import { fbm } from './valueNoise'
import { siteById } from '../data/marsFeatures'
import { C } from '../sim/constants'

/**
 * THE SUBSURFACE ICE FIELD
 * ========================
 *
 * What is under the ground within driving range of the outpost, and where the
 * rocks worth picking up are.
 *
 * WHAT IS REAL
 * ------------
 * Mars has a great deal of water ice buried shallowly, and it is not evenly
 * spread. Mars Odyssey's neutron spectrometer found hydrogen — effectively
 * ice — within about a metre of the surface over most of the planet poleward
 * of roughly 45 degrees latitude, and the Phoenix lander scraped into solid
 * ice a few centimetres down at 68 N in 2008. Nearer the equator it is
 * patchier, deeper and harder to reach, which is precisely the trade a
 * landing site makes: Jezero is good for science and poor for ice, Arcadia
 * and Utopia are the opposite. NASA's SWIM project (Subsurface Water Ice
 * Mapping) exists to find the places where both are true at once, because
 * that is where a crewed mission can actually land.
 *
 * WHAT IS GAME
 * ------------
 * The distribution of individual deposits inside this one 170 m bowl is
 * procedural. No orbiter can resolve a ten-metre ice lens, so no honest
 * simulation can claim to be reproducing one. What the field reproduces is
 * the SHAPE of the problem: ice is patchy, you cannot see it from the
 * surface, and the only way to know is to drive out and sound the ground.
 *
 * ARCHITECTURE RULE
 * -----------------
 * No React, no three, no store, no Math.random, no Date.now. Everything here
 * is a pure function of position and the mission seed, so the same mission
 * always has the same ice in the same places — and `test/field.test.ts`
 * surveys the whole field headlessly.
 */

/** How far from the habitat the rover can usefully go. metres. GAME */
export const FIELD_RADIUS = 150

/** Below this concentration the drill brings up dry regolith. GAME */
export const ICE_THRESHOLD = 0.34

/**
 * Subsurface ice concentration at a point, 0..1.
 *
 * The site's own `ice` rating scales the whole field, so landing at Arcadia
 * really does mean there is more of it under you — the same number that the
 * orbit screen showed before anybody committed to the site.
 */
export function iceAt(x: number, z: number, seed: number, siteId: string): number {
  const site = siteById(siteId)
  const abundance = Math.pow(site?.ice ?? 1, C.ICE_ABUNDANCE_EXP)

  // Two scales: broad lenses tens of metres across, and a finer grain so the
  // edge of a deposit is ragged rather than a circle.
  //
  // fbm returns roughly -1..1, so both terms are mapped into 0..1 before they
  // are mixed. Treating the raw value as a concentration clamped half the
  // bowl to zero and left almost nothing above the drilling threshold.
  const unit = (n: number) => n * 0.5 + 0.5
  const broad = unit(fbm(x * 0.012, z * 0.012, seed * 7 + 11, 3))
  const fine = unit(fbm(x * 0.05, z * 0.05, seed * 13 + 29, 2))
  let v = broad * 0.78 + fine * 0.22

  // Ice survives where the ground is cold and shadowed, which in this bowl
  // means the low ground away from the sun-facing slopes. A gentle bias, not
  // a rule, because the player is meant to have to sound for it.
  v += 0.06 * Math.max(0, -Math.sin(x * 0.02 + z * 0.014))

  /*
   * Contrast.
   *
   * Mixed noise is centred on a half, which made two thirds of the bowl
   * drillable and turned prospecting into driving anywhere and pressing a
   * button. Ice is not like that: it is concentrated in lenses with a lot of
   * dry ground between them. The power curve pushes the field apart, so the
   * baseline site has a handful of real deposits to find rather than a
   * carpet of mediocre ones.
   */
  v = Math.pow(Math.max(v, 0), C.ICE_CONTRAST)

  // Nothing worth drilling right under the outpost: the site was chosen for
  // other reasons, and an ice field in the car park removes the whole point
  // of owning a rover.
  const r = Math.hypot(x, z)
  const nearField = Math.min(Math.max((r - 28) / 26, 0), 1)

  return Math.max(0, Math.min(1, v * abundance * nearField))
}

export interface Deposit {
  id: string
  x: number
  z: number
  /** Concentration at the centre, 0..1. */
  grade: number
  /** Litres of water recoverable in total, before the lens is worked out. */
  volume: number
}

/**
 * The deposits worth driving to.
 *
 * Found by sampling the field on a coarse grid and keeping the local maxima
 * that clear the threshold — so the deposits are not placed and then a field
 * invented around them; they are genuinely the best spots in the field the
 * radar reads from. A player who learns to read the radar is reading the same
 * numbers this used.
 */
export function deposits(seed: number, siteId: string): Deposit[] {
  const out: Deposit[] = []
  const STEP = 14
  for (let x = -FIELD_RADIUS; x <= FIELD_RADIUS; x += STEP) {
    for (let z = -FIELD_RADIUS; z <= FIELD_RADIUS; z += STEP) {
      if (Math.hypot(x, z) > FIELD_RADIUS) continue
      const here = iceAt(x, z, seed, siteId)
      if (here < ICE_THRESHOLD) continue

      let best = true
      for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
        if (iceAt(x + dx, z + dz, seed, siteId) > here) { best = false; break }
      }
      if (!best) continue

      out.push({
        id: `d${x}_${z}`,
        x, z,
        grade: here,
        // A richer lens is a bigger lens. These are the same numbers
        // sim/expedition.ts works a patch out against, kept in step through
        // test/field.test.ts rather than by hope.
        volume: Math.round(60 + (here - ICE_THRESHOLD) * 260),
      })
    }
  }
  return out.sort((a, b) => b.grade - a.grade)
}

export type SampleKind = 'basalt' | 'sulfate' | 'claystone' | 'breccia' | 'olivine'

export interface SampleSite {
  id: string
  x: number
  z: number
  kind: SampleKind
  /** Science points this sample is worth once it has been analysed. */
  value: number
}

/**
 * What each kind of rock is, and why a geologist would want it.
 *
 * These are the materials Curiosity and Perseverance actually work with, and
 * the reason each one matters is the real reason.
 */
export const SAMPLE_INFO: Record<SampleKind, { name: string; why: string; value: number }> = {
  basalt: {
    name: 'Basalt', value: 3,
    why:
      'Volcanic rock, and most of the Martian crust is made of it. Dating a basalt dates the ' +
      'surface it came from, which is how the whole timeline of the planet is built.',
  },
  olivine: {
    name: 'Olivine-rich rock', value: 4,
    why:
      'Olivine weathers fast in water, so finding it intact says the ground has been dry for a ' +
      'very long time. Perseverance found an olivine-rich unit on the floor of Jezero crater.',
  },
  sulfate: {
    name: 'Sulfate', value: 5,
    why:
      'Salts left behind when water evaporated. Curiosity has climbed through a whole sulfate-' +
      'bearing unit on Mount Sharp that records Mars drying out.',
  },
  claystone: {
    name: 'Claystone', value: 6,
    why:
      'Clays form in standing water at moderate pH — the friendliest chemistry Mars is known to ' +
      'have had. These are the rocks a sample return mission is being flown for.',
  },
  breccia: {
    name: 'Impact breccia', value: 4,
    why:
      'Rock shattered and welded back together by an impact. It carries material from depth up ' +
      'to where a rover can reach it, which is the cheapest drilling anyone will ever do.',
  },
}

/**
 * The rocks lying about in the bowl, placed deterministically.
 *
 * Clays and sulfates are put where the ice is, because that is the honest
 * association: both form in water, so the ground that kept its ice is the
 * ground worth sampling. It is also what makes a single expedition worth
 * planning rather than two separate errands.
 */
export function sampleSites(seed: number, siteId: string): SampleSite[] {
  const out: SampleSite[] = []
  const site = siteById(siteId)
  const science = site?.science ?? 1

  // A fixed lattice walked with the noise field, so the rocks are scattered
  // but never clumped on top of each other.
  let n = 0
  for (let i = 0; i < 400 && out.length < 18; i++) {
    const a = i * 2.39996323   // golden angle, gives an even spiral
    const r = 26 + (i / 400) * (FIELD_RADIUS - 34)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const pick = fbm(x * 0.07 + 40, z * 0.07 - 17, seed * 3 + 5, 2) * 0.5 + 0.5
    if (pick < 0.52) continue

    const ice = iceAt(x, z, seed, siteId)
    const kind: SampleKind =
      ice > ICE_THRESHOLD * 1.1 ? (pick > 0.72 ? 'claystone' : 'sulfate')
        : pick > 0.78 ? 'breccia'
          : pick > 0.64 ? 'olivine' : 'basalt'

    out.push({
      id: `s${n++}`,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      kind,
      value: Math.round(SAMPLE_INFO[kind].value * science * 10) / 10,
    })
  }
  return out
}

/**
 * What the ground-penetrating radar shows at a point.
 *
 * A real GPR gives a return strength and a depth, not a number between nought
 * and one, so the readout is expressed the way an instrument would: percent
 * return and an estimated depth to the top of the reflector. The depth is
 * derived from the concentration — richer lenses in this bowl are shallower —
 * which gives the player something to steer by rather than a bare number.
 */
export function radarAt(x: number, z: number, seed: number, siteId: string) {
  const v = iceAt(x, z, seed, siteId)
  return {
    concentration: v,
    /** Metres to the top of the reflector. Beyond 3 m the drill cannot reach. */
    depthM: Math.round((0.4 + (1 - v) * 3.4) * 10) / 10,
    reachable: v >= ICE_THRESHOLD,
  }
}
