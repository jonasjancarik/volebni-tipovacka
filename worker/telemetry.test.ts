import { describe, expect, it } from "vitest"
import { pragueDay, referrerHost, viewPath } from "./telemetry"

describe("viewPath", () => {
  it("accepts the site's pages and race pages", () => {
    expect(viewPath("/")).toEqual({ path: "/", raceId: null })
    expect(viewPath("/tip/kv-554782")).toEqual({ path: "/tip/kv-554782", raceId: "kv-554782" })
  })

  it("rejects anything else, including addresses carrying a token", () => {
    expect(viewPath("/potvrzeni?token=abc")).toBeNull()
    expect(viewPath("/tip/someone@example.com")).toBeNull()
    expect(viewPath(undefined)).toBeNull()
  })
})

describe("referrerHost", () => {
  it("keeps only the host", () => {
    expect(referrerHost("https://www.seznam.cz/hledani?q=tipovacka", "tipovacka.example")).toBe("seznam.cz")
  })

  it("drops the site itself and unusable values", () => {
    expect(referrerHost("https://tipovacka.example/pravidla", "tipovacka.example")).toBe("")
    expect(referrerHost("android-app://com.example", "tipovacka.example")).toBe("")
    expect(referrerHost("nonsense", "tipovacka.example")).toBe("")
  })
})

describe("pragueDay", () => {
  it("uses the Prague calendar day", () => {
    expect(pragueDay(new Date("2026-10-09T22:30:00Z"))).toBe("2026-10-10")
  })
})
