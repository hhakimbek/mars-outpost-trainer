import {
  createDefaultPlan, createInitialState, resolveSol, computeProjection,
} from '../src/sim/simulation'
import {
  advanceRack, bedStage, bedYield, createGreenhouse, greenhouseSummary,
  harvestBed, plantBed, rackForecast,
} from '../src/sim/greenhouse'
import { C } from '../src/sim/constants'
import { BED_COUNT, CROPS, CROP_LIST } from '../src/data/crops'
import type { CropId } from '../src/data/crops'
import type { Assignment, Mode } from '../src/sim/types'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

/** A mission parked past the storm, so growth is measured and not storm luck. */
const fresh = (crop: CropId | null = null, bed = 0) => {
  const s = createInitialState(777)
  s.sol = 4
  if (crop) plantBed(s.greenhouse, bed, crop, s.sol)
  return s
}

const upkeep: Assignment[] = [
  { task: 'cleanArray', crewIndex: 0, fieldConfirmed: true },
  { task: 'inspection', crewIndex: 1, fieldConfirmed: true },
]

const planAt = (mode: Mode) => {
  const p = createDefaultPlan()
  p.modes.greenhouse = mode
  p.modes.commsScience = 0
  return p
}

/** Runs sols until the given bed is harvested, returning how many it took. */
function solsToHarvest(crop: CropId, mode: Mode = 2, maxSols = 14): number {
  let s = fresh(crop)
  for (let i = 1; i <= maxSols; i++) {
    s = resolveSol(s, planAt(mode), upkeep).next
    if (s.harvests > 0) return i
  }
  return -1
}

console.log('=== the crop table is coherent ===')

check('there are four crops and four beds',
  CROP_LIST.length === 4 && BED_COUNT === 4)
check('every crop id matches its key',
  CROP_LIST.every((c) => CROPS[c.id] === c))
// Growth time is compressed, but the ordering has to survive the compression
// or the crops are interchangeable.
check('the compressed growth order matches the real-world order',
  CROPS.lettuce.growSols < CROPS.wheat.growSols &&
  CROPS.wheat.growSols <= CROPS.potato.growSols &&
  CROPS.lettuce.realDays < CROPS.wheat.realDays &&
  CROPS.wheat.realDays < CROPS.potato.realDays,
  `lettuce ${CROPS.lettuce.growSols}, wheat ${CROPS.wheat.growSols}, potato ${CROPS.potato.growSols} sols`)
check('the slow crops are the calorie crops',
  CROPS.potato.meals > CROPS.lettuce.meals,
  `${CROPS.potato.meals} vs ${CROPS.lettuce.meals} meals`)
// No crop may be the right answer every time.
const dominated: string[] = []
for (const a of CROP_LIST) {
  for (const b of CROP_LIST) {
    if (a.id === b.id) continue
    if (a.growSols <= b.growSols && a.meals >= b.meals &&
        a.waterPerSol <= b.waterPerSol && a.nutrientPerSol <= b.nutrientPerSol &&
        a.minLight <= b.minLight && a.morale >= b.morale) {
      dominated.push(`${b.name} < ${a.name}`)
    }
  }
}
check('no crop dominates another', dominated.length === 0, dominated.join(', '))

console.log('\n=== growth happens, and takes about as long as advertised ===')

const lettuceSols = solsToHarvest('lettuce')
check('lettuce harvests close to its stated growth time',
  lettuceSols > 0 && Math.abs(lettuceSols - CROPS.lettuce.growSols) <= 2,
  `${lettuceSols} sols vs a stated ${CROPS.lettuce.growSols}`)

const potatoSols = solsToHarvest('potato')
check('a potato takes longer than lettuce', potatoSols > lettuceSols,
  `potato ${potatoSols} sols, lettuce ${lettuceSols}`)

console.log('\n=== light is a hard gate, not a multiplier ===')

for (const crop of CROP_LIST.filter((c) => c.minLight > 1)) {
  let s = fresh(crop.id)
  for (let i = 0; i < 3; i++) s = resolveSol(s, planAt(1), upkeep).next
  check(`${crop.name} does not grow below its minimum light`,
    s.greenhouse.beds[0].progress === 0,
    `progress ${s.greenhouse.beds[0].progress.toFixed(3)} at LOW`)
}
{
  let s = fresh('lettuce')
  for (let i = 0; i < 3; i++) s = resolveSol(s, planAt(1), upkeep).next
  check('lettuce tolerates LOW light', s.greenhouse.beds[0].progress > 0,
    `progress ${s.greenhouse.beds[0].progress.toFixed(2)}`)
}
{
  let s = fresh('lettuce')
  for (let i = 0; i < 3; i++) s = resolveSol(s, planAt(0), upkeep).next
  check('nothing grows with the lights off',
    s.greenhouse.beds[0].progress === 0 && s.greenhouse.beds[0].health < 100,
    `health ${s.greenhouse.beds[0].health.toFixed(0)}`)
}

console.log('\n=== the environment reaches the crops ===')

// CO2: the rack is enriched from the outside air, so a brighter setting is
// worth more than its light alone.
{
  const gh = createGreenhouse()
  plantBed(gh, 0, 'lettuce', 1)
  const s = fresh()
  s.greenhouse = gh
  const low = { ...s, greenhouse: structuredClone(gh) }
  const high = { ...s, greenhouse: structuredClone(gh) }
  advanceRack(low, { mode: 2, recyclerMode: 2, tendedBeds: [], nutrientsAdded: 0, sownThisSol: [] },
    [], { o2: 0, water: 0, food: 0, battery: 0, cleanliness: 0, science: 0 })
  advanceRack(high, { mode: 3, recyclerMode: 2, tendedBeds: [], nutrientsAdded: 0, sownThisSol: [] },
    [], { o2: 0, water: 0, food: 0, battery: 0, cleanliness: 0, science: 0 })
  check('CO2 enrichment rises with the greenhouse mode',
    high.greenhouse.co2ppm > low.greenhouse.co2ppm,
    `${low.greenhouse.co2ppm} vs ${high.greenhouse.co2ppm} ppm`)
}

// Temperature: a cool rack must favour the cool-loving crop and a hot rack the
// hot-loving one, or the per-crop ideal temperature is decoration.
{
  const grow = (crop: CropId, mode: Mode) => {
    let s = fresh(crop)
    for (let i = 0; i < 2; i++) s = resolveSol(s, planAt(mode), upkeep).next
    return s.greenhouse.beds[0].progress / CROPS[crop].growSols
  }
  const potatoCool = grow('potato', 2)
  const potatoHot = grow('potato', 3)
  const tomatoCool = grow('tomato', 2)
  const tomatoHot = grow('tomato', 3)
  // Both gain from the brighter setting; the question is which gains more.
  check('the warm-loving crop benefits more from a hot rack than the cool-loving one',
    tomatoHot / tomatoCool > potatoHot / potatoCool,
    `tomato x${(tomatoHot / tomatoCool).toFixed(2)} vs potato x${(potatoHot / potatoCool).toFixed(2)}`)
}

// Nutrients: an empty reservoir must visibly slow growth.
{
  let fed = fresh('lettuce')
  let starved = fresh('lettuce')
  starved.greenhouse.nutrients = 0
  fed = resolveSol(fed, planAt(2), upkeep).next
  starved = resolveSol(starved, planAt(2), upkeep).next
  check('an empty nutrient reservoir slows growth',
    starved.greenhouse.beds[0].progress < fed.greenhouse.beds[0].progress * 0.6,
    `${starved.greenhouse.beds[0].progress.toFixed(3)} vs ${fed.greenhouse.beds[0].progress.toFixed(3)}`)
  check('an empty nutrient reservoir costs crop condition',
    starved.greenhouse.beds[0].health < 100,
    `health ${starved.greenhouse.beds[0].health.toFixed(0)}`)
}

// A mixing shift must actually solve it.
{
  let s = fresh('lettuce')
  s.greenhouse.nutrients = 0.05
  s = resolveSol(s, planAt(2), [...upkeep,
    { task: 'mixNutrients', crewIndex: 2, fieldConfirmed: true }]).next
  check('a nutrient-mixing shift refills the reservoir', s.greenhouse.nutrients > 0.8,
    `${Math.round(s.greenhouse.nutrients * 100)}%`)
}

console.log('\n=== humidity decides how many beds the rack can carry ===')

// The slow crop on purpose: with lettuce the beds harvest after three sols and
// stop transpiring, so the measurement would be of an emptying rack rather
// than of a full one.
const humidityAfter = (beds: number, mode: Mode, sols = 4) => {
  let s = fresh()
  for (let i = 0; i < beds; i++) plantBed(s.greenhouse, i, 'potato', s.sol)
  for (let i = 0; i < sols; i++) s = resolveSol(s, planAt(mode), upkeep).next
  return s.greenhouse.humidity
}
// One bed of a crop that tolerates LOW is the cheap, safe play.
const oneBedLow = (() => {
  let s = fresh('lettuce')
  for (let i = 0; i < 3; i++) s = resolveSol(s, planAt(1), upkeep).next
  return s.greenhouse.humidity
})()
check('one bed is comfortable on LOW light', oneBedLow < C.GH_HUMIDITY_HIGH,
  `${Math.round(oneBedLow * 100)}%`)
check('a full rack goes mouldy at NOMINAL', humidityAfter(4, 2) >= C.GH_HUMIDITY_HIGH,
  `${Math.round(humidityAfter(4, 2) * 100)}%`)
check('a full rack is manageable at HIGH', humidityAfter(4, 3) < C.GH_HUMIDITY_HIGH,
  `${Math.round(humidityAfter(4, 3) * 100)}%`)

// The spiral this model used to have: once humid, crops lost condition, which
// slowed growth, which kept them transpiring. HIGH has to be able to recover.
{
  let s = fresh()
  for (let i = 0; i < 4; i++) plantBed(s.greenhouse, i, 'potato', s.sol)
  s.greenhouse.humidity = 1
  const before = s.greenhouse.humidity
  s = resolveSol(s, planAt(3), upkeep).next
  check('HIGH light digs a soaked rack back out', s.greenhouse.humidity < before - 0.2,
    `${Math.round(before * 100)}% to ${Math.round(s.greenhouse.humidity * 100)}%`)
}

console.log('\n=== condition, yield and death ===')

{
  const healthy = { crop: 'lettuce' as CropId, progress: 1, health: 100, solsTended: 0, solsStarved: 0, plantedSol: 1 }
  const sick = { ...healthy, health: 10 }
  check('a healthy bed yields more than a sick one', bedYield(healthy) > bedYield(sick),
    `${bedYield(healthy).toFixed(1)} vs ${bedYield(sick).toFixed(1)} meals`)
  check('even a sick bed yields something', bedYield(sick) > 0,
    `${bedYield(sick).toFixed(1)} meals`)
  check('tending raises the yield',
    bedYield({ ...healthy, solsTended: 3 }) > bedYield(healthy))
}

{
  // Sustained darkness has to kill a bed, and a dead bed has to need replanting.
  let s = fresh('tomato')
  for (let i = 0; i < 6; i++) s = resolveSol(s, planAt(0), upkeep).next
  const stage = bedStage(s.greenhouse.beds[0])
  check('a neglected bed eventually dies', stage === 'wilted', `stage ${stage}`)
  check('a dead bed can be replanted', plantBed(s.greenhouse, 0, 'lettuce', s.sol))
  check('a living bed cannot be overplanted',
    !plantBed(s.greenhouse, 0, 'wheat', s.sol))
}

{
  const gh = createGreenhouse()
  plantBed(gh, 1, 'wheat', 1)
  gh.beds[1].progress = 1
  const meals = harvestBed(gh, 1)
  check('harvesting a ripe bed returns meals and clears it',
    meals > 0 && bedStage(gh.beds[1]) === 'empty', `${meals.toFixed(0)} meals`)
  check('harvesting is counted for the debrief', gh.totalMeals === meals)
  check('harvesting an empty bed returns nothing', harvestBed(gh, 1) === 0)
}

console.log('\n=== the forecast tells the truth ===')

// This is the check that matters most: the planning screen's numbers come from
// `rackForecast`, and the sol is resolved by `advanceRack`. If they disagree
// the game lies to the player at the exact moment they are deciding.
{
  let mismatch: string[] = []
  for (const mode of [1, 2, 3] as Mode[]) {
    for (const crop of CROP_LIST) {
      const s = fresh(crop.id)
      const predicted = rackForecast(s.greenhouse, mode)
      const before = s.stocks.water
      const r = resolveSol(s, planAt(mode), upkeep)
      // Isolate the rack's share of the water delta from the crew's and the
      // thermal loop's by re-running with an empty rack.
      const bare = fresh()
      const bareR = resolveSol(bare, planAt(mode), upkeep)
      const rackShare = (r.next.stocks.water - before) -
        (bareR.next.stocks.water - bare.stocks.water)
      if (mode >= crop.minLight && Math.abs(rackShare - predicted.netWater) > 0.51) {
        mismatch.push(
          `${crop.id}@${mode}: forecast ${predicted.netWater.toFixed(1)} L, actual ${rackShare.toFixed(1)} L`)
      }
      if (predicted.willStall !== (mode < crop.minLight)) {
        mismatch.push(`${crop.id}@${mode}: stall flag wrong`)
      }
    }
  }
  check('the rack forecast matches what the sol actually does',
    mismatch.length === 0, mismatch.slice(0, 3).join(' · '))
}

{
  // And the whole-mission forecast must see incoming meals.
  const s = fresh('lettuce')
  s.greenhouse.beds[0].progress = 1
  const proj = computeProjection(s, planAt(2), [])
  check('the forecast counts a ripe bed as food coming in',
    proj.netFood > -C.MEALS_PER_CREW * s.crew.length,
    `net food ${proj.netFood.toFixed(0)} meals/sol`)
}

console.log('\n=== the summary the UI reads ===')

{
  const gh = createGreenhouse()
  check('an empty rack reads as empty', greenhouseSummary(gh).stage === 'empty')
  plantBed(gh, 0, 'lettuce', 1)
  plantBed(gh, 1, 'potato', 1)
  gh.beds[0].progress = 1
  const sum = greenhouseSummary(gh)
  check('the summary reports the most advanced bed', sum.stage === 'ready', sum.stage)
  check('the summary counts planted and ready beds',
    sum.planted === 2 && sum.ready === 1, `${sum.planted} planted, ${sum.ready} ready`)
  check('the summary only charges water for beds still growing',
    Math.abs(sum.waterDraw - CROPS.potato.waterPerSol) < 1e-9,
    `${sum.waterDraw} L/sol`)
}

console.log('\n=== fresh food is a countermeasure, not just calories ===')

{
  // The tomato's reason to exist: fewer meals than wheat, but it does
  // something for the crew that bulk calories do not.
  let s = fresh('tomato')
  s.greenhouse.beds[0].progress = 1
  for (const m of s.crew) m.health = 70
  const before = s.crew[0].health
  s = resolveSol(s, planAt(2), upkeep).next
  check('harvesting a tomato bed lifts crew condition', s.crew[0].health > before,
    `${before} to ${Math.round(s.crew[0].health)}`)

  let w = fresh('wheat')
  w.greenhouse.beds[0].progress = 1
  for (const m of w.crew) m.health = 70
  w = resolveSol(w, planAt(2), upkeep).next
  check('wheat delivers more meals but no morale',
    CROPS.wheat.meals > CROPS.tomato.meals && CROPS.wheat.morale === 0,
    `wheat ${CROPS.wheat.meals} meals / ${CROPS.wheat.morale} morale, ` +
    `tomato ${CROPS.tomato.meals} / ${CROPS.tomato.morale}`)
}

console.log('\n=== four crew ===')

{
  const s = createInitialState(5)
  check('the crew is four', s.crew.length === 4 && C.CREW_COUNT === 4, `${s.crew.length}`)
  check('the roles are all distinct',
    new Set(s.crew.map((m) => m.role)).size === 4,
    s.crew.map((m) => m.role).join(', '))
  check('there is a medical officer', s.crew.some((m) => m.role === 'medic'))
  check('four crew get 24 assignable hours',
    (C.CREW_HOURS_EACH - C.CREW_HOURS_MANDATORY) * 4 === 24)
  // The pantry must not survive the mission, or the rack is optional.
  const solsOfFood = C.START_FOOD / (C.MEALS_PER_CREW * C.CREW_COUNT)
  check('the pantry runs out before the mission ends', solsOfFood < C.TOTAL_SOLS,
    `${solsOfFood.toFixed(1)} sols of food for a ${C.TOTAL_SOLS}-sol mission`)
  // ...but not so early that the fastest crop cannot bridge the gap.
  check('the fastest crop can land before the pantry empties',
    CROPS.lettuce.growSols < solsOfFood,
    `lettuce ${CROPS.lettuce.growSols} sols vs ${solsOfFood.toFixed(1)} sols of food`)
  // And the oxygen plant must be able to feed four people at NOMINAL.
  const o2AtNominal = 13 / C.O2_KWH_PER_KG
  check('the oxygen plant at NOMINAL covers four crew',
    o2AtNominal >= C.O2_PER_CREW * C.CREW_COUNT - 0.05,
    `${o2AtNominal.toFixed(2)} kg/sol made vs ${(C.O2_PER_CREW * C.CREW_COUNT).toFixed(2)} needed`)
}

console.log(fails === 0 ? '\nALL CROP CHECKS PASSED' : `\n${fails} CROP CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
