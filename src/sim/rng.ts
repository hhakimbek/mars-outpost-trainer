/**
 * Deterministic RNG. The same seed plus the same decisions must always give
 * the same mission, which is what makes "replay this seed" meaningful and
 * what lets the simulation be tested.
 *
 * Never use Math.random() anywhere in sim/.
 */
export function mulberry32(seed: number, cursor = 0) {
  let c = cursor
  const next = (): number => {
    let t = (seed + 0x6d2b79f5 * ++c) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    chance: (p: number) => next() < p,
    get cursor() {
      return c
    },
  }
}
