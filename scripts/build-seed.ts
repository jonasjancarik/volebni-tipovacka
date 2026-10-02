// Turns the ČSÚ open-data registers in data/csu into seed/seed.sql for D1.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { parse } from "csv-parse/sync"

type Row = Record<string, string>
const read = (name: string): Row[] => parse(readFileSync(`data/csu/${name}.csv`, "utf8"), { columns: true, bom: true })

const sql = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`

export const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()

const okresy = new Map(read("cnumnuts").map((r) => [r.NUMNUTS, r.NAZEVNUTS]))
const druhy: Record<string, string> = {
  "1": "Obec",
  "2": "Město",
  "3": "Statutární město",
  "4": "Hlavní město",
  "5": "Městská část nebo obvod",
  "6": "Městys",
}

const races: (string | number | null)[][] = []
const options: (string | number)[][] = []

// Councils. A city council appears once per city part in kvrzcoco, so group by KODZASTUP.
const lists = new Map<string, Row[]>()
for (const r of read("kvros")) {
  if (!lists.has(r.KODZASTUP)) lists.set(r.KODZASTUP, [])
  lists.get(r.KODZASTUP)!.push(r)
}
const councils = new Map<string, Row[]>()
for (const r of read("kvrzcoco")) {
  if (!councils.has(r.KODZASTUP)) councils.set(r.KODZASTUP, [])
  councils.get(r.KODZASTUP)!.push(r)
}
let skipped = 0
for (const [code, rows] of councils) {
  const own = lists.get(code) ?? []
  // Skipped: councils without any list, and the one town split into several electoral districts.
  if (own.length === 0 || own.some((l) => l.COBVODU !== "1")) {
    skipped++
    continue
  }
  const r = rows[0]
  const pops = new Set(rows.map((x) => Number(x.POCOBYV)))
  const population = pops.size === 1 ? [...pops][0] : rows.reduce((a, x) => a + Number(x.POCOBYV), 0)
  const name = r.DRUHZASTUP === "4" ? "Praha" : r.NAZEVZAST
  const okres = okresy.get(r.OKRES) ?? ""
  const subtitle =
    r.DRUHZASTUP === "4"
      ? "Zastupitelstvo hlavního města"
      : r.OKRES === "1100"
        ? "Městská část Prahy"
        : [druhy[r.DRUHZASTUP], okres && `okres ${okres}`].filter(Boolean).join(", ")
  const id = `kv-${code}`
  races.push([id, "kv", Number(code), name, subtitle, normalize(name), population, Number(r.MANDATY)])
  for (const l of own) {
    const short = l.ZKRATKAO30.trim()
    const full = l.NAZEVCELK.trim()
    options.push([id, Number(l.POR_STR_HL), short || full, short && short !== full ? full : ""])
  }
}

// Senate districts.
const candidates = read("serk").filter((r) => r.PLATNOST === "A")
const districts = new Map(read("secobv").map((r) => [r.OBVOD, r.NAZEV_OBV]))
for (const obvod of new Set(candidates.map((r) => r.OBVOD))) {
  const id = `se-${obvod}`
  const name = `${districts.get(obvod)} – senátní obvod ${obvod}`
  races.push([id, "se", Number(obvod), name, "Volby do Senátu", normalize(name), 0, 1])
  for (const c of candidates.filter((r) => r.OBVOD === obvod)) {
    options.push([id, Number(c.CKAND), `${c.JMENO} ${c.PRIJMENI}`, c.NAZEV_VS])
  }
}

const insert = (table: string, cols: string, rows: (string | number | null)[][]) => {
  const out: string[] = []
  for (let i = 0; i < rows.length; i += 100) {
    const values = rows.slice(i, i + 100).map((r) => `(${r.map(sql).join(",")})`)
    out.push(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES\n${values.join(",\n")};`)
  }
  return out.join("\n")
}

mkdirSync("seed", { recursive: true })
writeFileSync(
  "seed/seed.sql",
  [
    insert("races", "id,kind,code,name,subtitle,search,population,seats", races),
    insert("options", "race_id,num,name,detail", options),
  ].join("\n") + "\n"
)
console.log(`races: ${races.length}, options: ${options.length}, skipped councils: ${skipped}`)
