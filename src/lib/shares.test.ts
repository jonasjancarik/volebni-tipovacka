import { describe, expect, it } from "vitest"
import { rescaleTo100 } from "./shares"

const total = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10

describe("rescaleTo100", () => {
  it("scales an overshoot down proportionally", () => {
    const out = rescaleTo100([60, 50, 21])
    expect(out).toEqual([45.8, 38.2, 16])
    expect(total(out)).toBe(100)
  })

  it("scales an undershoot up and keeps zeros", () => {
    expect(rescaleTo100([30, 0, 20])).toEqual([60, 0, 40])
  })

  it("always lands on exactly 100 despite rounding", () => {
    for (const values of [[1, 1, 1], [33.3, 33.3, 33.3, 7], [12.5, 7.5, 3.1, 0.4, 88], [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]]) {
      expect(total(rescaleTo100(values))).toBe(100)
    }
  })
})
