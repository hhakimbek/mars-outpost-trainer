import { C } from './constants'
import type { MissionState } from './types'

/**
 * HABITAT OPERATIONS
 * ==================
 *
 * The things the crew can do inside the habitat that are not scheduled shifts.
 *
 * A scheduled shift is planned in the morning and costs crew-hours. These are
 * different: they are decided in the moment, they cost stock rather than
 * hours, and each can be done once a sol. That limit is what stops them being
 * free health — you cannot stand at the galley pressing a button until
 * everyone is at 100.
 *
 * Every one of them is a trade the player can get wrong. A shared meal is
 * food you do not have if the greenhouse fails. A hygiene cycle is water. The
 * treatment station is water and it only helps the person who needs it most.
 *
 * ARCHITECTURE RULE
 * -----------------
 * No React, no three, no store, no Date.now, no Math.random. These mutate a
 * MissionState the caller already cloned, exactly like the rest of src/sim,
 * so they are deterministic and `test/habitat.test.ts` runs them headlessly.
 */

export type HabitatOpId = 'sharedMeal' | 'treatCrew' | 'hygieneCycle'

export interface HabitatOpDef {
  id: HabitatOpId
  name: string
  /** One line of cost, for the prompt. */
  cost: string
  /** What it buys, for the prompt. */
  gain: string
  /** Why this is a real thing a Mars crew does. */
  source: string
}

export const HABITAT_OPS: Record<HabitatOpId, HabitatOpDef> = {
  sharedMeal: {
    id: 'sharedMeal', name: 'Shared meal',
    cost: `${C.MEAL_FOOD} meals · ${C.MEAL_WATER} L water`,
    gain: `+${C.MEAL_HEALTH} condition and −${C.MEAL_FATIGUE} fatigue for all four`,
    source:
      'ISS and analog crews (including CHAPEA) treat the shared meal as a primary ' +
      'psychological countermeasure, not a break.',
  },
  treatCrew: {
    id: 'treatCrew', name: 'Medical treatment',
    cost: `${C.TREAT_WATER} L water`,
    gain: `+${C.TREAT_HEALTH} condition for whoever is worst off, ` +
      `+${C.TREAT_MEDIC_BONUS} more if the medic runs it`,
    source:
      'A Mars crew has no evacuation option, so one trained medical officer treats everything ' +
      'the mission produces.',
  },
  hygieneCycle: {
    id: 'hygieneCycle', name: 'Hygiene cycle',
    cost: `${C.HYGIENE_WATER} L water`,
    gain: `+${Math.round(C.HYGIENE_CLEAN * 100)}% cleanliness, +${C.HYGIENE_HEALTH} condition for all four`,
    source:
      'Most of the water comes back through the recycler; the real cost is the power to run ' +
      'the loop. Skipping hygiene in a sealed habitat is an infection problem, not a smell.',
  },
}

export interface OpResult {
  ok: boolean
  message: string
  warning: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Has this operation already been run this sol? */
export const opUsed = (s: MissionState, op: HabitatOpId): boolean =>
  s.habitatOpsUsed.includes(op)

/**
 * Why an operation cannot be run right now, or null if it can.
 *
 * Separate from running it so the prompt can grey itself out and say why,
 * rather than letting the player press E into a refusal.
 */
export function opBlockedReason(s: MissionState, op: HabitatOpId): string | null {
  if (opUsed(s, op)) return 'Already done this sol'
  switch (op) {
    case 'sharedMeal':
      if (s.stocks.food < C.MEAL_FOOD + C.CREW_COUNT) return 'Not enough food to spare'
      if (s.stocks.water < C.MEAL_WATER) return 'Not enough water'
      return null
    case 'treatCrew': {
      if (s.stocks.water < C.TREAT_WATER) return 'Not enough water'
      const worst = Math.min(...s.crew.map((m) => m.health))
      if (worst >= C.TREAT_CEILING) return 'Nobody needs treatment'
      return null
    }
    case 'hygieneCycle':
      if (s.stocks.water < C.HYGIENE_WATER) return 'Not enough water'
      if (s.stocks.cleanliness >= 0.99) return 'The habitat is already clean'
      return null
  }
}

/**
 * Runs an operation against a mission state the caller owns.
 *
 * `performer` is the crew index acting, which matters for treatment: the medic
 * is better at it, which is the only place in the trainer where who you are
 * controlling changes an outcome directly.
 */
export function runHabitatOp(
  s: MissionState, op: HabitatOpId, performer: number,
): OpResult {
  const blocked = opBlockedReason(s, op)
  if (blocked) return { ok: false, message: blocked, warning: true }

  s.habitatOpsUsed.push(op)

  switch (op) {
    case 'sharedMeal': {
      s.stocks.food -= C.MEAL_FOOD
      s.stocks.water -= C.MEAL_WATER
      for (const m of s.crew) {
        m.health = clamp(m.health + C.MEAL_HEALTH, 0, 100)
        m.fatigue = clamp(m.fatigue - C.MEAL_FATIGUE, 0, 100)
      }
      return {
        ok: true, warning: false,
        message: 'The crew ate together. Four people in better shape for it.',
      }
    }

    case 'treatCrew': {
      s.stocks.water -= C.TREAT_WATER
      let worst = 0
      for (let i = 1; i < s.crew.length; i++) {
        if (s.crew[i].health < s.crew[worst].health) worst = i
      }
      const medic = s.crew[performer]?.role === 'medic'
      const gain = C.TREAT_HEALTH + (medic ? C.TREAT_MEDIC_BONUS : 0)
      const patient = s.crew[worst]
      patient.health = clamp(patient.health + gain, 0, 100)
      patient.fatigue = clamp(patient.fatigue - C.TREAT_FATIGUE, 0, 100)
      return {
        ok: true, warning: false,
        message: medic
          ? `${patient.name} treated by the mission medic (+${gain}).`
          : `${patient.name} treated (+${gain}). A medic would have done better.`,
      }
    }

    case 'hygieneCycle': {
      s.stocks.water -= C.HYGIENE_WATER
      s.stocks.cleanliness = clamp(s.stocks.cleanliness + C.HYGIENE_CLEAN, 0, 1)
      for (const m of s.crew) m.health = clamp(m.health + C.HYGIENE_HEALTH, 0, 100)
      return {
        ok: true, warning: false,
        message: 'Hygiene cycle complete. The habitat is a better place to live in.',
      }
    }
  }
}
