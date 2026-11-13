import { STRUCTURES } from '../data/structures'

/**
 * Deterministic procedural noise for the Martian surface.
 *
 * Written by hand rather than pulled from a package: the terrain needs only a
 * handful of octaves plus domain warping, and keeping it local means the world
 * is reproducible and the bundle stays small.
 */

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

function valueNoise(x: number, y: number, seed: number): number {
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

/** Small secondary impact craters, placed deterministically. */
const CRATERS: [number, number, number, number][] = [
  // x, z, radius, depth
  [-38, 28, 13, 2.1],
  [44, -34, 17, 2.8],
  [26, 40, 9, 1.4],
  [-52, -18, 11, 1.8],
  [-20, 58, 8, 1.1],
]

function craterField(x: number, z: number): number {
  let h = 0
  for (const [cx, cz, radius, depth] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / radius
    if (d > 1.6) continue
    if (d < 1) {
      // bowl floor, with a raised rim just outside it
      h -= depth * (Math.cos(d * Math.PI) * 0.5 + 0.5)
    }
    const rim = Math.exp(-Math.pow((d - 1.02) * 5.5, 2))
    h += depth * 0.42 * rim
  }
  return h
}

/**
 * Flatness mask: 1 = full detail noise, 0 = perfectly level.
 *
 * Two things are kept flat. The inner apron, because a player walking the site
 * should not be fighting the ground; and a disc under every structure, because
 * a habitat whose far edge sits half a metre lower than its near edge looks
 * broken no matter how good the model is. The structure discs are derived from
 * STRUCTURES itself, so moving a building in the data file moves its pad too.
 */
const PADS: [number, number, number][] = STRUCTURES.map((s) => [s.pos[0], s.pos[2], s.radius])

function padMask(x: number, z: number): number {
  const r = Math.hypot(x, z)
  let m = Math.min(1, Math.max(0, (r - 7) / 20))

  for (let i = 0; i < PADS.length; i++) {
    const px = PADS[i][0]
    const pz = PADS[i][1]
    const rad = PADS[i][2]
    const inner = rad * 1.3
    const outer = rad * 2.6
    const d = Math.hypot(x - px, z - pz)
    if (d >= outer) continue
    const t = Math.min(1, Math.max(0, (d - inner) / (outer - inner)))
    // smoothstep, so the pad blends into the surrounding noise with no crease
    m = Math.min(m, t * t * (3 - 2 * t))
  }
  return m
}

/**
 * Terrain height in metres.
 *
 * A shallow crater bowl: flat where the outpost sits, rising to a rim that
 * gives the scene a horizon instead of an empty plain running to the draw
 * distance. Domain warping bends the detail noise so the slopes look eroded
 * rather than procedurally smooth.
 *
 * The rim is deliberately *clamped*. An unclamped quadratic ramp reached about
 * 160 m at the corners of the 210 m playfield, which reads as a vertical wall
 * and wrecks the sense of scale; a real small crater rim of this diameter is
 * tens of metres, not hundreds.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)

  // Main crater rim: eased in from r=52, fully risen by r=92, then a gentle
  // capped outer slope so the far hills still climb a little.
  const rimT = Math.min(1, Math.max(0, (r - 52) / 40))
  const rim = rimT * rimT * (3 - 2 * rimT) * 24
  const outer = Math.min(1, Math.max(0, (r - 92) / 26)) * 9
  const bowl = rim + outer

  const pad = padMask(x, z)

  // domain warp: offset the sample position by another noise field
  const wx = x + fbm(x * 0.012, z * 0.012, 91, 2) * 14
  const wz = z + fbm(x * 0.012 + 5.3, z * 0.012 - 2.1, 73, 2) * 14

  const broad = fbm(wx * 0.016, wz * 0.016, 7, 4) * 3.4
  const rocky = (ridged(wx * 0.045, wz * 0.045, 13, 4) - 0.35) * 2.6
  const fine = fbm(x * 0.14, z * 0.14, 41, 3) * 0.34

  // dune-like ripples, aligned, very low amplitude
  const ripple = Math.sin(x * 0.38 + fbm(x * 0.02, z * 0.02, 55, 2) * 6) * 0.11

  return bowl
    + (broad + rocky + ripple) * pad
    + fine * pad
    + craterField(x, z) * pad
}

/** Surface normal by central difference — used for slope-aware colouring. */
export function terrainNormal(x: number, z: number, eps = 0.6): [number, number, number] {
  const hL = terrainHeight(x - eps, z)
  const hR = terrainHeight(x + eps, z)
  const hD = terrainHeight(x, z - eps)
  const hU = terrainHeight(x, z + eps)
  const nx = hL - hR
  const nz = hD - hU
  const ny = 2 * eps
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}
