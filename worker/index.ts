import { Hono, type Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { csrf } from "hono/csrf"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { canonicalEmail } from "./email"
import { randomNickname } from "./nicknames"
import { importResults } from "./results"
import { pragueDay, referrerHost, viewPath } from "./telemetry"
import { compareScores, expandShares, scoreTip, validateTip, type Scored, type Shares, type TipInput } from "./scoring"

interface Env {
  DB: D1Database
  EMAIL?: { send(message: Record<string, unknown>): Promise<unknown> }
  DEADLINE: string
  POLLS_CLOSE: string
  RESULTS_UNTIL: string
  RESULTS_BASE_URL: string
  RESULTS_BATCH: string
  MAIL_FROM: string
  TURNSTILE_SITE_KEY: string
  TURNSTILE_SECRET?: string
  /** Secret key for hashing e-mail addresses; the addresses themselves are never stored. */
  EMAIL_HASH_KEY: string
  DEV_MODE?: string
}

interface User {
  id: number
  email_hash: string
  nickname: string
}

interface Race {
  id: string
  kind: "kv" | "se"
  name: string
  subtitle: string
  seats: number | null
  counted_pct: number | null
  turnout: number | null
  final: number
  winner: number | null
  results_at: string | null
}

const SESSION_DAYS = 60
const LINK_HOURS = 24
const LEADERBOARD_SIZE = 100
/** E-mails one address may receive per hour, and how many unconfirmed links it may have waiting. */
const HOURLY_EMAILS = 5
const PENDING_LINKS = 10
const STANDINGS_TTL_MS = 60_000
const STANDINGS_KEPT = 20

type AppEnv = { Bindings: Env; Variables: { user: User | null } }
type Ctx = Context<AppEnv>

const app = new Hono<AppEnv>().basePath("/api")

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** HMAC-SHA256 with EMAIL_HASH_KEY, so stored hashes cannot be reversed by trying every possible input. */
const keyedHash = async (env: Env, text: string) => {
  if (!env.EMAIL_HASH_KEY) throw new Error("EMAIL_HASH_KEY is not configured")
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.EMAIL_HASH_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const hashEmail = keyedHash

/**
 * The hash an address's account lives under. New accounts use the canonical form of the address;
 * an account created earlier under the address exactly as typed keeps working.
 */
async function accountHash(env: Env, email: string) {
  const typed = await hashEmail(env, email)
  const canonical = canonicalEmail(email)
  if (canonical === email) return typed
  const existing = await env.DB.prepare("SELECT 1 FROM users WHERE email_hash = ?").bind(typed).first()
  return existing ? typed : hashEmail(env, canonical)
}
// The prefix keeps IP hashes apart from e-mail hashes made with the same key.
const hashIp = (env: Env, ip: string) => keyedHash(env, `ip:${ip}`)

/**
 * DEV_MODE skips Turnstile and hands out confirmation links without e-mail, so it only counts on a
 * development host. Set by mistake in production, it changes nothing.
 */
const isDev = (env: Env, url: string) => {
  const host = new URL(url).hostname
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host) || /\.(localhost|local|ts\.net)$/.test(host)
  return env.DEV_MODE === "1" && local
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
const isOpen = (env: Env) => Date.now() < Date.parse(env.DEADLINE)
const cleanEmail = (v: unknown) => {
  const email = String(v ?? "")
    .trim()
    .toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? email : null
}

app.use("*", secureHeaders())
// Rejects form posts from other sites; the session cookie's SameSite setting is the first line of defence.
app.use("*", csrf())
app.use("*", async (c, next) => {
  await next()
  c.header("Cache-Control", "no-store")
})

app.use("*", async (c, next) => {
  const sid = getCookie(c, "sid")
  const user = sid
    ? await c.env.DB.prepare(
        `SELECT u.id, u.email_hash, u.nickname FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
        .bind(await sha256(sid), new Date().toISOString())
        .first<User>()
    : null
  c.set("user", user)
  await next()
})

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: "Tenhle požadavek jsme nemohli přijmout." }, err.status)
  console.error(err)
  return c.json({ error: "Něco se pokazilo. Zkuste to prosím za chvíli znovu." }, 500)
})

app.get("/config", (c) => {
  const user = c.var.user
  return c.json({
    deadline: c.env.DEADLINE,
    open: isOpen(c.env),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    me: user && { nickname: user.nickname },
  })
})

const RACE_LIST = `SELECT r.id, r.kind, r.name, r.subtitle,
  (SELECT COUNT(*) FROM options o WHERE o.race_id = r.id) AS options,
  (SELECT COUNT(*) FROM tips t WHERE t.race_id = r.id) AS tips
  FROM races r`

app.get("/races", async (c) => {
  const q = normalize(c.req.query("q") ?? "")
  if (q.length < 2) {
    // Nothing typed yet: offer the largest cities.
    const { results } = await c.env.DB.prepare(
      `${RACE_LIST} WHERE r.kind = 'kv' ORDER BY r.population DESC LIMIT 12`
    ).all()
    return c.json(results)
  }
  const like = q.replace(/[%_\\]/g, "\\$&")
  const { results } = await c.env.DB.prepare(
    `${RACE_LIST} WHERE r.kind = 'kv' AND r.search LIKE ? ESCAPE '\\'
     ORDER BY r.search = ? DESC, r.search LIKE ? ESCAPE '\\' DESC, r.population DESC LIMIT 30`
  )
    .bind(`%${like}%`, q, `${like}%`)
    .all()
  return c.json(results)
})

app.get("/senate", async (c) => {
  const { results } = await c.env.DB.prepare(`${RACE_LIST} WHERE r.kind = 'se' ORDER BY r.code`).all()
  return c.json(results)
})

type TipRow = { user_id: number; nickname: string; turnout: number; shares: string; winner: number | null }
type Ranked = { row: TipRow; tip: TipInput & { filled: number[] }; score: Scored }
const standings = new Map<string, { resultsAt: string | null; at: number; ranked: Ranked[] }>()

app.get("/races/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")
  const race = await db.prepare("SELECT * FROM races WHERE id = ?").bind(id).first<Race>()
  if (!race) return c.json({ error: "Tohle zastupitelstvo ani senátní obvod neznáme." }, 404)
  const options = (
    await db.prepare("SELECT num, name, detail, pct FROM options WHERE race_id = ? ORDER BY num").bind(id).all<{
      num: number
      name: string
      detail: string
      pct: number | null
    }>()
  ).results
  const user = c.var.user
  const open = isOpen(c.env)
  const hasResults = !open && (race.counted_pct ?? 0) > 0

  const nums = options.map((o) => o.num)
  // Stored tips hold only the filled-in shares; `filled` lets the form show which ones those were.
  const readTip = (row: { turnout: number; shares: string; winner: number | null }) => {
    const filled = JSON.parse(row.shares) as Shares
    return {
      turnout: row.turnout,
      shares: expandShares(filled, nums),
      winner: row.winner,
      filled: Object.keys(filled).map(Number),
    }
  }
  let myTip: ReturnType<typeof readTip> | null = null
  let tipCount: number
  let leaderboard: unknown[] | null = null
  let myRank: number | null = null

  if (hasResults) {
    // Ranking happens on read so the standings follow the count. The result is kept for a minute per
    // race, because tips no longer change and a busy race would otherwise be re-read on every view.
    const kept = standings.get(id)
    let ranked =
      kept && kept.resultsAt === race.results_at && Date.now() - kept.at < STANDINGS_TTL_MS ? kept.ranked : null
    if (!ranked) {
      const rows = (
        await db
          .prepare(
            `SELECT t.user_id, u.nickname, t.turnout, t.shares, t.winner
             FROM tips t JOIN users u ON u.id = t.user_id WHERE t.race_id = ?`
          )
          .bind(id)
          .all<TipRow>()
      ).results
      const actual = {
        pcts: Object.fromEntries(options.map((o) => [String(o.num), o.pct])),
        turnout: race.turnout ?? 0,
        winner: race.winner,
      }
      ranked = rows
        .map((row) => {
          const tip = readTip(row)
          return { row, tip, score: scoreTip(tip, actual) }
        })
        .sort((a, b) => compareScores(a.score, b.score))
      if (standings.size >= STANDINGS_KEPT) standings.clear()
      standings.set(id, { resultsAt: race.results_at, at: Date.now(), ranked })
    }
    tipCount = ranked.length
    const mine = ranked.findIndex((r) => r.row.user_id === user?.id)
    if (mine >= 0) {
      myRank = mine + 1
      myTip = ranked[mine].tip
    }
    leaderboard = ranked
      .map((r, i) => ({ rank: i + 1, nickname: r.row.nickname, mine: i === mine, ...r.tip, ...r.score }))
      .filter((r) => r.rank <= LEADERBOARD_SIZE || r.mine)
  } else {
    tipCount = (await db.prepare("SELECT COUNT(*) AS n FROM tips WHERE race_id = ?").bind(id).first<{ n: number }>())!.n
    if (user) {
      const row = await db
        .prepare("SELECT turnout, shares, winner FROM tips WHERE user_id = ? AND race_id = ?")
        .bind(user.id, id)
        .first<{ turnout: number; shares: string; winner: number | null }>()
      if (row) myTip = readTip(row)
    }
  }

  return c.json({
    race: {
      id: race.id,
      kind: race.kind,
      name: race.name,
      subtitle: race.subtitle,
      seats: race.seats,
      countedPct: hasResults ? race.counted_pct : null,
      turnout: hasResults ? race.turnout : null,
      final: hasResults && race.final === 1,
      winner: hasResults ? race.winner : null,
    },
    options: options.map((o) => ({ ...o, pct: hasResults ? o.pct : null })),
    tipCount,
    myTip,
    myRank,
    leaderboard,
  })
})

async function saveTip(db: D1Database, userId: number, raceId: string, tip: TipInput) {
  await db
    .prepare(
      `INSERT INTO tips (user_id, race_id, turnout, shares, winner, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, race_id) DO UPDATE SET
         turnout = excluded.turnout, shares = excluded.shares, winner = excluded.winner, updated_at = excluded.updated_at`
    )
    .bind(userId, raceId, tip.turnout, JSON.stringify(tip.shares), tip.winner, new Date().toISOString())
    .run()
}

async function verifyTurnstile(c: Ctx, token: unknown) {
  const env = c.env
  if (!env.TURNSTILE_SECRET) {
    if (isDev(env, c.req.url)) return true
    throw new Error("TURNSTILE_SECRET is not configured")
  }
  const ip = c.req.header("cf-connecting-ip") ?? ""
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token ?? ""), remoteip: ip }),
  })
  return ((await res.json()) as { success: boolean }).success
}

/**
 * Creates a confirmation link and e-mails it. Returns an error message for the user, or the link in dev mode.
 * `delivery` is "wait" to report a failed send, "background" to answer before the e-mail leaves, and "none"
 * to only count the request against the limits. The last two let sign-in answer the same way, and as fast,
 * for addresses with and without an account.
 */
async function sendLink(
  c: Ctx,
  email: string,
  payload: { raceId: string; raceName: string; tip: TipInput } | null,
  delivery: "wait" | "background" | "none" = "wait"
): Promise<{ error?: string; devLink?: string }> {
  const env = c.env
  const ip = c.req.header("cf-connecting-ip") ?? "local"
  const ipHash = await hashIp(env, ip)
  const emailHash = await accountHash(env, email)
  const nowIso = new Date().toISOString()
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const recent = await env.DB.prepare(
    `SELECT SUM(email_hash = ?1 AND created_at > ?3) AS by_email, SUM(ip_hash = ?2 AND created_at > ?3) AS by_ip,
       SUM(email_hash = ?1 AND expires_at > ?4) AS pending
     FROM magic_links WHERE (email_hash = ?1 OR ip_hash = ?2) AND (created_at > ?3 OR expires_at > ?4)`
  )
    .bind(emailHash, ipHash, hourAgo, nowIso)
    .first<{ by_email: number | null; by_ip: number | null; pending: number | null }>()
  if ((recent?.by_email ?? 0) >= HOURLY_EMAILS || (recent?.by_ip ?? 0) >= 30)
    return { error: "Poslali jsme vám už několik e-mailů. Zkuste to prosím znovu za hodinu." }
  // Without this a stranger could keep one address receiving e-mails all day, five every hour.
  if ((recent?.pending ?? 0) >= PENDING_LINKS)
    return {
      error: "Na tuhle adresu už čeká několik nepotvrzených e-mailů. Otevřete některý z nich, nebo to zkuste zítra.",
    }

  // A returning tipper keeps their nickname. A new one gets a generated nickname, reused across
  // their pending links so every e-mail they receive names the same one.
  const known = await env.DB.prepare(
    `SELECT nickname FROM users WHERE email_hash = ?1
     UNION ALL
     SELECT nickname FROM (SELECT nickname FROM magic_links
       WHERE email_hash = ?1 AND nickname IS NOT NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1)
     LIMIT 1`
  )
    .bind(emailHash, nowIso)
    .first<{ nickname: string }>()
  // A link that is never sent carries no nickname, so it can neither be confirmed nor name a future account.
  const nickname = delivery === "none" ? null : (known?.nickname ?? randomNickname())

  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare(
    "INSERT INTO magic_links (token_hash, email_hash, nickname, payload, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      await sha256(token),
      emailHash,
      nickname,
      payload && JSON.stringify(payload),
      ipHash,
      new Date(now).toISOString(),
      new Date(now + (delivery === "none" ? 1 : LINK_HOURS) * 3600_000).toISOString()
    )
    .run()
  if (delivery === "none" || !nickname) return {}

  const origin = new URL(c.req.url).origin
  const link = `${origin}/potvrzeni?token=${token}`
  const overview = `${origin}/moje-tipy`
  if (isDev(env, c.req.url)) {
    console.log(`Confirmation link for ${email}: ${link}`)
    return { devLink: link }
  }
  if (!env.EMAIL || !env.MAIL_FROM) throw new Error("E-mail sending is not configured")

  const action = payload ? `potvrdit tip pro ${payload.raceName}` : "přihlásit se"
  const subject = payload ? `Potvrďte svůj tip: ${payload.raceName}` : "Přihlášení do Volební tipovačky"
  const text = [
    `Dobrý den,`,
    ``,
    `tímto odkazem můžete ${action}:`,
    link,
    ``,
    `V pořadí tipujících vystupujete pod přezdívkou ${nickname}.`,
    ``,
    `Přehled všech svých tipů najdete tady:`,
    overview,
    `Na jiném zařízení se k němu přihlásíte stejnou e-mailovou adresou.`,
    ``,
    `Odkaz na ${payload ? "potvrzení" : "přihlášení"} platí ${LINK_HOURS} hodin. Pokud jste o něj nežádali, e-mail prostě ignorujte.`,
    ``,
    `Volební tipovačka`,
  ].join("\n")
  const kind = payload ? "potvrzení" : "přihlášení"
  const button = payload ? "Potvrdit tip" : "Přihlásit se"
  const heading = payload ? "Potvrďte svůj tip" : "Přihlášení do Volební tipovačky"
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const summary = payload
    ? `<tr><td style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;border-radius:12px;">
<tr><td style="padding:16px 20px 4px;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#8a8a85;">Váš tip pro</td></tr>
<tr><td style="padding:0 20px 14px;font-size:18px;font-weight:600;color:#111111;">${escapeHtml(payload.raceName)}</td></tr>
<tr><td style="padding:0 20px 4px;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#8a8a85;border-top:1px solid #e7e7e3;padding-top:14px;">Vystupujete jako</td></tr>
<tr><td style="padding:0 20px 16px;font-size:18px;font-weight:600;color:#111111;">${escapeHtml(nickname)}</td></tr>
</table></td></tr>`
    : `<tr><td style="padding:0 32px 28px;font-size:15px;line-height:1.55;color:#4b4b47;">V pořadí tipujících vystupujete pod přezdívkou <strong style="color:#111111;">${escapeHtml(nickname)}</strong>.</td></tr>`
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ecece8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecece8;padding:32px 12px;">
<tr><td align="center" style="font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 16px;font-family:${font};font-size:15px;font-weight:700;color:#111111;letter-spacing:.2px;">
<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#111111;color:#ffffff;border-radius:6px;font-size:13px;margin-right:8px;">&#10003;</span>Volební tipovačka</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e0e0db;font-family:${font};color:#1f1f1d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:36px 32px 12px;font-size:26px;line-height:1.25;font-weight:700;color:#111111;">${escapeHtml(heading)}</td></tr>
<tr><td style="padding:0 32px 28px;font-size:16px;line-height:1.6;color:#4b4b47;">Dobrý den, stačí jedno kliknutí${payload ? " a váš tip se uloží" : " a budete přihlášeni"}.</td></tr>
${summary}
<tr><td style="padding:0 32px 32px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#111111;border-radius:10px;">
<a href="${link}" style="display:inline-block;padding:15px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${button} &rarr;</a>
</td></tr></table></td></tr>
<tr><td style="padding:0 32px 32px;font-size:14px;line-height:1.6;color:#4b4b47;border-top:1px solid #eeeeea;padding-top:24px;">
Přehled všech svých tipů najdete na <a href="${overview}" style="color:#111111;font-weight:600;">${overview.replace(/^https?:\/\//, "")}</a>. Na jiném zařízení se k němu přihlásíte stejnou e-mailovou adresou.</td></tr>
</table></td></tr>
<tr><td style="padding:20px 8px 0;font-family:${font};font-size:12px;line-height:1.6;color:#8a8a85;">
Odkaz na ${kind} platí ${LINK_HOURS} hodin. Pokud jste o něj nežádali, e-mail prostě ignorujte.<br>
Tlačítko nefunguje? Zkopírujte si tuto adresu do prohlížeče:<br><span style="word-break:break-all;">${link}</span>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  // The address must not reach the logs, and a provider's error message may quote it.
  const sending = env.EMAIL.send({
    to: email,
    from: { email: env.MAIL_FROM, name: "Volební tipovačka" },
    subject,
    text,
    html,
  }).catch((err) => {
    throw new Error(`E-mail could not be sent: ${String(err).replaceAll(email, "<address>")}`)
  })
  if (delivery === "background") c.executionCtx.waitUntil(sending.catch((err) => console.error(err)))
  else await sending
  return {}
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!)

app.post("/tips", async (c) => {
  if (!isOpen(c.env)) return c.json({ error: "Tipování už skončilo, volební místnosti jsou otevřené." }, 403)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const raceId = String(body.raceId ?? "")
  const race = await c.env.DB.prepare("SELECT id, kind, name FROM races WHERE id = ?").bind(raceId).first<Race>()
  if (!race) return c.json({ error: "Tohle zastupitelstvo ani senátní obvod neznáme." }, 404)
  const nums = (
    await c.env.DB.prepare("SELECT num FROM options WHERE race_id = ?").bind(raceId).all<{ num: number }>()
  ).results.map((o) => o.num)
  const tip = validateTip(body, race.kind, nums)
  if (typeof tip === "string") return c.json({ error: tip }, 400)

  const user = c.var.user
  if (user) {
    await saveTip(c.env.DB, user.id, raceId, tip)
    return c.json({ saved: true })
  }

  const email = cleanEmail(body.email)
  if (!email) return c.json({ error: "Zadejte platnou e-mailovou adresu." }, 400)
  if (!(await verifyTurnstile(c, body.turnstileToken)))
    return c.json({ error: "Nepodařilo se ověřit, že nejste robot. Zkuste to prosím znovu." }, 400)
  const sent = await sendLink(c, email, { raceId, raceName: race.name, tip })
  if (sent.error) return c.json({ error: sent.error }, 429)
  return c.json({ emailSent: true, devLink: sent.devLink })
})

app.post("/login", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const email = cleanEmail(body.email)
  if (!email) return c.json({ error: "Zadejte platnou e-mailovou adresu." }, 400)
  if (!(await verifyTurnstile(c, body.turnstileToken)))
    return c.json({ error: "Nepodařilo se ověřit, že nejste robot. Zkuste to prosím znovu." }, 400)
  // Same answer whether or not the address has tips, so the form does not reveal who takes part:
  // both cases count against the same limits and neither waits for the e-mail to leave.
  const known = await c.env.DB.prepare("SELECT 1 FROM users WHERE email_hash = ?")
    .bind(await accountHash(c.env, email))
    .first()
  const sent = await sendLink(c, email, null, known ? "background" : "none")
  if (sent.error) return c.json({ error: sent.error }, 429)
  return c.json({ emailSent: true, devLink: sent.devLink })
})

// Links in e-mails sent before confirmation moved to its own page still point here.
app.get("/confirm", (c) => c.redirect(`/potvrzeni?token=${encodeURIComponent(c.req.query("token") ?? "")}`))

// Confirmation is a POST made from a button, so mail servers that open links on their own cannot
// confirm a tip or sign anyone in. A link works once.
app.post("/confirm", async (c) => {
  const db = c.env.DB
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const now = new Date().toISOString()
  const invalid = () => c.json({ error: "Odkaz už neplatí. Nechte si poslat nový." }, 400)
  // Expiring the row instead of deleting it keeps it counted in the hourly e-mail limit.
  const link = await db
    .prepare(
      "UPDATE magic_links SET expires_at = ?1 WHERE token_hash = ?2 AND expires_at > ?1 RETURNING email_hash, nickname, payload"
    )
    .bind(now, await sha256(String(body.token ?? "")))
    .first<{ email_hash: string; nickname: string | null; payload: string | null }>()
  if (!link) return invalid()

  let user = await db
    .prepare("SELECT id, email_hash, nickname FROM users WHERE email_hash = ?")
    .bind(link.email_hash)
    .first<User>()
  if (!user) {
    if (!link.nickname) return invalid()
    user = (await db
      .prepare(
        "INSERT INTO users (email_hash, nickname, created_at) VALUES (?, ?, ?) RETURNING id, email_hash, nickname"
      )
      .bind(link.email_hash, link.nickname, now)
      .first<User>())!
  }

  const sid = randomToken()
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(sid), user.id, new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString())
    .run()
  setCookie(c, "sid", sid, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  })

  if (!link.payload) return c.json({ next: "/moje-tipy" })
  const payload = JSON.parse(link.payload) as { raceId: string; tip: TipInput }
  if (!isOpen(c.env)) return c.json({ next: `/tip/${payload.raceId}?potvrzeni=pozde` })
  await saveTip(db, user.id, payload.raceId, payload.tip)
  return c.json({ next: `/tip/${payload.raceId}?potvrzeni=ok` })
})

app.post("/logout", async (c) => {
  const sid = getCookie(c, "sid")
  if (sid)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(sid))
      .run()
  deleteCookie(c, "sid", { path: "/" })
  return c.json({ ok: true })
})

app.get("/me/tips", async (c) => {
  const user = c.var.user
  if (!user) return c.json({ error: "Nejste přihlášeni." }, 401)
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.kind, r.name, r.subtitle, t.updated_at AS updatedAt
     FROM tips t JOIN races r ON r.id = t.race_id WHERE t.user_id = ? ORDER BY t.updated_at DESC`
  )
    .bind(user.id)
    .all()
  return c.json(results)
})

app.delete("/me", async (c) => {
  const user = c.var.user
  if (!user) return c.json({ error: "Nejste přihlášeni." }, 401)
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM tips WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM magic_links WHERE email_hash = ?").bind(user.email_hash),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ])
  deleteCookie(c, "sid", { path: "/" })
  return c.json({ ok: true })
})

// Traffic is counted without cookies or any visitor identifier: each view only raises a daily total.
app.post("/view", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const page = viewPath(body.path)
  if (!page) return c.body(null, 204)
  const entry = body.entry === true
  const referrer = entry ? referrerHost(body.referrer, new URL(c.req.url).hostname) : ""
  await c.env.DB.prepare(
    `INSERT INTO page_views (day, path, referrer, views, visits)
     SELECT ?1, ?2, ?3, 1, ?4 WHERE ?5 IS NULL OR EXISTS (SELECT 1 FROM races WHERE id = ?5)
     ON CONFLICT (day, path, referrer) DO UPDATE SET views = views + 1, visits = visits + excluded.visits`
  )
    .bind(pragueDay(), page.path, referrer, entry ? 1 : 0, page.raceId)
    .run()
  return c.body(null, 204)
})

app.all("*", (c) => c.json({ error: "Nenalezeno." }, 404))

/** Removes sign-in data that is no longer needed: ended sessions and links past the hourly e-mail limit window. */
async function purgeExpired(db: D1Database) {
  const now = Date.now()
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date(now).toISOString()),
    db
      .prepare("DELETE FROM magic_links WHERE expires_at < ?1 AND created_at < ?2")
      .bind(new Date(now).toISOString(), new Date(now - 3600_000).toISOString()),
  ])
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(importResults(env).then((summary) => console.log(`results import: ${summary}`)))
    ctx.waitUntil(purgeExpired(env.DB))
  },
} satisfies ExportedHandler<Env>
