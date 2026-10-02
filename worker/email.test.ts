import { describe, expect, it } from "vitest"
import { canonicalEmail } from "./email"

describe("canonicalEmail", () => {
  it("leaves an ordinary address alone", () => {
    expect(canonicalEmail("jana.novakova@seznam.cz")).toBe("jana.novakova@seznam.cz")
  })

  it("drops the part after a plus sign", () => {
    expect(canonicalEmail("jana+tip2@seznam.cz")).toBe("jana@seznam.cz")
  })

  it("ignores dots and the old domain name at Gmail", () => {
    expect(canonicalEmail("j.a.na+x@googlemail.com")).toBe("jana@gmail.com")
  })

  it("keeps an address whose name would end up empty", () => {
    expect(canonicalEmail("+x@seznam.cz")).toBe("+x@seznam.cz")
  })
})
