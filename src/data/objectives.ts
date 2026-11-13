import type { MissionState } from '../sim/types'

/**
 * MISSION OBJECTIVES
 * ==================
 *
 * The things a mission is sent to do, as opposed to the things it has to
 * survive. Staying alive for seven sols is the floor, not the goal, and
 * without something like this the trainer only ever asks the player not to
 * die.
 *
 * Each one is checked against the mission state at the end of every sol, each
 * is met once and stays met, and each pays science — which is the currency
 * that buys the technology that makes the next sols easier. That is the only
 * progression loop in the trainer, and it is deliberately the one that
 * rewards doing the mission rather than hiding from it.
 *
 * ARCHITECTURE RULE
 * -----------------
 * Data and pure predicates. No React, no three, no store.
 */

export interface Objective {
  id: string
  name: string
  /** What the player has to do, in one line. */
  brief: string
  /** Science paid out the first time it is met. */
  reward: number
  /** Why a real mission would be asked for this. */
  why: string
  met: (s: MissionState) => boolean
  /** 0..1, for the progress bar. */
  progress: (s: MissionState) => number
}

const frac = (have: number, need: number) => Math.max(0, Math.min(1, have / need))

export const OBJECTIVES: Objective[] = [
  {
    id: 'firstWater', name: 'Water from the ground', reward: 4,
    brief: 'Recover 40 litres of water ice by drilling.',
    why:
      'Every litre flown from Earth costs more than its weight in almost anything else. A ' +
      'mission that can top up its own tanks from the planet is a mission that can stay.',
    met: (s) => s.waterDrilled >= 40,
    progress: (s) => frac(s.waterDrilled, 40),
  },
  {
    id: 'fieldGeology', name: 'Field geology', reward: 5,
    brief: 'Analyse six samples at the laboratory bench.',
    why:
      'Collecting rocks is not science. The measurement is the product, and it happens at the ' +
      'bench — which is why a crew on the surface is worth what it costs to put there.',
    met: (s) => s.samplesAnalysed >= 6,
    progress: (s) => frac(s.samplesAnalysed, 6),
  },
  {
    id: 'reactorOnline', name: 'Independent of the weather', reward: 5,
    brief: 'Bring the fission surface power unit online.',
    why:
      'Solar power on Mars fails exactly when it is needed most. An outpost with a flat, ' +
      'weather-proof source has solved its worst single-point failure.',
    met: (s) => s.reactor === 'online',
    progress: (s) => (s.reactor === 'online' ? 1 : s.reactor === 'starting' ? 0.5 : 0),
  },
  {
    id: 'firstHarvest', name: 'Food grown on Mars', reward: 4,
    brief: 'Harvest 30 meals from the hydroponic rack.',
    why:
      'A closed food loop is the hardest of the three loops to close, and the only one nobody ' +
      'has yet closed anywhere. Thirty meals is not independence — it is proof the rack works.',
    met: (s) => s.greenhouse.totalMeals >= 30,
    progress: (s) => frac(s.greenhouse.totalMeals, 30),
  },
  {
    id: 'crewIntact', name: 'Everyone fit to work', reward: 4,
    brief: 'End a sol with all four crew above 70 condition and nothing broken.',
    why:
      'There is no replacement crew and no evacuation. A commander who finishes a hard sol ' +
      'with four people fit has done the part of the job that is hardest to measure.',
    met: (s) => s.crew.every((m) => m.health > 70)
      && !s.o2Leak && !s.recyclerClogged && !s.arrayFault && !s.thermalFault,
    progress: (s) => {
      const worst = Math.min(...s.crew.map((m) => m.health))
      const faults = [s.o2Leak > 0, s.recyclerClogged, s.arrayFault, s.thermalFault]
        .filter(Boolean).length
      return faults > 0 ? 0 : frac(worst, 70)
    },
  },
  {
    id: 'selfSufficient', name: 'Built on Mars', reward: 6,
    brief: 'Research a technology and sinter a structure from local regolith.',
    why:
      'In-situ resource utilisation is the whole difference between visiting and staying. The ' +
      'first thing an outpost builds out of the ground it stands on is the moment it stops ' +
      'being cargo.',
    met: (s) => s.researched.length > 0 && s.built.length > 0,
    progress: (s) => ((s.researched.length > 0 ? 0.5 : 0) + (s.built.length > 0 ? 0.5 : 0)),
  },
]

export const objectiveById = (id: string): Objective | undefined =>
  OBJECTIVES.find((o) => o.id === id)

/**
 * Checks every objective and pays for the ones newly met.
 *
 * Returns the ones that fired, so the resolution screen can say so rather
 * than quietly adding points to a total nobody was watching.
 */
export function settleObjectives(s: MissionState): Objective[] {
  const fired: Objective[] = []
  for (const o of OBJECTIVES) {
    if (s.objectivesMet.includes(o.id)) continue
    if (!o.met(s)) continue
    s.objectivesMet.push(o.id)
    s.stocks.science += o.reward
    fired.push(o)
  }
  return fired
}
