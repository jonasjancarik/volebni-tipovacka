import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { BrowserRouter, Link, Route, Routes } from "react-router"

import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { api, type Config } from "@/lib/api"
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
        <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4">
          <header className="flex items-center justify-between gap-4 py-4">
            <Link to="/" className="font-heading text-lg font-semibold">
              Volební tipovačka
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
