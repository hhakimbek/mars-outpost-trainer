import { C } from './constants'
import { BED_COUNT, CROPS, cropById, type CropId } from '../data/crops'
import type {
  CropBed, Greenhouse, GrowthStage, LogEntry, MissionState, Mode, Stocks,
} from './types'

/**
 * The hydroponic rack.
 *
 * Four beds that grow independently, inside one shared environment. The
 * environment is the whole point: the greenhouse power mode does not simply
 * multiply a growth number, it sets the light, the lamp heat, the CO2
 * enrichment and the dehumidifier, and each of those reaches the crops by a
 * different route. Running the rack hot and bright grows a tomato fast and
 * costs 16 kWh; running it dim saves the power and kills the wheat outright.
 *
 * This module may not import React, three, or the store — the same rule the
 * rest of `src/sim` follows, so the whole food loop is testable headlessly.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** Local copy of the simulation's log helper, to keep this module standalone. */
function note(
  out: LogEntry[], sol: number, category: string, message: string,
  delta = 0, warning = false,
): void {
  out.push({ sol, category, message, delta, warning })
}

// ===========================================================================
//  CONSTRUCTION AND READING
// ===========================================================================

export function emptyBed(): CropBed {
  return { crop: null, progress: 0, health: 100, solsTended: 0, solsStarved: 0, plantedSol: 0 }
}

export function createGreenhouse(): Greenhouse {
  return {
    beds: Array.from({ length: BED_COUNT }, emptyBed),
    tempC: C.HAB_TARGET_C,
    humidity: 0.45,
    co2ppm: C.GH_CO2_PPM[1],
    nutrients: 1,
    totalMeals: 0,
  }
}

/** The stage a bed reads as, for the HUD and the 3D rack. */
export function bedStage(bed: CropBed): GrowthStage {
  if (!bed.crop) return 'empty'
  if (bed.health <= C.GH_WILT_HEALTH) return 'wilted'
  if (bed.progress >= 1) return 'ready'
  if (bed.progress >= 0.66) return 'growing'
  if (bed.progress >= 0.33) return 'sprouting'
  return 'seeded'
}

export interface GreenhouseSummary {
  /** The most advanced bed's stage — what the exterior of the rack shows. */
  stage: GrowthStage
  /** Mean progress across planted beds, 0..1. */
  progress: number
  planted: number
  ready: number
  wilted: number
  /** Litres per sol all growing beds will draw. */
  waterDraw: number
  /** Meals waiting to be brought in. */
  mealsReady: number
}

const STAGE_RANK: Record<GrowthStage, number> = {
  empty: 0, wilted: 1, seeded: 2, sprouting: 3, growing: 4, ready: 5,
}

export function greenhouseSummary(gh: Greenhouse): GreenhouseSummary {
  let stage: GrowthStage = 'empty'
  let sum = 0
  let planted = 0
  let ready = 0
  let wilted = 0
  let waterDraw = 0
  let mealsReady = 0

  for (const bed of gh.beds) {
    const st = bedStage(bed)
    if (STAGE_RANK[st] > STAGE_RANK[stage]) stage = st
    if (st === 'wilted') wilted++
    if (st === 'empty' || st === 'wilted') continue
    planted++
    sum += bed.progress
    const crop = cropById(bed.crop as CropId)
    if (st === 'ready') {
      ready++
      mealsReady += bedYield(bed)
    } else {
      waterDraw += crop.waterPerSol
    }
  }

  return {
    stage,
    progress: planted > 0 ? sum / planted : 0,
    planted, ready, wilted, waterDraw, mealsReady,
  }
}

/**
 * Meals one bed will deliver.
 *
 * Health matters more than tending here: a crop kept alive in a bad rack still
 * yields nearly half, which is deliberate — a learner who scrapes through a
 * storm should get something back for it rather than nothing.
 */
export function bedYield(bed: CropBed): number {
  if (!bed.crop) return 0
  const crop = cropById(bed.crop)
  const condition = C.GH_MIN_YIELD + (1 - C.GH_MIN_YIELD) * (bed.health / 100)
  const care = clamp(1 + 0.06 * bed.solsTended, 1, 1.25)
  return crop.meals * condition * care
}

/** Sows a bed. Returns false if that bed already holds a living crop. */
export function plantBed(gh: Greenhouse, index: number, crop: CropId, sol: number): boolean {
  const bed = gh.beds[index]
  if (!bed) return false
  const st = bedStage(bed)
  if (st !== 'empty' && st !== 'wilted') return false
  gh.beds[index] = {
    crop, progress: 0, health: 100, solsTended: 0, solsStarved: 0, plantedSol: sol,
  }
  return true
}

/** Clears a bed and returns the meals it held. */
export function harvestBed(gh: Greenhouse, index: number): number {
  const bed = gh.beds[index]
  if (!bed || bedStage(bed) !== 'ready') return 0
  const meals = bedYield(bed)
  gh.beds[index] = emptyBed()
  gh.totalMeals += meals
  return meals
}

// ===========================================================================
//  THE PER-SOL TICK
// ===========================================================================

export interface RackInputs {
  /** The greenhouse mode the power settlement actually delivered. */
  mode: Mode
  /** The water recycler's delivered mode — HIGH recovers nutrients from waste. */
  recyclerMode: Mode
  /** Beds tended by crew this sol, by index. */
  tendedBeds: number[]
  /** Nutrient reservoir added by crew shifts, 0..n. */
  nutrientsAdded: number
  /** Beds sown this sol — seeds cannot starve before they germinate. */
  sownThisSol: number[]
  /**
   * Multiplier on growth from researched technology, default 1.
   *
   * Perchlorate remediation is the one that moves it: cleaner water and a
   * cleaner nutrient feed, which is a precondition for using any local
   * material around food at all.
   */
  techGrowth?: number
}

/**
 * Advances the whole rack by one sol.
 *
 * Order matters and is deliberate: the environment settles first, then the
 * shared water draw, then each bed grows inside the environment that resulted.
 * Doing it the other way round let a bed grow on water a later bed had already
 * spent.
 */
export function advanceRack(
  s: MissionState,
  inputs: RackInputs,
  solLog: LogEntry[],
  deltas: Stocks,
): void {
  const gh = s.greenhouse
  const { mode, recyclerMode, tendedBeds, nutrientsAdded, sownThisSol } = inputs

  // ---------------------------------------------------------- 1. environment
  // The lamps are the rack's heater: a habitat held at 10 C with the lights on
  // HIGH is still a survivable rack, which is a real tactic.
  gh.tempC = s.habTemp + C.GH_LAMP_HEAT[mode]
  gh.co2ppm = C.GH_CO2_PPM[mode]

  const growing = gh.beds.filter((b) => {
    const st = bedStage(b)
    return st !== 'empty' && st !== 'wilted' && st !== 'ready'
  })

  // Transpiration first, then whatever the environmental control can pull back
  // out. The removal is capped and only acts on the excess above the setpoint,
  // so a rack with one bed settles at the setpoint instead of drying to zero,
  // and a rack with four beds outruns anything below HIGH.
  const transpired = gh.humidity + C.GH_HUMIDITY_PER_BED * growing.length
  const target = C.GH_HUMIDITY_TARGET[mode]
  const removable = Math.min(C.GH_DEHUMIDIFY[mode], Math.max(transpired - target, 0))
  gh.humidity = clamp(transpired - removable, 0, 1)

  // Nutrients: crew shifts and recycled waste in, growth out.
  let nutrientIn = nutrientsAdded * C.GH_NUTRIENT_REFILL
  if (recyclerMode === 3) nutrientIn += C.GH_NUTRIENT_FROM_RECYCLER
  const nutrientOut = growing.reduce(
    (t, b) => t + cropById(b.crop as CropId).nutrientPerSol, 0)
  gh.nutrients = clamp(gh.nutrients + nutrientIn - nutrientOut, 0, 1)

  if (nutrientsAdded > 0) {
    note(solLog, s.sol, 'Greenhouse',
      `Hydroponic nutrient reservoir topped up to ${Math.round(gh.nutrients * 100)}%.`)
  }

  const dryTank = gh.nutrients <= 0.001
  if (dryTank && growing.length > 0) {
    note(solLog, s.sol, 'Greenhouse',
      'Nutrient reservoir is empty. The crops are living on water alone and losing ' +
      'condition — someone has to mix a new batch.', 0, true)
  }

  const mouldy = gh.humidity >= C.GH_HUMIDITY_HIGH
  if (mouldy) {
    note(solLog, s.sol, 'Greenhouse',
      `Rack humidity at ${Math.round(gh.humidity * 100)}% — ${growing.length} growing ` +
      `bed${growing.length === 1 ? '' : 's'} transpire more than the dehumidifier can ` +
      'remove at this setting. Water is condensing on the leaves and mould is setting in: ' +
      'raise the greenhouse mode, or run fewer beds.', 0, true)
  }

  // ---------------------------------------------------------- 2. shared water
  const demand = growing.reduce((t, b) => t + cropById(b.crop as CropId).waterPerSol, 0)
  const lightsOn = mode !== 0
  const watered = demand === 0 || s.stocks.water >= demand

  if (demand > 0 && watered) {
    // Transpired water condenses on the rack walls and is recovered, so the
    // net cost of irrigation is well below the gross draw. This is the single
    // most important fact about farming with a closed water loop.
    const net = -demand * (1 - C.GREENHOUSE_RECOVERY)
    s.stocks.water += net
    deltas.water += net
    note(solLog, s.sol, 'Water',
      `Rack drew ${Math.round(demand)} L across ${growing.length} ` +
      `bed${growing.length === 1 ? '' : 's'}; ` +
      `${Math.round(C.GREENHOUSE_RECOVERY * 100)}% recovered as condensate.`, net)
  } else if (demand > 0 && !watered) {
    note(solLog, s.sol, 'Greenhouse',
      `The rack needed ${Math.round(demand)} L and the tanks could not supply it.`, 0, true)
  }

  // ---------------------------------------------------------- 3. per-bed tick
  const co2Factor = 1 + C.GH_CO2_BONUS *
    clamp((gh.co2ppm - C.GH_CO2_PPM[0]) / (C.GH_CO2_PPM[3] - C.GH_CO2_PPM[0]), 0, 1)
  const baseRate = mode === 0 ? 0 : mode === 1 ? 0.6 : mode === 2 ? 1.0 : 1.25

  let harvestedMeals = 0
  let harvestedMorale = 0
  const harvestNames: string[] = []

  for (let i = 0; i < gh.beds.length; i++) {
    const bed = gh.beds[i]
    if (!bed.crop) continue
    const crop = cropById(bed.crop)
    const st = bedStage(bed)
    const tended = tendedBeds.includes(i)

    // ---- a ready bed is brought in -----------------------------------------
    // Harvesting ripe food is not an interesting decision, and leaving it as a
    // UI-only action meant the food loop could not be tested.
    if (st === 'ready') {
      const meals = harvestBed(gh, i)
      harvestedMeals += meals
      harvestedMorale += crop.morale
      harvestNames.push(crop.name.toLowerCase())
      continue
    }

    if (st === 'wilted') continue

    const tooDim = mode < crop.minLight
    const starving = !lightsOn || tooDim || !watered

    if (starving) {
      // Seeds sown today have not germinated, so they cannot starve yet.
      if (sownThisSol.includes(i)) continue
      bed.solsStarved++
      const why = !lightsOn ? 'the lights were off'
        : tooDim ? `${crop.name} will not grow below ${['OFF', 'LOW', 'NOMINAL', 'HIGH'][crop.minLight]} light`
        : 'there was no water'
      bed.health = clamp(bed.health - 18 * crop.fragility, 0, 100)
      note(solLog, s.sol, 'Greenhouse',
        `Bed ${i + 1} (${crop.name.toLowerCase()}) did not grow — ${why}.`, 0, true)
      if (bed.health <= C.GH_WILT_HEALTH) {
        note(solLog, s.sol, 'Greenhouse',
          `Bed ${i + 1} is lost. It has to be replanted from seed.`, 0, true)
      }
      continue
    }

    bed.solsStarved = 0

    // ---- growth -----------------------------------------------------------
    const offIdeal = Math.abs(gh.tempC - crop.idealTempC)
    const tempFactor = clamp(1 - (offIdeal / C.GH_TEMP_BAND) * 0.5, 0.25, 1)
    const nutrientFactor = dryTank ? C.GH_STARVED_GROWTH : 1
    const humidityFactor = mouldy ? 0.75 : 1
    // Condition is deliberately a weak multiplier. At 0.5 + 0.5*health a
    // damaged crop grew at half speed, which kept it in the rack longer, which
    // kept the rack humid, which damaged it further — the feedback loop was
    // positive and the player could not break it. A hurt crop should be behind
    // schedule, not doomed.
    const conditionFactor = 0.7 + 0.3 * (bed.health / 100)
    const tendFactor = tended ? 1.25 : 1

    const rate = baseRate * tempFactor * co2Factor * nutrientFactor *
      humidityFactor * conditionFactor * tendFactor * (inputs.techGrowth ?? 1)

    bed.progress = clamp(bed.progress + rate / crop.growSols, 0, 1)
    if (tended) bed.solsTended++

    // ---- condition --------------------------------------------------------
    let healthDelta = 0
    if (mouldy) healthDelta -= C.GH_MOULD_HEALTH * crop.fragility
    if (offIdeal > C.GH_TEMP_BAND) healthDelta -= 8 * crop.fragility
    if (dryTank) healthDelta -= C.GH_NUTRIENT_HEALTH * crop.fragility
    if (tended) healthDelta += C.GH_TEND_HEALTH
    // A rack inside its band heals a crop that had a bad sol. This has to be
    // fast enough to actually undo one bad sol, or every storm is permanent.
    if (healthDelta === 0) healthDelta += C.GH_HEAL_HEALTH

    bed.health = clamp(bed.health + healthDelta, 0, 100)

    if (bed.health <= C.GH_WILT_HEALTH) {
      note(solLog, s.sol, 'Greenhouse',
        `Bed ${i + 1} (${crop.name.toLowerCase()}) died. Replant it from seed.`, 0, true)
      continue
    }

    if (bed.progress >= 1) {
      note(solLog, s.sol, 'Greenhouse',
        `Bed ${i + 1}: the ${crop.name.toLowerCase()} is ready to harvest.`)
    } else if (rate > 0) {
      const left = Math.ceil(((1 - bed.progress) * crop.growSols) / Math.max(rate, 0.01))
      note(solLog, s.sol, 'Greenhouse',
        `Bed ${i + 1}: ${crop.name.toLowerCase()} ${Math.round(bed.progress * 100)}% grown, ` +
        `about ${left} sol${left === 1 ? '' : 's'} to harvest` +
        `${bed.health < 60 ? ` (condition ${Math.round(bed.health)}%)` : ''}.`)
    }
  }

  if (harvestedMeals > 0) {
    s.stocks.food += harvestedMeals
    deltas.food += harvestedMeals
    s.harvests += harvestNames.length
    note(solLog, s.sol, 'Greenhouse',
      `Harvested ${Math.round(harvestedMeals)} meals of ${harvestNames.join(' and ')}.`,
      harvestedMeals)
  }

  // Fresh food is a psychological countermeasure, not only calories. This is
  // the whole reason a tomato bed is worth its water.
  if (harvestedMorale > 0) {
    for (const m of s.crew) m.health = clamp(m.health + harvestedMorale, 0, 100)
    note(solLog, s.sol, 'Crew',
      `Something fresh at the table. The crew is in better shape for it ` +
      `(+${harvestedMorale} condition each).`, harvestedMorale)
  }
}

/**
 * What the rack will cost and return next sol, for the planning forecast.
 *
 * It has to agree with `advanceRack` exactly or the forecast lies, so it reads
 * the same crop table and the same recovery constant rather than estimating.
 */
export function rackForecast(
  gh: Greenhouse, mode: Mode,
): { netWater: number; mealsIncoming: number; willStall: boolean } {
  let gross = 0
  let mealsIncoming = 0
  let willStall = false

  for (const bed of gh.beds) {
    const st = bedStage(bed)
    if (st === 'ready') { mealsIncoming += bedYield(bed); continue }
    if (st === 'empty' || st === 'wilted' || !bed.crop) continue
    const crop = CROPS[bed.crop]
    gross += crop.waterPerSol
    if (mode < crop.minLight) willStall = true
  }

  return {
    netWater: -gross * (1 - C.GREENHOUSE_RECOVERY),
    mealsIncoming,
    willStall,
  }
}
