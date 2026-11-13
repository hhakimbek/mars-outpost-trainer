import { C } from './constants'
import { capWater, techMods } from './research'
import { ICE_THRESHOLD, SAMPLE_INFO, iceAt, sampleSites } from '../world/iceField'
import type { SampleKind } from '../world/iceField'
import type { MissionState } from './types'

/**
 * THE FIELD EXPEDITION
 * ====================
 *
 * Driving out, sounding the ground, drilling ice, picking up rocks, and
 * turning those rocks into science back at the laboratory bench.
 *
 * This is the loop that connects the three places the trainer now has: the
 * habitat interior, the outpost, and the 150 m bowl around it. Water comes
 * out of the ground and nowhere else; science comes out of samples and the
 * samples have to be carried home.
 *
 * WHAT STOPS IT BEING FREE
 * ------------------------
 * Three things, all of them real. The rover carries only the energy the sol's
 * plan charged into it, so driving and drilling compete with each other for
 * the same kWh. A lens is a finite volume and works out. And cargo space is
 * small, so a long drive with a full rack is wasted distance.
 *
 * ARCHITECTURE NOTE
 * -----------------
 * This imports `world/iceField`, which is pure — noise and arithmetic, no
 * three and no React — so the usual rule for `src/sim` still holds: this file
 * is deterministic, has no Math.random and no Date.now, and
 * `test/field.test.ts` drives a whole expedition in Node.
 */

export interface DrillResult {
  ok: boolean
  litres: number
  message: string
  warning: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** What one hole costs right now, autonomous drilling included. */
export const drillCost = (s: MissionState): number =>
  C.DRILL_KWH * techMods(s).drillEnergy

/** Litres already taken out of a deposit this mission. */
export const drilledFrom = (s: MissionState, id: string): number => s.drilled[id] ?? 0

/** The nearest deposit-sized patch of ground, identified the way the map does. */
export const patchId = (x: number, z: number): string =>
  `p${Math.round(x / C.DRILL_PATCH)}_${Math.round(z / C.DRILL_PATCH)}`

/**
 * How much water is left under a patch of ground.
 *
 * A lens is not bottomless. The volume scales with the concentration the radar
 * reads, so the ground the instrument says is best really is the ground that
 * gives the most — the readout is not decoration.
 */
export function patchRemaining(s: MissionState, x: number, z: number): number {
  const grade = iceAt(x, z, s.seed, s.siteId)
  if (grade < ICE_THRESHOLD) return 0
  const total = C.PATCH_LITRES_BASE + (grade - ICE_THRESHOLD) * C.PATCH_LITRES_SPAN
  return Math.max(0, total - drilledFrom(s, patchId(x, z)))
}

/**
 * Drills at the rover's current position.
 *
 * Costs rover energy whether or not it finds anything, which is the point: a
 * dry hole is the normal outcome of drilling without sounding first, and it
 * costs you the same kWh as a good one.
 */
export function drill(s: MissionState, x: number, z: number): DrillResult {
  const cost = drillCost(s)
  if (s.roverKwh < cost) {
    return { ok: false, litres: 0, warning: true,
      message: `The drill needs ${cost.toFixed(1)} kWh and the rover has ${s.roverKwh.toFixed(1)}.` }
  }

  s.roverKwh = Math.max(0, s.roverKwh - cost)
  const grade = iceAt(x, z, s.seed, s.siteId)

  if (grade < ICE_THRESHOLD) {
    return { ok: false, litres: 0, warning: true,
      message: `Dry hole — ${Math.round(grade * 100)}% return, below the ${Math.round(ICE_THRESHOLD * 100)}% ` +
        'the drill needs. That is a kWh spent on finding out.' }
  }

  const left = patchRemaining(s, x, z)
  if (left <= 0.5) {
    return { ok: false, litres: 0, warning: true,
      message: 'This lens is worked out. The radar still reads it; there is simply nothing left to take.' }
  }

  const litres = Math.min(C.DRILL_LITRES * grade, left)
  s.drilled[patchId(x, z)] = drilledFrom(s, patchId(x, z)) + litres
  s.stocks.water = Math.min(s.stocks.water + litres, capWater(s))
  s.waterDrilled += litres

  return { ok: true, litres, warning: false,
    message: `${Math.round(litres)} L of water ice recovered at ${Math.round(grade * 100)}% ` +
      `return. About ${Math.round(left - litres)} L left under this spot.` }
}

export interface SampleResult {
  ok: boolean
  message: string
  warning: boolean
}

/** Picks up a rock, if there is room in the rack. */
export function collectSample(s: MissionState, id: string): SampleResult {
  if (s.samplesHeld.length >= C.ROVER_CARGO) {
    return { ok: false, warning: true,
      message: `The sample rack is full (${C.ROVER_CARGO}). Analyse what you have at the lab bench first.` }
  }
  if (s.samplesTaken.includes(id)) {
    return { ok: false, warning: true, message: 'That one is already aboard.' }
  }
  const site = sampleSites(s.seed, s.siteId).find((p) => p.id === id)
  if (!site) return { ok: false, warning: true, message: 'Nothing here to collect.' }

  s.samplesTaken.push(id)
  s.samplesHeld.push(site.kind)
  return { ok: true, warning: false,
    message: `${SAMPLE_INFO[site.kind].name} bagged and stowed. ` +
      `${C.ROVER_CARGO - s.samplesHeld.length} slots left.` }
}

export interface AnalysisResult {
  ok: boolean
  science: number
  kinds: SampleKind[]
  message: string
  warning: boolean
}

/**
 * Works the sample rack at the laboratory bench.
 *
 * A rock in a bag is worth nothing. This is where it becomes a measurement,
 * and it is the only route from the field to the science score — which is
 * what makes the drive home as much a part of the expedition as the drive out.
 */
export function analyseSamples(s: MissionState): AnalysisResult {
  if (s.samplesHeld.length === 0) {
    return { ok: false, science: 0, kinds: [], warning: true,
      message: 'The rack is empty. Samples are collected out in the field.' }
  }
  const kinds = [...s.samplesHeld]
  const science = kinds.reduce((sum, k) => sum + SAMPLE_INFO[k].value, 0)
  s.stocks.science += science
  s.samplesAnalysed += kinds.length
  s.samplesHeld = []
  return { ok: true, science, kinds, warning: false,
    message: `${kinds.length} sample${kinds.length === 1 ? '' : 's'} analysed. ` +
      `+${Math.round(science)} science.` }
}

/**
 * Energy spent driving.
 *
 * Called by the rover controller with the distance covered since the last
 * frame, so the charge gauge falls while you watch it rather than on a sol
 * boundary. Returns true while there is still energy to move on.
 */
export function spendDriving(s: MissionState, metres: number): boolean {
  s.roverKwh = Math.max(0, s.roverKwh - (metres / 100) * C.ROVER_KWH_PER_100M)
  return s.roverKwh > 0
}

/** Charges the rover from the sol's delivered power. Called at resolution. */
export function chargeRover(s: MissionState, kwhDelivered: number): void {
  s.roverKwh = clamp(kwhDelivered, 0, C.ROVER_KWH_CAP)
}
