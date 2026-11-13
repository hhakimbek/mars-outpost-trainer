import { BUILDABLES, TECHS } from '../src/data/research'
import type { BuildId, TechId } from '../src/data/research'
import { OBJECTIVES, settleObjectives } from '../src/data/objectives'
import {
  build, buildBlockedReason, builtCount, capBattery, capWater, hasTech,
  research, techBlockedReason, techMods,
} from '../src/sim/research'
import {
  computeSolar, createDefaultPlan, createInitialState, doseRate, resolveSol, settleAllocation,
} from '../src/sim/simulation'
import { drill, drillCost } from '../src/sim/expedition'
import { C, TASK_HOURS } from '../src/sim/constants'
import type { Assignment, MissionState } from '../src/sim/types'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

const fresh = (science = 0): MissionState => {
  const s = createInitialState(909)
  s.stocks.science = science
  return s
}

/** A state with a technology already unlocked, bypassing the science cost. */
const withTech = (...ids: TechId[]): MissionState => {
  const s = fresh()
  s.researched.push(...ids)
  return s
}

const upkeep: Assignment[] = [{ task: 'inspection', crewIndex: 1, fieldConfirmed: true }]

// ===========================================================================

console.log('\n=== the tree is coherent ===')

{
  const ids = new Set(TECHS.map((t) => t.id))
  const dangling = TECHS.flatMap((t) => t.needs.filter((n) => !ids.has(n)))
  check('every prerequisite exists', dangling.length === 0, dangling.join(', '))

  // A cycle would make a branch permanently unreachable and would not be
  // visible anywhere in the UI, so it is worth the fifteen lines.
  const order: string[] = []
  const seen = new Set<string>()
  const visit = (id: string, stack: string[]): boolean => {
    if (stack.includes(id)) return false
    if (seen.has(id)) return true
    seen.add(id)
    const t = TECHS.find((x) => x.id === id)!
    for (const n of t.needs) if (!visit(n, [...stack, id])) return false
    order.push(id)
    return true
  }
  check('the tree has no cycles', TECHS.every((t) => visit(t.id, [])))

  check('every technology explains its real programme',
    TECHS.every((t) => t.real.length > 60))
  check('every technology states what it changes',
    TECHS.every((t) => t.effect.length > 20))
  check('costs are in a sane range',
    TECHS.every((t) => t.cost >= 10 && t.cost <= 40))
}

console.log('\n=== science actually buys something ===')

{
  const s = fresh(5)
  check('a technology cannot be bought without the science',
    techBlockedReason(s, 'sabatier') !== null, techBlockedReason(s, 'sabatier') ?? '')

  const rich = fresh(100)
  const before = rich.stocks.science
  const r = research(rich, 'sabatier')
  check('and can be with it', r.ok, r.message)
  check('the science is spent', rich.stocks.science < before,
    `${before} to ${rich.stocks.science}`)
  check('it is remembered', hasTech(rich, 'sabatier'))
  check('and cannot be bought twice', !research(rich, 'sabatier').ok)
}

{
  const s = fresh(100)
  check('a gated technology stays gated',
    techBlockedReason(s, 'sintering') !== null,
    techBlockedReason(s, 'sintering') ?? '')
  research(s, 'sabatier')
  research(s, 'perchlorate')
  check('and opens once its prerequisites are met',
    techBlockedReason(s, 'sintering') === null)
}

console.log('\n=== every technology changes the simulation ===')

{
  // The whole point. A technology that does not move a number is a caption,
  // and this is the check that stops one being added as one.
  const base = techMods(fresh())
  const inert: string[] = []
  for (const t of TECHS) {
    const m = techMods(withTech(t.id))
    const same = (Object.keys(base) as (keyof typeof base)[])
      .every((k) => m[k] === base[k])
    if (same) inert.push(t.id)
  }
  check('no technology is inert', inert.length === 0, inert.join(', '))
}

{
  const plain = fresh()
  const sab = withTech('sabatier')
  check('Sabatier lifts recycler recovery',
    techMods(sab).recyclerBonus > techMods(plain).recyclerBonus)

  const o2 = withTech('moxieScale')
  check('MOXIE scale-up raises oxygen yield', techMods(o2).o2Yield > 1)

  const dust = withTech('dustShield')
  check('the dust shield halves dust loss', techMods(dust).dustLoss < 1)

  const rad = withTech('radShelter')
  check('the shelter protocol lowers dose everywhere',
    doseRate('eva', false, false, techMods(rad).doseRate)
      < doseRate('eva', false, false))

  const dr = withTech('autoDrill')
  check('autonomous drilling makes a hole cheaper',
    drillCost(dr) < drillCost(plain),
    `${drillCost(dr).toFixed(2)} vs ${drillCost(plain).toFixed(2)} kWh`)
}

{
  // End to end rather than through the modifier table: run the same sol twice
  // and check the outpost really came out ahead.
  const plan = createDefaultPlan()
  const a = resolveSol(fresh(), plan, upkeep).next
  const b = resolveSol(withTech('moxieScale'), plan, upkeep).next
  check('MOXIE scale-up shows up in the tanks', b.stocks.o2 > a.stocks.o2,
    `${a.stocks.o2.toFixed(2)} vs ${b.stocks.o2.toFixed(2)} kg`)

  const c = resolveSol(withTech('dustShield'), plan, upkeep).next
  check('the dust shield shows up on the array',
    c.stocks.cleanliness > a.stocks.cleanliness,
    `${Math.round(a.stocks.cleanliness * 100)}% vs ${Math.round(c.stocks.cleanliness * 100)}%`)

  const d = resolveSol(withTech('sabatier'), plan, upkeep).next
  check('the Sabatier loop shows up in the water',
    d.stocks.water > a.stocks.water,
    `${a.stocks.water.toFixed(1)} vs ${d.stocks.water.toFixed(1)} L`)

  const e = resolveSol(withTech('radShelter'), plan, upkeep).next
  check('the shelter protocol shows up on the dosimeters',
    e.crew[0].dose < a.crew[0].dose,
    `${a.crew[0].dose.toFixed(3)} vs ${e.crew[0].dose.toFixed(3)} mSv`)
}

console.log('\n=== construction costs energy and crew-hours, not materials ===')

{
  const s = fresh()
  check('nothing can be built before sintering',
    buildBlockedReason(s, 'arrayExtension') !== null,
    buildBlockedReason(s, 'arrayExtension') ?? '')

  const ready = withTech('sintering')
  ready.stocks.battery = 100
  check('and can be after it', buildBlockedReason(ready, 'arrayExtension') === null)

  const battery = ready.stocks.battery
  const r = build(ready, 'arrayExtension')
  check('a build succeeds', r.ok, r.message)
  check('it costs battery', ready.stocks.battery < battery,
    `${battery} to ${ready.stocks.battery} kWh`)
  check('and nothing else — the feedstock is the ground',
    ready.stocks.water === s.stocks.water && ready.stocks.food === s.stocks.food)
  check('it is recorded', builtCount(ready, 'arrayExtension') === 1)
}

{
  const s = withTech('sintering')
  s.stocks.battery = 10
  check('an empty bank cannot sinter anything',
    buildBlockedReason(s, 'arrayExtension') !== null,
    buildBlockedReason(s, 'arrayExtension') ?? '')
}

{
  const s = withTech('sintering')
  for (const b of BUILDABLES) {
    for (let i = 0; i < b.max + 2; i++) {
      s.stocks.battery = 200
      build(s, b.id)
    }
    check(`${b.name} stops at its limit`, builtCount(s, b.id) === b.max,
      `${builtCount(s, b.id)} of ${b.max}`)
  }
}

{
  const s = withTech('sintering')
  s.stocks.battery = 200
  const env = createInitialState(909).env
  const before = computeSolar(env, 1, false, techMods(s).solarBonus)
  build(s, 'arrayExtension')
  const after = computeSolar(env, 1, false, techMods(s).solarBonus)
  check('an array extension generates more', after > before,
    `${before.toFixed(1)} to ${after.toFixed(1)} kWh`)

  const capW = capWater(s)
  build(s, 'waterTank')
  check('a tank holds more water', capWater(s) > capW,
    `${capW} to ${capWater(s)} L`)

  const capB = capBattery(s)
  build(s, 'batteryBank')
  check('a bank holds more energy', capBattery(s) > capB,
    `${capB} to ${capBattery(s)} kWh`)

  const settle = settleAllocation(createDefaultPlan(), s.stocks, env, {
    solarBonus: techMods(s).solarBonus, batteryCap: capBattery(s),
  })
  check('and the settlement sees both', settle.solar > before,
    `${settle.solar.toFixed(1)} kWh generated`)
}

console.log('\n=== building takes a shift that has to be carried out ===')

{
  const s = withTech('sintering')
  s.stocks.battery = 120
  s.pendingBuild = 'arrayExtension'
  const planned = resolveSol(s, createDefaultPlan(),
    [{ task: 'build', crewIndex: 1, fieldConfirmed: false }]).next
  check('a build nobody went out and did does not happen',
    planned.built.length === 0)
  check('and the queue is still there', planned.pendingBuild === 'arrayExtension')

  const done = resolveSol(s, createDefaultPlan(),
    [{ task: 'build', crewIndex: 1, fieldConfirmed: true }]).next
  check('a build that was carried out happens', done.built.length === 1,
    done.built.join(', '))
  check('and the queue is cleared', done.pendingBuild === null)
  check('the shift is a serious block of hours', TASK_HOURS.build >= 5,
    `${TASK_HOURS.build} h`)
}

{
  const s = withTech('sintering')
  s.stocks.battery = 120
  const idle = resolveSol(s, createDefaultPlan(),
    [{ task: 'build', crewIndex: 1, fieldConfirmed: true }]).next
  check('a build shift with nothing queued wastes the hours',
    idle.built.length === 0)
}

console.log('\n=== objectives ===')

{
  const s = fresh()
  check('nothing is met at the start', s.objectivesMet.length === 0)
  check('every objective explains itself',
    OBJECTIVES.every((o) => o.why.length > 60 && o.brief.length > 15))
  check('progress is bounded',
    OBJECTIVES.every((o) => {
      const p = o.progress(s)
      return p >= 0 && p <= 1
    }))
}

{
  const s = fresh()
  s.waterDrilled = 50
  const before = s.stocks.science
  const fired = settleObjectives(s)
  check('meeting one pays science', fired.length > 0 && s.stocks.science > before,
    fired.map((o) => o.name).join(', '))

  const again = settleObjectives(s)
  check('and it only pays once', again.length === 0)
  check('it stays met', s.objectivesMet.includes('firstWater'))
}

{
  // The loop the whole feature exists for: doing the mission earns science,
  // and science is what buys the technology.
  const s = fresh()
  s.waterDrilled = 50
  s.samplesAnalysed = 7
  s.greenhouse.totalMeals = 40
  settleObjectives(s)
  check('a productive mission funds its own research',
    s.stocks.science >= Math.min(...TECHS.map((t) => t.cost)),
    `${s.stocks.science} banked, cheapest technology is ${Math.min(...TECHS.map((t) => t.cost))}`)
}

{
  const s = fresh()
  for (const m of s.crew) m.health = 90
  s.o2Leak = 0.5
  settleObjectives(s)
  check('a fault blocks the "everyone fit" objective',
    !s.objectivesMet.includes('crewIntact'))
  s.o2Leak = 0
  settleObjectives(s)
  check('and clearing it unblocks it', s.objectivesMet.includes('crewIntact'))
}

{
  // Objectives fire from the simulation, not from the user interface.
  let s = fresh()
  s.greenhouse.totalMeals = 35
  s = resolveSol(s, createDefaultPlan(), upkeep).next
  check('the sol resolution settles objectives',
    s.objectivesMet.includes('firstHarvest'))
}

console.log(fails === 0
  ? '\nALL RESEARCH CHECKS PASSED'
  : `\n${fails} RESEARCH CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
