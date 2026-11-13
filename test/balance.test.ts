/**
 * Balance harness.
 *
 * Three questions this answers that no unit test can:
 *   1. Can a reasonable commander finish all seven sols?
 *   2. Does a careless one actually fail? (A trainer that cannot be lost
 *      teaches nothing.)
 *   3. Is any subsystem mode or event choice strictly dominant — free value
 *      with no cost? Those are the choices that are not really choices.
 */
import { createInitialState, createDefaultPlan, resolveSol, settleAllocation } from '../src/sim/simulation'
import { computeScore } from '../src/sim/scoring'
import { C, SUBSYSTEM_COST } from '../src/sim/constants'
import { EVENTS } from '../src/data/events'
import type { Assignment, MissionState, Mode, PowerPlan, Subsystem, Task } from '../src/sim/types'
import { greenhouseSummary, plantBed } from '../src/sim/greenhouse'
import type { CropId } from '../src/data/crops'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}
const section = (t: string) => console.log(`\n=== ${t} ===`)

// --------------------------------------------------------------- strategies

type Strategy = (s: MissionState) => { plan: PowerPlan; assignments: Assignment[] }

const A = (task: Task, crewIndex: number): Assignment => ({ task, crewIndex, fieldConfirmed: true })

/** A plant-crop assignment aimed at a named bed. */
const sow = (crewIndex: number, bed: number, crop: CropId): Assignment =>
  ({ task: 'plantCrop', crewIndex, fieldConfirmed: true, bed, crop })

/**
 * What a thoughtful player would plausibly do.
 *
 * With four crew the pantry is five and a half sols deep, so the rack is the
 * mission rather than a side activity: this strategy fills beds early, picks a
 * light setting that the dehumidifier can actually keep up with for that many
 * beds, and mixes nutrients before the reservoir runs dry.
 */
const reasonable: Strategy = (s) => {
  const rack = greenhouseSummary(s.greenhouse)
  const growingBeds = rack.planted - rack.ready

  const plan = createDefaultPlan()
  plan.modes.lifeSupport = 2
  plan.modes.thermal = 2
  plan.modes.oxygenGenerator = 2
  plan.modes.waterRecycler = 2
  plan.modes.greenhouse = growingBeds >= 3 ? 3 : growingBeds >= 1 ? 2 : 1
  plan.modes.commsScience = 1
  plan.modes.roverCharge = 0
  plan.batteryAuth = 0.5

  const assignments: Assignment[] = []

  // Slowest crop first: a potato sown on Sol 3 will never land, so the order
  // beds are filled in matters as much as how many.
  const plan_order: CropId[] = ['potato', 'lettuce', 'wheat', 'lettuce']
  const taken = new Set<number>()
  let sown = 0
  while (sown < 2 && s.sol <= 2) {
    const free = s.greenhouse.beds.findIndex(
      (b, i) => !taken.has(i) && (!b.crop || b.health <= C.GH_WILT_HEALTH))
    if (free < 0) break
    taken.add(free)
    assignments.push(sow(2, free, plan_order[free] ?? 'lettuce'))
    sown++
    plan.modes.greenhouse = Math.max(plan.modes.greenhouse, 2) as Mode
  }

  if (sown === 0) {
    if (s.greenhouse.nutrients < 0.35) assignments.push(A('mixNutrients', 2))
    else if (growingBeds > 0) assignments.push(A('tendGreenhouse', 2))
  }

  // Anything broken gets fixed; otherwise keep wear down and the array clean.
  const broken = s.o2Leak > 0 || s.recyclerClogged || s.arrayFault || s.thermalFault
  assignments.push(broken ? A('repair', 1) : A('inspection', 1))
  assignments.push(A('cleanArray', 0))
  // The medical officer's recovery shift is worth 50% more than anyone else's.
  assignments.push(A('extraRest', 3))

  // a storm sol is survived by shedding, not by spending
  if (s.env.dustStorm) {
    plan.modes.greenhouse = 1
    plan.modes.commsScience = 0
    plan.batteryAuth = 0.8
  }
  return { plan, assignments }
}

/** Everything maxed, nothing maintained. */
const careless: Strategy = () => {
  const plan = createDefaultPlan()
  plan.modes.lifeSupport = 1
  plan.modes.thermal = 1
  plan.modes.oxygenGenerator = 1
  plan.modes.waterRecycler = 1
  plan.modes.greenhouse = 0
  plan.modes.commsScience = 0
  plan.modes.roverCharge = 0
  plan.batteryAuth = 0.2
  return { plan, assignments: [] }
}

function play(seed: number, strat: Strategy, sols = C.TOTAL_SOLS) {
  let s = createInitialState(seed)
  const trace: string[] = []
  for (let i = 0; i < sols && s.outcome === 'inProgress'; i++) {
    const { plan, assignments } = strat(s)
    const r = resolveSol(s, plan, assignments)
    s = r.next
    trace.push(
      `sol${i + 1}: O2 ${s.stocks.o2.toFixed(1)} H2O ${Math.round(s.stocks.water)} ` +
      `food ${Math.round(s.stocks.food)} bat ${Math.round(s.stocks.battery)} ` +
      `health ${Math.round(Math.min(...s.crew.map((c) => c.health)))} ` +
      `clean ${Math.round(s.stocks.cleanliness * 100)}%`)
  }
  return { state: s, score: computeScore(s), trace }
}

// ------------------------------------------------------------------- tests

section('survivability')
{
  const seeds = [1, 7, 42, 101, 999]
  const results = seeds.map((sd) => play(sd, reasonable))
  const wins = results.filter((r) => r.state.outcome === 'success').length
  check('a reasonable strategy completes all seven sols on every seed',
    wins === seeds.length, `${wins}/${seeds.length} succeeded`)
  results.forEach((r, i) => {
    if (r.state.outcome !== 'success') {
      console.log(`     seed ${seeds[i]} FAILED at sol ${r.state.sol}:`)
      for (const line of r.trace) console.log('       ' + line)
      const bad = r.state.log.filter((l) => l.warning).slice(-10)
      for (const l of bad) console.log(`       ! sol${l.sol} [${l.category}] ${l.message}`)
    }
  })
  const scores = results.map((r) => r.score.total)
  check('a reasonable strategy scores like a competent run (>= 600)',
    Math.min(...scores) >= 600, `scores ${scores.join(', ')}`)
  console.log('     trace (seed 42):')
  for (const line of play(42, reasonable).trace) console.log('       ' + line)
}

section('losability')
{
  const seeds = [1, 7, 42, 101, 999]
  const results = seeds.map((sd) => play(sd, careless))
  const losses = results.filter((r) => r.state.outcome === 'aborted').length
  check('a careless strategy loses the mission on every seed',
    losses === seeds.length, `${losses}/${seeds.length} aborted`)
  const scores = results.map((r) => r.score.total)
  check('a careless run scores below a reasonable one',
    Math.max(...scores) < 600, `scores ${scores.join(', ')}`)
  console.log('     trace (seed 42):')
  for (const line of play(42, careless).trace) console.log('       ' + line)
}

section('a mission can be lost in more than one way')
{
  // A trainer where every defeat looks the same teaches one lesson. These are
  // the three distinct ways a commander can lose this outpost, each traced to
  // the decision that caused it.

  // 1. Never plants. Everything else is run correctly.
  const noFarm: Strategy = (st) => {
    const r = reasonable(st)
    r.assignments = r.assignments.filter((a) => a.task !== 'plantCrop' && a.task !== 'tendGreenhouse')
    r.plan.modes.greenhouse = 0
    return r
  }
  const famine = play(42, noFarm)
  check('ignoring the greenhouse starves the crew',
    famine.state.stocks.food <= 0,
    `food ${Math.round(famine.state.stocks.food)}, outcome ${famine.state.outcome}`)

  // 2. Throttles life support and heating to save power.
  const coldAndStuffy: Strategy = (st) => {
    const r = reasonable(st)
    r.plan.modes.lifeSupport = 1
    r.plan.modes.thermal = 1
    return r
  }
  const stuffy = play(42, coldAndStuffy)
  check('running life support and heating at LOW makes the habitat unlivable',
    stuffy.state.co2AlarmSols > 0 || stuffy.state.coldSols > 0,
    `${stuffy.state.co2AlarmSols} CO₂ alarm sols, ${stuffy.state.coldSols} cold sols, ` +
    `min health ${Math.round(Math.min(...stuffy.state.crew.map((c) => c.health)))}`)
  check('that habitat costs real score',
    stuffy.score.total < play(42, reasonable).score.total,
    `${stuffy.score.total} vs ${play(42, reasonable).score.total}`)

  // 3. Never inspects or repairs.
  const neverMaintains: Strategy = (st) => {
    const r = reasonable(st)
    r.assignments = r.assignments.filter((a) => a.task !== 'inspection' && a.task !== 'repair')
    return r
  }
  const broken = play(42, neverMaintains)
  const outstanding = (broken.state.o2Leak > 0 ? 1 : 0) + (broken.state.recyclerClogged ? 1 : 0) +
    (broken.state.arrayFault ? 1 : 0) + (broken.state.thermalFault ? 1 : 0)
  check('skipping maintenance lets faults accumulate',
    outstanding > 0 || broken.state.wear > 0.5,
    `${outstanding} unrepaired faults, wear ${Math.round(broken.state.wear * 100)}%`)
  check('unmaintained hardware costs score',
    broken.score.maintenance < play(42, reasonable).score.maintenance,
    `maintenance ${broken.score.maintenance} vs ${play(42, reasonable).score.maintenance}`)
}

section('no free lunch — every subsystem mode must cost or earn something')
{
  // Run a baseline sol, then re-run with one subsystem stepped DOWN. If the
  // cheaper setting leaves every resource and every crew member at least as
  // well off, that setting is strictly better and the expensive mode is
  // decoration.
  const subsystems = Object.keys(SUBSYSTEM_COST) as Subsystem[]
  const freebies: string[] = []

  for (const sub of subsystems) {
    const base = createInitialState(42)
    // A half-grown bed, so the greenhouse modes have something to act on.
    plantBed(base.greenhouse, 0, 'lettuce', 1)
    base.greenhouse.beds[0].progress = 0.5
    base.greenhouse.beds[0].solsTended = 1

    // A mode only has to earn its keep in the situation it exists for. Life
    // support HIGH is pointless in clean air and essential in foul air; the
    // test has to put each system under the load it is meant to carry.
    if (sub === 'lifeSupport') base.co2 = 0.62
    if (sub === 'thermal') base.habTemp = 4
    if (sub === 'waterRecycler') base.stocks.water = 60

    const hi = createDefaultPlan()
    hi.modes[sub] = Math.min(hi.modes[sub] + 1, 3) as Mode
    const lo = createDefaultPlan()
    lo.modes[sub] = Math.max(hi.modes[sub] - 1, 0) as Mode
    if (hi.modes[sub] === lo.modes[sub]) continue

    // roverCharge only does anything when someone is driving the rover.
    const work: Assignment[] = sub === 'roverCharge' ? [A('iceRun', 0)] : []
    const rHi = resolveSol(base, hi, work)
    const rLo = resolveSol(base, lo, work)

    const better = (a: MissionState, b: MissionState) =>
      a.stocks.o2 >= b.stocks.o2 - 1e-6 &&
      a.stocks.water >= b.stocks.water - 1e-6 &&
      a.stocks.food >= b.stocks.food - 1e-6 &&
      a.stocks.battery >= b.stocks.battery - 1e-6 &&
      a.stocks.science >= b.stocks.science - 1e-6 &&
      greenhouseSummary(a.greenhouse).progress >=
        greenhouseSummary(b.greenhouse).progress - 1e-6 &&
      // Crop condition and the nutrient tank are outcomes too: a cheaper
      // greenhouse setting that quietly lets the rack go mouldy is not free.
      a.greenhouse.beds.every((bed, i) => bed.health >= b.greenhouse.beds[i].health - 1e-6) &&
      a.greenhouse.humidity <= b.greenhouse.humidity + 1e-6 &&
      a.greenhouse.nutrients >= b.greenhouse.nutrients - 1e-6 &&
      // Air quality and habitat temperature are outcomes too. Leaving them out
      // made life support and the heaters look like pure cost.
      a.co2 <= b.co2 + 1e-6 &&
      a.habTemp >= b.habTemp - 1e-6 &&
      a.wear <= b.wear + 1e-6 &&
      a.crew.every((m, i) => m.health >= b.crew[i].health - 1e-6 && m.dose <= b.crew[i].dose + 1e-6)

    if (better(rLo.next, rHi.next)) {
      freebies.push(`${sub} (${lo.modes[sub]} dominates ${hi.modes[sub]})`)
    }
  }
  check('no subsystem can be throttled down for free', freebies.length === 0,
    freebies.length ? freebies.join('; ') : 'every mode buys something')
}

section('event choices are real choices')
{
  const noEffect: string[] = []
  const dominated: string[] = []

  const signature = (c: { effects: Record<string, unknown>; future?: unknown[]; cost: string }) =>
    Object.keys(c.effects).length + (c.future?.length ?? 0)

  for (const e of EVENTS) {
    for (const c of e.choices) {
      if (signature(c) === 0) noEffect.push(`${e.id}/${c.id}`)
    }
    // A choice is dominated when another option is at least as good on every
    // numeric effect and strictly better somewhere.
    for (const a of e.choices) {
      for (const b of e.choices) {
        if (a === b) continue
        const keys = new Set([...Object.keys(a.effects), ...Object.keys(b.effects)])
        let atLeast = true
        let strictly = false
        for (const k of keys) {
          const av = (a.effects as Record<string, number>)[k] ?? 0
          const bv = (b.effects as Record<string, number>)[k] ?? 0
          // These are costs, so a smaller number is the better outcome.
          const COSTS = ['o2Leak', 'doseAll', 'fatigueAll', 'crewHoursLost', 'co2', 'wear', 'greenhouseStall']
          const invert = COSTS.includes(k)
          const an = invert ? -av : av
          const bn = invert ? -bv : bv
          if (an < bn - 1e-9) atLeast = false
          if (an > bn + 1e-9) strictly = true
        }
        if (atLeast && strictly && (a.future?.length ?? 0) === 0 && (b.future?.length ?? 0) === 0) {
          dominated.push(`${e.id}: "${a.label}" dominates "${b.label}"`)
        }
      }
    }
  }
  check('every event choice has a mechanical effect', noEffect.length === 0,
    noEffect.length ? `${noEffect.length} inert: ${noEffect.slice(0, 6).join(', ')}` : 'all choices do something')
  check('no event choice strictly dominates another', dominated.length === 0,
    dominated.length ? dominated.slice(0, 4).join(' | ') : 'all options trade off')
}

section('power settlement sanity')
{
  const s = createInitialState(42)
  const plan = createDefaultPlan()
  for (const k of Object.keys(plan.modes) as Subsystem[]) plan.modes[k] = 3
  const settle = settleAllocation(plan, s.stocks, s.env)
  check('an all-HIGH plan browns out', settle.brownedOut.length > 0,
    `shed: ${settle.brownedOut.join(', ')}`)
  check('life support is never shed below LOW', settle.achieved.lifeSupport >= 1)
}

section('the score tiers are all reachable')
{
  // A top tier nobody can reach is decoration, and a top tier a careless run
  // stumbles into is meaningless. Both ends are checked here.
  //
  // The headless strategies cannot answer mission events — that is a UI
  // action — so a played run earns up to 140 decision points this harness
  // never sees. The ceiling is therefore measured as the simulated score plus
  // a perfect decision record, which is exactly what a strong player gets.
  const PERFECT_DECISIONS = 140

  const ace: Strategy = (s) => {
    const plan = createDefaultPlan()
    plan.modes.lifeSupport = 2
    plan.modes.thermal = 2
    plan.modes.oxygenGenerator = 2
    plan.modes.waterRecycler = 2
    plan.modes.greenhouse = 2
    plan.modes.commsScience = 3
    plan.modes.roverCharge = 0
    plan.batteryAuth = 0.5

    const assignments: Assignment[] = []
    const rack = greenhouseSummary(s.greenhouse)
    const growingBeds = rack.planted - rack.ready

    // A strong commander fills the rack in the first two sols with a portfolio
    // — the slow calorie crops for the back half, a fast crop to bridge the
    // pantry — and then sets the light high enough to carry that many beds.
    const order: CropId[] = ['potato', 'lettuce', 'wheat', 'lettuce']
    const taken = new Set<number>()
    let sown = 0
    while (sown < 2 && s.sol <= 2) {
      const free = s.greenhouse.beds.findIndex(
        (b, i) => !taken.has(i) && (!b.crop || b.health <= C.GH_WILT_HEALTH))
      if (free < 0) break
      taken.add(free)
      assignments.push(sow(2, free, order[free] ?? 'lettuce'))
      sown++
    }
    if (sown === 0) {
      if (s.greenhouse.nutrients < 0.4) assignments.push(A('mixNutrients', 2))
      else if (growingBeds > 0) assignments.push(A('tendGreenhouse', 2))
      else assignments.push(A('science', 2))
    }

    const bedsAfterSowing = growingBeds + sown
    plan.modes.greenhouse = (bedsAfterSowing >= 3 ? 3 : bedsAfterSowing >= 1 ? 2 : 1) as Mode

    const broken = s.o2Leak > 0 || s.recyclerClogged || s.arrayFault || s.thermalFault
    assignments.push(broken ? A('repair', 1) : A('inspection', 1))

    // The particle event lands on sol 5, so the shielding has to be piled
    // before it, not after.
    if (!s.shieldInstalled && s.sol <= 4) assignments.push(A('regolithShield', 0))
    else assignments.push(A('cleanArray', 0))

    // The medical officer keeps the crew's condition up, which is a third of
    // the score.
    assignments.push(A('extraRest', 3))

    if (s.env.dustStorm) {
      // The lights go to LOW rather than off: the fast crop tolerates it, and
      // two sols of darkness kills the whole rack.
      plan.modes.greenhouse = 1
      plan.modes.commsScience = 0
      plan.batteryAuth = 0.85
    } else {
      for (const sub of ['commsScience', 'greenhouse', 'oxygenGenerator'] as const) {
        let guard = 0
        while (plan.modes[sub] > 1 && guard++ < 4) {
          const st = settleAllocation(plan, s.stocks, s.env)
          if (st.requested <= st.available) break
          plan.modes[sub] = (plan.modes[sub] - 1) as Mode
        }
      }
    }
    return { plan, assignments }
  }

  let ceiling = 0
  let floorOfAce = 9999
  for (const seed of [1, 7, 23, 41, 99]) {
    const r = play(seed, ace)
    const withDecisions = r.score.total + PERFECT_DECISIONS
    ceiling = Math.max(ceiling, withDecisions)
    floorOfAce = Math.min(floorOfAce, withDecisions)
  }
  check('three stars is reachable by a strong run', ceiling >= 820,
    `best commanded run scores ${ceiling} with a perfect decision record`)
  check('three stars still has to be earned', floorOfAce < 820 || ceiling < 940,
    `a strong-but-not-flawless run lands at ${floorOfAce}`)

  // And the other end: the careless run must not back into a passing grade.
  const bad = play(3, careless)
  check('a careless run cannot reach two stars', bad.score.stars < 2,
    `careless scores ${bad.score.total} (${bad.score.stars}★)`)
}

console.log(fails === 0 ? '\nALL BALANCE CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
