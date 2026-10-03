import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseCouncil, parseSenate } from "./results"
import { compareScores, compareWeightedScores, expandShares, scoreTip, validateTip } from "./scoring"

const fixture = (name: string) => readFileSync(`worker/fixtures/${name}`, "utf8")

describe("parseSenate", () => {
  const senate = parseSenate(fixture("senat-2024.xml"))

  it("reads a district decided in round one", () => {
    const sokolov = senate.get(2)!
    expect(sokolov.turnout).toBe(27.05)
    expect(sokolov.final).toBe(true)
    expect(sokolov.winner).toBe(2)
    expect(sokolov.pcts[2]).toBe(50.72)
  })

  it("takes the winner from round two but shares from round one", () => {
    const decidedLater = [...senate.values()].filter((r) => r.winner !== null)
    expect(decidedLater).toHaveLength(27)
    for (const r of senate.values()) {
      const sum = Object.values(r.pcts).reduce((a, b) => a + b, 0)
      expect(sum).toBeGreaterThan(99)
      expect(sum).toBeLessThan(100.5)
    }
  })
})

describe("parseCouncil", () => {
  it("reads an uncounted council as zero progress", () => {
    const praha = parseCouncil(fixture("kv-praha-empty.xml"))!
    expect(praha.countedPct).toBe(0)
    expect(praha.final).toBe(false)
    expect(Object.keys(praha.pcts).length).toBeGreaterThan(10)
  })

  it("reads shares and turnout", () => {
    const r = parseCouncil(`<VYSLEDKY_OBEC><OBEC KODZASTUP="1"><VYSLEDEK>
      <UCAST OKRSKY_CELKEM="2" OKRSKY_ZPRAC="2" OKRSKY_ZPRAC_PROC="100.00" UCAST_PROC="45.50"/>
      <VOLEBNI_STRANA POR_STR_HLAS_LIST="1" HLASY_PROC="60.25"/>
      <VOLEBNI_STRANA POR_STR_HLAS_LIST="2" HLASY_PROC="39.75"/>
    </VYSLEDEK></OBEC></VYSLEDKY_OBEC>`)!
    expect(r).toEqual({ countedPct: 100, turnout: 45.5, final: true, winner: null, pcts: { 1: 60.25, 2: 39.75 } })
  })

  it("returns null for an error response", () => {
    expect(parseCouncil("<VYSLEDKY_OBEC><CHYBA>x</CHYBA></VYSLEDKY_OBEC>")).toBeNull()
  })
})

describe("tips", () => {
  it("rejects a fully filled tip that does not add up to 100", () => {
    expect(validateTip({ turnout: 40, shares: { 1: 50, 2: 40 } }, "kv", [1, 2])).toMatch(/přesně 100 %/)
  })

  it("rejects shares above 100 in total and an empty tip", () => {
    expect(validateTip({ turnout: 40, shares: { 1: 70, 2: 40 } }, "kv", [1, 2, 3])).toMatch(/víc než 100 %/)
    expect(validateTip({ turnout: 40, shares: { 1: "" } }, "kv", [1, 2])).toMatch(/aspoň u jedné/)
  })

  it("splits the remainder equally among skipped options", () => {
    expect(expandShares({ 1: 60, 2: 28 }, [1, 2, 3, 4, 5])).toEqual({ 1: 60, 2: 28, 3: 4, 4: 4, 5: 4 })
    expect(expandShares({ 1: 100 }, [1, 2])).toEqual({ 1: 100, 2: 0 })
  })

  it("requires a Senate winner from the ballot", () => {
    expect(validateTip({ turnout: 40, shares: { 1: 50, 2: 50 }, winner: 9 }, "se", [1, 2])).toMatch(/senátorem/)
  })

  it("keeps only filled shares and rounds to one decimal", () => {
    expect(validateTip({ turnout: "41.26", shares: { 1: 55.55, 2: "" } }, "kv", [1, 2, 3])).toEqual({
      turnout: 41.3,
      shares: { 1: 55.6 },
      winner: null,
    })
  })

  it("ignores anything in the request that is not a share for an option on the ballot", () => {
    const body = {
      turnout: 40,
      shares: { 1: 60, 99: 40, __proto__: 5, note: "<script>" },
      nickname: "Vlastní",
      winner: 7,
    }
    expect(validateTip(body, "kv", [1, 2])).toEqual({ turnout: 40, shares: { 1: 60 }, winner: null })
  })

  it("ranks by average error, then turnout", () => {
    const actual = { pcts: { 1: 60, 2: 40 }, turnout: 50, winner: null }
    const close = scoreTip({ shares: { 1: 58, 2: 42 }, turnout: 30, winner: null }, actual)
    const far = scoreTip({ shares: { 1: 50, 2: 50 }, turnout: 50, winner: null }, actual)
    const closeBetterTurnout = scoreTip({ shares: { 1: 62, 2: 38 }, turnout: 49, winner: null }, actual)
    expect(close.error).toBe(2)
    expect([far, close, closeBetterTurnout].sort(compareScores)).toEqual([closeBetterTurnout, close, far])
  })

  it("counts the same miss more for a small list only in the weighted ranking", () => {
    const actual = { pcts: { 1: 20, 2: 5, 3: 75 }, turnout: 50, winner: null }
    const offAtBig = scoreTip({ shares: { 1: 23, 2: 5, 3: 75 }, turnout: 50, winner: null }, actual)
    const offAtSmall = scoreTip({ shares: { 1: 20, 2: 8, 3: 75 }, turnout: 50, winner: null }, actual)
    expect(offAtSmall.error).toBe(offAtBig.error)
    expect(offAtSmall.weightedError / offAtBig.weightedError).toBeCloseTo(2)
    expect([offAtSmall, offAtBig].sort(compareWeightedScores)).toEqual([offAtBig, offAtSmall])
  })

  it("weights lists with no votes like lists with 1 %", () => {
    const actual = { pcts: { 1: 100, 2: 0 }, turnout: 50, winner: null }
    const score = scoreTip({ shares: { 1: 99, 2: 1 }, turnout: 50, winner: null }, actual)
    expect(score.weightedError).toBeCloseTo(1)
  })
})
