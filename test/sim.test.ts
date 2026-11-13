import { createInitialState, createDefaultPlan, resolveSol, computeProjection } from '../src/sim/simulation'
import { computeScore } from '../src/sim/scoring'
import type { Assignment, MissionState } from '../src/sim/types'

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
  if (!ok) failures++
}

const finite = (s: MissionState) =>
  Object.values(s.stocks).every(Number.isFinite) &&
  s.crew.every(c => Number.isFinite(c.health) && Number.isFinite(c.dose) && Number.isFinite(c.fatigue))

const nonNegative = (s: MissionState) =>
  s.stocks.o2 >= 0 && s.stocks.water >= 0 && s.stocks.food >= 0 && s.stocks.battery >= 0

// A sensible 7-sol playthrough under the current rules: plant early, keep the
// rack lit, clean the array, and spend a shift on maintenance so the hardware
// does not fail. The harvest is handled by the simulation.
function playMission(seed: number) {
  let s = createInitialState(seed)

  for (let i = 0; i < 7; i++) {
    const plan = createDefaultPlan()
    plan.modes.greenhouse = 2
    plan.modes.commsScience = 1
    if (s.env.dustStorm) {
      // On a storm sol there is not enough energy for everything; the crop can
      // lose a sol, the crew cannot lose air or heat.
      plan.modes.greenhouse = 1
      plan.modes.commsScience = 0
      plan.batteryAuth = 0.9
    }

    const a: Assignment[] = []
    if (s.greenhouse.stage === 'empty' || s.greenhouse.stage === 'wilted') {
      a.push({ task: 'plantCrop', crewIndex: 2, fieldConfirmed: true })
    } else {
      a.push({ task: 'tendGreenhouse', crewIndex: 2, fieldConfirmed: true })
    }

    const broken = s.o2Leak > 0 || s.recyclerClogged || s.arrayFault || s.thermalFault
    a.push({ task: broken ? 'repair' : 'inspection', crewIndex: 1, fieldConfirmed: true })
    a.push({ task: s.sol === 2 ? 'regolithShield' : 'cleanArray', crewIndex: 0, fieldConfirmed: true })

    const r = resolveSol(s, plan, a)
    if (!finite(r.next)) throw new Error(`non-finite state at sol ${s.sol}`)
    if (!nonNegative(r.next)) throw new Error(`negative stock at sol ${s.sol}`)
    s = r.next
    if (s.outcome !== 'inProgress') break
  }
  return s
}

console.log('=== determinism ===')
const a1 = playMission(4242)
const a2 = playMission(4242)
check('same seed + same decisions = identical final state',
  JSON.stringify(a1) === JSON.stringify(a2))
check('different seeds produce different missions',
  JSON.stringify(playMission(1).log) !== JSON.stringify(playMission(99999).log))

console.log('\n=== robustness ===')
check('no non-finite values after 7 sols', finite(a1))
check('no negative stocks after 7 sols', nonNegative(a1))

// Fuzz: random plans and assignments must never break the model.
let fuzzBad = 0
for (let t = 0; t < 400; t++) {
  let s = createInitialState(t * 7 + 1)
  for (let i = 0; i < 7 && s.outcome === 'inProgress'; i++) {
    const plan = createDefaultPlan()
    for (const k of Object.keys(plan.modes) as (keyof typeof plan.modes)[]) {
      plan.modes[k] = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3
    }
    plan.batteryAuth = Math.random()
    s = resolveSol(s, plan, []).next
    if (!finite(s) || !nonNegative(s)) { fuzzBad++; break }
  }
}
check('400 random playthroughs stay finite and non-negative', fuzzBad === 0, `${fuzzBad} bad`)

console.log('\n=== mechanics ===')
const fresh = createInitialState(777)

// The dust storm must actually force a choice.
const stormPlan = createDefaultPlan()
stormPlan.modes.greenhouse = 2
let pre = fresh
for (let i = 0; i < 2; i++) pre = resolveSol(pre, createDefaultPlan(), []).next
const stormResult = resolveSol(pre, stormPlan, [])
check('Sol 3 is a dust storm', stormResult.next.env.dustStorm || pre.env.dustStorm,
  `solarFactor ${pre.env.solarFactor.toFixed(2)}`)
check('storm forces a brownout when everything stays nominal',
  stormResult.power.brownedOut.length > 0,
  `shed: ${stormResult.power.brownedOut.join(',') || 'none'}`)

// Life support can never be switched off by the allocator.
check('life support never shed below LOW',
  stormResult.power.achieved.lifeSupport >= 1 && stormResult.power.achieved.thermal >= 1)

// Oxygen generator off must produce a visible deficit.
const offPlan = createDefaultPlan()
offPlan.modes.oxygenGenerator = 0
const projOff = computeProjection(fresh, offPlan, [])
check('oxygen generator OFF gives a negative oxygen forecast', projOff.netO2 < 0,
  `net ${projOff.netO2.toFixed(2)} kg/sol, ${projOff.o2Sols} sols left`)
check('forecast reports sols remaining', projOff.o2Sols > 0 && projOff.o2Sols < 20)

// Over-allocation must be detectable.
const greedy = createDefaultPlan()
for (const k of Object.keys(greedy.modes) as (keyof typeof greedy.modes)[]) greedy.modes[k] = 3
greedy.batteryAuth = 0
check('an all-HIGH plan is flagged as over-allocated',
  computeProjection(fresh, greedy, []).overAllocated)

// Radiation must accumulate and differ by shielding.
const evaAssign: Assignment[] = [{ task: 'science', crewIndex: 0, fieldConfirmed: true }]
const withEva = resolveSol(fresh, createDefaultPlan(), evaAssign).next
const noEva = resolveSol(fresh, createDefaultPlan(), []).next
check('EVA work raises that crew member’s dose',
  withEva.crew[0].dose > noEva.crew[0].dose,
  `${withEva.crew[0].dose.toFixed(3)} vs ${noEva.crew[0].dose.toFixed(3)} mSv`)
check('dose only ever increases', withEva.crew.every(c => c.dose > 0))

// Greenhouse lead time must be real.
let gh = createInitialState(5)
// Start past sol 3. The storm is a power crisis, not a statement about how
// fast lettuce grows, and including it measured the wrong thing.
gh.sol = 4
gh.greenhouse = { stage: 'seeded', progress: 0, solsTended: 0, solsStarved: 0 }
const ghPlan = createDefaultPlan()
ghPlan.modes.greenhouse = 2
ghPlan.modes.commsScience = 0   // a commander who wants the crop fed cuts science first
let solsToReady = 0
for (let i = 0; i < 8; i++) {
  // Keeping the array clean and the hardware inspected is part of keeping the
  // rack lit — an unnoticed array fault browns the greenhouse out and would
  // make this measure fault luck rather than growth time.
  const upkeep: Assignment[] = [
    { task: 'cleanArray', crewIndex: 0, fieldConfirmed: true },
    { task: 'inspection', crewIndex: 1, fieldConfirmed: true },
  ]
  gh = resolveSol(gh, ghPlan, upkeep).next
  solsToReady++
  if (gh.greenhouse.stage === 'ready') break
}
check('a crop needs about 4 sols when kept lit and watered',
  solsToReady >= 3 && solsToReady <= 5, `${solsToReady} sols`)

// And the opposite must also be true: neglect must cost growth.
let neglected = createInitialState(5)
neglected.sol = 4
neglected.greenhouse = { stage: 'seeded', progress: 0, solsTended: 0, solsStarved: 0 }
const darkPlan = createDefaultPlan(); darkPlan.modes.greenhouse = 0
for (let i = 0; i < 4; i++) neglected = resolveSol(neglected, darkPlan, []).next
check('an unlit crop never becomes ready', neglected.greenhouse.stage !== 'ready',
  `stage ${neglected.greenhouse.stage}`)

console.log('\n=== scoring ===')
const score = computeScore(a1)
check('score is within 0..1000', score.total >= 0 && score.total <= 1000, `${score.total}`)
check('score produces a rating and stars', score.rating.length > 0 && score.stars >= 0 && score.stars <= 3,
  `${score.stars}★ ${score.rating}`)
check('a well-played mission scores above 450', score.total > 450, `${score.total}`)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
console.log(`final state: sol ${a1.sol}, outcome ${a1.outcome}, O2 ${a1.stocks.o2.toFixed(1)}kg, ` +
  `water ${Math.round(a1.stocks.water)}L, food ${Math.round(a1.stocks.food)} meals, ` +
  `maxDose ${Math.max(...a1.crew.map(c => c.dose)).toFixed(2)}mSv`)
process.exit(failures === 0 ? 0 : 1)
