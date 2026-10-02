import { useEffect, useRef } from "react"

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, options: { sitekey: string; language: string; callback(token: string): void }): string
      remove(id: string): void
    }
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widget: string | undefined
    let cancelled = false
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, language: "cs", callback: onToken })
    }
    if (window.turnstile) render()
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`)
      if (!script) {
        script = document.createElement("script")
        script.src = SCRIPT
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener("load", render)
    }
    return () => {
      cancelled = true
      if (widget) window.turnstile?.remove(widget)
    }
  }, [siteKey, onToken])

  return <div ref={ref} />
}
