const PAGES = ["/", "/moje-tipy", "/prihlaseni", "/potvrzeni", "/pravidla"]

/** The page a view is counted under, or null for addresses the site does not have. */
export function viewPath(path: unknown): { path: string; raceId: string | null } | null {
  if (typeof path !== "string") return null
  if (PAGES.includes(path)) return { path, raceId: null }
  const race = /^\/tip\/((?:kv|se)-\d{1,7})$/.exec(path)
  return race ? { path, raceId: race[1] } : null
}

/** Only the host of the referring page is kept, and nothing at all when it is the site itself. */
export function referrerHost(referrer: unknown, ownHost: string): string {
  if (typeof referrer !== "string" || !referrer) return ""
  try {
    const { protocol, hostname } = new URL(referrer)
    if (!/^https?:$/.test(protocol) || hostname === ownHost || hostname.length > 100) return ""
    return hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

export const pragueDay = (date = new Date()) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" })
