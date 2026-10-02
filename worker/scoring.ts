export type Shares = Record<string, number>

export interface TipInput {
  turnout: number
  shares: Shares
  winner: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Checks a submitted tip against the race's ballot and returns it cleaned up, or a message for the user. */
export function validateTip(
  body: { turnout?: unknown; shares?: unknown; winner?: unknown },
  kind: string,
  nums: number[],
): TipInput | string {
  const raw = (body.shares ?? {}) as Record<string, unknown>
  if (typeof raw !== "object") return "Tip se nepodařilo přečíst."
  const shares: Shares = {}
  let sum = 0
  for (const num of nums) {
    const v = Number(raw[String(num)] ?? 0)
    if (!Number.isFinite(v) || v < 0 || v > 100) return "Každý výsledek musí být mezi 0 a 100 %."
    shares[String(num)] = round1(v)
    sum += shares[String(num)]
  }
  if (Math.abs(sum - 100) > 0.05) return "Součet všech výsledků musí být přesně 100 %."
  const turnout = Number(body.turnout)
  if (body.turnout === "" || body.turnout == null || !Number.isFinite(turnout) || turnout < 0 || turnout > 100)
    return "Doplňte volební účast mezi 0 a 100 %."
  let winner: number | null = null
  if (kind === "se") {
    winner = Number(body.winner)
    if (!nums.includes(winner)) return "Vyberte, kdo se podle vás stane senátorem."
  }
  return { turnout: round1(turnout), shares, winner }
}

export interface Scored {
  /** Average distance from the real result in percentage points; lower is better. */
  error: number
  turnoutError: number
  winnerHit: boolean | null
}

export function scoreTip(
  tip: TipInput,
  actual: { pcts: Record<string, number | null>; turnout: number; winner: number | null },
): Scored {
  const nums = Object.keys(actual.pcts)
  const total = nums.reduce((a, n) => a + Math.abs((tip.shares[n] ?? 0) - (actual.pcts[n] ?? 0)), 0)
  return {
    error: nums.length ? total / nums.length : 0,
    turnoutError: Math.abs(tip.turnout - actual.turnout),
    winnerHit: actual.winner == null || tip.winner == null ? null : tip.winner === actual.winner,
  }
}

/** Best tip first: smallest average error, then closest turnout. */
export const compareScores = (a: Scored, b: Scored) =>
  a.error - b.error || a.turnoutError - b.turnoutError
