import { SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"

import { useConfig } from "@/App"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { api, formatDeadline, tipsLabel, type RaceSummary } from "@/lib/api"

function RaceLink({ race }: { race: RaceSummary }) {
  return (
    <Link
      to={`/tip/${race.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{race.name}</div>
        <div className="truncate text-sm text-muted-foreground">
          {race.kind === "kv" ? race.subtitle : `${race.options} kandidátů`}
        </div>
      </div>
      {race.tips > 0 && <Badge variant="secondary">{tipsLabel(race.tips)}</Badge>}
    </Link>
  )
}

export function Home() {
  const { config } = useConfig()
  const [query, setQuery] = useState("")
  const [councils, setCouncils] = useState<RaceSummary[] | null>(null)
  const [senate, setSenate] = useState<RaceSummary[] | null>(null)

  useEffect(() => {
    api<RaceSummary[]>("/senate").then(setSenate).catch(() => setSenate([]))
  }, [])

  useEffect(() => {
    const timer = setTimeout(
      () => {
        api<RaceSummary[]>(`/races?q=${encodeURIComponent(query)}`)
          .then(setCouncils)
          .catch(() => setCouncils([]))
      },
      query ? 200 : 0,
    )
    return () => clearTimeout(timer)
  }, [query])

  const searching = query.trim().length >= 2

  return (
    <>
      <section className="flex flex-col gap-3 pt-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Jak dopadnou volby u vás?
        </h1>
        <p className="text-lg text-muted-foreground">
          Tipněte si výsledek komunálních voleb ve své obci nebo senátních voleb ve svém obvodu. Po sečtení hlasů
          uvidíte, jak blízko jste byli a kdo tipoval nejlépe.
        </p>
        {config && (
          <p className="text-sm">
            {config.open
              ? `Tipovat můžete do otevření volebních místností: ${formatDeadline(config.deadline)}.`
              : "Tipování skončilo. U každé obce a obvodu teď najdete výsledky a pořadí tipujících."}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Komunální volby</h2>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Najděte svou obec, město nebo městskou část"
            aria-label="Hledat obec"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>
        {!searching && <p className="text-sm text-muted-foreground">Největší města</p>}
        {councils === null ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : councils.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Žádnou obec s tímhle názvem jsme nenašli. Zkuste zadat jen začátek názvu.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {councils.map((race) => (
              <RaceLink key={race.id} race={race} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold">Senátní volby</h2>
          <p className="text-sm text-muted-foreground">Letos se volí ve 27 obvodech.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {senate === null
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)
            : senate.map((race) => <RaceLink key={race.id} race={race} />)}
        </div>
      </section>
    </>
  )
}
