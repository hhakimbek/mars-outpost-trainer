/**
 * Deterministic 2D value noise primitives.
 *
 * Split out of `noise.ts` so that code which only needs noise — the
 * subsurface ice field, for one — does not also pull in the terrain model and
 * the outpost layout that `noise.ts` carries. That import chain was putting
 * the whole surface into the main bundle by way of the store.
 *
 * `fbm` returns roughly -1..1 and `ridged` roughly 0..1. The difference has
 * bitten once already, so it is stated on each of them as well as here.
 */

export function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi

  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)

  const u = smooth(xf)
  const v = smooth(yf)

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

/** Layered fractal noise, roughly -1..1 */
export function fbm(x: number, y: number, seed = 7, octaves = 4): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (valueNoise(x * frequency, y * frequency, seed + i * 17) * 2 - 1)
    frequency *= 2.07
    amplitude *= 0.49
  }
  return value
}

/**
 * Ridged multifractal. Produces sharp crests and smooth valleys instead of the
 * rolling blobs plain fbm gives — this is what makes rock outcrops read as
 * eroded stone rather than as sand dunes.
 */
export function ridged(x: number, y: number, seed = 13, octaves = 4): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let weight = 1
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * frequency, y * frequency, seed + i * 31) * 2 - 1)
    const sq = n * n * weight
    value += sq * amplitude
    weight = Math.min(sq * 2.2, 1)
    frequency *= 2.14
    amplitude *= 0.5
  }
  return value
}
