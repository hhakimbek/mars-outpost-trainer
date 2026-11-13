import { create } from 'zustand'
import { C, TASK_HOURS } from '../sim/constants'
import {
  applyChoiceEffects, assignableHours, canTurnOff, clampStocks, computeEnvironment, computeProjection,
  createDefaultPlan, createInitialState, doseRate, firstFreeBed, resolveSol,
} from '../sim/simulation'
import { computeScore } from '../sim/scoring'
import { eventForSol } from '../data/events'
import { DEFAULT_SITE_ID } from '../data/marsFeatures'
import { CROP_LIST, cropById, type CropId } from '../data/crops'
import { bedStage, harvestBed } from '../sim/greenhouse'
import { cloneState } from '../sim/clone'
import { HABITAT_OPS, opBlockedReason, runHabitatOp, type HabitatOpId } from '../sim/habitatOps'
import type {
  Assignment, MissionEvent, MissionState, Mode, PowerPlan, Projection,
  ScoreBreakdown, SolPhase, SolResult, Subsystem, Task, Zone,
} from '../sim/types'

const SAVE_KEY = 'mot.save.v1'

/**
 * Bumped whenever MissionState gains or loses a field. An older save is
 * rejected rather than half-loaded; `load` additionally heals any field that
 * is missing or non-finite, so a partial save can never poison the model.
 */
const SAVE_VERSION = 4

interface Toast { id: number; text: string; warning: boolean }

interface GameStore {
  phase: SolPhase
  state: MissionState
  plan: PowerPlan
  assignments: Assignment[]
  checkpoint: MissionState | null
  lastResult: SolResult | null
  activeEvent: MissionEvent | null
  eventResolved: boolean
  controlled: number
  cadetName: string
  toasts: Toast[]
  evaSecondsLeft: number
  reduceMotion: boolean

  /**
   * First-person when true, over-the-shoulder when false.
   *
   * First person is the better view for judging a hull panel or lining up a
   * drill; third person is the better view for crossing the site without
   * walking off a slope. Both are needed, so the player gets both.
   */
  firstPerson: boolean

  /** The site highlighted in orbit. Becomes the mission's site on touchdown. */
  selectedSiteId: string
  /**
   * The seed the player typed on the menu, held while they choose a site.
   *
   * It cannot go straight into a mission: the mission does not exist until a
   * site is picked, and leaving the old one running underneath the globe would
   * let the player abandon a half-played sol by accident.
   */
  pendingSeed: number | null

  // navigation
  setPhase: (p: SolPhase) => void
  openSiteSelect: (seed?: number) => void
  selectSite: (id: string) => void
  commitLanding: () => void
  landingComplete: () => void
  startCampaign: (seed?: number, siteId?: string) => void
  restartSol: () => void
  confirmPlan: () => void
  endSol: () => void
  nextSol: () => void
  quitToMenu: () => void

  // decisions
  setMode: (s: Subsystem, m: Mode) => void
  setBatteryAuth: (v: number) => void
  assignTask: (t: Task, crewIndex: number, bed?: number, crop?: CropId) => boolean
  removeAssignment: (i: number) => void
  confirmFieldTask: (t: Task) => void
  chooseEventOption: (index: number) => void
  plantCrop: (bed?: number, crop?: CropId) => void
  harvestCrop: () => boolean
  /** The crop the field controls will sow next. Cycled with C at the rack. */
  selectedCrop: CropId
  setSelectedCrop: (c: CropId) => void
  cycleSelectedCrop: () => void

  // field ops
  /**
   * True while the crew member you are controlling is inside the habitat.
   *
   * This is a view switch and a simulation fact at once: inside, the surface
   * scene is not rendered at all, the EVA window stops running down, and the
   * radiation zone is the shielded core. The habitat is worth being in.
   */
  inside: boolean
  /** Airlock cycle: null, or which way through it the crew member is going. */
  airlockDir: 'in' | 'out' | null
  /** Airlock cycle progress, 0..1. */
  airlockT: number
  beginAirlock: (dir: 'in' | 'out') => void
  tickAirlock: (dt: number) => void
  /** Run one of the once-a-sol habitat operations. See sim/habitatOps.ts. */
  runHabitatOp: (op: HabitatOpId) => boolean
  toggleView: () => void
  setControlled: (i: number) => void
  setZone: (crewIndex: number, zone: Zone) => void
  tickFieldOps: (dt: number) => void

  // readers
  projection: () => Projection
  score: () => ScoreBreakdown
  usedCrewHours: () => number
  maxCrewHours: () => number
  fieldWorkOutstanding: () => boolean

  // misc
  pushToast: (text: string, warning?: boolean) => void
  dismissToast: (id: number) => void
  setCadetName: (n: string) => void
  setReduceMotion: (v: boolean) => void
  save: () => void
  load: () => boolean
  hasSave: () => boolean
}

let toastId = 0

export const useGame = create<GameStore>((set, get) => ({
  phase: 'menu',
  state: createInitialState(20261112),
  plan: createDefaultPlan(),
  assignments: [],
  checkpoint: null,
  lastResult: null,
  activeEvent: null,
  eventResolved: false,
  controlled: 0,
  cadetName: '',
  toasts: [],
  evaSecondsLeft: C.EVA_SECONDS,
  reduceMotion: false,
  firstPerson: false,
  inside: false,
  airlockDir: null,
  airlockT: 0,
  selectedCrop: 'lettuce',
  selectedSiteId: DEFAULT_SITE_ID,
  pendingSeed: null,

  // ------------------------------------------------------------ navigation

  setPhase: (p) => set({ phase: p }),

  /** Menu -> orbit. The mission is not built yet; only the seed is held. */
  openSiteSelect: (seed) => set({
    pendingSeed: seed ?? null,
    selectedSiteId: get().selectedSiteId || DEFAULT_SITE_ID,
    phase: 'orbit',
  }),

  selectSite: (id) => set({ selectedSiteId: id }),

  /** Orbit -> descent. The globe plays the approach; nothing is committed yet. */
  commitLanding: () => set({ phase: 'descent' }),

  /**
   * Touchdown. Only now is the mission built, so a player who backs out of the
   * descent has not disturbed anything.
   */
  landingComplete: () => {
    const { pendingSeed, selectedSiteId } = get()
    get().startCampaign(pendingSeed ?? undefined, selectedSiteId)
  },

  startCampaign: (seed = Math.floor(Date.now() / 1000) % 1000000, siteId) => {
    const site = siteId ?? get().selectedSiteId ?? DEFAULT_SITE_ID
    const state = createInitialState(seed, C.TOTAL_SOLS, site)
    set({
      state,
      plan: createDefaultPlan(),
      assignments: [],
      checkpoint: state,
      lastResult: null,
      activeEvent: eventForSol(1) ?? null,
      eventResolved: false,
      controlled: 0,
      selectedSiteId: site,
      phase: 'briefing',
      evaSecondsLeft: C.EVA_SECONDS,
      inside: false,
      airlockDir: null,
      airlockT: 0,
    })
  },

  restartSol: () => {
    // A learner who lost a sol badly should be able to retry that sol, not the
    // whole mission. Losing twenty minutes to one bad call is discouraging.
    const cp = get().checkpoint
    if (!cp) return
    set({
      state: cloneState(cp),
      plan: createDefaultPlan(),
      assignments: [],
      lastResult: null,
      activeEvent: eventForSol(cp.sol) ?? null,
      eventResolved: false,
      phase: 'briefing',
      evaSecondsLeft: C.EVA_SECONDS,
    })
    get().pushToast(`Sol ${cp.sol} restarted.`)
  },

  confirmPlan: () => {
    if (get().projection().overAllocated) {
      get().pushToast('You cannot confirm a plan that uses more energy than you have.', true)
      return
    }
    set({ phase: 'fieldOps', evaSecondsLeft: C.EVA_SECONDS })
  },

  endSol: () => {
    const { state, plan, assignments } = get()
    const result = resolveSol(state, plan, assignments)
    set({ state: result.next, lastResult: result, phase: 'resolution' })
    get().save()
  },

  nextSol: () => {
    const s = get().state
    if (s.outcome !== 'inProgress' || s.sol > s.totalSols) {
      set({ phase: 'results' })
      return
    }
    const withEnv: MissionState = { ...cloneState(s), env: computeEnvironment(s.sol, s.seed) }
    set({
      state: withEnv,
      checkpoint: cloneState(withEnv),
      plan: createDefaultPlan(),
      assignments: [],
      activeEvent: eventForSol(s.sol) ?? null,
      eventResolved: false,
      phase: 'briefing',
      evaSecondsLeft: C.EVA_SECONDS,
    })
  },

  quitToMenu: () => set({ phase: 'menu' }),

  // ------------------------------------------------------------- decisions

  setMode: (sub, m) => {
    // Life support and thermal have a floor: the player may throttle them and
    // take the consequence, but cannot switch off the crew's air or heat.
    const mode: Mode = !canTurnOff(sub) && m === 0 ? 1 : m
    set((st) => ({ plan: { ...st.plan, modes: { ...st.plan.modes, [sub]: mode } } }))
  },

  setBatteryAuth: (v) =>
    set((st) => ({ plan: { ...st.plan, batteryAuth: Math.min(Math.max(v, 0), 1) } })),

  assignTask: (task, crewIndex, bed, crop) => {
    const { assignments, state } = get()
    const hours = TASK_HOURS[task]

    const personHours = assignments
      .filter((a) => a.crewIndex === crewIndex)
      .reduce((t, a) => t + TASK_HOURS[a.task], 0)
    if (personHours + hours > C.CREW_HOURS_EACH) {
      get().pushToast(`${state.crew[crewIndex]?.name ?? 'That crew member'} has no hours left today.`, true)
      return false
    }

    const used = assignments.reduce((t, a) => t + TASK_HOURS[a.task], 0)
    if (used + hours > assignableHours(state)) {
      get().pushToast('Not enough crew-hours left in the sol.', true)
      return false
    }
    if (task === 'regolithShield' && state.shieldInstalled) {
      get().pushToast('Regolith shielding is already installed.', true)
      return false
    }

    // Tasks that exist in the 3D world are not credited until the player has
    // actually walked over and done the work. Planning is not doing.
    const needsField = task === 'repair' || task === 'cleanArray' || task === 'iceRun'
    set({
      assignments: [
        ...assignments,
        {
          task,
          crewIndex,
          fieldConfirmed: !needsField,
          bed,
          crop: task === 'plantCrop' ? crop ?? get().selectedCrop : crop,
        },
      ],
    })
    return true
  },

  removeAssignment: (i) =>
    set((st) => ({ assignments: st.assignments.filter((_, idx) => idx !== i) })),

  confirmFieldTask: (task) => {
    let changed = false
    const next = get().assignments.map((a) => {
      if (a.task === task && !a.fieldConfirmed) { changed = true; return { ...a, fieldConfirmed: true } }
      return a
    })
    if (changed) {
      set({ assignments: next })
      get().pushToast('Field task completed.')
    }
  },

  chooseEventOption: (index) => {
    const { activeEvent, state } = get()
    if (!activeEvent || get().eventResolved) return
    const choice = activeEvent.choices[index]
    if (!choice) return

    const s = cloneState(state)

    // All of the mechanical work happens in the simulation, so a choice is a
    // real move with testable consequences rather than UI-local bookkeeping.
    const notes = applyChoiceEffects(s, choice.effects)
    for (const n of notes) get().pushToast(n)

    // Queue the consequences that land on later sols. This mechanism is what
    // teaches the difference between a cheap fix and a real one.
    for (const f of choice.future ?? []) {
      s.pending.push({ ...f, onSol: f.onSol <= s.sol ? s.sol + 1 : f.onSol })
    }

    s.decisions.push({
      sol: s.sol,
      eventId: activeEvent.id,
      choiceId: choice.id,
      quality: choice.quality,
      label: choice.label,
      reasoning: choice.reasoning,
    })

    set({ state: s, eventResolved: true })
  },

  plantCrop: (bed, crop) => {
    const s = cloneState(get().state)
    const target = bed ?? firstFreeBed(s)
    if (target < 0) {
      get().pushToast('Every bed already holds a living crop.', true)
      return
    }
    const choice = crop ?? get().selectedCrop
    const def = cropById(choice)
    s.greenhouse.beds[target] = {
      crop: choice, progress: 0, health: 100, solsTended: 0, solsStarved: 0, plantedSol: s.sol,
    }
    // Planting in the field costs the same two crew-hours as planning it.
    // Free planting would make the assignable task pointless.
    s.hoursLost += TASK_HOURS.plantCrop
    set({ state: s })
    get().pushToast(
      `${def.name} sown in bed ${target + 1} — about ${def.growSols} sols to harvest.`)
  },

  harvestCrop: () => {
    const s = cloneState(get().state)
    let meals = 0
    let count = 0
    for (let i = 0; i < s.greenhouse.beds.length; i++) {
      if (bedStage(s.greenhouse.beds[i]) !== 'ready') continue
      meals += harvestBed(s.greenhouse, i)
      count++
    }
    if (count === 0) return false
    s.stocks.food += meals
    s.stocks = clampStocks(s.stocks)
    s.harvests += count
    set({ state: s })
    get().pushToast(
      `Harvested ${Math.round(meals)} meals from ${count} bed${count === 1 ? '' : 's'}.`)
    return true
  },

  setSelectedCrop: (c) => set({ selectedCrop: c }),

  cycleSelectedCrop: () => {
    const i = CROP_LIST.findIndex((c) => c.id === get().selectedCrop)
    const next = CROP_LIST[(i + 1) % CROP_LIST.length]
    set({ selectedCrop: next.id })
    get().pushToast(
      `Next sowing: ${next.name} — ${next.growSols} sols, ${next.meals} meals, ` +
      `${next.waterPerSol} L/sol.`)
  },

  // ------------------------------------------------------------- field ops

  /**
   * Start an airlock cycle.
   *
   * The cycle is not decoration. Going out means suiting up and pumping the
   * lock down to Martian pressure; coming in means repressurising and brushing
   * perchlorate dust off the suit before it reaches the living space. It takes
   * real seconds of the EVA window either way, which is the honest reason not
   * to pop outside for one small job.
   */
  beginAirlock: (dir) => {
    if (get().airlockDir) return
    set({ airlockDir: dir, airlockT: 0 })
  },

  tickAirlock: (dt) => {
    const { airlockDir, airlockT } = get()
    if (!airlockDir) return
    const t = airlockT + dt / C.AIRLOCK_SECONDS
    if (t < 1) { set({ airlockT: t }); return }

    const goingIn = airlockDir === 'in'
    set({ airlockDir: null, airlockT: 0, inside: goingIn })
    get().pushToast(goingIn
      ? 'Airlock repressurised. Welcome inside.'
      : 'Airlock cycled. Surface pressure — about 6 mbar.')
  },

  runHabitatOp: (op) => {
    const { state, controlled } = get()
    const blocked = opBlockedReason(state, op)
    if (blocked) {
      get().pushToast(`${HABITAT_OPS[op].name}: ${blocked.toLowerCase()}.`, true)
      return false
    }
    const s = cloneState(state)
    const result = runHabitatOp(s, op, controlled)
    set({ state: s })
    get().pushToast(result.message, result.warning)
    return result.ok
  },

  toggleView: () => {
    const next = !get().firstPerson
    set({ firstPerson: next })
    get().pushToast(next ? 'First-person view.' : 'Third-person view.')
  },

  setControlled: (i) => set({ controlled: i }),

  setZone: (crewIndex, zone) => {
    set((st) => {
      const crew = st.state.crew.map((m, i) => (i === crewIndex ? { ...m, zone } : m))
      return { state: { ...st.state, crew } }
    })
  },

  tickFieldOps: (dt) => {
    const { phase, state, controlled, evaSecondsLeft } = get()
    if (phase !== 'fieldOps') return

    const member = state.crew[controlled]
    if (!member) return

    // Dose accrues in real time while outside, so the dosimeter on the HUD
    // ticks at a rate the player can actually feel.
    const inGameHours = (dt / C.EVA_SECONDS) * C.EVA_HOURS
    const rate = doseRate(member.zone, state.shieldInstalled, state.env.spe)
    const crew = state.crew.map((m, i) =>
      i === controlled ? { ...m, dose: m.dose + rate * inGameHours } : m)

    // The EVA window is a window on the *surface*. Inside the habitat the
    // crew is on habitat consumables and the clock has no business running —
    // which is also what makes stepping inside a real decision rather than a
    // scene change.
    const left = get().inside
      ? evaSecondsLeft
      : Math.max(evaSecondsLeft - dt, 0)
    set({ state: { ...state, crew }, evaSecondsLeft: left })

    if (left <= 0) {
      get().pushToast('EVA window closed — ending the sol.', true)
      get().endSol()
    }
  },

  // --------------------------------------------------------------- readers

  projection: () => computeProjection(get().state, get().plan, get().assignments),
  score: () => computeScore(get().state),
  usedCrewHours: () => get().assignments.reduce((t, a) => t + TASK_HOURS[a.task], 0),
  maxCrewHours: () => assignableHours(get().state),
  fieldWorkOutstanding: () => get().assignments.some((a) => !a.fieldConfirmed),

  // ------------------------------------------------------------------ misc

  pushToast: (text, warning = false) => {
    const id = ++toastId
    set((st) => ({ toasts: [...st.toasts.slice(-2), { id, text, warning }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setCadetName: (n) => set({ cadetName: n.slice(0, 32) }),
  setReduceMotion: (v) => set({ reduceMotion: v }),

  save: () => {
    try {
      const { state, plan, assignments, cadetName } = get()
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, state, plan, assignments, cadetName }))
    } catch {
      // Private browsing or blocked storage. The game must keep working.
    }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return false
      const data = JSON.parse(raw) as { v: number; state: MissionState; plan: PowerPlan; assignments: Assignment[]; cadetName?: string }
      if (data.v !== SAVE_VERSION || !data.state) return false

      // Fill in anything the saved mission is missing. A save written by an
      // older build is the single most likely thing to be sitting in a
      // demo machine's browser, and a missing field becomes NaN on the first
      // arithmetic that touches it, which breaks the whole mission silently.
      const fresh = createInitialState(data.state.seed ?? 1)
      const healed: MissionState = { ...fresh, ...data.state }
      for (const k of Object.keys(fresh) as (keyof MissionState)[]) {
        const v = healed[k]
        if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) {
          ;(healed as unknown as Record<string, unknown>)[k] = fresh[k]
        }
      }
      healed.stocks = { ...fresh.stocks, ...(data.state.stocks ?? {}) }
      healed.crew = Array.isArray(data.state.crew) && data.state.crew.length === fresh.crew.length
        ? data.state.crew.map((m, i) => ({ ...fresh.crew[i], ...m }))
        : fresh.crew

      set({
        state: healed,
        selectedSiteId: healed.siteId ?? DEFAULT_SITE_ID,
        plan: data.plan ?? createDefaultPlan(),
        assignments: data.assignments ?? [],
        checkpoint: cloneState(healed),
        cadetName: data.cadetName ?? '',
        activeEvent: eventForSol(healed.sol) ?? null,
        eventResolved: false,
        phase: 'briefing',
        evaSecondsLeft: C.EVA_SECONDS,
      })
      return true
    } catch {
      // A corrupt save starts a fresh mission rather than crashing.
      return false
    }
  },

  hasSave: () => {
    try { return localStorage.getItem(SAVE_KEY) !== null } catch { return false }
  },
}))
