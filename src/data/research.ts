/**
 * RESEARCH AND CONSTRUCTION
 * =========================
 *
 * What the outpost can become.
 *
 * Science points were a score and nothing else: you earned them, the debrief
 * counted them, and the outpost you were running never changed. Here they buy
 * capability, and every technology on this list is one that a real Mars
 * programme is actually working on — with the effect in the simulation being
 * the effect the real work is meant to have.
 *
 * CONSTRUCTION COSTS NO MATERIALS, AND THAT IS THE POINT
 * -----------------------------------------------------
 * There is no "materials" stock here, deliberately. In-situ resource
 * utilisation means the feedstock is the ground you are standing on: regolith
 * is free, and what construction really costs on Mars is energy and crew
 * time. So a build costs a shift and a block of kWh, and nothing else — which
 * is both the honest model and the reason the Sintering technology is the
 * gate that unlocks all of it.
 *
 * ARCHITECTURE RULE
 * -----------------
 * Data only. No React, no three, no store. The numbers here are read by
 * `sim/research.ts`, which is what the simulation actually consults.
 */

export type TechId =
  | 'sintering' | 'sabatier' | 'moxieScale' | 'dustShield'
  | 'radShelter' | 'autoDrill' | 'perchlorate'

export interface Tech {
  id: TechId
  name: string
  /** Science points to unlock. */
  cost: number
  /** Technologies that must be unlocked first. */
  needs: TechId[]
  /** One line: what it changes in the simulation. */
  effect: string
  /** The real programme this comes from. */
  real: string
}

export const TECHS: Tech[] = [
  {
    id: 'sabatier', name: 'Closed Sabatier Loop', cost: 14, needs: [],
    effect: 'The water recycler recovers 4 percentage points more at every mode.',
    real:
      'The ISS runs a Sabatier reactor that takes carbon dioxide from the air and hydrogen from ' +
      'electrolysis and makes water out of them. It is the single piece of hardware that pushes ' +
      'a closed loop from roughly 90% recovery towards 98%.',
  },
  {
    id: 'moxieScale', name: 'MOXIE Scale-Up', cost: 18, needs: [],
    effect: 'The oxygen generator makes 18% more oxygen for the same energy.',
    real:
      'MOXIE ran sixteen times on Perseverance and produced 122 g of oxygen in total — about ' +
      'four hours of breathing. It was a 1% scale demonstrator; the crewed version is the same ' +
      'solid-oxide electrolysis, a hundred times larger.',
  },
  {
    id: 'dustShield', name: 'Electrodynamic Dust Shield', cost: 16, needs: [],
    effect: 'The solar array loses half as much output to settling dust each sol.',
    real:
      'A transparent electrode grid that lifts and moves charged dust off a surface with a ' +
      'travelling wave. NASA has flown it on the ISS and it is manifested for lunar landers, ' +
      'because sweeping panels by hand does not scale.',
  },
  {
    id: 'perchlorate', name: 'Perchlorate Remediation', cost: 20, needs: ['sabatier'],
    effect: 'Crops grow 12% faster: cleaner water and a better nutrient feed.',
    real:
      'Phoenix found perchlorate salts in Martian soil in 2008 — toxic to people, and present ' +
      'in the dust that gets everywhere. Removing them is a precondition for using local ' +
      'material for anything that touches food or water.',
  },
  {
    id: 'radShelter', name: 'Storm Shelter Protocol', cost: 22, needs: [],
    effect: 'Every crew member takes 20% less dose, everywhere, for the rest of the mission.',
    real:
      'Curiosity’s RAD instrument measured the actual radiation environment on the way to ' +
      'Mars and on the surface. Knowing the numbers is what turns shielding from guesswork into ' +
      'a design: you put the mass where the crew is when the flux arrives.',
  },
  {
    id: 'autoDrill', name: 'Autonomous Drilling', cost: 18, needs: [],
    effect: 'A drill hole costs 30% less rover energy, so a charge goes further.',
    real:
      'Curiosity and Perseverance both drill on their own schedule, with the sequence planned ' +
      'on Earth and executed without supervision — because at 4 to 24 light-minutes there is no ' +
      'supervising anything.',
  },
  {
    id: 'sintering', name: 'Regolith Sintering', cost: 26, needs: ['perchlorate'],
    effect: 'Unlocks construction: the outpost can be extended using local material.',
    real:
      'Microwave or laser sintering fuses loose regolith into solid blocks with no binder flown ' +
      'from Earth. NASA’s Mars Dune Alpha habitat was 3D-printed from a regolith simulant ' +
      'for exactly this reason: the feedstock has to be the planet.',
  },
]

export const techById = (id: TechId): Tech | undefined => TECHS.find((t) => t.id === id)

// ---------------------------------------------------------------------------
//  CONSTRUCTION
// ---------------------------------------------------------------------------

export type BuildId = 'arrayExtension' | 'batteryBank' | 'waterTank'

export interface Buildable {
  id: BuildId
  name: string
  /** kWh drawn from the battery to sinter and assemble it. */
  energy: number
  /** How many of these the outpost can have. */
  max: number
  effect: string
  real: string
}

export const BUILDABLES: Buildable[] = [
  {
    id: 'arrayExtension', name: 'Solar Array Extension', energy: 26, max: 2,
    effect: 'Adds 14 kWh to a clear sol’s generation. Dust still takes its share.',
    real:
      'More panels is the cheapest capacity on Mars and the least reliable: the extension is ' +
      'subject to the same dust and the same winter as the rest of the farm.',
  },
  {
    id: 'batteryBank', name: 'Battery Bank', energy: 22, max: 2,
    effect: 'Adds 30 kWh of storage, so less surplus is thrown away.',
    real:
      'Storage is what makes an intermittent source usable overnight. It never makes energy — ' +
      'and surplus above what the bank can hold is simply lost.',
  },
  {
    id: 'waterTank', name: 'Water Tank', energy: 18, max: 2,
    effect: 'Adds 90 L of water capacity, so a good drilling sol is not wasted.',
    real:
      'Tankage is the difference between finding water and keeping it. A full tank means the ' +
      'next litre out of the ground goes nowhere.',
  },
]

export const buildById = (id: BuildId): Buildable | undefined =>
  BUILDABLES.find((b) => b.id === id)
