import { useEffect } from "react"
import { useLocation } from "react-router"

let last: string | null = null

/** Counts page views anonymously: only the page and, on arrival, the referring site are sent. */
export function usePageViews() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname === last) return
    const entry = last === null
    last = pathname
    fetch("/api/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, entry, referrer: entry ? document.referrer : "" }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname])
}
