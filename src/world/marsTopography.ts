import { MARS_FEATURES, type MarsFeature } from '../data/marsFeatures'

/**
 * Elevation and albedo anywhere on the globe.
 *
 * The real landmarks come from `data/marsFeatures.ts` and are placed at their
 * published coordinates and sizes. Everything between them is deterministic
 * noise, weighted so it behaves the way the real surface does: the southern
 * highlands are rough and heavily cratered, the northern lowlands are smooth
 * and several kilometres lower.
 *
 * ---------------------------------------------------------------------------
 * Swapping in real MOLA data
 * ---------------------------------------------------------------------------
 * If a real MOLA height raster is ever shipped with the build, only this file
 * changes. Decode the raster once into a Float32Array of width*height samples
 * in equirectangular layout, keep it in `elevationRaster`, and have
 * `marsElevation` bilinear-sample it instead of calling `proceduralRelief`.
 * Nothing else in the project reads the height field directly.
 *
 * It is deliberately not shipped by default: the usable MOLA products are tens
 * to hundreds of megabytes, which is more than this whole game, and the globe
 * is a navigation screen rather than a survey instrument.
 */

/** REAL — mean volumetric radius, km. */
export const MARS_RADIUS_KM = 3389.5

/**
 * Vertical exaggeration of the relief on the globe.
 *
 * Mars's full relief — Hellas floor to Olympus summit, about 30 km — is under
 * one percent of its radius. Drawn true to scale the planet is smoother than a
 * billiard ball and Olympus Mons is invisible, so the globe exaggerates like
 * every physical relief model does. The figure is surfaced in the UI rather
 * than hidden, because "Mars is far smoother than this" is itself one of the
 * more surprising facts about the place.
 *
 * It lives here, next to the height field, rather than in the globe component:
 * the orbit panel quotes it, and importing it from the component would drag
 * three.js and the whole 33k-vertex planet into the main bundle.
 */
export const RELIEF_EXAGGERATION = 22

const DEG = Math.PI / 180

// ===========================================================================
//  3D VALUE NOISE
// ===========================================================================
//
// The surface noise has to be sampled on a sphere, so it is generated in three
// dimensions from the direction vector. Sampling 2D noise in (lon, lat) would
// put a visible seam down the prime meridian and pinch every feature at the
// poles.

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1442695040 + seed * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi)

  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed)

  const x00 = c(0, 0, 0) * (1 - u) + c(1, 0, 0) * u
  const x10 = c(0, 1, 0) * (1 - u) + c(1, 1, 0) * u
  const x01 = c(0, 0, 1) * (1 - u) + c(1, 0, 1) * u
  const x11 = c(0, 1, 1) * (1 - u) + c(1, 1, 1) * u

  const y0 = x00 * (1 - v) + x10 * v
  const y1 = x01 * (1 - v) + x11 * v
  return y0 * (1 - w) + y1 * w
}

/** Layered 3D noise, roughly -1..1. */
export function fbm3(x: number, y: number, z: number, seed = 5, octaves = 5): number {
  let value = 0, amplitude = 0.5, frequency = 1
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (valueNoise3(x * frequency, y * frequency, z * frequency, seed + i * 19) * 2 - 1)
    frequency *= 2.03
    amplitude *= 0.5
  }
  return value
}

/** Ridged 3D noise — sharp crests, used for the cratered highland texture. */
function ridged3(x: number, y: number, z: number, seed = 11, octaves = 4): number {
  let value = 0, amplitude = 0.5, frequency = 1, weight = 1
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise3(x * frequency, y * frequency, z * frequency, seed + i * 29) * 2 - 1)
    const sq = n * n * weight
    value += sq * amplitude
    weight = Math.min(sq * 2.0, 1)
    frequency *= 2.11
    amplitude *= 0.5
  }
  return value
}

// ===========================================================================
//  SPHERICAL GEOMETRY
// ===========================================================================

export type Vec3 = [number, number, number]

/**
 * Unit direction for a latitude/longitude.
 *
 * The convention here — +Y through the north pole, longitude increasing
 * eastward from -Z — is the one the globe mesh and the site markers both use,
 * so a marker placed from lat/lon lands exactly on the terrain it names.
 */
export function lonLatToVec(lat: number, lon: number): Vec3 {
  const phi = lat * DEG
  const theta = lon * DEG
  const c = Math.cos(phi)
  return [c * Math.sin(theta), Math.sin(phi), -c * Math.cos(theta)]
}

/** Inverse of `lonLatToVec`, returning [lat, lon] with lon in 0..360. */
export function vecToLonLat(v: Vec3): [number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  const y = v[1] / len
  const lat = Math.asin(Math.min(Math.max(y, -1), 1)) / DEG
  let lon = Math.atan2(v[0], -v[2]) / DEG
  if (lon < 0) lon += 360
  return [lat, lon]
}

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Great-circle surface distance between two directions, in km. */
export function arcDistanceKm(a: Vec3, b: Vec3): number {
  const d = Math.min(Math.max(dot3(a, b), -1), 1)
  return Math.acos(d) * MARS_RADIUS_KM
}

/** Shortest distance from a direction to a great-circle segment, in km. */
function arcToSegmentKm(p: Vec3, a: Vec3, b: Vec3): number {
  // Sample the segment rather than solving it analytically: the segments here
  // are short, this runs once per vertex at build time, and a sampled minimum
  // cannot produce the sign errors an analytic great-circle solution can.
  let best = Infinity
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x: Vec3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]
    const len = Math.hypot(x[0], x[1], x[2]) || 1
    const d = arcDistanceKm(p, [x[0] / len, x[1] / len, x[2] / len])
    if (d < best) best = d
  }
  return best
}

// Feature centres and paths, resolved to vectors once.
interface PreparedFeature {
  def: MarsFeature
  centre: Vec3
  path?: Vec3[]
  /**
   * Distance from the centre beyond which this feature cannot contribute.
   *
   * The height field is evaluated once per vertex, and a long feature like
   * Valles Marineris costs ~90 great-circle distances to measure properly.
   * Rejecting it with a single distance to the centre first turns the globe
   * build from seconds into milliseconds, and the bound is generous enough
   * that it can never clip a contribution the exact test would have kept.
   */
  boundKm: number
}

const PREPARED: PreparedFeature[] = MARS_FEATURES.map((f) => {
  const centre = lonLatToVec(f.lat, f.lon)
  const path = f.path?.map(([lat, lon]) => lonLatToVec(lat, lon))
  // Albedo reaches further than relief does, so the bound covers both.
  let reach = f.radiusKm * 3.4
  if (path) {
    let span = 0
    for (const p of path) span = Math.max(span, arcDistanceKm(centre, p))
    reach += span
  }
  return { def: f, centre, path, boundKm: reach }
})

/** Distance in km from a direction to a feature's centre line or centre point. */
function distanceToFeature(dir: Vec3, f: PreparedFeature): number {
  if (!f.path || f.path.length < 2) return arcDistanceKm(dir, f.centre)
  let best = Infinity
  for (let i = 0; i < f.path.length - 1; i++) {
    const d = arcToSegmentKm(dir, f.path[i], f.path[i + 1])
    if (d < best) best = d
  }
  return best
}

// ===========================================================================
//  THE HEIGHT FIELD
// ===========================================================================

/**
 * The crustal dichotomy — the biggest single feature in Mars's topography.
 *
 * Roughly a third of the planet is ancient, cratered highland standing several
 * kilometres above the smooth northern lowlands, and the boundary between them
 * is a great circle inclined about 35 degrees to the equator rather than
 * following a line of latitude. Modelled here as a smooth step across that
 * tilted plane.
 */
const DICHOTOMY_POLE: Vec3 = (() => {
  const v = lonLatToVec(55, 200)
  return v
})()

function dichotomy(dir: Vec3): number {
  const t = dot3(dir, DICHOTOMY_POLE)
  // +1 deep in the northern lowlands, 0 in the southern highlands
  const s = Math.min(Math.max((t + 0.12) / 0.55, 0), 1)
  return s * s * (3 - 2 * s)
}

/** Shape of one feature's contribution at a given distance, in km of relief. */
function featureRelief(f: PreparedFeature, d: number): number {
  const { kind, radiusKm, reliefKm } = f.def
  const r = d / radiusKm

  switch (kind) {
    case 'volcano': {
      if (r > 2.4) return 0
      // A shield profile: steep near the summit, long shallow flanks. The real
      // Tharsis shields have slopes of only a few degrees, which is why they
      // are invisible from the ground and obvious from orbit.
      const flank = Math.exp(-Math.pow(r * 1.15, 1.7))
      // The caldera is a dish bitten out of the summit plateau, not a notch
      // taken off the peak height: Olympus Mons still has to reach its
      // published 21.9 km, and a caldera applied at r = 0 would shave
      // kilometres off the one number everybody checks.
      const caldera = r < 0.17 ? -0.055 * Math.cos((r / 0.17) * Math.PI * 0.5) : 0
      return reliefKm * (flank + caldera)
    }
    case 'basin': {
      if (r > 1.9) return 0
      // Bowl floor with a raised rim just outside it, the standard large-impact
      // profile. reliefKm is negative for a basin.
      const bowl = r < 1 ? Math.cos(r * Math.PI) * 0.5 + 0.5 : 0
      const rim = Math.exp(-Math.pow((r - 1.05) * 4.2, 2)) * 0.3
      return reliefKm * bowl - reliefKm * rim * 0.55
    }
    case 'canyon': {
      if (r > 3.2) return 0
      // A steep-walled trough: flat-bottomed in the middle, walls rising fast.
      const trough = Math.exp(-Math.pow(r * 0.85, 2.6))
      const shoulder = Math.exp(-Math.pow((r - 1.6) * 1.5, 2)) * 0.14
      return -reliefKm * trough + reliefKm * shoulder
    }
    case 'rise':
      if (r > 2.2) return 0
      return reliefKm * Math.exp(-Math.pow(r * 1.0, 2.0))
    case 'plain':
      if (r > 1.8) return 0
      return reliefKm * Math.exp(-Math.pow(r * 1.1, 2.2))
    case 'cap':
      if (r > 1.6) return 0
      return reliefKm * Math.exp(-Math.pow(r * 1.2, 2.0))
    default:
      return 0
  }
}

/**
 * Procedural fill between the named landmarks.
 *
 * Highland roughness is gated on the dichotomy, because that is the real
 * relationship: the old southern crust carries billions of years of impacts,
 * the resurfaced northern plains do not.
 */
function proceduralRelief(dir: Vec3, north: number): number {
  const [x, y, z] = dir

  // broad regional undulation everywhere
  const broad = fbm3(x * 2.6, y * 2.6, z * 2.6, 17, 4) * 1.5

  // cratered highland texture, suppressed over the lowlands
  const highland = (ridged3(x * 9.0, y * 9.0, z * 9.0, 23, 4) - 0.4) * 2.4
  const mid = fbm3(x * 16.0, y * 16.0, z * 16.0, 37, 3) * 0.7

  return broad + highland * (1 - north) * 0.9 + mid * (1 - north * 0.55)
}

/**
 * Elevation in km relative to the areoid.
 *
 * Real range on Mars is about -8.2 km (Hellas floor) to +21.9 km (Olympus
 * summit); this function stays inside that envelope.
 */
export function marsElevation(lat: number, lon: number): number {
  const dir = lonLatToVec(lat, lon)
  return marsElevationVec(dir)
}

export function marsElevationVec(dir: Vec3): number {
  const north = dichotomy(dir)

  // The dichotomy step itself: lowlands sit ~4.5 km below the highlands. The
  // constant is set so the area-weighted mean elevation lands near zero,
  // which is what the areoid datum means.
  let h = 1.6 - north * 4.5

  h += proceduralRelief(dir, north)

  for (let i = 0; i < PREPARED.length; i++) {
    const f = PREPARED[i]
    if (arcDistanceKm(dir, f.centre) > f.boundKm) continue
    h += featureRelief(f, distanceToFeature(dir, f))
  }

  return h
}

// ===========================================================================
//  ALBEDO
// ===========================================================================

/**
 * Surface brightness, 0 (dark basalt) .. 1 (polar ice).
 *
 * Mars's visible markings are dust, not rock type: bright regions are
 * dust-mantled, dark regions are swept clean by wind and show basaltic sand.
 * Syrtis Major and Acidalia are dark, Arabia Terra and Hellas are bright, and
 * those are the patterns that make a rendered globe recognisable.
 */
export function marsAlbedoVec(dir: Vec3): number {
  const [x, y, z] = dir
  let a = 0.5

  for (let i = 0; i < PREPARED.length; i++) {
    const f = PREPARED[i]
    if (f.def.albedo === 0) continue
    if (arcDistanceKm(dir, f.centre) > f.boundKm) continue
    const r = distanceToFeature(dir, f) / (f.def.radiusKm * 1.5)
    if (r > 1.6) continue
    a += f.def.albedo * Math.exp(-Math.pow(r * 1.25, 2))
  }

  // wind-streak mottling at two scales
  a += fbm3(x * 5.5, y * 5.5, z * 5.5, 61, 3) * 0.1
  a += fbm3(x * 21.0, y * 21.0, z * 21.0, 83, 2) * 0.045

  // Seasonal polar frost reaches well beyond the permanent caps.
  const lat = Math.asin(Math.min(Math.max(y, -1), 1)) / DEG
  const frost = Math.min(Math.max((Math.abs(lat) - 62) / 22, 0), 1)
  a += frost * frost * 0.5

  return Math.min(Math.max(a, 0), 1)
}
