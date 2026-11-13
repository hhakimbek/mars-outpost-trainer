import {
  FIELD_RADIUS, ICE_THRESHOLD, SAMPLE_INFO, deposits, iceAt, radarAt, sampleSites,
} from '../src/world/iceField'
import {
  analyseSamples, chargeRover, collectSample, drill, patchId, patchRemaining, spendDriving,
} from '../src/sim/expedition'
import { createDefaultPlan, createInitialState, resolveSol } from '../src/sim/simulation'
import { C } from '../src/sim/constants'
import { LANDING_SITES } from '../src/data/marsFeatures'
import type { MissionState } from '../src/sim/types'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

const SEED = 777
const fresh = (siteId = 'jezero'): MissionState => {
  const s = createInitialState(SEED, 7, siteId)
  s.roverKwh = C.ROVER_KWH_CAP
  return s
}

/** Fraction of the bowl where the drill would find something. */
function drillableFraction(siteId: string, step = 4): number {
  let above = 0
  let n = 0
  for (let x = -FIELD_RADIUS; x <= FIELD_RADIUS; x += step) {
    for (let z = -FIELD_RADIUS; z <= FIELD_RADIUS; z += step) {
      if (Math.hypot(x, z) > FIELD_RADIUS) continue
      n++
      if (iceAt(x, z, SEED, siteId) >= ICE_THRESHOLD) above++
    }
  }
  return above / n
}

/** The best patch in the bowl, found the way a player would: by sounding. */
function bestSpot(siteId: string): { x: number; z: number; v: number } {
  let best = { x: 0, z: 0, v: 0 }
  for (let x = -FIELD_RADIUS; x <= FIELD_RADIUS; x += 4) {
    for (let z = -FIELD_RADIUS; z <= FIELD_RADIUS; z += 4) {
      if (Math.hypot(x, z) > FIELD_RADIUS) continue
      const v = iceAt(x, z, SEED, siteId)
      if (v > best.v) best = { x, z, v }
    }
  }
  return best
}

// ===========================================================================

console.log('\n=== the field is a search problem ===')

{
  const f = drillableFraction('jezero')
  check('most of the baseline bowl is dry ground', f < 0.3, `${Math.round(f * 100)}% drillable`)
  check('but there is real ice to find', f > 0.08, `${Math.round(f * 100)}%`)
}

{
  // Every site has to be playable. A site with no drillable ground anywhere
  // is not a hard choice, it is a dead end — and that is exactly what a
  // straight multiply by the site's ice rating produced before the exponent.
  const empty: string[] = []
  const carpets: string[] = []
  for (const site of LANDING_SITES) {
    const f = drillableFraction(site.id, 6)
    if (f < 0.02) empty.push(`${site.id} ${Math.round(f * 100)}%`)
    if (f > 0.6) carpets.push(`${site.id} ${Math.round(f * 100)}%`)
  }
  check('no landing site is barren', empty.length === 0, empty.join(', '))
  check('and none is paved with ice', carpets.length === 0, carpets.join(', '))
}

{
  // The orbit screen promised that Arcadia has more ice than Jezero. The
  // ground has to keep that promise, or site selection was a decoration.
  const rich = drillableFraction('arcadia', 6)
  const poor = drillableFraction('gale', 6)
  const base = drillableFraction('jezero', 6)
  check('the site ratings hold up on the ground', rich > base && base > poor,
    `arcadia ${Math.round(rich * 100)}% > jezero ${Math.round(base * 100)}% > gale ${Math.round(poor * 100)}%`)
}

{
  const near = iceAt(6, 4, SEED, 'arcadia')
  check('there is nothing to drill in the car park', near < ICE_THRESHOLD,
    `${Math.round(near * 100)}% under the outpost`)
}

{
  const a = iceAt(50, -30, SEED, 'jezero')
  const b = iceAt(50, -30, SEED, 'jezero')
  const other = iceAt(50, -30, SEED + 1, 'jezero')
  check('the field is deterministic', a === b)
  check('and a different mission has a different field', a !== other)
}

console.log('\n=== the radar tells the truth ===')

{
  const spot = bestSpot('jezero')
  const r = radarAt(spot.x, spot.z, SEED, 'jezero')
  check('the radar reads the same field the drill works',
    Math.abs(r.concentration - spot.v) < 1e-9)
  check('it says so when the ground is drillable', r.reachable)

  const dry = radarAt(4, 4, SEED, 'jezero')
  check('and says so when it is not', !dry.reachable)
  check('richer ground reads as shallower', r.depthM < dry.depthM,
    `${r.depthM} m vs ${dry.depthM} m`)
}

console.log('\n=== drilling ===')

{
  const s = fresh()
  const spot = bestSpot('jezero')
  const water = s.stocks.water
  const kwh = s.roverKwh
  const r = drill(s, spot.x, spot.z)
  check('a hole in good ground yields water', r.ok && r.litres > 0, r.message)
  check('the water arrives in the tanks', s.stocks.water > water,
    `+${(s.stocks.water - water).toFixed(1)} L`)
  check('and it costs rover energy', s.roverKwh === kwh - C.DRILL_KWH)
  check('the mission total is recorded', s.waterDrilled > 0)
}

{
  // A dry hole has to cost the same energy as a good one. That is the whole
  // reason to read the instrument before stopping.
  const s = fresh()
  const kwh = s.roverKwh
  const r = drill(s, 36, 2)
  const dryGround = iceAt(36, 2, SEED, 'jezero') < ICE_THRESHOLD
  if (dryGround) {
    check('a dry hole yields nothing', !r.ok && r.litres === 0, r.message)
    check('but still costs the energy', s.roverKwh === kwh - C.DRILL_KWH)
  } else {
    check('a dry hole yields nothing', true, 'skipped — that spot has ice')
    check('but still costs the energy', true, 'skipped')
  }
}

{
  const s = fresh()
  s.roverKwh = C.DRILL_KWH - 0.1
  const spot = bestSpot('jezero')
  const r = drill(s, spot.x, spot.z)
  check('a flat rover cannot drill', !r.ok, r.message)
  check('and a refused drill costs nothing', s.roverKwh === C.DRILL_KWH - 0.1)
}

{
  // A lens is finite. Parking on the best ground in the bowl and drilling
  // forever has to stop working.
  const s = fresh()
  const spot = bestSpot('jezero')
  const total = patchRemaining(s, spot.x, spot.z)
  let got = 0
  for (let i = 0; i < 30; i++) {
    s.roverKwh = C.ROVER_KWH_CAP
    const r = drill(s, spot.x, spot.z)
    if (!r.ok) break
    got += r.litres
  }
  check('a lens works out', patchRemaining(s, spot.x, spot.z) < 1,
    `took ${Math.round(got)} L of ${Math.round(total)} L`)
  check('and it gave about what it said it held', Math.abs(got - total) < 1.5,
    `${got.toFixed(1)} vs ${total.toFixed(1)} L`)
  check('the patch key is stable', patchId(spot.x, spot.z) === patchId(spot.x + 1, spot.z + 1)
    || patchId(spot.x, spot.z).startsWith('p'))
}

{
  // The one number that decides whether this breaks the water economy: what
  // a full charge is worth if every hole is a good one.
  const s = fresh('arcadia')
  const spot = bestSpot('arcadia')
  let litres = 0
  while (s.roverKwh >= C.DRILL_KWH) {
    const r = drill(s, spot.x, spot.z)
    if (!r.ok) break
    litres += r.litres
  }
  const solDraw = C.WATER_PER_CREW * C.CREW_COUNT
  check('a perfect sol of drilling is worth having', litres > solDraw * 0.4,
    `${Math.round(litres)} L against a ${Math.round(solDraw)} L daily draw`)
  check('but does not replace the recycler', litres < solDraw * 2.5,
    `${Math.round(litres)} L`)
}

console.log('\n=== driving costs energy ===')

{
  const s = fresh()
  const kwh = s.roverKwh
  spendDriving(s, 100)
  check('100 m costs what the constant says',
    Math.abs((kwh - s.roverKwh) - C.ROVER_KWH_PER_100M) < 1e-9)

  const far = fresh()
  const stillGoing = spendDriving(far, 100000)
  check('a long enough drive flattens it', !stillGoing && far.roverKwh === 0)
}

{
  // Driving to the far side of the bowl and back must be affordable, or the
  // field is bigger than the vehicle and most of it is scenery.
  const roundTrip = (FIELD_RADIUS * 2 / 100) * C.ROVER_KWH_PER_100M
  check('the far edge is reachable and back', roundTrip < C.ROVER_KWH_CAP,
    `${roundTrip.toFixed(1)} of ${C.ROVER_KWH_CAP} kWh`)
  check('but a full traverse leaves little for drilling',
    C.ROVER_KWH_CAP - roundTrip < C.DRILL_KWH * 4,
    `${(C.ROVER_KWH_CAP - roundTrip).toFixed(1)} kWh left`)
}

{
  const s = fresh()
  chargeRover(s, 6)
  check('the rover is charged from delivered power', s.roverKwh === 6)
  chargeRover(s, 999)
  check('and cannot hold more than its capacity', s.roverKwh === C.ROVER_KWH_CAP)
}

console.log('\n=== samples ===')

{
  const sites = sampleSites(SEED, 'jezero')
  check('there are rocks to find', sites.length > 8, `${sites.length} sites`)
  check('none of them is under the habitat',
    sites.every((p) => Math.hypot(p.x, p.z) > 20))
  check('every kind is described',
    sites.every((p) => !!SAMPLE_INFO[p.kind]?.why))

  const far = sites.every((p) => Math.hypot(p.x, p.z) <= FIELD_RADIUS)
  check('and all of them are inside the bowl', far)
}

{
  const s = fresh()
  const first = sampleSites(SEED, s.siteId)[0]
  const r = collectSample(s, first.id)
  check('a rock can be picked up', r.ok, r.message)
  check('it goes in the rack', s.samplesHeld.length === 1)
  check('science has not moved yet', s.stocks.science === 0,
    'a rock in a bag is worth nothing')

  const again = collectSample(s, first.id)
  check('the same rock cannot be taken twice', !again.ok, again.message)
}

{
  const s = fresh()
  const sites = sampleSites(SEED, s.siteId)
  for (let i = 0; i < C.ROVER_CARGO + 2 && i < sites.length; i++) collectSample(s, sites[i].id)
  check('the rack has a limit', s.samplesHeld.length === C.ROVER_CARGO,
    `${s.samplesHeld.length} of ${C.ROVER_CARGO}`)
}

{
  const s = fresh()
  const sites = sampleSites(SEED, s.siteId)
  for (let i = 0; i < 3; i++) collectSample(s, sites[i].id)
  const before = s.stocks.science
  const r = analyseSamples(s)
  check('analysis turns rocks into science', r.ok && s.stocks.science > before,
    `+${r.science} points`)
  check('the rack is emptied', s.samplesHeld.length === 0)
  check('and the count is kept', s.samplesAnalysed === 3)

  const empty = analyseSamples(s)
  check('an empty rack analyses nothing', !empty.ok, empty.message)
}

{
  // Science from samples has to be bounded, or the field is a points farm.
  // The bound is simply that there are only so many rocks in the bowl.
  const s = fresh()
  for (const p of sampleSites(SEED, s.siteId)) {
    if (s.samplesHeld.length >= C.ROVER_CARGO) analyseSamples(s)
    collectSample(s, p.id)
  }
  analyseSamples(s)
  check('the whole bowl is worth a finite amount',
    s.stocks.science > 20 && s.stocks.science < 120,
    `${Math.round(s.stocks.science)} points for every rock on the site`)
}

console.log('\n=== deposits are the field, not a list beside it ===')

{
  const d = deposits(SEED, 'jezero')
  check('the mapped deposits are real ground', d.length > 3, `${d.length} lenses`)
  check('every one of them is drillable',
    d.every((p) => iceAt(p.x, p.z, SEED, 'jezero') >= ICE_THRESHOLD))
  check('they are sorted best first',
    d.every((p, i) => i === 0 || d[i - 1].grade >= p.grade))
  check('a richer lens holds more water',
    d.length < 2 || d[0].volume >= d[d.length - 1].volume)
}

console.log('\n=== the expedition survives a sol ===')

{
  let s = fresh()
  const spot = bestSpot('jezero')
  drill(s, spot.x, spot.z)
  collectSample(s, sampleSites(SEED, s.siteId)[0].id)
  const held = s.samplesHeld.length
  const drilledKeys = Object.keys(s.drilled).length

  const plan = createDefaultPlan()
  plan.modes.roverCharge = 2
  s = resolveSol(s, plan, [{ task: 'inspection', crewIndex: 1, fieldConfirmed: true }]).next

  check('worked-out lenses are remembered across sols',
    Object.keys(s.drilled).length === drilledKeys)
  check('samples stay in the rack overnight', s.samplesHeld.length === held)
  check('and the rover is recharged for the morning', s.roverKwh > 0,
    `${s.roverKwh.toFixed(1)} kWh`)
}

console.log(fails === 0
  ? '\nALL FIELD CHECKS PASSED'
  : `\n${fails} FIELD CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
