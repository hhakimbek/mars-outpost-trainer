import { BUILDABLES, TECHS, buildById, techById } from '../data/research'
import type { BuildId, TechId } from '../data/research'
import { C } from './constants'
import type { MissionState } from './types'

/**
 * What the outpost's research and construction actually do.
 *
 * One place where every technology turns into a number, so that a technology
 * cannot be added to the list without someone deciding what it changes — and
 * so the simulation reads modifiers rather than checking for strings in a
 * dozen places.
 *
 * ARCHITECTURE RULE
 * -----------------
 * No React, no three, no store, no Math.random, no Date.now.
 */

export const hasTech = (s: MissionState, id: TechId): boolean => s.researched.includes(id)

export const builtCount = (s: MissionState, id: BuildId): number =>
  s.built.filter((b) => b === id).length

export interface TechMods {
  /** Added to the recycler's recovery fraction at every mode. */
  recyclerBonus: number
  /** Multiplier on oxygen produced per kWh. */
  o2Yield: number
  /** Multiplier on the cleanliness lost to dust each sol. */
  dustLoss: number
  /** Multiplier on every crew member's dose rate. */
  doseRate: number
  /** Multiplier on the energy a drill hole costs. */
  drillEnergy: number
  /** Multiplier on crop growth rate. */
  cropGrowth: number
  /** True once the outpost can build. */
  canBuild: boolean
  /** Extra kWh of clear-sol solar generation from built array extensions. */
  solarBonus: number
  /** Extra battery capacity, kWh. */
  batteryBonus: number
  /** Extra water capacity, litres. */
  waterBonus: number
}

/** Every modifier the outpost currently enjoys, derived from what it owns. */
export function techMods(s: MissionState): TechMods {
  return {
    recyclerBonus: hasTech(s, 'sabatier') ? 0.04 : 0,
    o2Yield: hasTech(s, 'moxieScale') ? 1.18 : 1,
    dustLoss: hasTech(s, 'dustShield') ? 0.5 : 1,
    doseRate: hasTech(s, 'radShelter') ? 0.8 : 1,
    drillEnergy: hasTech(s, 'autoDrill') ? 0.7 : 1,
    cropGrowth: hasTech(s, 'perchlorate') ? 1.12 : 1,
    canBuild: hasTech(s, 'sintering'),
    solarBonus: builtCount(s, 'arrayExtension') * 14,
    batteryBonus: builtCount(s, 'batteryBank') * 30,
    waterBonus: builtCount(s, 'waterTank') * 90,
  }
}

export interface ResearchResult {
  ok: boolean
  message: string
  warning: boolean
}

/** Why a technology cannot be unlocked right now, or null if it can. */
export function techBlockedReason(s: MissionState, id: TechId): string | null {
  const tech = techById(id)
  if (!tech) return 'No such technology'
  if (hasTech(s, id)) return 'Already researched'
  const missing = tech.needs.filter((n) => !hasTech(s, n))
  if (missing.length > 0) {
    return `Needs ${missing.map((m) => techById(m)?.name ?? m).join(' and ')} first`
  }
  if (s.stocks.science < tech.cost) {
    return `${tech.cost} science needed, ${Math.floor(s.stocks.science)} banked`
  }
  return null
}

/**
 * Spends science on a technology.
 *
 * Science is the only thing it costs, and it is permanent. That makes the
 * research screen the one place in the trainer where a decision compounds:
 * the sooner a technology is bought, the more sols it pays back over.
 */
export function research(s: MissionState, id: TechId): ResearchResult {
  const blocked = techBlockedReason(s, id)
  if (blocked) return { ok: false, message: blocked, warning: true }
  const tech = techById(id)!
  s.stocks.science -= tech.cost
  s.researched.push(id)
  return {
    ok: true, warning: false,
    message: `${tech.name} online. ${tech.effect}`,
  }
}

/** Why a structure cannot be built right now, or null if it can. */
export function buildBlockedReason(s: MissionState, id: BuildId): string | null {
  const def = buildById(id)
  if (!def) return 'No such structure'
  if (!hasTech(s, 'sintering')) return 'Needs Regolith Sintering'
  if (builtCount(s, id) >= def.max) return `All ${def.max} already built`
  if (s.stocks.battery < def.energy) {
    return `${def.energy} kWh needed, ${Math.floor(s.stocks.battery)} in the bank`
  }
  return null
}

/**
 * Sinters and assembles a structure.
 *
 * Costs energy and nothing else, because the feedstock is the ground. The
 * crew-hours are charged separately, by the `build` shift that has to be
 * scheduled and then carried out in the field.
 */
export function build(s: MissionState, id: BuildId): ResearchResult {
  const blocked = buildBlockedReason(s, id)
  if (blocked) return { ok: false, message: blocked, warning: true }
  const def = buildById(id)!
  s.stocks.battery -= def.energy
  s.built.push(id)
  return {
    ok: true, warning: false,
    message: `${def.name} sintered and assembled. ${def.effect}`,
  }
}

/**
 * The outpost's real capacities, tanks and banks included.
 *
 * Every caller that used to read C.CAP_WATER or C.CAP_BATTERY goes through
 * these instead, so a tank the crew built is a tank the whole simulation
 * knows about — the gauge, the clamp, the surplus calculation and the score.
 */
export const capWater = (s: MissionState): number =>
  C.CAP_WATER + builtCount(s, 'waterTank') * 90

export const capBattery = (s: MissionState): number =>
  C.CAP_BATTERY + builtCount(s, 'batteryBank') * 30

/** Everything researchable right now, for the UI. */
export const availableTechs = (s: MissionState) =>
  TECHS.filter((t) => !hasTech(s, t.id))

/** Everything buildable right now, for the UI. */
export const availableBuilds = (s: MissionState) =>
  BUILDABLES.filter((b) => builtCount(s, b.id) < b.max)
