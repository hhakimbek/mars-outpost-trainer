import {
  CEILING, DOORS, FLOOR_AREA_M2, ROOMS, SHELL, SPAWN, STATIONS, WALLS,
  BODY_R, WALL_T, resolveWalls, roomAt, roomById, stationById,
} from '../src/data/habitat'
import {
  HABITAT_OPS, opBlockedReason, opUsed, runHabitatOp, type HabitatOpId,
} from '../src/sim/habitatOps'
import { createDefaultPlan, createInitialState, resolveSol } from '../src/sim/simulation'
import { C } from '../src/sim/constants'
import type { Assignment, MissionState } from '../src/sim/types'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

const fresh = (): MissionState => {
  const s = createInitialState(404)
  s.sol = 3
  return s
}

const upkeep: Assignment[] = [
  { task: 'cleanArray', crewIndex: 0, fieldConfirmed: true },
]

// ===========================================================================

console.log('\n=== the deck plan is a plan, not a drawing ===')

{
  // No two rooms may overlap. A plan that overlaps is a plan where `roomAt`
  // returns whichever room happens to be first in the list, which is how a
  // HUD ends up naming the wrong room.
  const overlaps: string[] = []
  for (let i = 0; i < ROOMS.length; i++) {
    for (let j = i + 1; j < ROOMS.length; j++) {
      const a = ROOMS[i].rect
      const b = ROOMS[j].rect
      const over = a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6
        && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6
      if (over) overlaps.push(`${ROOMS[i].id}/${ROOMS[j].id}`)
    }
  }
  check('no two rooms overlap', overlaps.length === 0, overlaps.join(', '))
}

{
  const outside = ROOMS.filter((r) =>
    r.rect[0] < SHELL[0] - 1e-6 || r.rect[1] < SHELL[1] - 1e-6 ||
    r.rect[2] > SHELL[2] + 1e-6 || r.rect[3] > SHELL[3] + 1e-6)
  check('every room is inside the pressure shell', outside.length === 0,
    outside.map((r) => r.id).join(', '))
}

{
  // Mars Dune Alpha is 1,700 sq ft — about 158 m². The plan should land in
  // that class, or the floor area quoted to the player is fiction.
  const ok = FLOOR_AREA_M2 > 130 && FLOOR_AREA_M2 < 200
  check('floor area is in the Mars Dune Alpha class', ok, `${FLOOR_AREA_M2.toFixed(1)} m²`)
}

{
  const quarters = ROOMS.filter((r) => r.crewIndex !== undefined)
  const indices = quarters.map((r) => r.crewIndex).sort()
  check('there is one private quarter per crew member',
    quarters.length === C.CREW_COUNT && indices.join() === [0, 1, 2, 3].join(),
    `${quarters.length} quarters for ${C.CREW_COUNT} crew`)

  const tooSmall = quarters.filter((r) =>
    (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) < 6)
  check('a bunk room is at least 6 m²', tooSmall.length === 0)
}

{
  const missing = ROOMS.filter((r) => !r.learn || r.learn.length < 80)
  check('every room carries a learning card', missing.length === 0,
    missing.map((r) => r.id).join(', '))
}

console.log('\n=== doors actually open onto something ===')

{
  // Every door must have a room on both sides of it, measured a clear
  // body-width away so the test is checking the gap you can walk through
  // rather than the mathematical line.
  const step = BODY_R + WALL_T
  const orphans: string[] = []
  for (const d of DOORS) {
    const a = d.axis === 'x'
      ? roomAt(d.centre, d.at - step) : roomAt(d.at - step, d.centre)
    const b = d.axis === 'x'
      ? roomAt(d.centre, d.at + step) : roomAt(d.at + step, d.centre)
    // An external hatch has vacuum on one side; one room is enough.
    const ok = d.external ? !!(a || b) : !!(a && b)
    if (!ok) orphans.push(`${d.axis}@${d.at} centre ${d.centre}`)
  }
  check('every door connects two rooms (or one and the outside)',
    orphans.length === 0, orphans.join(' | '))
}

{
  const external = DOORS.filter((d) => d.external)
  check('there are two ways out of the habitat', external.length === 2,
    `${external.length} external hatches`)
}

console.log('\n=== you can walk to every room ===')

{
  /**
   * A flood fill over the walkable floor, using the same `resolveWalls` the
   * game moves the player with. If a room cannot be reached from the airlock
   * spawn, its door is in the wrong place — and this catches it without ever
   * opening a browser.
   */
  const CELL = 0.16
  const [x0, z0, x1, z1] = SHELL
  const cols = Math.ceil((x1 - x0) / CELL)
  const rows = Math.ceil((z1 - z0) / CELL)
  const key = (c: number, r: number) => r * cols + c
  const seen = new Set<number>()

  const free = (c: number, r: number) => {
    const x = x0 + (c + 0.5) * CELL
    const z = z0 + (r + 0.5) * CELL
    if (!roomAt(x, z)) return null
    const [rx, rz] = resolveWalls(x, z)
    // A cell counts as standable only if the collision solver leaves it alone.
    return Math.hypot(rx - x, rz - z) < 1e-6 ? [x, z] as [number, number] : null
  }

  const startC = Math.floor((SPAWN[0] - x0) / CELL)
  const startR = Math.floor((SPAWN[1] - z0) / CELL)
  const stack = [[startC, startR]]
  seen.add(key(startC, startR))
  const reached = new Set<string>()

  while (stack.length) {
    const [c, r] = stack.pop()!
    const here = free(c, r)
    if (!here) continue
    reached.add(roomAt(here[0], here[1])!.id)
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const k = key(nc, nr)
      if (seen.has(k)) continue
      seen.add(k)
      if (free(nc, nr)) stack.push([nc, nr])
    }
  }

  const unreachable = ROOMS.filter((r) => !reached.has(r.id)).map((r) => r.id)
  check('every room is reachable on foot from the airlock',
    unreachable.length === 0, unreachable.join(', '))
}

{
  // The spawn point has to be standable, or a player arrives inside a wall
  // and is shoved somewhere arbitrary on the first frame.
  const [sx, sz] = resolveWalls(SPAWN[0], SPAWN[1])
  check('the airlock spawn is clear of every wall',
    Math.hypot(sx - SPAWN[0], sz - SPAWN[1]) < 1e-6,
    `moved ${Math.hypot(sx - SPAWN[0], sz - SPAWN[1]).toFixed(3)} m`)
  check('the spawn is in the airlock', roomAt(SPAWN[0], SPAWN[1])?.id === 'airlock')
}

{
  // Walking hard into a wall must stop you, not let you through it. The walk
  // is stepped, exactly as the controller moves the player: handing the
  // solver a point that is already outside is not a case that can occur, and
  // asking it about one proves nothing.
  let x = 0
  let z = 0
  for (let i = 0; i < 400; i++) {
    x += 0.08
    ;[x, z] = resolveWalls(x, z)
  }
  check('the shell cannot be walked through', x < SHELL[2],
    `walked east for 32 m, ended at x=${x.toFixed(2)}`)
}

console.log('\n=== stations are where they say they are ===')

{
  const misplaced = STATIONS.filter((st) => roomAt(st.pos[0], st.pos[1])?.id !== st.room)
  check('every station sits in the room it claims', misplaced.length === 0,
    misplaced.map((s) => s.id).join(', '))

  const walled = STATIONS.filter((st) => {
    const [x, z] = resolveWalls(st.pos[0], st.pos[1])
    return Math.hypot(x - st.pos[0], z - st.pos[1]) > 1e-6
  })
  check('no station is standing inside a wall', walled.length === 0,
    walled.map((s) => s.id).join(', '))
}

{
  // The point of the interior: three scheduled tasks had nowhere on the map
  // to happen before it existed. If that regresses, planning can schedule
  // work the field cannot carry out.
  const homed = new Set(STATIONS.filter((s) => s.kind === 'task').map((s) => s.task))
  for (const t of ['science', 'inspection', 'extraRest'] as const) {
    check(`'${t}' has a place to happen`, homed.has(t))
  }
}

{
  const bunks = STATIONS.filter((s) => s.id.startsWith('bunk'))
  check('there is one bunk station per crew member', bunks.length === C.CREW_COUNT)
  check('each bunk belongs to exactly one crew member',
    new Set(bunks.map((b) => b.crewIndex)).size === C.CREW_COUNT)
}

{
  const ops = STATIONS.filter((s) => s.kind === 'action').map((s) => s.op)
  const known = Object.keys(HABITAT_OPS)
  const unknown = ops.filter((o) => !known.includes(o as string))
  check('every action station names a real operation', unknown.length === 0,
    unknown.join(', '))
  check('every operation has a station', known.every((k) => ops.includes(k)),
    `${ops.length} stations for ${known.length} operations`)
}

console.log('\n=== habitat operations cost what they claim ===')

{
  const s = fresh()
  // A crew already at 100 cannot benefit from anything, so the check has to
  // start from a crew that has been working.
  for (const m of s.crew) m.health = 72
  const before = { ...s.stocks }
  const health = s.crew.map((m) => m.health)
  const r = runHabitatOp(s, 'sharedMeal', 0)
  check('a shared meal succeeds when there is food', r.ok, r.message)
  check('it costs food', s.stocks.food === before.food - C.MEAL_FOOD,
    `${before.food} to ${s.stocks.food}`)
  check('it costs water', s.stocks.water === before.water - C.MEAL_WATER)
  check('every crew member benefits',
    s.crew.every((m, i) => m.health > health[i]))
  check('and it cannot be run twice in one sol', opUsed(s, 'sharedMeal'))

  const again = runHabitatOp(s, 'sharedMeal', 0)
  check('the second attempt is refused and costs nothing',
    !again.ok && s.stocks.food === before.food - C.MEAL_FOOD, again.message)
}

{
  const s = fresh()
  s.stocks.food = 1
  check('a shared meal is refused when the pantry is nearly empty',
    opBlockedReason(s, 'sharedMeal') !== null, opBlockedReason(s, 'sharedMeal') ?? '')
}

{
  const s = fresh()
  for (const m of s.crew) m.health = 80
  s.crew[2].health = 40
  const water = s.stocks.water
  // The medic is crew index 3 in the standard roster.
  const medicIdx = s.crew.findIndex((m) => m.role === 'medic')
  runHabitatOp(s, 'treatCrew', medicIdx)
  check('treatment finds the crew member in the worst condition',
    s.crew[2].health > 40 && s.crew[0].health === 80,
    `worst went to ${Math.round(s.crew[2].health)}`)
  check('treatment costs water', s.stocks.water === water - C.TREAT_WATER)

  const other = fresh()
  for (const m of other.crew) m.health = 80
  other.crew[2].health = 40
  const nonMedic = other.crew.findIndex((m) => m.role !== 'medic')
  runHabitatOp(other, 'treatCrew', nonMedic)
  check('the medic treats better than anyone else',
    s.crew[2].health > other.crew[2].health,
    `${Math.round(s.crew[2].health)} vs ${Math.round(other.crew[2].health)}`)
}

{
  const s = fresh()
  for (const m of s.crew) m.health = 95
  check('treatment is refused when nobody needs it',
    opBlockedReason(s, 'treatCrew') !== null)
}

{
  const s = fresh()
  s.stocks.cleanliness = 0.4
  const water = s.stocks.water
  runHabitatOp(s, 'hygieneCycle', 0)
  check('a hygiene cycle raises cleanliness',
    s.stocks.cleanliness > 0.4, s.stocks.cleanliness.toFixed(2))
  check('and it costs water', s.stocks.water === water - C.HYGIENE_WATER)
}

{
  // The limit has to be part of the mission, not of the user interface: a new
  // sol clears it, and nothing else does.
  let s = fresh()
  s.stocks.cleanliness = 0.5
  runHabitatOp(s, 'sharedMeal', 0)
  runHabitatOp(s, 'hygieneCycle', 0)
  check('two operations are recorded', s.habitatOpsUsed.length === 2)
  s = resolveSol(s, createDefaultPlan(), upkeep).next
  check('a new sol clears the record', s.habitatOpsUsed.length === 0)
}

{
  // No operation may be free. If one of them ever stops costing stock it
  // becomes an unlimited source of crew condition, which is the single way
  // this whole feature could break the balance of the mission.
  const free: string[] = []
  for (const id of Object.keys(HABITAT_OPS) as HabitatOpId[]) {
    const s = fresh()
    for (const m of s.crew) m.health = 60
    s.stocks.cleanliness = 0.5
    const before = s.stocks.water + s.stocks.food * 3
    runHabitatOp(s, id, 0)
    const after = s.stocks.water + s.stocks.food * 3
    if (after >= before) free.push(id)
  }
  check('no habitat operation is free', free.length === 0, free.join(', '))
}

console.log('\n=== the shape of the place ===')

{
  check('the ceiling is high enough to stand under', CEILING > 2.2 && CEILING < 3.0,
    `${CEILING} m`)
  check('walls exist and have been cut for doors', WALLS.length > DOORS.length,
    `${WALLS.length} wall runs, ${DOORS.length} doors`)
  check('a known room resolves by id', roomById('galley')?.name.includes('Galley') === true)
  check('a known station resolves by id', stationById('medBay')?.room === 'medical')
  check('the airlock cycle is felt but not tedious',
    C.AIRLOCK_SECONDS >= 2 && C.AIRLOCK_SECONDS <= 8, `${C.AIRLOCK_SECONDS}s`)
}

console.log(fails === 0
  ? '\nALL HABITAT CHECKS PASSED'
  : `\n${fails} HABITAT CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
