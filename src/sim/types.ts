import type { CropId } from '../data/crops'
import type { SampleKind } from '../world/iceField'

export type SolPhase =
  | 'menu' | 'orbit' | 'descent' | 'briefing' | 'planning' | 'fieldOps'
  | 'resolution' | 'debrief' | 'results' | 'science' | 'howto'

export type Subsystem =
  | 'lifeSupport' | 'thermal' | 'oxygenGenerator' | 'waterRecycler'
  | 'greenhouse' | 'commsScience' | 'roverCharge'

export type Mode = 0 | 1 | 2 | 3 // off, low, nominal, high
export const MODE_NAMES = ['OFF', 'LOW', 'NOMINAL', 'HIGH'] as const

export type Task =
  | 'none' | 'cleanArray' | 'repair' | 'tendGreenhouse' | 'science'
  | 'iceRun' | 'regolithShield' | 'inspection' | 'extraRest' | 'plantCrop'
  | 'mixNutrients' | 'startReactor'

/** The four things that can break. Each one is repairable in the field. */
export type FaultId = 'o2Leak' | 'recyclerClogged' | 'arrayFault' | 'thermalFault'

export type Zone = 'shelter' | 'habitat' | 'rover' | 'eva'
export type CrewRole = 'commander' | 'engineer' | 'scientist' | 'medic'
export type GrowthStage = 'empty' | 'seeded' | 'sprouting' | 'growing' | 'ready' | 'wilted'
export type Quality = 'poor' | 'acceptable' | 'optimal'
export type Outcome = 'inProgress' | 'success' | 'aborted'
export type ScienceTag = 'REAL' | 'SIMPLIFIED'

export interface Stocks {
  o2: number          // kg
  water: number       // L
  food: number        // meals
  battery: number     // kWh
  cleanliness: number // 0..1
  science: number     // points
}

export interface CrewMember {
  name: string
  role: CrewRole
  shortRole: string
  health: number
  fatigue: number
  dose: number        // mSv, cumulative, never decreases
  zone: Zone
  assignedHours: number
  color: string
}

/**
 * One hydroponic bed.
 *
 * Each bed grows independently, so the rack is a portfolio decision: four beds
 * of lettuce is food on Sol 3 and nothing after, four beds of potato is
 * nothing at all inside a seven-sol mission, and the interesting plays are in
 * between. `health` is separate from `progress` because a crop can be alive
 * and behind schedule, or on schedule and dying.
 */
export interface CropBed {
  crop: CropId | null
  /** 0..1 of the way to harvest. */
  progress: number
  /** 0..100. At zero the crop is lost and the bed must be replanted. */
  health: number
  solsTended: number
  solsStarved: number
  /** The sol it was sown on, for the debrief. */
  plantedSol: number
}

/**
 * The growing environment, which is what the greenhouse power mode actually
 * buys. Every field here is read by the growth model, so none of it is a dial
 * that does nothing.
 */
export interface Greenhouse {
  beds: CropBed[]
  /** Rack air temperature, degrees C. Follows the habitat plus lamp heat. */
  tempC: number
  /** Relative humidity, 0..1. Plants raise it; the dehumidifier lowers it. */
  humidity: number
  /**
   * CO2 enrichment in ppm.
   *
   * On Mars this is the cheap input, not the scarce one: the outside air is
   * 95% CO2, so the rack can be enriched well above Earth ambient for the cost
   * of running a compressor. That is a genuinely counter-intuitive advantage
   * of farming on Mars, so the model lets the player feel it.
   */
  co2ppm: number
  /** Hydroponic nutrient reservoir, 0..1. Drawn down by growth, topped up by crew. */
  nutrients: number
  /** Meals harvested over the whole mission, for the debrief and the score. */
  totalMeals: number
}

export interface Environment {
  solarFactor: number
  tau: number
  dustStorm: boolean
  spe: boolean
  highTemp: number
  lowTemp: number
  headline: string
}

export interface PowerPlan {
  modes: Record<Subsystem, Mode>
  batteryAuth: number // 0..1
}

export interface Assignment {
  task: Task
  crewIndex: number
  fieldConfirmed: boolean
  /**
   * Which hydroponic bed this shift is for.
   *
   * `plantCrop` and `tendGreenhouse` act on one bed, not on the whole rack —
   * that is what turns four beds into four decisions. Left undefined, planting
   * takes the first free bed and tending takes the bed in the worst condition.
   */
  bed?: number
  /** Which crop to sow. Only meaningful for `plantCrop`. */
  crop?: CropId
}

/**
 * How the outpost is powered.
 *
 * `stowed`   the fission unit is on its pallet, unfuelled from the crew's
 *            point of view and producing nothing
 * `starting` set by the startup shift and converted to `online` at the end of
 *            the same sol's resolution, after that sol's power has already
 *            been settled. It is therefore never visible between sols: it is
 *            the mechanism of the one-sol delay, not a state to display
 * `online`   producing a flat output every sol, day, night and dust storm
 * `scrammed` shut down by a fault or a decision; it can be restarted
 */
export type ReactorState = 'stowed' | 'starting' | 'online' | 'scrammed'

export interface PowerSettlement {
  generation: number
  /** The solar half of `generation`, kWh. Dust and cleanliness move this. */
  solar: number
  /** The fission half of `generation`, kWh. Nothing in the weather moves it. */
  reactor: number
  batteryDraw: number
  available: number
  requested: number
  delivered: number
  surplus: number
  wasted: number
  achieved: Record<Subsystem, Mode>
  brownedOut: Subsystem[]
}

export interface LogEntry {
  sol: number
  category: string
  message: string
  delta: number
  warning: boolean
}

export interface Projection {
  o2Sols: number      // -1 means stable or rising
  waterSols: number
  foodSols: number
  netO2: number
  netWater: number
  netFood: number
  powerBalance: number
  overAllocated: boolean
  warning: string
  /** False when comms is unfunded: the numbers above are then unavailable. */
  telemetry: boolean
  /** Projected cabin CO2 and habitat temperature after this plan resolves. */
  nextCo2: number
  nextHabTemp: number
  /** Plain-language risks this plan carries, worst first. */
  risks: string[]
}

export interface DecisionRecord {
  sol: number
  eventId: string
  choiceId: string
  quality: Quality
  label: string
  reasoning: string
}

export interface DelayedEffect {
  onSol: number
  o2?: number
  water?: number
  food?: number
  battery?: number
  healthAll?: number
  doseAll?: number
  fatigueAll?: number
  science?: number
  wear?: number
  message: string
}

/**
 * Everything an event choice is allowed to change.
 *
 * Kept wide on purpose: a choice that cannot touch the simulation is not a
 * decision, it is a caption. Costs are expressed here so the balance harness
 * can check that no option is strictly better than another.
 */
export interface ChoiceEffects {
  o2?: number
  water?: number
  food?: number
  battery?: number
  science?: number
  cleanliness?: number
  healthAll?: number
  fatigueAll?: number
  doseAll?: number
  co2?: number
  habTemp?: number
  wear?: number
  o2Leak?: number
  recyclerClogged?: boolean
  arrayFault?: boolean
  thermalFault?: boolean
  shieldInstalled?: boolean
  /** Crew-hours burned by the choice itself, before the player assigns any. */
  crewHoursLost?: number
  /** Sols of growth every planted bed loses outright. */
  greenhouseStall?: number
  /** Growth progress granted immediately to every planted bed, 0..1. */
  greenhouseBoost?: number
  /** Health lost by every planted bed, 0..100. */
  cropDamage?: number
  /** Change to the nutrient reservoir, -1..1. */
  nutrients?: number
  /** Trips the fission unit offline. It has to be restarted by hand. */
  reactorScram?: boolean
}

export interface MissionState {
  sol: number
  totalSols: number
  outcome: Outcome
  seed: number
  /** Which landing site this mission is being flown from. See data/marsFeatures. */
  siteId: string
  rngCursor: number

  stocks: Stocks
  crew: CrewMember[]
  greenhouse: Greenhouse
  env: Environment

  shieldInstalled: boolean
  /** The backup fission surface power unit. See constants REACTOR_*. */
  reactor: ReactorState
  o2Leak: number
  recyclerClogged: boolean
  arrayFault: boolean
  thermalFault: boolean
  roverCharged: boolean
  /**
   * Energy aboard the rover right now, kWh.
   *
   * Set from the power the sol's plan actually delivered to roverCharge, then
   * spent in real time by driving and drilling. When it reaches zero the
   * rover stops where it is and the crew member walks home.
   */
  roverKwh: number
  /** Litres already taken out of each ice lens, keyed by patch. */
  drilled: Record<string, number>
  /** Total litres drilled this mission, for the debrief. */
  waterDrilled: number
  /** Sample site ids already picked up, so a rock cannot be collected twice. */
  samplesTaken: string[]
  /** Samples in the rack, not yet analysed. Worth nothing until they are. */
  samplesHeld: SampleKind[]
  /** How many have been worked at the laboratory bench. */
  samplesAnalysed: number

  /** Cabin CO2, normalised 0..1. Driven by the life-support mode. */
  co2: number
  /** Habitat interior temperature, degrees C. Driven by the thermal mode. */
  habTemp: number
  /** Accumulated equipment wear, 0..1. Drives the chance of a new fault. */
  wear: number
  /** Sol on which the last maintenance inspection was carried out. */
  lastInspection: number
  /**
   * Habitat operations already run this sol. See sim/habitatOps.ts.
   *
   * Cleared when the sol advances. This single list is what keeps the indoor
   * stations from being an unlimited source of crew condition: each one is a
   * once-a-sol decision with a price, not a button.
   */
  habitatOpsUsed: string[]
  /** True while the comms link is funded — gates the forecast. */
  telemetry: boolean
  faultsFixed: number

  brownoutSols: number
  depletedCount: number
  co2AlarmSols: number
  coldSols: number
  /** Crew-hours taken by this sol's event before the player assigns any. */
  hoursLost: number
  repairsDone: number
  harvests: number
  totalGenerated: number
  totalUsed: number
  totalWasted: number

  decisions: DecisionRecord[]
  pending: DelayedEffect[]
  log: LogEntry[]
}

export interface SolResult {
  next: MissionState
  power: PowerSettlement
  solLog: LogEntry[]
  deltas: Stocks
  outcome: Outcome
}

export interface ScoreBreakdown {
  crewSurvival: number
  lifeSupport: number
  efficiency: number
  radiation: number
  decisions: number
  science: number
  maintenance: number
  total: number
  stars: number
  rating: string
  badges: string[]
}

export interface LearningCard {
  what: string
  why: string
  realScience: string
  sourceLabel: string
  sourceUrl: string
  tag: ScienceTag
}

export interface EventChoice {
  id: string
  label: string
  cost: string
  effects: ChoiceEffects
  future?: DelayedEffect[]
  quality: Quality
  reasoning: string
}

export interface MissionEvent {
  id: string
  sol: number
  title: string
  category: string
  severity: 'info' | 'caution' | 'warning' | 'critical'
  situation: string
  /**
   * A fixed string, or a value read off the live mission.
   *
   * Several of these figures depend on the seed and on how the outpost has
   * been run — solar output moves with dust and array cleanliness. Written as
   * constants they contradicted the briefing screen on the same sol, which
   * makes the trainer look like it is guessing.
   */
  telemetry: Record<string, string | ((s: MissionState) => string)>
  requiresField?: Task
  choices: EventChoice[]
  learning: LearningCard
  objective: string
}
