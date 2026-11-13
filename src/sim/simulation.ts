import { C, SUBSYSTEM_COST, SUBSYSTEM_PRIORITY, CANNOT_TURN_OFF, TASK_HOURS } from './constants'
import { DEFAULT_SITE_ID, siteById, type LandingSite } from '../data/marsFeatures'
import { cropById, type CropId } from '../data/crops'
import {
  advanceRack, bedStage, createGreenhouse, greenhouseSummary, plantBed,
  rackForecast, type RackInputs,
} from './greenhouse'
import { mulberry32 } from './rng'
import { cloneState } from './clone'
import { MODE_NAMES } from './types'
import type {
  Assignment, ChoiceEffects, CrewMember, Environment, FaultId, LogEntry, MissionState, Mode,
  PowerPlan, PowerSettlement, Projection, SolResult, Stocks, Subsystem, Task, Zone,
} from './types'

const SUBSYSTEMS = Object.keys(SUBSYSTEM_COST) as Subsystem[]

// ---------------------------------------------------------------- helpers

const clamp = (v: number, min: number, max: number): number => {
  // A non-finite value here means a bug upstream. Catching it keeps one bad
  // frame from poisoning the whole mission.
  if (!Number.isFinite(v)) {
    console.error('[sim] non-finite value sanitised')
    return min
  }
  return Math.min(Math.max(v, min), max)
}

export function clampStocks(s: Stocks): Stocks {
  return {
    o2: clamp(s.o2, 0, C.CAP_O2),
    water: clamp(s.water, 0, C.CAP_WATER),
    food: clamp(s.food, 0, C.CAP_FOOD),
    battery: clamp(s.battery, 0, C.CAP_BATTERY),
    cleanliness: clamp(s.cleanliness, 0, 1),
    science: clamp(s.science, 0, 9999),
  }
}

function log(
  out: LogEntry[], sol: number, category: string,
  message: string, delta = 0, warning = false,
): void {
  out.push({ sol, category, message, delta, warning })
}

export const emptyStocks = (): Stocks => ({
  o2: 0, water: 0, food: 0, battery: 0, cleanliness: 0, science: 0,
})

// ------------------------------------------------------------------ setup

/**
 * The crew.
 *
 * Four, which is the size the mission is written for: a commander who is
 * strongest outside, an engineer who fixes things properly, a scientist who
 * runs the rack and the instruments, and a medical officer who keeps the other
 * three working. Each role has a real mechanical edge, so losing one to
 * fatigue or dose costs something specific rather than a generic slot.
 */
const CREW_TEMPLATE: Omit<CrewMember, 'health' | 'fatigue' | 'dose' | 'zone' | 'assignedHours'>[] = [
  { name: 'Aylin Reyes',    role: 'commander', shortRole: 'CMDR', color: '#7dd3fc' },
  { name: 'Kenji Oyelaran', role: 'engineer',  shortRole: 'ENG',  color: '#fbbf24' },
  { name: 'Nadia Ferraro',  role: 'scientist', shortRole: 'SCI',  color: '#34d399' },
  { name: 'Tomas Alvarez',  role: 'medic',     shortRole: 'MED',  color: '#f472b6' },
]

/**
 * The landing site a mission is being flown from.
 *
 * Every read goes through here so an older save, or a state built before the
 * site existed, falls back to the baseline instead of producing NaN power.
 */
export const siteOf = (s: MissionState): LandingSite => siteById(s.siteId ?? DEFAULT_SITE_ID)

export function createInitialState(
  seed: number,
  totalSols = C.TOTAL_SOLS,
  siteId: string = DEFAULT_SITE_ID,
): MissionState {
  const site = siteById(siteId)
  const state: MissionState = {
    sol: 1,
    totalSols,
    outcome: 'inProgress',
    seed,
    siteId: site.id,
    rngCursor: 0,
    stocks: {
      o2: C.START_O2,
      water: C.START_WATER,
      food: C.START_FOOD,
      battery: C.START_BATTERY,
      cleanliness: 1,
      science: 0,
    },
    crew: CREW_TEMPLATE.map((t) => ({
      ...t, health: 100, fatigue: 0, dose: 0, zone: 'habitat' as Zone, assignedHours: 0,
    })),
    greenhouse: createGreenhouse(),
    env: computeEnvironment(1, seed, site.id),
    shieldInstalled: false,
    o2Leak: 0,
    recyclerClogged: false,
    arrayFault: false,
    thermalFault: false,
    roverCharged: false,
    co2: 0.12,
    habTemp: C.HAB_TARGET_C,
    wear: 0.05,
    lastInspection: 0,
    habitatOpsUsed: [],
    telemetry: true,
    faultsFixed: 0,
    brownoutSols: 0,
    depletedCount: 0,
    co2AlarmSols: 0,
    coldSols: 0,
    hoursLost: 0,
    repairsDone: 0,
    harvests: 0,
    totalGenerated: 0,
    totalUsed: 0,
    totalWasted: 0,
    decisions: [],
    pending: [],
    log: [],
  }

  log(state.log, 1, 'Mission',
    `Outpost powered up at ${site.name}, ${Math.abs(site.lat).toFixed(1)}\u00b0` +
    `${site.lat >= 0 ? 'N' : 'S'} ${site.lon.toFixed(1)}\u00b0E, ` +
    `${Math.abs(site.elevationKm).toFixed(1)} km ` +
    `${site.elevationKm < 0 ? 'below' : 'above'} datum. ` +
    `Crew of ${C.CREW_COUNT} aboard. Earth is 14 light-minutes away.`)

  return state
}

export function createDefaultPlan(): PowerPlan {
  return {
    modes: {
      lifeSupport: 2, thermal: 2, oxygenGenerator: 2, waterRecycler: 2,
      greenhouse: 1, commsScience: 1, roverCharge: 0,
    },
    batteryAuth: 0.5,
  }
}

// ------------------------------------------------------------ environment

/**
 * Weather for one sol at one place.
 *
 * The site is what makes the choice in orbit matter: latitude sets how much
 * sunlight the array can ever see and how cold the night gets, and local dust
 * climate sets how often the sky goes against you. Sol 3 is still always the
 * storm — the teaching beat is fixed — but how hard it bites is not.
 */
export function computeEnvironment(
  sol: number,
  seed: number,
  siteId: string = DEFAULT_SITE_ID,
): Environment {
  const site = siteById(siteId)
  // Sol 3 is always the dust storm and Sol 5 always the particle event: those
  // sols carry specific teaching objectives and must not be left to chance.
  const dustStorm = sol === 3
  const spe = sol === 5

  const rng = mulberry32(seed, (seed % 977) + sol * 31)

  let tau: number
  let solarFactor: number
  let headline: string

  if (dustStorm) {
    tau = 5.8 * site.dust
    // A dustier site loses more of what little light gets through.
    solarFactor = C.STORM_SOLAR_FACTOR / Math.max(site.dust, 0.2)
    headline = 'REGIONAL DUST STORM — solar output collapsing'
  } else {
    const roll = rng.next()
    // A dusty basin gets hazy skies more often and clear skies less often.
    const hazeThreshold = 0.18 * site.dust
    const clearThreshold = 1 - (1 - 0.88) / Math.max(site.dust, 0.2)
    if (roll > clearThreshold) {
      tau = 0.22 * site.dust; solarFactor = 1.12
      headline = 'Exceptionally clear sky — solar output above plan'
    } else if (roll < hazeThreshold) {
      tau = 1.15 * site.dust; solarFactor = 0.78
      headline = 'Dust haze aloft — solar output below plan'
    } else {
      tau = rng.range(0.35, 0.65) * site.dust; solarFactor = rng.range(0.93, 1.03)
      headline = 'Nominal conditions'
    }
  }

  // Latitude and local dust opacity scale everything the array can collect.
  solarFactor *= site.solar

  if (spe) headline = 'SOLAR PARTICLE EVENT INBOUND — shelter the crew'

  return {
    solarFactor, tau, dustStorm, spe,
    // A high-latitude site runs colder, and the night is where that bites:
    // the heater has to hold the same cabin temperature against a bigger gap.
    highTemp: Math.round(rng.range(-28, -8) + site.nightTempC * 0.5),
    lowTemp: Math.round(rng.range(-95, -72) + site.nightTempC),
    headline,
  }
}

// ------------------------------------------------------------------ power

export const subsystemCost = (s: Subsystem, m: Mode): number => SUBSYSTEM_COST[s][m]

export const canTurnOff = (s: Subsystem): boolean =>
  !(CANNOT_TURN_OFF as readonly string[]).includes(s)

export function computeGeneration(
  env: Environment, cleanliness: number, arrayFault = false,
): number {
  const fault = arrayFault ? C.ARRAY_FAULT_PENALTY : 1
  return C.ARRAY_CLEAR_KWH * Math.max(env.solarFactor, 0) * clamp(cleanliness, 0, 1) * fault
}

/**
 * Hardware condition that changes what the plan actually costs or yields.
 * Passed explicitly rather than read from state so the projection and the
 * resolution can never disagree about it.
 */
export interface PowerMods {
  arrayFault?: boolean
  thermalFault?: boolean
}

/** What a subsystem really draws this sol, faults included. */
export function effectiveCost(sub: Subsystem, m: Mode, mods: PowerMods = {}): number {
  let cost = SUBSYSTEM_COST[sub][m]
  // A failed heater loop works harder for the same result.
  if (sub === 'thermal' && mods.thermalFault && m > 0) cost += C.THERMAL_FAULT_COST
  return cost
}

/**
 * Distributes available energy. If the plan asks for more than exists,
 * subsystems step DOWN one mode at a time in reverse priority order, and every
 * step is recorded — so the debrief can say "the greenhouse ran at LOW instead
 * of NOMINAL" rather than silently swallowing the deficit.
 */
export function settleAllocation(
  plan: PowerPlan, stocks: Stocks, env: Environment, mods: PowerMods = {},
): PowerSettlement {
  const generation = computeGeneration(env, stocks.cleanliness, mods.arrayFault)
  const batteryDraw = stocks.battery * C.BATTERY_MAX_DISCHARGE * clamp(plan.batteryAuth, 0, 1)
  const available = generation + batteryDraw

  const achieved = { ...plan.modes }
  let requested = SUBSYSTEMS.reduce((sum, s) => sum + effectiveCost(s, achieved[s], mods), 0)
  const originalRequest = requested

  const shedOrder = [...SUBSYSTEMS].sort(
    (a, b) => SUBSYSTEM_PRIORITY[b] - SUBSYSTEM_PRIORITY[a],
  )

  const brownedOut: Subsystem[] = []
  let guard = 0

  while (requested > available + 1e-6 && guard++ < 64) {
    let stepped = false
    for (const s of shedOrder) {
      const floor: Mode = canTurnOff(s) ? 0 : 1
      if (achieved[s] <= floor) continue

      const before = effectiveCost(s, achieved[s], mods)
      achieved[s] = (achieved[s] - 1) as Mode
      requested -= before - effectiveCost(s, achieved[s], mods)
      if (!brownedOut.includes(s)) brownedOut.push(s)
      stepped = true
      break
    }
    // Everything is already at its floor: the remaining deficit is
    // unavoidable and gets reported rather than hidden.
    if (!stepped) break
  }

  const delivered = Math.min(requested, available)
  const surplus = Math.max(generation - delivered, 0)
  const headroom = Math.max(C.CAP_BATTERY - stocks.battery, 0)

  return {
    generation, batteryDraw, available,
    requested: originalRequest, delivered, surplus,
    wasted: Math.max(surplus - headroom, 0),
    achieved, brownedOut,
  }
}

// ----------------------------------------------------------------- faults

export const FAULT_LABEL: Record<FaultId, string> = {
  o2Leak: 'hull breach venting oxygen',
  recyclerClogged: 'water recycler filter clogged',
  arrayFault: 'solar array string offline',
  thermalFault: 'heater loop running hot',
}

/** Worst first: this is the order a single repair shift works through. */
export const FAULT_PRIORITY: FaultId[] = ['o2Leak', 'arrayFault', 'thermalFault', 'recyclerClogged']

export function activeFaults(s: MissionState): FaultId[] {
  const out: FaultId[] = []
  for (const f of FAULT_PRIORITY) {
    if (f === 'o2Leak' ? s.o2Leak > 0 : (s[f] as boolean)) out.push(f)
  }
  return out
}

/**
 * Roll for a new equipment fault.
 *
 * Chance grows with accumulated wear, so a commander who never spends
 * crew-hours on inspection is not punished by a coin flip — they are punished
 * by a rising, visible number they chose to ignore. An inspection on the
 * previous sol suppresses the roll entirely, which is what makes those two
 * crew-hours worth spending.
 */
export function rollFault(s: MissionState): FaultId | null {
  if (s.lastInspection === s.sol - 1) return null

  const rng = mulberry32(s.seed, 7717 + s.sol * 101)
  const chance = C.FAULT_BASE_CHANCE + C.FAULT_WEAR_CHANCE * clamp(s.wear, 0, 1)
  if (rng.next() > chance) return null

  // Only break something that is not already broken.
  const candidates = FAULT_PRIORITY.filter(
    (f) => (f === 'o2Leak' ? s.o2Leak <= 0 : !(s[f] as boolean)),
  )
  if (candidates.length === 0) return null
  return candidates[Math.floor(rng.next() * candidates.length) % candidates.length]
}

export function applyFault(s: MissionState, f: FaultId): void {
  if (f === 'o2Leak') s.o2Leak = C.LEAK_RATE
  else if (f === 'recyclerClogged') s.recyclerClogged = true
  else if (f === 'arrayFault') s.arrayFault = true
  else if (f === 'thermalFault') s.thermalFault = true
}

export function clearFault(s: MissionState, f: FaultId): void {
  if (f === 'o2Leak') s.o2Leak = 0
  else if (f === 'recyclerClogged') s.recyclerClogged = false
  else if (f === 'arrayFault') s.arrayFault = false
  else if (f === 'thermalFault') s.thermalFault = false
}

// ------------------------------------------------------------- crew hours

export const taskHours = (t: Task): number => TASK_HOURS[t]

export function taskZone(t: Task): Zone {
  switch (t) {
    case 'cleanArray': case 'science': case 'regolithShield': return 'eva'
    case 'iceRun': return 'rover'
    default: return 'habitat'
  }
}

export function taskEfficiency(t: Task, m: CrewMember, co2 = 0): number {
  let e = 1
  // Elevated CO2 causes headaches and slowed reasoning long before it is
  // dangerous. It makes every hour of work worth less, which is the real
  // reason not to throttle life support.
  if (co2 >= C.CO2_SYMPTOM) e *= C.CO2_WORK_PENALTY
  if (m.role === 'commander' && taskZone(t) === 'eva') e *= 1.25
  if (m.role === 'engineer' && (t === 'repair' || t === 'inspection')) e *= 1.3
  if (m.role === 'scientist' && (t === 'tendGreenhouse' || t === 'mixNutrients')) e *= 1.15
  if (m.role === 'scientist' && t === 'science') e *= 1.2
  // The medical officer's shift is worth more to the crew than to the hardware:
  // a recovery shift they run buys back noticeably more fatigue and health.
  if (m.role === 'medic' && t === 'extraRest') e *= 1.5
  // A tired or unwell crew member does worse work, which is why rotation and
  // rest are real strategies rather than wasted hours.
  if (m.fatigue >= 70 || m.health <= 40) e *= 0.75
  return e
}

/** The first bed with no living crop in it, or -1. */
export function firstFreeBed(s: MissionState): number {
  return s.greenhouse.beds.findIndex((b) => {
    const st = bedStage(b)
    return st === 'empty' || st === 'wilted'
  })
}

/** The planted bed in the worst condition, or -1 if the rack is bare. */
export function worstBed(s: MissionState): number {
  let best = -1
  let worstHealth = Infinity
  s.greenhouse.beds.forEach((b, i) => {
    const st = bedStage(b)
    if (st === 'empty' || st === 'wilted' || st === 'ready') return
    if (b.health < worstHealth) { worstHealth = b.health; best = i }
  })
  return best
}

export const assignableHours = (s: MissionState): number =>
  Math.max(
    s.crew.filter((c) => c.health > 0).length * (C.CREW_HOURS_EACH - C.CREW_HOURS_MANDATORY) -
      s.hoursLost,
    0)

/**
 * Apply an event choice to the mission state.
 *
 * This lives in the simulation rather than the store so that a choice is a
 * real move with testable consequences, and so the balance harness can play
 * decisions without a React store. It mutates `s` in place.
 */
export function applyChoiceEffects(s: MissionState, e: ChoiceEffects): string[] {
  const notes: string[] = []
  const was = { ...s.stocks }

  s.stocks.o2 += e.o2 ?? 0
  s.stocks.water += e.water ?? 0
  s.stocks.food += e.food ?? 0
  s.stocks.battery += e.battery ?? 0
  s.stocks.science += e.science ?? 0
  s.stocks.cleanliness += e.cleanliness ?? 0

  if (e.co2) s.co2 = clamp(s.co2 + e.co2, 0, 1.3)
  if (e.habTemp) s.habTemp = clamp(s.habTemp + e.habTemp, -60, 30)
  if (e.wear) s.wear = clamp(s.wear + e.wear, 0, 1)

  if (e.o2Leak !== undefined) s.o2Leak = Math.max(e.o2Leak, 0)
  if (e.recyclerClogged !== undefined) s.recyclerClogged = e.recyclerClogged
  if (e.arrayFault !== undefined) s.arrayFault = e.arrayFault
  if (e.thermalFault !== undefined) s.thermalFault = e.thermalFault
  if (e.shieldInstalled) s.shieldInstalled = true

  if (e.healthAll) {
    s.crew.forEach((m) => { m.health = clamp(m.health + e.healthAll!, 0, 100) })
  }
  if (e.fatigueAll) {
    s.crew.forEach((m) => { m.fatigue = clamp(m.fatigue + e.fatigueAll!, 0, 100) })
  }
  if (e.doseAll) {
    s.crew.forEach((m) => { m.dose += e.doseAll! })
    notes.push(`Each crew member took ${e.doseAll.toFixed(2)} mSv.`)
  }
  if (e.crewHoursLost) {
    s.hoursLost += e.crewHoursLost
    notes.push(`${e.crewHoursLost} crew-hours are gone before planning even starts.`)
  }

  // A rack event reaches every planted bed, which is what makes four beds a
  // portfolio rather than four copies of the same bet.
  if (e.greenhouseStall) {
    for (const bed of s.greenhouse.beds) {
      const st = bedStage(bed)
      if (st === 'empty' || st === 'wilted' || !bed.crop) continue
      bed.solsStarved += e.greenhouseStall
      bed.health = clamp(bed.health - 16 * e.greenhouseStall * cropById(bed.crop).fragility, 0, 100)
      if (bed.health <= C.GH_WILT_HEALTH) bed.progress = 0
    }
    notes.push('The crop in the rack has lost growing time.')
  }

  if (e.cropDamage) {
    for (const bed of s.greenhouse.beds) {
      const st = bedStage(bed)
      if (st === 'empty' || st === 'wilted' || !bed.crop) continue
      bed.health = clamp(bed.health - e.cropDamage * cropById(bed.crop).fragility, 0, 100)
    }
    notes.push('The crops have taken damage.')
  }

  if (e.nutrients) {
    s.greenhouse.nutrients = clamp(s.greenhouse.nutrients + e.nutrients, 0, 1)
  }

  if (e.greenhouseBoost) {
    for (const bed of s.greenhouse.beds) {
      const st = bedStage(bed)
      if (st === 'empty' || st === 'wilted') continue
      bed.progress = clamp(bed.progress + e.greenhouseBoost, 0, 1)
    }
  }

  s.stocks = clampStocks(s.stocks)

  // Report what the player will actually see change.
  const moved: string[] = []
  if (Math.abs(s.stocks.o2 - was.o2) > 0.05) moved.push(`O₂ ${(s.stocks.o2 - was.o2).toFixed(1)} kg`)
  if (Math.abs(s.stocks.water - was.water) > 0.5) moved.push(`water ${Math.round(s.stocks.water - was.water)} L`)
  if (Math.abs(s.stocks.food - was.food) > 0.5) moved.push(`food ${Math.round(s.stocks.food - was.food)} meals`)
  if (Math.abs(s.stocks.battery - was.battery) > 0.5) moved.push(`battery ${Math.round(s.stocks.battery - was.battery)} kWh`)
  if (Math.abs(s.stocks.science - was.science) > 0.5) moved.push(`science ${Math.round(s.stocks.science - was.science)}`)
  if (moved.length) notes.unshift(moved.join(', '))
  return notes
}

// -------------------------------------------------------------- radiation

export function doseRate(zone: Zone, shield: boolean, spe: boolean): number {
  let r =
    zone === 'shelter' ? C.DOSE_SHELTER :
    zone === 'habitat' ? C.DOSE_HABITAT :
    zone === 'rover' ? C.DOSE_ROVER : C.DOSE_EVA

  // Regolith mass helps inside. It does nothing for someone standing on the
  // open surface — which is exactly the lesson.
  if (shield && (zone === 'habitat' || zone === 'shelter')) r *= 1 - C.SHIELD_REDUCTION

  // A shelter works against a particle event; open ground does not.
  if (spe) r *= zone === 'shelter' ? 2 : C.SPE_MULTIPLIER

  return r
}

export const solsRemaining = (stock: number, net: number): number =>
  net >= -1e-6 ? -1 : Math.floor(stock / Math.abs(net))

// ------------------------------------------------------------- greenhouse

// ------------------------------------------------------------------- crew

function updateCrew(s: MissionState, assignments: Assignment[], solLog: LogEntry[]): void {
  const spe = s.env.spe

  s.crew.forEach((m, index) => {
    m.assignedHours = 0
    let dose = 0
    let onTask = 0

    for (const a of assignments) {
      if (a.crewIndex !== index || a.task === 'none') continue
      const hours = taskHours(a.task)
      onTask += hours
      m.assignedHours += hours
      dose += hours * doseRate(taskZone(a.task), s.shieldInstalled, spe)
    }

    // The rest of the sol is spent inside. During a particle event the crew
    // shelter — which is why reaching the shelter in time matters.
    const indoors = Math.max(C.SOL_HOURS - onTask, 0)
    dose += indoors * doseRate(spe ? 'shelter' : 'habitat', s.shieldInstalled, spe)
    m.dose += dose

    if (dose > 1) {
      log(solLog, s.sol, 'Radiation',
        `${m.shortRole} ${m.name} absorbed ${dose.toFixed(2)} mSv today.`, dose, true)
    }

    m.fatigue = clamp(m.fatigue + m.assignedHours * C.FATIGUE_PER_HOUR - C.FATIGUE_RECOVERY, 0, 100)

    let delta = 0
    if (s.stocks.o2 <= 0) delta -= C.HEALTH_LOSS_O2
    if (s.stocks.water <= 0) delta -= C.HEALTH_LOSS_WATER
    if (s.stocks.food <= 0) delta -= C.HEALTH_LOSS_FOOD
    if (s.co2 >= C.CO2_DANGER) delta -= C.CO2_HEALTH_LOSS
    if (s.habTemp < C.HAB_COLD_C) delta -= C.COLD_HEALTH_LOSS
    // Recovery only happens when the habitat is actually a decent place to be.
    if (delta === 0 && m.fatigue < 40 && s.co2 < C.CO2_SYMPTOM) {
      delta += m.role === 'scientist' ? 6 : 4
    }

    m.health = clamp(m.health + delta, 0, 100)

    if (delta < 0) {
      log(solLog, s.sol, 'Crew', `${m.name}'s condition is deteriorating.`, delta, true)
    }
    if (m.dose > C.DOSE_BUDGET) {
      log(solLog, s.sol, 'Radiation',
        `${m.name} has exceeded the mission dose allowance.`, m.dose, true)
    }
  })
}

// -------------------------------------------------------- delayed effects

function applyPending(s: MissionState, solLog: LogEntry[]): void {
  s.pending = s.pending.filter((e) => {
    if (e.onSol !== s.sol) return true
    s.stocks.o2 += e.o2 ?? 0
    s.stocks.water += e.water ?? 0
    s.stocks.food += e.food ?? 0
    s.stocks.battery += e.battery ?? 0
    if (e.healthAll) {
      s.crew.forEach((m) => { m.health = clamp(m.health + e.healthAll!, 0, 100) })
    }
    log(solLog, s.sol, 'Consequence', e.message, 0, true)
    return false
  })
}

// ---------------------------------------------------------------- outcome

function evaluateOutcome(s: MissionState): MissionState['outcome'] {
  // Age-appropriate failure: nobody dies on screen. A critical medical state
  // aborts the mission and the crew goes home, which still costs score.
  for (const m of s.crew) {
    if (m.health <= C.HEALTH_ABORT) return 'aborted'
    if (m.dose > C.DOSE_BUDGET * 1.5) return 'aborted'
  }
  if (s.sol > s.totalSols) {
    const avg = s.crew.reduce((t, m) => t + m.health, 0) / s.crew.length
    const supplied = s.stocks.o2 > 0 && s.stocks.water > 0 && s.stocks.food > 0
    return avg > C.HEALTH_ABORT && supplied ? 'success' : 'aborted'
  }
  return 'inProgress'
}

// -------------------------------------------------------------- THE TICK

export function resolveSol(
  state: MissionState, plan: PowerPlan, assignments: Assignment[],
): SolResult {
  const s: MissionState = cloneState(state)
  const solLog: LogEntry[] = []
  const deltas = emptyStocks()
  const before = { ...s.stocks }

  // 1. effects scheduled by earlier decisions
  applyPending(s, solLog)

  // 2. weather
  s.env = computeEnvironment(s.sol, s.seed, s.siteId)

  // 3. equipment. Rolled before power so a dead array string bites today.
  const newFault = rollFault(s)
  if (newFault) {
    applyFault(s, newFault)
    log(solLog, s.sol, 'Fault', `Equipment fault: ${FAULT_LABEL[newFault]}.`, 0, true)
  } else if (s.lastInspection === s.sol - 1) {
    log(solLog, s.sol, 'Maintenance',
      "Yesterday's inspection caught the wear early — no new faults today.")
  }

  const mods = { arrayFault: s.arrayFault, thermalFault: s.thermalFault }

  // 4-5. power
  const power = settleAllocation(plan, s.stocks, s.env, mods)
  s.totalGenerated += power.generation
  s.totalUsed += power.delivered
  s.totalWasted += power.wasted

  log(solLog, s.sol, 'Power',
    `Solar array generated ${Math.round(power.generation)} kWh ` +
    `(${Math.round(s.env.solarFactor * s.stocks.cleanliness * 100)}% of nominal` +
    `${s.arrayFault ? ', one string offline' : ''}).`,
    power.generation)

  if (power.brownedOut.length > 0) {
    s.brownoutSols++
    for (const sub of power.brownedOut) {
      log(solLog, s.sol, 'Power',
        `Not enough energy — ${sub} ran below the requested mode.`, 0, true)
    }
  }
  if (power.wasted > 0.5) {
    log(solLog, s.sol, 'Power',
      `${Math.round(power.wasted)} kWh was wasted — the battery was already full.`,
      -power.wasted, true)
  }

  const mode = (sub: Subsystem): Mode => power.achieved[sub]

  // 6. production — oxygen from atmospheric CO2
  const o2Kwh = effectiveCost('oxygenGenerator', mode('oxygenGenerator'), mods)
  const o2Made = o2Kwh / C.O2_KWH_PER_KG
  s.stocks.o2 += o2Made
  deltas.o2 += o2Made
  log(solLog, s.sol, 'Oxygen',
    o2Made > 0 ? 'Oxygen generator split CO₂ from the Martian atmosphere.'
               : 'Oxygen generator was offline — the crew drew on stored oxygen.',
    o2Made, o2Made <= 0)

  const rMode = mode('waterRecycler')
  let recovery = rMode === 3 ? C.RECYCLER_HIGH : rMode === 2 ? C.RECYCLER_NOMINAL : rMode === 1 ? C.RECYCLER_LOW : 0
  if (s.recyclerClogged) recovery *= 0.5

  // 7. consumption
  const o2Used = C.O2_PER_CREW * s.crew.length
  s.stocks.o2 -= o2Used
  deltas.o2 -= o2Used
  log(solLog, s.sol, 'Oxygen', `Crew of ${s.crew.length} consumed oxygen.`, -o2Used)

  if (s.o2Leak > 0) {
    s.stocks.o2 -= s.o2Leak
    deltas.o2 -= s.o2Leak
    log(solLog, s.sol, 'Oxygen',
      'Hull leak is still venting oxygen. It must be patched.', -s.o2Leak, true)
  }

  // ---- air quality: what the life-support mode actually buys ----
  const lsMode = mode('lifeSupport')
  const co2Delta =
    lsMode <= 1 ? C.CO2_RISE_LOW :
    lsMode === 2 ? C.CO2_HOLD_NOMINAL : C.CO2_SCRUB_HIGH
  s.co2 = clamp(s.co2 + co2Delta, 0, 1.3)

  if (s.co2 >= C.CO2_DANGER) {
    s.co2AlarmSols++
    log(solLog, s.sol, 'Air',
      `Cabin CO₂ at ${Math.round(s.co2 * 100)}% of the limit — the crew has headaches ` +
      'and is working badly. Raise life support.', 0, true)
  } else if (s.co2 >= C.CO2_SYMPTOM) {
    log(solLog, s.sol, 'Air',
      `Cabin CO₂ climbing (${Math.round(s.co2 * 100)}%). Scrubbers are not keeping up.`, 0, true)
  } else if (co2Delta < 0 && s.co2 < 0.2) {
    log(solLog, s.sol, 'Air', 'Cabin air clean — scrubbers ahead of the crew.')
  }

  // ---- thermal: the habitat drifts toward the outside temperature ----
  const thMode = mode('thermal')
  const outside = (s.env.highTemp + s.env.lowTemp) / 2
  s.habTemp = clamp(
    s.habTemp + C.THERMAL_HEAT[thMode] - (s.habTemp - outside) * C.THERMAL_LOSS, -60, 30)

  const cold = s.habTemp < C.HAB_COLD_C
  if (cold) {
    s.coldSols++
    // A frozen condensate line is a water loss, not just a comfort problem.
    s.stocks.water -= C.COLD_WATER_LOSS
    deltas.water -= C.COLD_WATER_LOSS
    log(solLog, s.sol, 'Thermal',
      `Habitat fell to ${Math.round(s.habTemp)} °C. The condensate line froze and the ` +
      'crew is losing body heat.', -C.COLD_WATER_LOSS, true)
  } else {
    log(solLog, s.sol, 'Thermal', `Habitat held at ${Math.round(s.habTemp)} °C.`)
  }

  // ---- the comms link: science, and whether the player can see anything ----
  const comms = mode('commsScience')
  s.telemetry = comms >= C.TELEMETRY_MIN_MODE
  // A site chosen for its science value returns more from the same downlink.
  const sciGain = Math.round(C.SCIENCE_PER_SOL[comms] * siteOf(s).science)
  if (sciGain > 0) {
    s.stocks.science += sciGain
    deltas.science += sciGain
    log(solLog, s.sol, 'Science',
      `Downlinked ${sciGain} science points to Earth over the high-gain antenna.`, sciGain)
  } else {
    log(solLog, s.sol, 'Comms',
      'Comms unpowered — no telemetry, no forecast, and no science returned.', 0, true)
  }

  const crewWater = C.WATER_PER_CREW * s.crew.length
  const netWater = crewWater * recovery - crewWater
  s.stocks.water += netWater
  deltas.water += netWater
  log(solLog, s.sol, 'Water',
    `Crew used ${Math.round(crewWater)} L; recycler recovered ${Math.round(recovery * 100)}%.`,
    netWater)

  const foodUsed = C.MEALS_PER_CREW * s.crew.length
  s.stocks.food -= foodUsed
  deltas.food -= foodUsed
  log(solLog, s.sol, 'Food',
    `Crew of ${s.crew.length} ate ${C.MEALS_PER_CREW} meals each.`, -foodUsed)

  // crew tasks
  const tendedBeds: number[] = []
  const sownThisSol: number[] = []
  let nutrientsAdded = 0
  for (const a of assignments) {
    const m = s.crew[a.crewIndex]
    if (!m || a.task === 'none') continue
    const eff = taskEfficiency(a.task, m, s.co2)

    switch (a.task) {
      case 'cleanArray':
        s.stocks.cleanliness = 1
        log(solLog, s.sol, 'Power',
          `${m.name} cleaned the solar array — output restored to full.`)
        break
      case 'tendGreenhouse': {
        // One shift tends one bed. Left unspecified it goes to the bed in the
        // worst condition, which is what a botanist would actually do.
        const target = a.bed ?? worstBed(s)
        if (target < 0) {
          log(solLog, s.sol, 'Greenhouse',
            'There was nothing in the rack to tend — the shift was wasted.', 0, true)
        } else {
          tendedBeds.push(target)
          log(solLog, s.sol, 'Greenhouse',
            `${m.name} tended bed ${target + 1}: pruned, checked the roots and the ` +
            'nutrient feed.')
        }
        break
      }
      case 'plantCrop': {
        const target = a.bed ?? firstFreeBed(s)
        const crop: CropId = a.crop ?? 'lettuce'
        if (target < 0) {
          log(solLog, s.sol, 'Greenhouse',
            'Every bed is already planted — the sowing shift bought nothing.', 0, true)
        } else if (plantBed(s.greenhouse, target, crop, s.sol)) {
          sownThisSol.push(target)
          const def = cropById(crop)
          log(solLog, s.sol, 'Greenhouse',
            `${m.name} sowed ${def.name.toLowerCase()} in bed ${target + 1}. ` +
            `About ${def.growSols} sols to harvest at full care, and it will not grow ` +
            `below ${MODE_NAMES[def.minLight]} light.`)
        } else {
          log(solLog, s.sol, 'Greenhouse',
            `Bed ${target + 1} already holds a living crop — nothing was sown.`, 0, true)
        }
        break
      }
      case 'mixNutrients':
        nutrientsAdded += eff
        break
      case 'science': {
        const pts = 15 * eff
        s.stocks.science += pts
        deltas.science += pts
        log(solLog, s.sol, 'Science', `${m.name} completed a surface survey.`, pts)
        break
      }
      case 'iceRun':
        if (mode('roverCharge') !== 0) {
          // Shallow ice is the whole reason to accept a high-latitude site.
          const yieldL = C.ICE_RUN_YIELD * eff * siteOf(s).ice
          s.stocks.water += yieldL
          deltas.water += yieldL
          log(solLog, s.sol, 'Water',
            `${m.name} drove to the ice site and extracted subsurface water ice.`, yieldL)
        } else {
          log(solLog, s.sol, 'Water',
            'The ice run was cancelled — the rover was never charged.', 0, true)
        }
        break
      case 'regolithShield':
        if (!s.shieldInstalled) {
          s.shieldInstalled = true
          log(solLog, s.sol, 'Radiation',
            'Regolith piled over the habitat. Interior dose rate permanently reduced by 35%.')
        } else {
          log(solLog, s.sol, 'Radiation',
            'The habitat is already shielded — those six crew-hours bought nothing.', 0, true)
        }
        break
      case 'repair': {
        // One shift fixes the worst outstanding fault. An engineer, or an
        // unhurried crew, can get to a second one.
        const outstanding = activeFaults(s)
        if (outstanding.length === 0) {
          log(solLog, s.sol, 'Repair', 'Nothing was broken — the shift was spent on checks.', 0, true)
          s.wear = clamp(s.wear + C.WEAR_INSPECTION * 0.5, 0, 1)
        } else if (!a.fieldConfirmed) {
          log(solLog, s.sol, 'Repair',
            `The repair was planned but never carried out in the field — the ` +
            `${FAULT_LABEL[outstanding[0]]} is still there.`, 0, true)
        } else {
          const fixCount = eff >= 1.25 && outstanding.length > 1 ? 2 : 1
          for (const f of outstanding.slice(0, fixCount)) {
            clearFault(s, f)
            s.faultsFixed++
            log(solLog, s.sol, 'Repair', `${m.name} repaired the ${FAULT_LABEL[f]}.`)
          }
          s.repairsDone++
          s.wear = clamp(s.wear + C.WEAR_INSPECTION * 0.5, 0, 1)
        }
        break
      }
      case 'inspection':
        s.lastInspection = s.sol
        s.wear = clamp(s.wear + C.WEAR_INSPECTION * eff, 0, 1)
        log(solLog, s.sol, 'Maintenance',
          `${m.name} inspected the outpost. Wear is down to ` +
          `${Math.round(s.wear * 100)}% and nothing will fail tomorrow.`)
        break
      case 'extraRest':
        // Rest is not idleness: it buys back the efficiency that fatigue costs.
        m.fatigue = clamp(m.fatigue - 30, 0, 100)
        m.health = clamp(m.health + 5, 0, 100)
        log(solLog, s.sol, 'Crew', `${m.name} took a recovery shift.`)
        break
      default:
        break
    }
  }

  const rackInputs: RackInputs = {
    mode: mode('greenhouse'),
    recyclerMode: mode('waterRecycler'),
    tendedBeds,
    nutrientsAdded,
    sownThisSol,
  }
  advanceRack(s, rackInputs, solLog, deltas)

  // 8. clamp and count depletions
  if (s.stocks.o2 <= 0 && before.o2 > 0) s.depletedCount++
  if (s.stocks.water <= 0 && before.water > 0) s.depletedCount++
  if (s.stocks.food <= 0 && before.food > 0) s.depletedCount++
  s.stocks = clampStocks(s.stocks)

  // 9-10. radiation, health, fatigue
  updateCrew(s, assignments, solLog)

  // 11. battery
  const stored = Math.min(power.surplus, Math.max(C.CAP_BATTERY - s.stocks.battery, 0))
  s.stocks.battery = clamp(s.stocks.battery - power.batteryDraw + stored, 0, C.CAP_BATTERY)
  s.roverCharged = mode('roverCharge') !== 0

  // 12. dust and wear
  const dustLoss = C.DUST_PER_SOL + (s.env.dustStorm ? 0.22 : 0)
  if (!assignments.some((a) => a.task === 'cleanArray')) {
    s.stocks.cleanliness = clamp(s.stocks.cleanliness - dustLoss, 0, 1)
  }

  // Wear only climbs on sols nobody looked at the hardware — that is the
  // pressure that makes an inspection shift worth its two crew-hours.
  if (!assignments.some((a) => a.task === 'inspection' || a.task === 'repair')) {
    s.wear = clamp(s.wear + C.WEAR_PER_SOL + (s.env.dustStorm ? C.WEAR_STORM : 0), 0, 1)
  }
  if (s.wear > 0.6) {
    log(solLog, s.sol, 'Maintenance',
      `Equipment wear is at ${Math.round(s.wear * 100)}%. Something will fail soon ` +
      'unless the crew inspects the outpost.', 0, true)
  }
  s.stocks = clampStocks(s.stocks)

  // 13-14. advance and judge
  s.hoursLost = 0
  // A new sol is a new galley, a new hygiene cycle and a new course of
  // treatment. Clearing this here, in the simulation, is what makes the limit
  // part of the mission rather than a UI convention.
  s.habitatOpsUsed = []
  s.sol++
  s.outcome = evaluateOutcome(s)
  s.log = [...s.log, ...solLog]

  // The returned state must describe the sol the player is about to command,
  // not the one just resolved — otherwise the briefing and the planning
  // forecast would show yesterday's weather.
  s.env = computeEnvironment(s.sol, s.seed, s.siteId)

  return { next: s, power, solLog, deltas, outcome: s.outcome }
}

// --------------------------------------------------------------- forecast

/**
 * Non-destructive preview, recomputed live while the player edits their plan.
 * This is the feature that turns the game into a trainer: the consequence is
 * visible BEFORE the decision is committed.
 */
export function computeProjection(
  s: MissionState, plan: PowerPlan, assignments: Assignment[],
): Projection {
  const mods = { arrayFault: s.arrayFault, thermalFault: s.thermalFault }
  const power = settleAllocation(plan, s.stocks, s.env, mods)
  const powerBalance = power.available - power.requested
  const overAllocated = powerBalance < -1e-6

  // ---- what the air and the heaters will do ----
  const lsMode = plan.modes.lifeSupport
  const co2Delta =
    lsMode <= 1 ? C.CO2_RISE_LOW :
    lsMode === 2 ? C.CO2_HOLD_NOMINAL : C.CO2_SCRUB_HIGH
  const nextCo2 = clamp(s.co2 + co2Delta, 0, 1.3)

  const outside = (s.env.highTemp + s.env.lowTemp) / 2
  const nextHabTemp = clamp(
    s.habTemp + C.THERMAL_HEAT[plan.modes.thermal] - (s.habTemp - outside) * C.THERMAL_LOSS,
    -60, 30)
  const willBeCold = nextHabTemp < C.HAB_COLD_C

  // ---- resource balances ----
  const netO2 =
    effectiveCost('oxygenGenerator', plan.modes.oxygenGenerator, mods) / C.O2_KWH_PER_KG -
    C.O2_PER_CREW * s.crew.length - s.o2Leak

  const rMode = plan.modes.waterRecycler
  let recovery = rMode === 3 ? C.RECYCLER_HIGH : rMode === 2 ? C.RECYCLER_NOMINAL : rMode === 1 ? C.RECYCLER_LOW : 0
  if (s.recyclerClogged) recovery *= 0.5
  const crewWater = C.WATER_PER_CREW * s.crew.length
  let netWater = crewWater * recovery - crewWater

  // The rack's forecast is computed by the rack itself, from the same crop
  // table the growth model uses, so the planning screen and the resolution can
  // never disagree about what a bed of tomatoes costs.
  const rack = rackForecast(s.greenhouse, plan.modes.greenhouse)
  if (plan.modes.greenhouse !== 0) netWater += rack.netWater
  if (willBeCold) netWater -= C.COLD_WATER_LOSS
  if (assignments.some((a) => a.task === 'iceRun') && plan.modes.roverCharge !== 0) {
    netWater += C.ICE_RUN_YIELD * siteOf(s).ice
  }

  let netFood = -C.MEALS_PER_CREW * s.crew.length
  netFood += rack.mealsIncoming

  const o2Sols = solsRemaining(s.stocks.o2, netO2)
  const waterSols = solsRemaining(s.stocks.water, netWater)
  const foodSols = solsRemaining(s.stocks.food, netFood)

  // ---- risks, worst first ----
  // Every one of these names a cause and an action. "Something is wrong" is
  // not feedback; "the greenhouse has no water and the crop dies in two sols"
  // is something a ten-year-old can act on.
  const risks: string[] = []

  if (overAllocated) {
    risks.push(`Over budget by ${Math.round(-powerBalance)} kWh — something will be shut down for you.`)
  }
  if (nextCo2 >= C.CO2_DANGER) {
    risks.push('Cabin CO₂ reaches the danger band. The crew loses health and works slowly.')
  } else if (nextCo2 >= C.CO2_SYMPTOM) {
    risks.push('Cabin CO₂ is climbing. Life support at NOMINAL or higher will clear it.')
  }
  if (willBeCold) {
    risks.push(`Habitat drops to ${Math.round(nextHabTemp)} °C — frozen water line, slow crop, cold crew.`)
  }
  if (o2Sols >= 0 && o2Sols <= 2) risks.push('Oxygen runs out within two sols at this setting.')
  if (waterSols >= 0 && waterSols <= 2) risks.push('Water runs out within two sols at this setting.')
  const gh = greenhouseSummary(s.greenhouse)

  if (foodSols >= 0 && foodSols <= 2) {
    risks.push(gh.planted === 0
      ? 'Food runs out within two sols and every bed is empty. The fastest crop still takes three.'
      : 'Food runs out within two sols. A bed has to come in before then.')
  }
  if (plan.modes.greenhouse === 0 && gh.planted > gh.ready) {
    risks.push('Grow lights are off. Two sols without light and the beds are lost.')
  }
  if (rack.willStall && plan.modes.greenhouse !== 0) {
    risks.push('A planted bed needs brighter light than this and will not grow at all.')
  }
  if (gh.planted === 0 && s.sol <= 3) {
    risks.push(
      `Nothing is planted. The pantry runs out on sol ` +
      `${s.sol + Math.max(solsRemaining(s.stocks.food, netFood), 0)}, and even lettuce ` +
      'takes three sols.')
  }
  if (s.greenhouse.nutrients <= 0.12 && gh.planted > 0) {
    risks.push('The hydroponic nutrient reservoir is nearly dry. Growth halves when it empties.')
  }
  // The forecast has to warn before the mould, not after: it re-runs the same
  // transpiration arithmetic the rack will run tonight.
  const growingBeds = gh.planted - gh.ready
  if (growingBeds > 0 && plan.modes.greenhouse !== 0) {
    const projected = s.greenhouse.humidity + C.GH_HUMIDITY_PER_BED * growingBeds
    const target = C.GH_HUMIDITY_TARGET[plan.modes.greenhouse]
    const after = projected - Math.min(
      C.GH_DEHUMIDIFY[plan.modes.greenhouse], Math.max(projected - target, 0))
    if (after >= C.GH_HUMIDITY_HIGH) {
      risks.push(
        `${growingBeds} growing beds transpire more than the dehumidifier can remove at ` +
        'this greenhouse setting — the rack goes mouldy and the crops lose condition.')
    }
  }
  if (gh.wilted > 0) {
    risks.push(`${gh.wilted} bed${gh.wilted === 1 ? '' : 's'} died and must be replanted from seed.`)
  }
  // The quietest way to lose this mission is to command the power plan
  // perfectly and never give anybody a job. Nothing else on screen says so.
  const assignedHours = assignments.reduce((t, a) => t + taskHours(a.task), 0)
  if (assignedHours === 0) {
    risks.push('Nobody is assigned to anything. The crew will stand idle for the whole sol.')
  } else if (assignedHours < assignableHours(s) * 0.4) {
    risks.push(`Only ${assignedHours} of ${assignableHours(s)} crew-hours are used. Idle hands fix nothing.`)
  }
  if (s.wear > 0.55) {
    risks.push(`Equipment wear at ${Math.round(s.wear * 100)}% — an inspection stops a failure tomorrow.`)
  }
  for (const f of activeFaults(s)) {
    risks.push(`Unrepaired: ${FAULT_LABEL[f]}.`)
  }

  // ---- the information economy ----
  // Comms is not a luxury system. Switching it off saves 3 kWh and takes the
  // forecast away, so the player must decide what knowing is worth.
  const telemetry = plan.modes.commsScience >= C.TELEMETRY_MIN_MODE

  if (!telemetry) {
    return {
      o2Sols: -1, waterSols: -1, foodSols: -1,
      netO2: 0, netWater: 0, netFood: 0,
      powerBalance, overAllocated,
      warning: overAllocated
        ? `You have allocated ${Math.round(-powerBalance)} kWh more than you have. Reduce a system.`
        : 'Comms is unpowered — no forecast available. You are flying blind.',
      telemetry: false,
      nextCo2, nextHabTemp,
      risks: overAllocated ? [risks[0]] : [],
    }
  }

  return {
    o2Sols, waterSols, foodSols, netO2, netWater, netFood,
    powerBalance, overAllocated,
    warning: risks[0] ?? '',
    telemetry: true,
    nextCo2, nextHabTemp,
    risks,
  }
}
