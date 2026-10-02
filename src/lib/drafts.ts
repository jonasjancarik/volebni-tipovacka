// Unfinished tips are kept in this browser only, so closing the tab does not lose them.
// Storage can be unavailable (private windows, blocked site data), so every access is guarded.

export interface Draft {
  shares: Record<number, string>
  turnout: string
  winner: string
}

const key = (raceId: string) => `tip-draft:${raceId}`

export function loadDraft(raceId: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(raceId))
    const draft = raw ? (JSON.parse(raw) as Partial<Draft>) : null
    if (!draft || typeof draft.shares !== "object" || draft.shares === null) return null
    return { shares: draft.shares, turnout: String(draft.turnout ?? ""), winner: String(draft.winner ?? "") }
  } catch {
    return null
  }
}

export function saveDraft(raceId: string, draft: Draft) {
  try {
    const empty = !draft.turnout && !draft.winner && Object.values(draft.shares).every((v) => !v)
    if (empty) localStorage.removeItem(key(raceId))
    else localStorage.setItem(key(raceId), JSON.stringify(draft))
  } catch {
    // Nothing to do: the form still works, it just will not survive a reload.
  }
}

export function clearDraft(raceId: string) {
  try {
    localStorage.removeItem(key(raceId))
  } catch {
    // See saveDraft.
  }
}
