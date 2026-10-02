import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { BrowserRouter, Link, Route, Routes } from "react-router"

import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/sonner"
import { api, type Config } from "@/lib/api"
import { usePageViews } from "@/lib/telemetry"
import { Confirm } from "@/pages/Confirm"
import { Home } from "@/pages/Home"
import { Login } from "@/pages/Login"
import { MyTips } from "@/pages/MyTips"
import { RacePage } from "@/pages/Race"
import { Rules } from "@/pages/Rules"

const ConfigContext = createContext<{ config: Config | null; reload: () => void }>({
  config: null,
  reload: () => {},
})

export const useConfig = () => useContext(ConfigContext)

function PageViews() {
  usePageViews()
  return null
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const reload = useCallback(() => {
    api<Config>("/config")
      .then(setConfig)
      .catch(() => {})
  }, [])
  useEffect(reload, [reload])

  return (
    <ConfigContext.Provider value={{ config, reload }}>
      <BrowserRouter>
        <PageViews />
        <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4">
          <header className="flex items-center justify-between gap-2 py-4 sm:gap-4">
            <Link to="/" className="font-heading text-base font-semibold whitespace-nowrap brand-gradient sm:text-lg">
              <span className="sm:hidden">Tipovačka</span>
              <span className="hidden sm:inline">Volební tipovačka</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/pravidla" />}>
                Pravidla
              </Button>
              {config?.me ? (
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/moje-tipy" />}>
                  Moje tipy
                </Button>
              ) : (
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/prihlaseni" />}>
                  Přihlásit se
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                aria-label="GitHub"
                render={
                  <a href="https://github.com/jonasjancarik/volebni-tipovacka" target="_blank" rel="noreferrer" />
                }
              >
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-icon="inline-start">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                <span className="hidden sm:inline">GitHub</span>
              </Button>
              <ThemeToggle />
            </nav>
          </header>
          <main className="flex flex-1 flex-col gap-8 pb-16">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/tip/:id" element={<RacePage />} />
              <Route path="/moje-tipy" element={<MyTips />} />
              <Route path="/prihlaseni" element={<Login />} />
              <Route path="/potvrzeni" element={<Confirm />} />
              <Route path="/pravidla" element={<Rules />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <footer className="border-t py-6 text-sm text-muted-foreground">
            Kandidátní listiny a výsledky pocházejí z otevřených dat Českého statistického úřadu.
          </footer>
        </div>
        <Toaster />
      </BrowserRouter>
    </ConfigContext.Provider>
  )
}

export default App
