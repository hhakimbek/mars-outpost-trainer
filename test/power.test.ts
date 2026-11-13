import {
  computeEnvironment, computeGeneration, computeReactor, computeSolar,
  createDefaultPlan, createInitialState, resolveSol, settleAllocation, taskZone,
} from '../src/sim/simulation'
import { C, TASK_HOURS } from '../src/sim/constants'
import { STRUCTURES } from '../src/data/structures'
import type { Assignment, MissionState } from '../src/sim/types'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

const SEED = 2187

const fresh = (): MissionState => createInitialState(SEED)

const startShift = (crew = 1): Assignment[] => ([
  { task: 'startReactor', crewIndex: crew, fieldConfirmed: true },
])

/** Runs the startup and then the sol after it, returning both states. */
function bringOnline(s: MissionState) {
  const after = resolveSol(s, createDefaultPlan(), startShift()).next
  return after
}

// ===========================================================================

console.log('\n=== the outpost starts on solar alone ===')

{
  const s = fresh()
  check('the fission unit begins stowed', s.reactor === 'stowed', s.reactor)
  check('and makes nothing while it is', computeReactor(s.reactor) === 0)
  const g = computeGeneration(s.env, 1, false, s.reactor)
  const solar = computeSolar(s.env, 1, false)
  check('generation is solar and nothing else', Math.abs(g - solar) < 1e-9,
    `${g.toFixed(1)} vs ${solar.toFixed(1)} kWh`)
}

console.log('\n=== starting it is a real shift with a real price ===')

{
  const s = fresh()
  const battery = s.stocks.battery
  const dose = s.crew[1].dose
  const result = resolveSol(s, createDefaultPlan(), startShift())
  const next = result.next

  // The contract: the shift is worked today and the power arrives tomorrow.
  // `next` is the state for the sol the player is about to command, so a
  // correctly delayed reactor is 'online' in it while THIS sol's settlement
  // got nothing from it.
  check('the sol the startup was worked on gets no fission power',
    result.power.reactor === 0, `${result.power.reactor} kWh`)
  check('and the sol after it does', next.reactor === 'online', next.reactor)
  check('it spends battery', next.stocks.battery < battery,
    `${battery.toFixed(1)} to ${next.stocks.battery.toFixed(1)} kWh`)
  check('the crew member who ran it took a dose',
    next.crew[1].dose > dose,
    `+${(next.crew[1].dose - dose).toFixed(2)} mSv`)
  check('nobody else did', next.crew[0].dose < next.crew[1].dose)

  const after = resolveSol(next, createDefaultPlan(), [])
  check('and it really generates on that sol', after.power.reactor === C.REACTOR_KWH,
    `${after.power.reactor} kWh`)
  check('while the array is still doing its own thing', after.power.solar > 0,
    `${after.power.solar.toFixed(1)} kWh solar`)
}

{
  // Planned but never walked out to: the shift has to fail, exactly as a
  // repair does. Otherwise field ops is optional and the whole loop is a lie.
  const s = fresh()
  const next = resolveSol(s, createDefaultPlan(),
    [{ task: 'startReactor', crewIndex: 1, fieldConfirmed: false }]).next
  check('a startup nobody carried out in the field does nothing',
    next.reactor === 'stowed', next.reactor)
}

{
  const s = fresh()
  s.stocks.battery = C.REACTOR_START_KWH - 1
  const next = resolveSol(s, createDefaultPlan(), startShift()).next
  check('a flat battery cannot start a reactor', next.reactor === 'stowed', next.reactor)
}

{
  const s = bringOnline(fresh())
  const online = resolveSol(s, createDefaultPlan(), []).next
  const again = resolveSol(online, createDefaultPlan(), startShift()).next
  check('starting it twice wastes the shift and nothing else',
    again.reactor === 'online')
}

console.log('\n=== what the fission unit is for ===')

{
  // The point of the thing, stated as a test: on the worst sol of the mission
  // the array collapses and this does not.
  const s = fresh()
  let stormSol = -1
  for (let sol = 1; sol <= 7; sol++) {
    if (computeEnvironment(sol, SEED, s.siteId).dustStorm) { stormSol = sol; break }
  }
  check('the seeded mission has a dust storm to test against', stormSol > 0, `sol ${stormSol}`)

  if (stormSol > 0) {
    const env = computeEnvironment(stormSol, SEED, s.siteId)
    const solar = computeSolar(env, 1, false)
    check('the array collapses in the storm', solar < C.ARRAY_CLEAR_KWH * 0.6,
      `${solar.toFixed(1)} of ${C.ARRAY_CLEAR_KWH} kWh`)
    check('the fission unit does not notice the storm',
      computeReactor('online') === C.REACTOR_KWH)
    check('and on that sol it is the larger source', C.REACTOR_KWH > solar,
      `fission ${C.REACTOR_KWH} vs solar ${solar.toFixed(1)} kWh`)
  }
}

{
  // It must matter, and it must not end the game. A unit that covers the
  // whole outpost turns every later power decision into a formality.
  const share = C.REACTOR_KWH / C.ARRAY_CLEAR_KWH
  check('one unit is a meaningful fraction of a clean array',
    share > 0.2 && share < 0.45, `${Math.round(share * 100)}%`)

  const plan = createDefaultPlan()
  const s = fresh()
  const nominalDraw = settleAllocation(plan, s.stocks, s.env, {}).requested
  check('and it cannot carry the outpost by itself', C.REACTOR_KWH < nominalDraw * 0.6,
    `${C.REACTOR_KWH} kWh against a ${nominalDraw.toFixed(0)} kWh plan`)
}

console.log('\n=== the settlement reports the two sources separately ===')

{
  const s = fresh()
  const plan = createDefaultPlan()
  const off = settleAllocation(plan, s.stocks, s.env, { reactor: 'stowed' })
  const on = settleAllocation(plan, s.stocks, s.env, { reactor: 'online' })

  check('solar is unchanged by the reactor', Math.abs(off.solar - on.solar) < 1e-9)
  check('the reactor line is zero when it is cold', off.reactor === 0)
  check('generation is exactly the sum of the two',
    Math.abs(on.generation - (on.solar + on.reactor)) < 1e-9)
  check('more energy is available with it running', on.available > off.available,
    `${off.available.toFixed(1)} to ${on.available.toFixed(1)} kWh`)
  check('a caller that forgets the reactor under-promises rather than over-promises',
    settleAllocation(plan, s.stocks, s.env, {}).reactor === 0)
}

{
  // Brownouts are the thing it is bought to prevent, so it has to actually
  // prevent them in a case that browns out without it.
  const s = fresh()
  s.stocks.battery = 0
  s.stocks.cleanliness = 0.45
  const plan = createDefaultPlan()
  const without = settleAllocation(plan, s.stocks, s.env, { reactor: 'stowed' })
  const withIt = settleAllocation(plan, s.stocks, s.env, { reactor: 'online' })
  check('a starved plan browns out without it', without.brownedOut.length > 0,
    without.brownedOut.join(', '))
  check('and browns out less with it',
    withIt.brownedOut.length < without.brownedOut.length,
    `${without.brownedOut.length} to ${withIt.brownedOut.length} subsystems`)
}

console.log('\n=== it can be lost ===')

{
  const s = bringOnline(fresh())
  const online = resolveSol(s, createDefaultPlan(), []).next
  check('online before the scram', online.reactor === 'online')

  // applyChoiceEffects goes through resolveSol's event path in play; here the
  // effect is exercised directly, which is what an event choice does to it.
  const scrammed = { ...online, reactor: 'scrammed' as const }
  check('a scrammed unit produces nothing', computeReactor(scrammed.reactor) === 0)

  const restart = resolveSol(scrammed, createDefaultPlan(), startShift())
  check('a restart costs the same sol of delay as the first start',
    restart.power.reactor === 0, `${restart.power.reactor} kWh`)
  check('and it can be restarted', restart.next.reactor === 'online', restart.next.reactor)
}

console.log('\n=== it is reachable, schedulable and documented ===')

{
  const def = STRUCTURES.find((d) => d.id === 'reactor')
  check('there is a structure to walk to', !!def)
  check('it carries the startup task', def?.task === 'startReactor')
  check('it is sited well away from the habitat',
    !!def && Math.hypot(def.pos[0], def.pos[2]) > 20,
    def ? `${Math.hypot(def.pos[0], def.pos[2]).toFixed(0)} m out` : '')
  check('working at it is counted as an EVA', taskZone('startReactor') === 'eva')
  check('the startup costs a serious block of hours', TASK_HOURS.startReactor >= 4,
    `${TASK_HOURS.startReactor} h`)
  check('it explains the real hardware',
    (def?.learn ?? '').includes('Kilopower') && (def?.learn ?? '').includes('KRUSTY'))
}

console.log(fails === 0
  ? '\nALL POWER CHECKS PASSED'
  : `\n${fails} POWER CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
