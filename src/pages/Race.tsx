import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { useConfig } from "@/App"
import { Turnstile } from "@/components/turnstile"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, pct, tipsLabel, type RaceDetail } from "@/lib/api"

const toNumber = (s: string) => Number(s.replace(",", ".").trim() || 0)
const toInput = (n: number | undefined) => (n ? String(n).replace(".", ",") : "")

function PercentInput(props: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <InputGroup className="w-28 shrink-0">
      <InputGroupInput
        id={props.id}
        inputMode="decimal"
        placeholder="0"
        className="text-right"
        value={props.value}
        aria-invalid={props.invalid || undefined}
        onChange={(e) => props.onChange(e.target.value.replace(/[^\d.,]/g, ""))}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>%</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

function TipForm({ data, onSaved }: { data: RaceDetail; onSaved: () => void }) {
  const { config } = useConfig()
  const { race, options, myTip } = data
  const isSenate = race.kind === "se"
  const [shares, setShares] = useState<Record<number, string>>(() =>
    Object.fromEntries(options.map((o) => [o.num, toInput(myTip?.shares[o.num])])),
  )
  const [turnout, setTurnout] = useState(toInput(myTip?.turnout))
  const [winner, setWinner] = useState(myTip?.winner ? String(myTip.winner) : "")
  const [email, setEmail] = useState("")
  const [nickname, setNickname] = useState("")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState<{ devLink?: string } | null>(null)

  const values = options.map((o) => toNumber(shares[o.num] ?? ""))
  const invalidValue = values.some((v) => !Number.isFinite(v) || v > 100)
  const sum = Math.round(values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) * 10) / 10
  const remaining = Math.round((100 - sum) * 10) / 10
  const complete = !invalidValue && remaining === 0 && turnout.trim() !== "" && (!isSenate || winner !== "")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await api<{ saved?: boolean; devLink?: string }>("/tips", {
        body: {
          raceId: race.id,
          shares: Object.fromEntries(options.map((o, i) => [o.num, values[i]])),
          turnout: toNumber(turnout),
          winner: isSenate ? Number(winner) : null,
          email,
          nickname,
          turnstileToken: token,
        },
      })
      if (res.saved) {
        toast.success("Tip je uložený.")
        onSaved()
      } else setSent(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Alert>
        <AlertTitle>Ještě tip potvrďte v e-mailu</AlertTitle>
        <AlertDescription>
          Na adresu {email} jsme poslali odkaz. Tip začne platit, až na něj kliknete. Když e-mail nepřijde do pár
          minut, podívejte se do spamu.
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
    )
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{isSenate ? "Kolik procent získají kandidáti v prvním kole" : "Kolik procent hlasů získají"}</FieldLegend>
          <div className="flex flex-col divide-y">
            {options.map((o) => (
              <div key={o.num} className="flex items-center gap-3 py-2.5">
                <Badge variant="outline" className="w-8 shrink-0 justify-center tabular-nums">
                  {o.num}
                </Badge>
                <label htmlFor={`share-${o.num}`} className="min-w-0 flex-1">
                  <div className="font-medium">{o.name}</div>
                  {o.detail && <div className="line-clamp-2 text-sm text-muted-foreground">{o.detail}</div>}
                </label>
                <PercentInput
                  id={`share-${o.num}`}
                  value={shares[o.num] ?? ""}
                  invalid={toNumber(shares[o.num] ?? "") > 100}
                  onChange={(v) => setShares((s) => ({ ...s, [o.num]: v }))}
                />
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background py-3">
            <Progress value={Math.min(sum, 100)} />
            <p className="text-sm" aria-live="polite">
              {remaining === 0
                ? "Rozděleno přesně 100 %."
                : remaining > 0
                  ? `Zbývá rozdělit ${pct(remaining)}.`
                  : `Rozdělili jste o ${pct(-remaining)} víc, než je 100 %.`}
            </p>
          </div>
        </FieldSet>

        {isSenate && (
          <Field>
            <FieldLabel htmlFor="winner">Kdo se stane senátorem</FieldLabel>
            <NativeSelect id="winner" value={winner} onChange={(e) => setWinner(e.target.value)}>
              <NativeSelectOption value="">Vyberte kandidáta</NativeSelectOption>
              {options.map((o) => (
                <NativeSelectOption key={o.num} value={o.num}>
                  {o.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>Počítá se konečný vítěz, i kdyby o něm rozhodlo až druhé kolo.</FieldDescription>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="turnout">Volební účast</FieldLabel>
          <PercentInput id="turnout" value={turnout} onChange={setTurnout} invalid={toNumber(turnout) > 100} />
          <FieldDescription>
            {isSenate ? "Účast v prvním kole. Rozhoduje při shodě v pořadí." : "Rozhoduje při shodě v pořadí."}
          </FieldDescription>
        </Field>

        {!config?.me && (
          <>
            <Field>
              <FieldLabel htmlFor="nickname">Přezdívka</FieldLabel>
              <Input id="nickname" required minLength={2} maxLength={30} value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <FieldDescription>Pod ní vás ostatní uvidí v pořadí tipujících.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">E-mail</FieldLabel>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <FieldDescription>
                Pošleme vám odkaz, kterým tip potvrdíte. Adresu si neukládáme, jen její otisk, podle kterého vás příště poznáme.
              </FieldDescription>
            </Field>
            {config?.turnstileSiteKey && <Turnstile siteKey={config.turnstileSiteKey} onToken={setToken} />}
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Field orientation="horizontal">
          <Button type="submit" disabled={busy || !complete}>
            {busy && <Spinner data-icon="inline-start" />}
            {myTip ? "Uložit změny" : "Odeslat tip"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

function Results({ data }: { data: RaceDetail }) {
  const { race, options, myTip, leaderboard, myRank } = data
  const counted = race.countedPct !== null
  const sorted = counted ? [...options].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)) : options
  const winnerName = options.find((o) => o.num === race.winner)?.name
  const myWinner = options.find((o) => o.num === myTip?.winner)?.name

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-xl font-semibold">{counted ? "Výsledky" : "Váš tip"}</h2>
          {counted && (
            <Badge variant={race.final ? "default" : "secondary"}>
              {race.final ? "Sečteno" : `Sečteno ${pct(race.countedPct!, 0)} okrsků`}
            </Badge>
          )}
        </div>
        {!counted && (
          <p className="text-muted-foreground">
            Tipování skončilo. Výsledky a pořadí tipujících se tu začnou objevovat po uzavření volebních místností.
            {!myTip && " Vy jste tady netipovali."}
          </p>
        )}
        {(counted || myTip) && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{race.kind === "se" ? "Kandidát" : "Kandidátní listina"}</TableHead>
                {counted && <TableHead className="text-right">Výsledek</TableHead>}
                {myTip && <TableHead className="text-right">Váš tip</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((o) => (
                <TableRow key={o.num}>
                  <TableCell className="whitespace-normal">{o.name}</TableCell>
                  {counted && <TableCell className="text-right tabular-nums">{pct(o.pct ?? 0, 2)}</TableCell>}
                  {myTip && <TableCell className="text-right tabular-nums">{pct(myTip.shares[o.num] ?? 0)}</TableCell>}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium">Volební účast</TableCell>
                {counted && <TableCell className="text-right tabular-nums">{pct(race.turnout ?? 0, 2)}</TableCell>}
                {myTip && <TableCell className="text-right tabular-nums">{pct(myTip.turnout)}</TableCell>}
              </TableRow>
            </TableBody>
          </Table>
        )}
        {race.kind === "se" && (winnerName || myWinner) && (
          <p className="text-sm">
            {winnerName ? `Senátorem se stal(a) ${winnerName}.` : "O senátorovi rozhodne druhé kolo."}
            {myWinner && ` Vy jste tipovali: ${myWinner}.`}
          </p>
        )}
      </section>

      {leaderboard && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-xl font-semibold">Pořadí tipujících</h2>
            <p className="text-sm text-muted-foreground">
              {leaderboard.length === 0
                ? "Tady nikdo netipoval."
                : `${race.final ? "" : "Průběžné pořadí, mění se se sčítáním. "}Odchylka říká, o kolik procentních bodů se tip v průměru spletl.${myRank ? ` Jste na ${myRank}. místě.` : ""}`}
            </p>
          </div>
          {leaderboard.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Přezdívka</TableHead>
                  <TableHead className="text-right">Odchylka</TableHead>
                  <TableHead className="text-right">Tip účasti</TableHead>
                  {race.kind === "se" && race.winner !== null && <TableHead className="text-right">Vítěz</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((row) => (
                  <TableRow key={row.rank} data-state={row.mine ? "selected" : undefined}>
                    <TableCell className="tabular-nums">{row.rank}.</TableCell>
                    <TableCell className="whitespace-normal">
                      {row.nickname}
                      {row.mine && " (vy)"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.error.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p. b.
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(row.turnout)}</TableCell>
                    {race.kind === "se" && race.winner !== null && (
                      <TableCell className="text-right">
                        {row.winnerHit ? (
                          <CheckIcon className="ml-auto size-4" aria-label="Trefil vítěze" />
                        ) : (
                          <XIcon className="ml-auto size-4 text-muted-foreground" aria-label="Netrefil vítěze" />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </>
  )
}

export function RacePage() {
  const { id } = useParams()
  const { config, reload } = useConfig()
  const [params] = useSearchParams()
  const [data, setData] = useState<RaceDetail | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    api<RaceDetail>(`/races/${id}`)
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // A confirmation link signs the visitor in, so the header needs fresh account info.
  const confirmation = params.get("potvrzeni")
  useEffect(() => {
    if (confirmation) reload()
  }, [confirmation, reload])

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Button variant="ghost" size="sm" className="-ml-2 self-start" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Jiná obec nebo obvod
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !data ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{data.race.name}</h1>
            <p className="text-muted-foreground">
              {[
                data.race.subtitle,
                data.race.kind === "kv" && data.race.seats ? `volí se ${data.race.seats} zastupitelů` : "",
                data.tipCount > 0 ? `${config?.open ? "zatím " : ""}${tipsLabel(data.tipCount)}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}
      </div>

      {confirmation === "ok" && (
        <Alert>
          <AlertTitle>Tip je potvrzený</AlertTitle>
          <AlertDescription>
            Do uzávěrky ho můžete kdykoli upravit. Další tipy z tohoto zařízení už potvrzovat nemusíte.
          </AlertDescription>
        </Alert>
      )}
      {confirmation === "pozde" && (
        <Alert variant="destructive">
          <AlertTitle>Tip už nešlo započítat</AlertTitle>
          <AlertDescription>Potvrzení přišlo až po uzávěrce tipování.</AlertDescription>
        </Alert>
      )}

      {data && config && (
        config.open ? (
          <>
            {data.myTip && !confirmation && (
              <Alert>
                <AlertTitle>Tady už tip máte</AlertTitle>
                <AlertDescription>Do uzávěrky ho můžete změnit.</AlertDescription>
              </Alert>
            )}
            <TipForm key={`${data.race.id}-${config.me?.nickname ?? ""}`} data={data} onSaved={load} />
          </>
        ) : (
          <Results data={data} />
        )
      )}
    </>
  )
}
