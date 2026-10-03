export interface Config {
  deadline: string
  open: boolean
  turnstileSiteKey: string
  /** `resultEmail` is true when the tipper asked to be e-mailed their placing after the count. */
  me: { nickname: string; resultEmail: boolean } | null
}

export interface RaceSummary {
  id: string
  kind: "kv" | "se"
  name: string
  subtitle: string
  options: number
  tips: number
}

export interface Tip {
  turnout: number
  shares: Record<string, number>
  winner: number | null
  /** Ballot numbers the tipper filled in; the other shares were split from the remainder. */
  filled: number[]
}

export interface LeaderboardRow extends Tip {
  rank: number
  nickname: string
  mine: boolean
  error: number
  weightedError: number
  turnoutError: number
  winnerHit: boolean | null
}

export interface RaceDetail {
  race: {
    id: string
    kind: "kv" | "se"
    name: string
    subtitle: string
    seats: number | null
    countedPct: number | null
    turnout: number | null
    final: boolean
    winner: number | null
  }
  options: { num: number; name: string; detail: string; pct: number | null }[]
  tipCount: number
  myTip: Tip | null
  myRank: number | null
  myWeightedRank: number | null
  /** Main ranking by plain average error. */
  leaderboard: LeaderboardRow[] | null
  /** Second ranking, where misses on smaller lists count more. */
  weightedLeaderboard: LeaderboardRow[] | null
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !data) throw new Error(data?.error ?? "Něco se pokazilo. Zkuste to prosím za chvíli znovu.")
  return data
}

export const pct = (n: number, digits = 1) =>
  `${n.toLocaleString("cs-CZ", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`

export const tipsLabel = (n: number) => (n === 1 ? "1 tip" : n >= 2 && n <= 4 ? `${n} tipy` : `${n} tipů`)

export const formatDeadline = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  })
