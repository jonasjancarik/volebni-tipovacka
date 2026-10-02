import { useState } from "react"
import { useSearchParams } from "react-router"

import { useConfig } from "@/App"
import { Turnstile } from "@/components/turnstile"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"

export function Login() {
  const { config } = useConfig()
  const [params] = useSearchParams()
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState<{ devLink?: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      setSent(await api<{ devLink?: string }>("/login", { body: { email, turnstileToken: token } }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-6 pt-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Přihlášení</h1>
        <p className="text-muted-foreground">
          Pošleme vám odkaz, kterým se dostanete ke svým tipům. Heslo nepotřebujete.
        </p>
      </div>
      {params.get("odkaz") === "neplatny" && !sent && (
        <Alert variant="destructive">
          <AlertTitle>Odkaz už neplatí</AlertTitle>
          <AlertDescription>Nechte si poslat nový.</AlertDescription>
        </Alert>
      )}
      {sent ? (
        <Alert>
          <AlertTitle>Podívejte se do e-mailu</AlertTitle>
          <AlertDescription>
            Pokud na adrese {email} už nějaký tip máte, poslali jsme vám odkaz pro přihlášení. Ještě jste netipovali?
            Stačí odeslat první tip a účet vznikne sám.
            {sent.devLink && (
              <>
                {" "}
                <a className="underline" href={sent.devLink}>
                  Otevřít odkaz (vývojový režim)
                </a>
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="login-email">E-mail</FieldLabel>
              <Input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                aria-invalid={error ? true : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <FieldDescription>{error}</FieldDescription>}
            </Field>
            {config?.turnstileSiteKey && <Turnstile siteKey={config.turnstileSiteKey} onToken={setToken} />}
            <Field orientation="horizontal">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner data-icon="inline-start" />}
                Poslat odkaz
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
    </section>
  )
}
