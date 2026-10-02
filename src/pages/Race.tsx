import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { useConfig } from "@/App"
import { Turnstile } from "@/components/turnstile"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, pct, tipsLabel, type RaceDetail } from "@/lib/api"
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts"
import { rescaleTo100 } from "@/lib/shares"
import { cn } from "@/lib/utils"

const toNumber = (s: string) => Number(s.replace(",", ".").trim() || 0)
const toInput = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","))
const round1 = (n: number) => Math.round(n * 10) / 10

/** Thin horizontal bar; `scale` is the value that fills the whole width. */
function ShareBar({ value, scale, muted }: { value: number; scale: number; muted?: boolean }) {
  const width = scale > 0 ? Math.max(0, Math.min(100, (value / scale) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-full transition-[width]", muted ? "bg-muted-foreground/35" : "bg-primary")}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function PercentInput(props: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  placeholder?: string
}) {
  return (
    <InputGroup className="w-28 shrink-0">
      <InputGroupInput
        id={props.id}
        inputMode="decimal"
        placeholder={props.placeholder ?? "0"}
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
  const saved = {
    shares: Object.fromEntries(
      options.map((o) => [o.num, myTip?.filled.includes(o.num) ? toInput(myTip.shares[o.num]) : ""])
    ) as Record<number, string>,
    turnout: toInput(myTip?.turnout),
    winner: myTip?.winner ? String(myTip.winner) : "",
  }
  // A draft left in this browser wins over the saved tip, so unfinished edits are not lost.
  const [draft] = useState(() => loadDraft(race.id))
  const [restored, setRestored] = useState(draft !== null)
  const [shares, setShares] = useState<Record<number, string>>(
    draft ? { ...saved.shares, ...draft.shares } : saved.shares
  )
  const [turnout, setTurnout] = useState(draft?.turnout ?? saved.turnout)
  const [winner, setWinner] = useState(draft?.winner || saved.winner)

  // Only real differences from the saved tip count as a draft; otherwise there is nothing to remember.
  const savedJson = JSON.stringify(saved)
  useEffect(() => {
    const current = { shares, turnout, winner }
    if (JSON.stringify(current) === savedJson) clearDraft(race.id)
    else saveDraft(race.id, current)
  }, [race.id, shares, turnout, winner, savedJson])

  const discardDraft = () => {
    setShares(saved.shares)
    setTurnout(saved.turnout)
    setWinner(saved.winner)
    setRestored(false)
  }
  const [email, setEmail] = useState("")
  const [sort, setSort] = useState<"num" | "name">("num")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState<{ devLink?: string } | null>(null)

  const collator = new Intl.Collator("cs")
  const shown = sort === "num" ? options : [...options].sort((a, b) => collator.compare(a.name, b.name))
  const filled = options.filter((o) => (shares[o.num] ?? "").trim() !== "")
  const values = filled.map((o) => toNumber(shares[o.num]))
  const invalidValue = values.some((v) => !Number.isFinite(v) || v > 100)
  const sum = round1(values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0))
  const remaining = round1(100 - sum)
  const blanks = options.length - filled.length
  // Whatever is left over is split equally among the fields the tipper skipped.
  const each = blanks > 0 && remaining >= 0 ? remaining / blanks : 0
  const sharesOk = !invalidValue && filled.length > 0 && remaining >= 0 && (blanks > 0 || remaining === 0)
  const complete = sharesOk && turnout.trim() !== "" && (!isSenate || winner !== "")
  // Offered when the entered shares cannot add up to 100: scales them down (or up) keeping their proportions.
  const canRescale = !invalidValue && sum > 0 && (remaining < 0 || (blanks === 0 && remaining > 0))
  const rescale = () => {
    const scaled = rescaleTo100(values)
    setShares((s) => ({ ...s, ...Object.fromEntries(filled.map((o, i) => [o.num, toInput(scaled[i])])) }))
  }
  // Bars are drawn relative to the largest share so small parties stay visible on long ballots.
  const shareOf = (num: number) => {
    const typed = (shares[num] ?? "").trim()
    const v = typed === "" ? each : toNumber(typed)
    return Number.isFinite(v) ? v : 0
  }
  const barScale = Math.max(10, ...options.map((o) => shareOf(o.num)))
  const status =
    filled.length === 0
      ? `Vyplňte odhad aspoň u jednoho ${isSenate ? "kandidáta" : "z uskupení"}.`
      : remaining < 0
        ? `Rozdělili jste o ${pct(-remaining)} víc, než je 100 %.`
        : blanks === 0
          ? remaining === 0
            ? "Rozděleno přesně 100 %."
            : `Zbývá rozdělit ${pct(remaining)}.`
          : remaining === 0
            ? "Rozděleno přesně 100 %. Nevyplněné počítáme jako 0 %."
            : blanks === 1
              ? `Zbylých ${pct(remaining)} připadne na jedinou nevyplněnou položku.`
              : `Zbylých ${pct(remaining)} rozdělíme rovným dílem mezi ${blanks} ${blanks < 5 ? "nevyplněné položky" : "nevyplněných položek"}, na každou vyjde ${pct(each, 2)}.`

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await api<{ saved?: boolean; devLink?: string }>("/tips", {
        body: {
          raceId: race.id,
          shares: Object.fromEntries(filled.map((o, i) => [o.num, values[i]])),
          turnout: toNumber(turnout),
          winner: isSenate ? Number(winner) : null,
          email,
          turnstileToken: token,
        },
      })
      if (res.saved) {
        clearDraft(race.id)
        setRestored(false)
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
          Na adresu {email} jsme poslali odkaz. Tip začne platit, až na něj kliknete. V e-mailu najdete i přezdívku, pod
          kterou vás ostatní uvidí v pořadí. Když zpráva nepřijde do pár minut, podívejte se do spamu.
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
        {restored && (
          <Alert>
            <AlertTitle>Pokračujete v rozepsaném tipu</AlertTitle>
            <AlertDescription>
              Čísla, která jste tu minule nedokončili, jsme si v tomto prohlížeči zapamatovali.
              {myTip ? " Váš uložený tip platí dál, dokud změny neodešlete." : ""}
            </AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={discardDraft}>
                {myTip ? "Vrátit uložený tip" : "Začít znovu"}
              </Button>
            </AlertAction>
          </Alert>
        )}
        <FieldSet>
          <FieldLegend>
            {isSenate ? "Kolik procent získají kandidáti v prvním kole" : "Kolik procent hlasů získají"}
          </FieldLegend>
          <FieldDescription>
            Nemusíte vyplňovat každého. Zadejte odhad tam, kde nějaký máte, a zbytek do 100 % rozdělíme rovným dílem
            mezi ostatní. Kolik na ně vyjde, uvidíte šedě v prázdných polích.
          </FieldDescription>
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[sort]}
            onValueChange={(v) => v[0] && setSort(v[0] as "num" | "name")}
            aria-label="Řazení"
          >
            <ToggleGroupItem value="num">Podle volebního čísla</ToggleGroupItem>
            <ToggleGroupItem value="name">Podle abecedy</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-col divide-y">
            {shown.map((o) => (
              <div key={o.num} className="flex items-center gap-3 py-2.5">
                <Badge variant="outline" className="w-8 shrink-0 justify-center tabular-nums">
                  {o.num}
                </Badge>
                <label htmlFor={`share-${o.num}`} className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div>
                    <div className="font-medium">{o.name}</div>
                    {o.detail && <div className="line-clamp-2 text-sm text-muted-foreground">{o.detail}</div>}
                  </div>
                  <ShareBar value={shareOf(o.num)} scale={barScale} muted={(shares[o.num] ?? "").trim() === ""} />
                </label>
                <PercentInput
                  id={`share-${o.num}`}
                  value={shares[o.num] ?? ""}
                  placeholder={sharesOk ? toInput(Math.round(each * 100) / 100) : "0"}
                  invalid={toNumber(shares[o.num] ?? "") > 100}
                  onChange={(v) => setShares((s) => ({ ...s, [o.num]: v }))}
                />
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background py-3">
            <Progress value={Math.min(sum, 100)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm" aria-live="polite">
                {status}
              </p>
              {canRescale && (
                <Button type="button" variant="outline" size="sm" onClick={rescale}>
                  Přepočítat na 100 %
                </Button>
              )}
            </div>
            {canRescale && (
              <p className="text-sm text-muted-foreground">
                Přepočet {remaining < 0 ? "zmenší" : "zvětší"} všechna zadaná čísla ve stejném poměru, takže pořadí i
                odstupy mezi nimi zůstanou.
              </p>
            )}
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
              <FieldLabel htmlFor="email">E-mail</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FieldDescription>
                Pošleme vám odkaz, kterým tip potvrdíte. Adresu si neukládáme, jen její otisk, podle kterého vás příště
                poznáme.
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
  const barScale = Math.max(10, ...options.map((o) => Math.max(o.pct ?? 0, myTip?.shares[o.num] ?? 0)))

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
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col gap-1.5">
                      {o.name}
                      <div className="flex flex-col gap-0.5">
                        {counted && <ShareBar value={o.pct ?? 0} scale={barScale} />}
                        {myTip && <ShareBar value={myTip.shares[o.num] ?? 0} scale={barScale} muted />}
                      </div>
                    </div>
                  </TableCell>
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
        {counted && myTip && (
          <p className="text-sm text-muted-foreground">Tmavý pruh ukazuje skutečný výsledek, světlý váš tip.</p>
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
  // Once the link is confirmed the tip is stored on the server, so the browser copy is no longer needed.
  if (confirmation && id) clearDraft(id)

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

      {data &&
        config &&
        (config.open ? (
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
        ))}
    </>
  )
}
