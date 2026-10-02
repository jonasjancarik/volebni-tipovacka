import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { useConfig } from "@/App"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type RaceSummary } from "@/lib/api"

export function MyTips() {
  const { config, reload } = useConfig()
  const navigate = useNavigate()
  const [tips, setTips] = useState<RaceSummary[] | null>(null)
  const [draft, setNickname] = useState<string | null>(null)
  const nickname = draft ?? config?.me?.nickname ?? ""

  useEffect(() => {
    if (!config) return
    if (!config.me) {
      navigate("/prihlaseni", { replace: true })
      return
    }
    api<RaceSummary[]>("/me/tips").then(setTips).catch(() => setTips([]))
  }, [config, navigate])

  const saveNickname = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api("/me", { body: { nickname } })
      toast.success("Přezdívka je změněná.")
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const logout = async () => {
    await api("/logout", { method: "POST" })
    reload()
    navigate("/")
  }

  const deleteAccount = async () => {
    if (!window.confirm("Opravdu smazat účet i všechny vaše tipy? Nejde to vrátit.")) return
    await api("/me", { method: "DELETE" })
    reload()
    navigate("/")
  }

  if (!config?.me) return null

  return (
    <>
      <section className="flex flex-col gap-4 pt-6">
        <h1 className="font-heading text-2xl font-semibold">Moje tipy</h1>
        {tips === null ? (
          <Skeleton className="h-16" />
        ) : tips.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Zatím jste nic netipovali</EmptyTitle>
              <EmptyDescription>Vyberte si obec nebo senátní obvod a zkuste odhadnout výsledek.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link to="/" />}>Vybrat obec nebo obvod</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-2">
            {tips.map((race) => (
              <Link
                key={race.id}
                to={`/tip/${race.id}`}
                className="rounded-lg border px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="font-medium">{race.name}</div>
                <div className="text-sm text-muted-foreground">{race.subtitle}</div>
              </Link>
            ))}
            {config.open && (
              <Button variant="outline" className="self-start" nativeButton={false} render={<Link to="/" />}>
                Přidat další tip
              </Button>
            )}
          </div>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Účet</h2>
        <form onSubmit={saveNickname} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="nickname">Přezdívka</FieldLabel>
            <Input id="nickname" value={nickname} minLength={2} maxLength={30} onChange={(e) => setNickname(e.target.value)} />
            <FieldDescription>
              Pod přezdívkou vás ostatní uvidí v pořadí tipujících. Přihlášeni jste jako {config.me.email}.
            </FieldDescription>
          </Field>
          <Button type="submit" variant="outline" className="self-start" disabled={nickname.trim() === config.me.nickname}>
            Uložit přezdívku
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={logout}>
            Odhlásit se
          </Button>
          <Button variant="destructive" onClick={deleteAccount}>
            Smazat účet a tipy
          </Button>
        </div>
      </section>
    </>
  )
}
