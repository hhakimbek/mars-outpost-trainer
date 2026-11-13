import {
  MARS_RADIUS_KM, arcDistanceKm, lonLatToVec, marsAlbedoVec,
  marsElevation, marsElevationVec, vecToLonLat,
} from '../src/world/marsTopography'
import { LANDING_SITES, MARS_FEATURES, siteById } from '../src/data/marsFeatures'
import {
  computeEnvironment, computeGeneration, computeProjection,
  createDefaultPlan, createInitialState,
} from '../src/sim/simulation'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

console.log('\n=== spherical geometry ===')

// lat/lon -> vector -> lat/lon must survive the round trip, including at the
// wrap point, or every site marker lands in the wrong place.
let worstLat = 0
let worstLon = 0
for (let i = 0; i < 2000; i++) {
  const lat = (Math.random() - 0.5) * 178
  const lon = Math.random() * 360
  const [lat2, lon2] = vecToLonLat(lonLatToVec(lat, lon))
  let dLon = Math.abs(lon2 - lon)
  if (dLon > 180) dLon = 360 - dLon
  worstLat = Math.max(worstLat, Math.abs(lat2 - lat))
  worstLon = Math.max(worstLon, dLon * Math.cos(lat * Math.PI / 180))
}
check('lat/lon round trip', worstLat < 1e-6 && worstLon < 1e-6,
  `worst lat ${worstLat.toExponential(1)}, lon ${worstLon.toExponential(1)}`)

// A quarter turn across the surface is a quarter of the circumference.
const quarter = arcDistanceKm(lonLatToVec(0, 0), lonLatToVec(0, 90))
check('arc distance scale', Math.abs(quarter - (Math.PI / 2) * MARS_RADIUS_KM) < 1,
  `${quarter.toFixed(0)} km for 90 degrees`)

// Antipodes are half the circumference apart.
const anti = arcDistanceKm(lonLatToVec(20, 40), lonLatToVec(-20, 220))
check('antipodal distance', Math.abs(anti - Math.PI * MARS_RADIUS_KM) < 1,
  `${anti.toFixed(0)} km`)

console.log('\n=== the height field stays inside real Mars ===')

// Real Mars spans about -8.2 km (Hellas floor) to +21.9 km (Olympus summit).
// A globe that leaves that envelope is not a stylised Mars, it is a wrong one.
let lo = Infinity
let hi = -Infinity
let bad = 0
for (let i = 0; i < 12000; i++) {
  const lat = Math.asin(Math.random() * 2 - 1) * 180 / Math.PI  // area-uniform
  const lon = Math.random() * 360
  const h = marsElevation(lat, lon)
  if (!Number.isFinite(h)) bad++
  lo = Math.min(lo, h)
  hi = Math.max(hi, h)
}
check('elevation finite everywhere', bad === 0, `${bad} non-finite`)
check('elevation within the real envelope', lo > -11 && hi < 24,
  `range ${lo.toFixed(1)} .. ${hi.toFixed(1)} km`)

console.log('\n=== the landmarks are where they belong ===')

// Each named feature must actually dominate its own location: a summit has to
// be high ground and a basin floor has to be low ground, or the globe is just
// noise with labels on it.
const globalMean = (() => {
  let sum = 0
  const n = 4000
  for (let i = 0; i < n; i++) {
    const lat = Math.asin(Math.random() * 2 - 1) * 180 / Math.PI
    sum += marsElevation(lat, Math.random() * 360)
  }
  return sum / n
})()

const at = (id: string) => {
  const f = MARS_FEATURES.find((x) => x.id === id)!
  return marsElevation(f.lat, f.lon)
}

const olympus = at('olympus')
check('Olympus Mons is the high point', olympus > 15,
  `${olympus.toFixed(1)} km (real summit 21.9)`)
check('Olympus is higher than Elysium Mons', olympus > at('elysium'),
  `${olympus.toFixed(1)} vs ${at('elysium').toFixed(1)} km`)

const hellas = at('hellas')
check('Hellas is the low point', hellas < -5, `${hellas.toFixed(1)} km (real floor -8.2)`)
check('Hellas is below Argyre', hellas < at('argyre'),
  `${hellas.toFixed(1)} vs ${at('argyre').toFixed(1)} km`)

const marineris = at('marineris')
check('Valles Marineris is a trough', marineris < globalMean - 2,
  `${marineris.toFixed(1)} km vs global mean ${globalMean.toFixed(1)}`)

// The canyon is a line, not a dot: a point 1500 km along the rift from its
// nominal centre must still be inside the trough.
const alongRift = marsElevation(-8.2, 274.0)
check('the rift runs along its whole path', alongRift < globalMean - 1.5,
  `${alongRift.toFixed(1)} km at Ius Chasma`)

// Tharsis must stand above the northern plains, which is the planet's
// defining asymmetry.
const tharsis = marsElevation(0, 265)
const lowlands = marsElevation(55, 150)
check('Tharsis stands above the northern lowlands', tharsis - lowlands > 4,
  `${tharsis.toFixed(1)} vs ${lowlands.toFixed(1)} km`)

console.log('\n=== the crustal dichotomy ===')

// Averaged over many samples the north must sit kilometres below the south.
const hemiMean = (sign: number) => {
  let sum = 0
  const n = 3000
  for (let i = 0; i < n; i++) {
    const lat = sign * (10 + Math.random() * 55)
    sum += marsElevation(lat, Math.random() * 360)
  }
  return sum / n
}
const northMean = hemiMean(1)
const southMean = hemiMean(-1)
check('northern lowlands sit below southern highlands', southMean - northMean > 1.5,
  `south ${southMean.toFixed(1)} km, north ${northMean.toFixed(1)} km`)

console.log('\n=== albedo ===')

let aBad = 0
for (let i = 0; i < 4000; i++) {
  const lat = (Math.random() - 0.5) * 180
  const a = marsAlbedoVec(lonLatToVec(lat, Math.random() * 360))
  if (!Number.isFinite(a) || a < 0 || a > 1) aBad++
}
check('albedo stays in 0..1', aBad === 0, `${aBad} out of range`)

// Syrtis Major is the dark patch visible from Earth; Arabia Terra is bright.
const syrtis = marsAlbedoVec(lonLatToVec(8.4, 69.5))
const arabia = marsAlbedoVec(lonLatToVec(21, 6))
check('Syrtis Major reads dark', syrtis < 0.4, syrtis.toFixed(2))
check('Arabia Terra reads bright', arabia > 0.6, arabia.toFixed(2))
check('the poles are the brightest ground', marsAlbedoVec(lonLatToVec(88, 0)) > 0.85,
  marsAlbedoVec(lonLatToVec(88, 0)).toFixed(2))

console.log('\n=== determinism ===')

// The globe is rebuilt on every mount. If it is not deterministic the player
// lands on a different planet than the one they picked a site from.
let drift = 0
for (let i = 0; i < 400; i++) {
  const lat = (i % 180) - 90
  const lon = (i * 7) % 360
  const a = marsElevation(lat, lon)
  const b = marsElevation(lat, lon)
  drift = Math.max(drift, Math.abs(a - b))
}
check('elevation is deterministic', drift === 0, `max drift ${drift}`)

console.log('\n=== landing sites ===')

check('site ids are unique',
  new Set(LANDING_SITES.map((s) => s.id)).size === LANDING_SITES.length)

for (const s of LANDING_SITES) {
  const ok = s.lat >= -90 && s.lat <= 90 && s.lon >= 0 && s.lon < 360
  check(`${s.name} has a valid coordinate`, ok, `${s.lat}N ${s.lon}E`)
}

// Every site must be a real trade: no site may be at least as good as another
// on every axis, or the choice is decoration.
let dominated: string[] = []
for (const a of LANDING_SITES) {
  for (const b of LANDING_SITES) {
    if (a.id === b.id) continue
    const betterOrEqual =
      a.solar >= b.solar && a.ice >= b.ice && a.science >= b.science &&
      a.dust <= b.dust && a.nightTempC >= b.nightTempC
    const strictlyBetter =
      a.solar > b.solar || a.ice > b.ice || a.science > b.science ||
      a.dust < b.dust || a.nightTempC > b.nightTempC
    if (betterOrEqual && strictlyBetter) dominated.push(`${b.name} < ${a.name}`)
  }
}
check('no landing site dominates another', dominated.length === 0, dominated.join(', '))

// The baseline site must be neutral, because the whole seven-sol balance was
// tuned on it.
const base = siteById('jezero')
check('Jezero is the neutral baseline',
  base.solar === 1 && base.ice === 1 && base.science === 1 && base.dust === 1 && base.nightTempC === 0)


// ---------------------------------------------------------------------------
// The site has to change the mission, not just the scenery.
// ---------------------------------------------------------------------------
console.log('\n=== the site reaches the simulation ===')

const SEED = 20261112

const gen = (siteId: string, sol: number) => {
  const env = computeEnvironment(sol, SEED, siteId)
  return computeGeneration(env, 1, false)
}

// Arcadia sits at 47 degrees north: the array must lose real output there.
const jezeroPower = gen('jezero', 1)
const arcadiaPower = gen('arcadia', 1)
check('a high-latitude site generates less power', arcadiaPower < jezeroPower * 0.85,
  `${arcadiaPower.toFixed(1)} vs ${jezeroPower.toFixed(1)} kWh at Jezero`)

// Gale is nearly equatorial and must beat it.
check('an equatorial site generates more power', gen('gale', 1) > jezeroPower,
  `${gen('gale', 1).toFixed(1)} kWh at Gale`)

// Nights at high latitude must be colder, because that is what makes the
// heater expensive there.
const arcadiaNight = computeEnvironment(1, SEED, 'arcadia').lowTemp
const galeNight = computeEnvironment(1, SEED, 'gale').lowTemp
check('high latitude means colder nights', arcadiaNight < galeNight - 10,
  `${arcadiaNight} C vs ${galeNight} C`)

// Every site must still survive the fixed Sol 3 storm without the power model
// going negative or non-finite.
let envBad = 0
for (const site of LANDING_SITES) {
  for (let sol = 1; sol <= 7; sol++) {
    const env = computeEnvironment(sol, SEED, site.id)
    const g = computeGeneration(env, 1, false)
    if (!Number.isFinite(g) || g < 0 || g > 120) envBad++
    if (!Number.isFinite(env.lowTemp) || env.lowTemp > env.highTemp) envBad++
  }
}
check('every site produces a sane seven-sol forecast', envBad === 0, `${envBad} bad sols`)

// The storm still has to be a crisis everywhere, or Sol 3 stops teaching.
let stormOk = true
for (const site of LANDING_SITES) {
  const storm = computeGeneration(computeEnvironment(3, SEED, site.id), 1, false)
  const clear = computeGeneration(computeEnvironment(1, SEED, site.id), 1, false)
  if (storm > clear * 0.4) stormOk = false
}
check('Sol 3 is a power crisis at every site', stormOk)

// An ice-rich site must actually deliver more water per rover run.
const iceAt = (siteId: string) => {
  const st = createInitialState(SEED, 7, siteId)
  const plan = createDefaultPlan()
  plan.modes.roverCharge = 1
  return computeProjection(st, plan, [{ task: 'iceRun', crewIndex: 1, fieldConfirmed: true }])
}
const jezeroWater = iceAt('jezero').netWater
const arcadiaWater = iceAt('arcadia').netWater
check('shallow ice means a bigger ice run', arcadiaWater > jezeroWater + 20,
  `${arcadiaWater.toFixed(0)} L/sol vs ${jezeroWater.toFixed(0)} L/sol at Jezero`)

// And the mission must know where it is.
const built = createInitialState(SEED, 7, 'hellas')
check('the mission records its site', built.siteId === 'hellas', built.siteId)
check('the opening log names the site',
  built.log[0].message.includes('Hellas'), built.log[0].message.slice(0, 60))

// An unknown or missing site must fall back to the baseline rather than
// producing NaN power — old saves are the likeliest source of one.
const legacy = createInitialState(SEED, 7)
delete (legacy as unknown as Record<string, unknown>).siteId
check('a mission with no site still runs', Number.isFinite(computeProjection(legacy, createDefaultPlan(), []).powerBalance))
check('an unknown site falls back to the baseline', siteById('nowhere').id === 'jezero')

console.log(fails === 0 ? '\nALL GLOBE CHECKS PASSED' : `\n${fails} GLOBE CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
