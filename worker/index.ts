import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { importResults } from "./results"
import { compareScores, expandShares, scoreTip, validateTip, type Shares, type TipInput } from "./scoring"

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
}

const SESSION_DAYS = 60
const LINK_HOURS = 24
const LEADERBOARD_SIZE = 100

const app = new Hono<{ Bindings: Env; Variables: { user: User | null } }>().basePath("/api")

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const hashEmail = async (env: Env, email: string) => {
  if (!env.EMAIL_HASH_KEY) throw new Error("EMAIL_HASH_KEY is not configured")
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.EMAIL_HASH_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
const isOpen = (env: Env) => Date.now() < Date.parse(env.DEADLINE)
const cleanEmail = (v: unknown) => {
  const email = String(v ?? "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? email : null
}
const cleanNickname = (v: unknown) => {
  const nickname = String(v ?? "").trim().replace(/\s+/g, " ")
  return nickname.length >= 2 && nickname.length <= 30 ? nickname : null
}

app.use("*", async (c, next) => {
  const sid = getCookie(c, "sid")
  const user = sid
    ? await c.env.DB.prepare(
        `SELECT u.id, u.email_hash, u.nickname FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
        .bind(await sha256(sid), new Date().toISOString())
        .first<User>()
    : null
  c.set("user", user)
  await next()
})

app.onError((err, c) => {
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
    const { results } = await c.env.DB.prepare(`${RACE_LIST} WHERE r.kind = 'kv' ORDER BY r.population DESC LIMIT 12`).all()
    return c.json(results)
  }
  const like = q.replace(/[%_\\]/g, "\\$&")
  const { results } = await c.env.DB.prepare(
    `${RACE_LIST} WHERE r.kind = 'kv' AND r.search LIKE ? ESCAPE '\\'
     ORDER BY r.search = ? DESC, r.search LIKE ? ESCAPE '\\' DESC, r.population DESC LIMIT 30`,
  )
    .bind(`%${like}%`, q, `${like}%`)
    .all()
  return c.json(results)
})

app.get("/senate", async (c) => {
  const { results } = await c.env.DB.prepare(`${RACE_LIST} WHERE r.kind = 'se' ORDER BY r.code`).all()
  return c.json(results)
})

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

  type TipRow = { user_id: number; nickname: string; turnout: number; shares: string; winner: number | null }
  const nums = options.map((o) => o.num)
  // Stored tips hold only the filled-in shares; `filled` lets the form show which ones those were.
  const readTip = (row: { turnout: number; shares: string; winner: number | null }) => {
    const filled = JSON.parse(row.shares) as Shares
    return { turnout: row.turnout, shares: expandShares(filled, nums), winner: row.winner, filled: Object.keys(filled).map(Number) }
  }
  let myTip: ReturnType<typeof readTip> | null = null
  let tipCount: number
  let leaderboard: unknown[] | null = null
  let myRank: number | null = null

  if (hasResults) {
    // Tips are few per race, so ranking on read keeps the standings current without rewriting scores.
    const rows = (
      await db
        .prepare(
          `SELECT t.user_id, u.nickname, t.turnout, t.shares, t.winner
           FROM tips t JOIN users u ON u.id = t.user_id WHERE t.race_id = ?`,
        )
        .bind(id)
        .all<TipRow>()
    ).results
    tipCount = rows.length
    const actual = {
      pcts: Object.fromEntries(options.map((o) => [String(o.num), o.pct])),
      turnout: race.turnout ?? 0,
      winner: race.winner,
    }
    const ranked = rows
      .map((row) => {
        const tip = readTip(row)
        return { row, tip, score: scoreTip(tip, actual) }
      })
      .sort((a, b) => compareScores(a.score, b.score))
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
         turnout = excluded.turnout, shares = excluded.shares, winner = excluded.winner, updated_at = excluded.updated_at`,
    )
    .bind(userId, raceId, tip.turnout, JSON.stringify(tip.shares), tip.winner, new Date().toISOString())
    .run()
}

async function verifyTurnstile(env: Env, token: unknown, ip: string) {
  if (!env.TURNSTILE_SECRET) return true
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token ?? ""), remoteip: ip }),
  })
  return ((await res.json()) as { success: boolean }).success
}

/** Creates a confirmation link and e-mails it. Returns an error message for the user, or the link in dev mode. */
async function sendLink(
  c: { env: Env; req: { url: string; header(name: string): string | undefined } },
  email: string,
  nickname: string | null,
  payload: { raceId: string; raceName: string; tip: TipInput } | null,
): Promise<{ error?: string; devLink?: string }> {
  const env = c.env
  const ip = c.req.header("cf-connecting-ip") ?? "local"
  const ipHash = await sha256(ip)
  const emailHash = await hashEmail(env, email)
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const recent = await env.DB.prepare(
    `SELECT SUM(email_hash = ?1) AS by_email, SUM(ip_hash = ?2) AS by_ip FROM magic_links
     WHERE created_at > ?3 AND (email_hash = ?1 OR ip_hash = ?2)`,
  )
    .bind(emailHash, ipHash, hourAgo)
    .first<{ by_email: number | null; by_ip: number | null }>()
  if ((recent?.by_email ?? 0) >= 5 || (recent?.by_ip ?? 0) >= 30)
    return { error: "Poslali jsme vám už několik e-mailů. Zkuste to prosím znovu za hodinu." }

  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare(
    "INSERT INTO magic_links (token_hash, email_hash, nickname, payload, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      await sha256(token),
      emailHash,
      nickname,
      payload && JSON.stringify(payload),
      ipHash,
      new Date(now).toISOString(),
      new Date(now + LINK_HOURS * 3600_000).toISOString(),
    )
    .run()

  const link = `${new URL(c.req.url).origin}/api/confirm?token=${token}`
  if (env.DEV_MODE === "1") {
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
    `Odkaz platí ${LINK_HOURS} hodin. Pokud jste o něj nežádali, e-mail prostě ignorujte.`,
    ``,
    `Volební tipovačka`,
  ].join("\n")
  const html = `<p>Dobrý den,</p><p>tímto odkazem můžete ${escapeHtml(action)}:</p>
<p><a href="${link}">${payload ? "Potvrdit tip" : "Přihlásit se"}</a></p>
<p>Odkaz platí ${LINK_HOURS} hodin. Pokud jste o něj nežádali, e-mail prostě ignorujte.</p><p>Volební tipovačka</p>`
  await env.EMAIL.send({ to: email, from: { email: env.MAIL_FROM, name: "Volební tipovačka" }, subject, text, html })
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
  const nickname = cleanNickname(body.nickname)
  if (!nickname) return c.json({ error: "Zadejte přezdívku o 2 až 30 znacích." }, 400)
  if (!(await verifyTurnstile(c.env, body.turnstileToken, c.req.header("cf-connecting-ip") ?? "")))
    return c.json({ error: "Nepodařilo se ověřit, že nejste robot. Zkuste to prosím znovu." }, 400)
  const sent = await sendLink(c, email, nickname, { raceId, raceName: race.name, tip })
  if (sent.error) return c.json({ error: sent.error }, 429)
  return c.json({ emailSent: true, devLink: sent.devLink })
})

app.post("/login", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const email = cleanEmail(body.email)
  if (!email) return c.json({ error: "Zadejte platnou e-mailovou adresu." }, 400)
  if (!(await verifyTurnstile(c.env, body.turnstileToken, c.req.header("cf-connecting-ip") ?? "")))
    return c.json({ error: "Nepodařilo se ověřit, že nejste robot. Zkuste to prosím znovu." }, 400)
  // Same answer whether or not the address has tips, so the form does not reveal who takes part.
  const known = await c.env.DB.prepare("SELECT 1 FROM users WHERE email_hash = ?")
    .bind(await hashEmail(c.env, email))
    .first()
  if (!known) return c.json({ emailSent: true })
  const sent = await sendLink(c, email, null, null)
  if (sent.error) return c.json({ error: sent.error }, 429)
  return c.json({ emailSent: true, devLink: sent.devLink })
})

app.get("/confirm", async (c) => {
  const db = c.env.DB
  const now = new Date().toISOString()
  const link = await db
    .prepare("SELECT email_hash, nickname, payload FROM magic_links WHERE token_hash = ? AND expires_at > ?")
    .bind(await sha256(c.req.query("token") ?? ""), now)
    .first<{ email_hash: string; nickname: string | null; payload: string | null }>()
  if (!link) return c.redirect("/prihlaseni?odkaz=neplatny")

  let user = await db
    .prepare("SELECT id, email_hash, nickname FROM users WHERE email_hash = ?")
    .bind(link.email_hash)
    .first<User>()
  if (!user) {
    if (!link.nickname) return c.redirect("/prihlaseni?odkaz=neplatny")
    user = (await db
      .prepare("INSERT INTO users (email_hash, nickname, created_at) VALUES (?, ?, ?) RETURNING id, email_hash, nickname")
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

  if (!link.payload) return c.redirect("/moje-tipy")
  const payload = JSON.parse(link.payload) as { raceId: string; tip: TipInput }
  if (!isOpen(c.env)) return c.redirect(`/tip/${payload.raceId}?potvrzeni=pozde`)
  await saveTip(db, user.id, payload.raceId, payload.tip)
  return c.redirect(`/tip/${payload.raceId}?potvrzeni=ok`)
})

app.post("/logout", async (c) => {
  const sid = getCookie(c, "sid")
  if (sid) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(sid)).run()
  deleteCookie(c, "sid", { path: "/" })
  return c.json({ ok: true })
})

app.post("/me", async (c) => {
  const user = c.var.user
  if (!user) return c.json({ error: "Nejste přihlášeni." }, 401)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const nickname = cleanNickname(body.nickname)
  if (!nickname) return c.json({ error: "Zadejte přezdívku o 2 až 30 znacích." }, 400)
  await c.env.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(nickname, user.id).run()
  return c.json({ nickname })
})

app.get("/me/tips", async (c) => {
  const user = c.var.user
  if (!user) return c.json({ error: "Nejste přihlášeni." }, 401)
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.kind, r.name, r.subtitle, t.updated_at AS updatedAt
     FROM tips t JOIN races r ON r.id = t.race_id WHERE t.user_id = ? ORDER BY t.updated_at DESC`,
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

app.all("*", (c) => c.json({ error: "Nenalezeno." }, 404))

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(importResults(env).then((summary) => console.log(`results import: ${summary}`)))
  },
} satisfies ExportedHandler<Env>
