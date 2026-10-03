import { describe, expect, it } from "vitest"

import { buildResultEmail } from "./result-email"

describe("result e-mail", () => {
  const placing = { tips: 12, rank: 3, error: 2.456, weightedRank: 5, weightedError: 3.1 }

  it("reports both rankings for every race", () => {
    const mail = buildResultEmail("Modrý jezevec", "https://example.test", [
      { id: "kv-1", name: "Brno", ...placing },
      { id: "se-27", name: "Obvod 27", ...placing, rank: 1 },
    ])
    expect(mail.subject).toBe("Jak dopadly vaše tipy")
    expect(mail.text).toContain("Hlavní pořadí: 3. místo z 12, průměrná odchylka 2,46 p. b.")
    expect(mail.text).toContain("Vážené pořadí: 5. místo z 12, vážená odchylka 3,10 p. b.")
    expect(mail.text).toContain("https://example.test/tip/se-27")
    expect(mail.text).toContain("kryptografický otisk")
    expect(mail.html).toContain("1. místo z 12")
  })

  it("names the race in the subject when there is only one and escapes it in HTML", () => {
    const mail = buildResultEmail("N", "https://example.test", [{ id: "kv-1", name: "A <b> & B", ...placing }])
    expect(mail.subject).toBe("Jak dopadl váš tip: A <b> & B")
    expect(mail.html).toContain("A &lt;b&gt; &amp; B")
    expect(mail.html).not.toContain("A <b>")
  })
})
