import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  isArray: (name) => ["OBVOD", "KANDIDAT", "UCAST", "VOLEBNI_STRANA"].includes(name),
})

export interface RaceResult {
  countedPct: number
  turnout: number
  final: boolean
  winner: number | null
  pcts: Record<number, number>
}

type Attrs = Record<string, string>

/** Result of one council from zastup/vysledky_obec_<code>.xml; null while the feed has no usable data. */
export function parseCouncil(xml: string): RaceResult | null {
  const obec = parser.parse(xml)?.VYSLEDKY_OBEC?.OBEC
  const vysledek = obec?.VYSLEDEK
  const ucast: Attrs | undefined = vysledek?.UCAST?.[0]
  if (!ucast) return null
  const pcts: Record<number, number> = {}
  for (const s of (vysledek.VOLEBNI_STRANA ?? []) as Attrs[]) {
    pcts[Number(s.POR_STR_HLAS_LIST)] = Number(s.HLASY_PROC)
  }
  return {
    countedPct: Number(ucast.OKRSKY_ZPRAC_PROC),
    turnout: Number(ucast.UCAST_PROC),
    final: Number(ucast.OKRSKY_ZPRAC) > 0 && ucast.OKRSKY_ZPRAC === ucast.OKRSKY_CELKEM,
    winner: null,
    pcts,
  }
}

/** All Senate districts from vysledky.xml, keyed by district number. Shares and turnout come from round one. */
export function parseSenate(xml: string): Map<number, RaceResult> {
  const out = new Map<number, RaceResult>()
  for (const obvod of parser.parse(xml)?.VYSLEDKY?.OBVOD ?? []) {
    const round1: Attrs | undefined = (obvod.UCAST as Attrs[] | undefined)?.find((u) => u.KOLO === "1")
    if (!round1) continue
    const pcts: Record<number, number> = {}
    let winner: number | null = null
    for (const k of (obvod.KANDIDAT ?? []) as Attrs[]) {
      const num = Number(k.PORADOVE_CISLO)
      pcts[num] = Number(k.HLASY_PROC_1KOLO)
      if (k.ZVOLEN_1KOLO === "ZVOLEN" || k.ZVOLEN_2KOLO === "ZVOLEN") winner = num
    }
    out.set(Number(obvod.CISLO), {
      countedPct: Number(round1.OKRSKY_ZPRAC_PROC),
      turnout: Number(round1.UCAST_PROC),
      final: Number(round1.OKRSKY_ZPRAC) > 0 && round1.OKRSKY_ZPRAC === round1.OKRSKY_CELKEM,
      winner,
      pcts,
    })
  }
  return out
}

function statements(db: D1Database, raceId: string, r: RaceResult, now: string) {
  return [
    db
      .prepare("UPDATE races SET counted_pct = ?, turnout = ?, final = ?, winner = ?, results_at = ? WHERE id = ?")
      .bind(r.countedPct, r.turnout, r.final ? 1 : 0, r.winner, now, raceId),
    ...Object.entries(r.pcts).map(([num, pct]) =>
      db.prepare("UPDATE options SET pct = ? WHERE race_id = ? AND num = ?").bind(pct, raceId, Number(num)),
    ),
  ]
}

export interface ResultsEnv {
  DB: D1Database
  POLLS_CLOSE: string
  RESULTS_UNTIL: string
  RESULTS_BASE_URL: string
  RESULTS_BATCH: string
}

/** Pulls fresh results from the ČSÚ feeds for the Senate and for councils that somebody tipped. */
export async function importResults(env: ResultsEnv): Promise<string> {
  const nowMs = Date.now()
  if (nowMs < Date.parse(env.POLLS_CLOSE) || nowMs > Date.parse(env.RESULTS_UNTIL)) return "outside counting window"
  const now = new Date(nowMs).toISOString()
  const base = env.RESULTS_BASE_URL
  let updated = 0

  const senate = await fetch(`${base}/senat/20261009/odata/vysledky.xml`)
  if (senate.ok) {
    const stmts = [...parseSenate(await senate.text())].flatMap(([obvod, r]) =>
      r.countedPct > 0 ? statements(env.DB, `se-${obvod}`, r, now) : [],
    )
    if (stmts.length) await env.DB.batch(stmts)
    updated += stmts.length ? 1 : 0
  }

  // Least recently refreshed first, so every tipped council gets its turn across runs.
  const { results } = await env.DB.prepare(
    `SELECT id, code FROM races
     WHERE kind = 'kv' AND final = 0 AND EXISTS (SELECT 1 FROM tips WHERE tips.race_id = races.id)
     ORDER BY results_at IS NOT NULL, results_at LIMIT ?`,
  )
    .bind(Number(env.RESULTS_BATCH) || 15)
    .all<{ id: string; code: number }>()

  const stmts: D1PreparedStatement[] = []
  await Promise.all(
    results.map(async (race) => {
      const res = await fetch(`${base}/kv2026/20261009/odata/zastup/vysledky_obec_${race.code}.xml`)
      const parsed = res.ok ? parseCouncil(await res.text()) : null
      if (parsed && parsed.countedPct > 0) stmts.push(...statements(env.DB, race.id, parsed, now))
      else stmts.push(env.DB.prepare("UPDATE races SET results_at = ? WHERE id = ?").bind(now, race.id))
    }),
  )
  if (stmts.length) await env.DB.batch(stmts)
  return `senate ${updated ? "updated" : "unchanged"}, councils checked: ${results.length}`
}
