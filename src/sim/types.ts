export type SolPhase =
  | 'menu' | 'briefing' | 'planning' | 'fieldOps'
  | 'resolution' | 'debrief' | 'results' | 'science' | 'howto'

export type Subsystem =
  | 'lifeSupport' | 'thermal' | 'oxygenGenerator' | 'waterRecycler'
  | 'greenhouse' | 'commsScience' | 'roverCharge'

export type Mode = 0 | 1 | 2 | 3 // off, low, nominal, high
export const MODE_NAMES = ['OFF', 'LOW', 'NOMINAL', 'HIGH'] as const

export type Task =
  | 'none' | 'cleanArray' | 'repair' | 'tendGreenhouse' | 'science'
  | 'iceRun' | 'regolithShield' | 'inspection' | 'extraRest' | 'plantCrop'

/** The four things that can break. Each one is repairable in the field. */
export type FaultId = 'o2Leak' | 'recyclerClogged' | 'arrayFault' | 'thermalFault'

export type Zone = 'shelter' | 'habitat' | 'rover' | 'eva'
export type CrewRole = 'commander' | 'engineer' | 'scientist'
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

export interface Greenhouse {
  stage: GrowthStage
  progress: number
  solsTended: number
  solsStarved: number
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
}

export interface PowerSettlement {
  generation: number
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
  /** Sols of growth the crop loses outright. */
  greenhouseStall?: number
  /** Growth progress granted immediately, 0..1. */
  greenhouseBoost?: number
}

export interface MissionState {
  sol: number
  totalSols: number
  outcome: Outcome
  seed: number
  rngCursor: number

  stocks: Stocks
  crew: CrewMember[]
  greenhouse: Greenhouse
  env: Environment

  shieldInstalled: boolean
  o2Leak: number
  recyclerClogged: boolean
  arrayFault: boolean
  thermalFault: boolean
  roverCharged: boolean

  /** Cabin CO2, normalised 0..1. Driven by the life-support mode. */
  co2: number
  /** Habitat interior temperature, degrees C. Driven by the thermal mode. */
  habTemp: number
  /** Accumulated equipment wear, 0..1. Drives the chance of a new fault. */
  wear: number
  /** Sol on which the last maintenance inspection was carried out. */
  lastInspection: number
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
