const round1 = (n: number) => Math.round(n * 10) / 10

/** Scales shares so they add up to exactly 100 while keeping their proportions, to one decimal place. */
export function rescaleTo100(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0) return values
  const scaled = values.map((v) => round1((v * 100) / sum))
  // Rounding can leave the total a tenth off; the largest share absorbs the difference.
  const largest = scaled.indexOf(Math.max(...scaled))
  scaled[largest] = round1(scaled[largest] + 100 - scaled.reduce((a, b) => a + b, 0))
  return scaled
}
