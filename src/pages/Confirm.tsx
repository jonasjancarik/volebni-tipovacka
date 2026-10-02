import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { useConfig } from "@/App"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"

export function Confirm() {
  const { reload } = useConfig()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const confirm = async () => {
    setBusy(true)
    try {
      const { next } = await api<{ next: string }>("/confirm", { body: { token: params.get("token") ?? "" } })
      reload()
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-6 pt-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Ještě jedno kliknutí</h1>
        <p className="text-muted-foreground">
          Tlačítkem potvrdíte, že odkaz z e-mailu otevíráte vy. Přihlásíme vás na tomto zařízení, a pokud jste posílali
          tip, začne platit.
        </p>
      </div>
      {error ? (
        <>
          <Alert variant="destructive">
            <AlertTitle>Potvrzení se nepovedlo</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button className="self-start" nativeButton={false} render={<Link to="/prihlaseni" />}>
            Poslat nový odkaz
          </Button>
        </>
      ) : (
        <Button className="self-start" disabled={busy} onClick={confirm}>
          {busy && <Spinner data-icon="inline-start" />}
          Potvrdit a pokračovat
        </Button>
      )}
    </section>
  )
}
