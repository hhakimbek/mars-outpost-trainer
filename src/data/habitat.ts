import type { Task } from '../sim/types'

/**
 * THE HABITAT DECK PLAN
 * =====================
 *
 * The outpost's interior, as a real floor plan rather than a backdrop. Every
 * wall in the 3D interior, every collision the player bumps into and every
 * room label on the HUD is generated from the numbers in this file, so the
 * plan and the thing you walk around can never drift apart.
 *
 * WHERE THE LAYOUT COMES FROM
 * ---------------------------
 * The reference is NASA's Mars Dune Alpha — the 3D-printed, 1,700 sq ft
 * (158 m²) habitat at Johnson Space Center used for the CHAPEA analog
 * missions, in which a crew of FOUR lived and worked for 378 days starting in
 * June 2023. That is also where this trainer's crew of four comes from. Its
 * published arrangement is what is reproduced here: four private crew
 * quarters, a shared galley and wardroom, dedicated medical and laboratory
 * workstations, a command and comms station, technical/storage space, two
 * hygiene stations, and airlocks for surface egress.
 *
 * The room sizes below total about 160 m² of floor, which is the real figure
 * to within the precision a game floor plan deserves. `FLOOR_AREA_M2` computes
 * it from the actual rectangles rather than quoting it, so if a room is ever
 * resized the number the player is shown moves with it.
 *
 * WHAT IS REAL AND WHAT IS GAME DESIGN
 * ------------------------------------
 * REAL   the overall footprint, the crew size, the room inventory, the fact
 *        that quarters are small and the wardroom is the largest shared space
 * GAME   the exact position of each partition, and the fact that the whole
 *        plan is one storey (Mars Dune Alpha's volume is arranged differently)
 *
 * ARCHITECTURE RULE
 * -----------------
 * No React, no three, no store. Pure geometry and data: the layout is
 * therefore testable headlessly, and `test/habitat.test.ts` checks that no two
 * rooms overlap, that every room is reachable through a door, and that every
 * station sits inside the room it claims to be in.
 */

// ---------------------------------------------------------------------------
//  TYPES
// ---------------------------------------------------------------------------

export type RoomId =
  | 'corridor' | 'command' | 'lab' | 'galley' | 'storage'
  | 'roverDock' | 'medical' | 'quarters1' | 'quarters2' | 'quarters3'
  | 'quarters4' | 'sanitation' | 'airlock'

export interface Room {
  id: RoomId
  name: string
  /** Rectangle in habitat-local metres: [xMin, zMin, xMax, zMax]. */
  rect: [number, number, number, number]
  /** What the room is for, one line, shown on the HUD when you step inside. */
  fn: string
  /** The longer card, shown on the room's data plate and in the science panel. */
  learn: string
  /** Accent colour, used for the door frame light and the HUD chip. */
  tint: string
  /** Quarters only: which crew index sleeps here. */
  crewIndex?: number
}

export type Axis = 'x' | 'z'

/** An axis-aligned wall run. Doors are already subtracted. */
export interface WallSeg {
  axis: Axis
  /** The coordinate the wall sits at (z for an x-run, x for a z-run). */
  at: number
  from: number
  to: number
}

/** A doorway: a gap in a wall, plus the frame the renderer draws around it. */
export interface Door {
  axis: Axis
  at: number
  centre: number
  width: number
  /** True for a hatch to the outside — drawn heavier, and it is a pressure boundary. */
  external?: boolean
}

export type StationKind =
  | 'task'        // confirms a scheduled shift, exactly like a surface structure
  | 'action'      // runs a habitat operation with its own cost (see sim/habitatOps)
  | 'readout'     // shows live mission numbers; changes nothing
  | 'transit'     // takes you somewhere (the airlock)

export interface Station {
  id: string
  room: RoomId
  name: string
  kind: StationKind
  /** Position in habitat-local metres. */
  pos: [number, number]
  /** Facing, radians. The player is prompted when inside `range` metres. */
  facing: number
  range: number
  /** For kind 'task': the scheduled task this station satisfies. */
  task?: Task
  /** For kind 'action': the habitat operation id. See sim/habitatOps.ts. */
  op?: string
  /** Quarters only: whose bunk this is. A crew member rests in their own bunk. */
  crewIndex?: number
  fn: string
  learn: string
}

// ---------------------------------------------------------------------------
//  THE PLAN
// ---------------------------------------------------------------------------

/** Interior clear height, metres. GAME — chosen so a 1.7 m eye line feels enclosed. */
export const CEILING = 2.45

/** The corridor runs the length of the habitat between these two z values. */
export const CORRIDOR_Z: [number, number] = [-1.0, 1.0]

/** Outer extent of the pressurised shell. */
export const SHELL: [number, number, number, number] = [-8, -5, 8, 5]

export const ROOMS: Room[] = [
  {
    id: 'corridor', name: 'Main Spine', rect: [-8, -1.0, 8, 1.0], tint: '#9aa7b8',
    fn: 'The pressurised spine. Every room opens onto it.',
    learn:
      'A single spine is a deliberate safety choice, not a space-saving one: it gives every ' +
      'compartment two things — one short path to the airlock, and one wall that can be sealed ' +
      'without trapping anyone behind it.',
  },
  {
    id: 'command', name: 'Command & Comms', rect: [-8, 1.0, -4.4, 5.0], tint: '#7dd3fc',
    fn: 'Mission planning, telemetry, and the Earth downlink.',
    learn:
      'Earth is between 4 and 24 light-minutes away depending on where the two planets are in ' +
      'their orbits, so a question and its answer are separated by 8 to 48 minutes. Nothing ' +
      'here is a phone call. The crew plans the sol, sends the result, and gets on with it.',
  },
  {
    id: 'lab', name: 'Laboratory', rect: [-4.4, 1.0, -0.8, 5.0], tint: '#a78bfa',
    fn: 'Sample preparation, microscopy and the analysis bench.',
    learn:
      'Samples collected outside are worth nothing until they are catalogued, split and ' +
      'analysed. The bench is where an interesting rock becomes a measurement — and where a ' +
      'contaminated sample is caught before it ruins the set.',
  },
  {
    id: 'galley', name: 'Galley & Wardroom', rect: [-0.8, 1.0, 2.8, 5.0], tint: '#fbbf24',
    fn: 'Food preparation and the one table the whole crew shares.',
    learn:
      'The largest shared space in the habitat is a dining table, and that is not sentimental. ' +
      'Analog and station crews consistently report the shared meal as the strongest routine ' +
      'they have for holding a small isolated group together over months.',
  },
  {
    id: 'storage', name: 'Storage & Maintenance', rect: [2.8, 1.0, 8, 5.0], tint: '#94a3b8',
    fn: 'Spares, consumables, the ECLSS rack and the workbench.',
    learn:
      'Every spare part is mass that was flown from Earth at enormous cost, so a Mars outpost ' +
      'repairs rather than replaces. The inventory is also the honest measure of how long the ' +
      'outpost can keep running without resupply.',
  },
  {
    id: 'roverDock', name: 'Rover Dock', rect: [-8, -5.0, -5.8, -1.0], tint: '#c9622b',
    fn: 'Pressurised docking tunnel for the rover. A second way out.',
    learn:
      'A rover that docks pressurised lets the crew transfer without suiting up, which saves ' +
      'hours and consumables on every single trip. It is also the habitat’s second exit, which ' +
      'is why it is at the opposite end from the main airlock.',
  },
  {
    id: 'medical', name: 'Medical Bay', rect: [-5.8, -5.0, -2.9, -1.0], tint: '#f472b6',
    fn: 'Examination, treatment and the pharmacy locker.',
    learn:
      'There is no evacuation. A Mars crew carries one trained medical officer and treats ' +
      'everything it meets, which is why the medical bay is a dedicated room and not a cupboard.',
  },
  {
    id: 'quarters1', name: 'Crew Quarters — CDR', rect: [-2.9, -5.0, -0.9, -1.0],
    tint: '#f59e0b', crewIndex: 0,
    fn: 'Private sleeping quarters. Bunk, desk, personal stowage.',
    learn:
      'Private space is a countermeasure. On a long mission the ability to close a door on ' +
      'three other people is as much a part of crew health as the exercise equipment, and ' +
      'analog crews rate it that way too.',
  },
  {
    id: 'quarters2', name: 'Crew Quarters — ENG', rect: [-0.9, -5.0, 1.1, -1.0],
    tint: '#38bdf8', crewIndex: 1,
    fn: 'Private sleeping quarters. Bunk, desk, personal stowage.',
    learn:
      'Each bunk is sized for sleep and little else — about 8 m². The volume saved goes into ' +
      'the shared spaces, because a crew spends its waking hours together.',
  },
  {
    id: 'quarters3', name: 'Crew Quarters — SCI', rect: [1.1, -5.0, 3.1, -1.0],
    tint: '#a3e635', crewIndex: 2,
    fn: 'Private sleeping quarters. Bunk, desk, personal stowage.',
    learn:
      'Sleep is the only thing that clears fatigue in this simulation, as in life. A rested ' +
      'crew member works a full shift; a tired one makes the mistakes that become events.',
  },
  {
    id: 'quarters4', name: 'Crew Quarters — MED', rect: [3.1, -5.0, 5.1, -1.0],
    tint: '#f472b6', crewIndex: 3,
    fn: 'Private sleeping quarters. Bunk, desk, personal stowage.',
    learn:
      'The quarters are deliberately on the inboard side of the habitat. Mass is shielding, ' +
      'and the crew spends a third of every sol asleep in these four rooms.',
  },
  {
    id: 'sanitation', name: 'Hygiene & Waste', rect: [5.1, -5.0, 6.3, -1.0], tint: '#67e8f9',
    fn: 'Washroom, waste handling and the feed to the water recycler.',
    learn:
      'Everything that leaves the crew goes to the recycler, including humidity condensed out ' +
      'of the cabin air. The ISS recovers roughly 90–98% of its water this way. Hygiene is ' +
      'not a luxury here — skipping it is how a closed habitat grows an infection problem.',
  },
  {
    id: 'airlock', name: 'Main Airlock', rect: [6.3, -5.0, 8, -1.0], tint: '#fb923c',
    fn: 'Suit-up, dust mitigation, depressurise, and out onto the surface.',
    learn:
      'The airlock exists because the habitat holds about 1 bar and Mars holds about 6 ' +
      'millibars — under 1% of it. Every cycle also loses some air, and brings perchlorate ' +
      'dust in on the suits, which is why suits are stored at the hatch and never inboard.',
  },
]

export const roomById = (id: RoomId): Room | undefined => ROOMS.find((r) => r.id === id)

/** Floor area of everything inside the shell, computed rather than quoted. */
export const FLOOR_AREA_M2 = ROOMS.reduce(
  (sum, r) => sum + (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), 0)

/** Which room a habitat-local point is in, or null if it is inside a wall. */
export function roomAt(x: number, z: number): Room | null {
  for (const r of ROOMS) {
    if (x >= r.rect[0] && x <= r.rect[2] && z >= r.rect[1] && z <= r.rect[3]) return r
  }
  return null
}

// ---------------------------------------------------------------------------
//  DOORS
// ---------------------------------------------------------------------------

/**
 * Internal door width, metres.
 *
 * It has to clear BODY_R plus half a wall on each side or the player is
 * squeezed out of the opening by the two posts and the room behind it becomes
 * unreachable — which is exactly what the reachability flood fill in
 * test/habitat.test.ts caught when the bunk doors were 0.8 m. Real habitat
 * hatches are around this width for the same reason: a person carrying
 * something has to fit.
 */
const DOOR_W = 1.05

/** Centre x of a room, used to hang its door. */
const cx = (id: RoomId) => {
  const r = roomById(id)!
  return (r.rect[0] + r.rect[2]) / 2
}

export const DOORS: Door[] = [
  // North row: each room opens south onto the spine.
  { axis: 'x', at: CORRIDOR_Z[1], centre: cx('command'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[1], centre: cx('lab'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[1], centre: cx('galley'), width: 1.6 },
  { axis: 'x', at: CORRIDOR_Z[1], centre: cx('storage'), width: 1.4 },
  // South row: each room opens north onto the spine.
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('roverDock'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('medical'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('quarters1'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('quarters2'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('quarters3'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('quarters4'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('sanitation'), width: DOOR_W },
  { axis: 'x', at: CORRIDOR_Z[0], centre: cx('airlock'), width: DOOR_W },
  // The two pressure boundaries to the outside.
  { axis: 'x', at: SHELL[1], centre: cx('airlock'), width: DOOR_W, external: true },
  { axis: 'z', at: SHELL[0], centre: -3.0, width: DOOR_W, external: true },
]

// ---------------------------------------------------------------------------
//  WALLS
// ---------------------------------------------------------------------------

/**
 * Cuts the doorways out of a wall run.
 *
 * Doors are described once, in DOORS, and subtracted from the walls here —
 * which is why a door can never end up drawn in one place and collided with in
 * another. Returns the surviving solid pieces, in order.
 */
function gapped(axis: Axis, at: number, from: number, to: number): WallSeg[] {
  const gaps = DOORS
    .filter((d) => d.axis === axis && Math.abs(d.at - at) < 1e-6)
    .map((d) => [d.centre - d.width / 2, d.centre + d.width / 2] as [number, number])
    .filter(([a, b]) => b > from && a < to)
    .sort((p, q) => p[0] - q[0])

  const out: WallSeg[] = []
  let cursor = from
  for (const [a, b] of gaps) {
    if (a > cursor + 1e-6) out.push({ axis, at, from: cursor, to: Math.min(a, to) })
    cursor = Math.max(cursor, b)
  }
  if (cursor < to - 1e-6) out.push({ axis, at, from: cursor, to })
  return out
}

/**
 * Every wall in the habitat, doors already subtracted.
 *
 * Built from the room rectangles rather than typed out, so moving a partition
 * is a one-number edit and the collision, the geometry and the plan all follow.
 */
export const WALLS: WallSeg[] = (() => {
  const [x0, z0, x1, z1] = SHELL
  const w: WallSeg[] = []

  // Shell.
  w.push(...gapped('x', z0, x0, x1))     // south, with the airlock hatch
  w.push(...gapped('x', z1, x0, x1))     // north
  w.push(...gapped('z', x0, z0, z1))     // west, with the rover dock hatch
  w.push(...gapped('z', x1, z0, z1))     // east

  // The two long spine walls, with every room door cut out of them.
  w.push(...gapped('x', CORRIDOR_Z[1], x0, x1))
  w.push(...gapped('x', CORRIDOR_Z[0], x0, x1))

  // Partitions between neighbouring rooms in each row. Taking the shared edge
  // from the room list means a partition cannot be forgotten when a room is
  // added.
  const partitions = (ids: RoomId[], from: number, to: number) => {
    for (let i = 1; i < ids.length; i++) {
      const at = roomById(ids[i])!.rect[0]
      w.push({ axis: 'z', at, from, to })
    }
  }
  partitions(['command', 'lab', 'galley', 'storage'], CORRIDOR_Z[1], z1)
  partitions(
    ['roverDock', 'medical', 'quarters1', 'quarters2', 'quarters3', 'quarters4',
      'sanitation', 'airlock'], z0, CORRIDOR_Z[0])

  return w
})()

// ---------------------------------------------------------------------------
//  STATIONS
// ---------------------------------------------------------------------------

/**
 * The things you can actually do indoors.
 *
 * Three of these confirm shifts the player scheduled in planning — `science`,
 * `inspection` and `extraRest` previously had nowhere on the map to happen,
 * which meant the plan could schedule work that the field could not carry out.
 * The rest run habitat operations with their own costs, defined in
 * sim/habitatOps.ts, or simply read the mission out.
 */
export const STATIONS: Station[] = [
  {
    id: 'planningConsole', room: 'command', name: 'Mission Console',
    kind: 'readout', pos: [-6.2, 4.3], facing: Math.PI, range: 1.6,
    fn: 'The sol plan: power modes, crew shifts, and the projection.',
    learn:
      'Planning is the whole game. Power is allocated before it is generated, and crew hours ' +
      'are spent before the sol reveals what it wanted them for.',
  },
  {
    id: 'commsTerminal', room: 'command', name: 'Earth Downlink',
    kind: 'readout', pos: [-7.4, 2.4], facing: Math.PI / 2, range: 1.5,
    fn: 'Telemetry status and the link budget.',
    learn:
      'The forecast on the planning screen is a telemetry product. Switch comms off to save ' +
      'power and the numbers stop arriving — the outpost keeps running, but blind.',
  },
  {
    id: 'labBench', room: 'lab', name: 'Analysis Bench',
    kind: 'task', task: 'science', pos: [-2.6, 4.2], facing: Math.PI, range: 1.7,
    fn: 'Work a scheduled science shift: prepare and analyse samples.',
    learn:
      'Science is the reason the mission was funded, and it is the first thing a struggling ' +
      'outpost stops doing. Points earned here are the difference between surviving and ' +
      'accomplishing something.',
  },
  {
    id: 'microscope', room: 'lab', name: 'Microscope Station',
    kind: 'readout', pos: [-3.8, 2.3], facing: Math.PI / 2, range: 1.4,
    fn: 'Catalogue of everything the outpost has analysed so far.',
    learn:
      'Perchlorates — the chlorine salts in Martian regolith — were found by the Phoenix ' +
      'lander in 2008. They are toxic to people and must be washed out before regolith can ' +
      'grow anything, which is why the greenhouse here is hydroponic.',
  },
  {
    id: 'galleyStation', room: 'galley', name: 'Galley',
    kind: 'action', op: 'sharedMeal', pos: [1.0, 4.3], facing: Math.PI, range: 1.7,
    fn: 'Cook and serve a shared hot meal for the whole crew.',
    learn:
      'A hot meal eaten together costs food, water and power, and buys crew condition. On a ' +
      'long isolated mission that trade is worth making, and analog crews make it daily.',
  },
  {
    id: 'pantry', room: 'galley', name: 'Pantry',
    kind: 'readout', pos: [2.25, 2.2], facing: Math.PI / 2, range: 1.4,
    fn: 'Food on hand, and how many sols it covers at the current burn.',
    learn:
      'Meals are counted, not weighed. Four people eat four meals a sol no matter what else ' +
      'is happening, which makes the pantry the most predictable line in the budget — and the ' +
      'most unforgiving when the greenhouse fails.',
  },
  {
    id: 'workbench', room: 'storage', name: 'Maintenance Workbench',
    kind: 'task', task: 'inspection', pos: [4.4, 4.3], facing: Math.PI, range: 1.7,
    fn: 'Work a scheduled inspection shift: find wear before it becomes a fault.',
    learn:
      'Wear accumulates every sol and raises the chance of a fault. An inspection is cheap and ' +
      'boring; the fault it prevents is neither.',
  },
  {
    id: 'eclssRack', room: 'storage', name: 'ECLSS Rack',
    kind: 'readout', pos: [7.3, 3.4], facing: -Math.PI / 2, range: 1.5,
    fn: 'Cabin air: CO₂, temperature, and what life support is drawing.',
    learn:
      'Environmental Control and Life Support is the system that makes the inside of this ' +
      'building different from the outside. CO₂ above about 1% begins to affect judgement ' +
      'long before it is dangerous, which is exactly the wrong order for a crew making ' +
      'decisions.',
  },
  {
    id: 'medBay', room: 'medical', name: 'Treatment Station',
    kind: 'action', op: 'treatCrew', pos: [-4.3, -4.2], facing: 0, range: 1.7,
    fn: 'Treat the crew member in the worst condition.',
    learn:
      'Treatment costs water and time and does not conjure health out of nothing — but a crew ' +
      'member who falls far enough is a crew member who cannot work, and the shifts they were ' +
      'going to take do not disappear.',
  },
  {
    id: 'hygiene', room: 'sanitation', name: 'Hygiene Station',
    kind: 'action', op: 'hygieneCycle', pos: [5.7, -4.0], facing: 0, range: 1.5,
    fn: 'Run a hygiene cycle. Costs water, raises habitat cleanliness.',
    learn:
      'Cleanliness is a health variable in a sealed can. The water it costs is almost all ' +
      'recovered by the recycler, so the real price is the power to run the loop.',
  },
  {
    id: 'suitRack', room: 'airlock', name: 'Suit Rack',
    kind: 'transit', pos: [7.15, -2.0], facing: 0, range: 1.8,
    fn: 'Suit up and cycle the airlock to the surface.',
    learn:
      'Suits are stored at the hatch so that perchlorate dust brought in on them never reaches ' +
      'the living space. Every cycle vents some of the habitat’s air, which is why nobody goes ' +
      'out for one small job.',
  },
  // One bunk per crew member, generated below so the four can never disagree.
]

for (const room of ROOMS) {
  if (room.crewIndex === undefined) continue
  const x = (room.rect[0] + room.rect[2]) / 2
  STATIONS.push({
    id: `bunk${room.crewIndex}`, room: room.id, name: `${room.name.split('— ')[1]} Bunk`,
    kind: 'task', task: 'extraRest', crewIndex: room.crewIndex,
    pos: [x, -4.1], facing: 0, range: 1.5,
    fn: 'Work a scheduled rest shift. Only in your own quarters.',
    learn:
      'Fatigue is cleared by sleep and by nothing else. A rest shift costs the hours it takes, ' +
      'which is the point: there is no way to be both rested and everywhere at once.',
  })
}

export const stationById = (id: string): Station | undefined =>
  STATIONS.find((s) => s.id === id)

// ---------------------------------------------------------------------------
//  COLLISION
// ---------------------------------------------------------------------------

/**
 * Radius the walker collides with, metres.
 *
 * A suited person is about 0.6 m across the shoulders. The clearance a wall
 * actually takes is BODY_R + WALL_T / 2 = 0.39 m, so every opening has to be
 * wider than 0.78 m; DOOR_W above is sized against this number, and the test
 * suite walks the plan to prove it.
 */
export const BODY_R = 0.32
/** Wall thickness, metres. The renderer draws boxes of exactly this. */
export const WALL_T = 0.14
/** Where you arrive when you come in through the main airlock. */
export const SPAWN: [number, number] = [7.15, -2.4]

/**
 * Pushes a point out of every wall it has got inside.
 *
 * Walls are axis-aligned runs, so the nearest point on one is found by
 * clamping along its single free axis — no raycasts and no physics engine.
 * Two passes, because sliding out of one wall can push you into its
 * neighbour at a corner.
 *
 * This lives here rather than in the renderer so the test suite can walk the
 * whole deck plan headlessly and prove every room is reachable through a door.
 */
export function resolveWalls(x: number, z: number): [number, number] {
  const clear = BODY_R + WALL_T / 2
  for (let pass = 0; pass < 2; pass++) {
    for (const w of WALLS) {
      const nx = w.axis === 'x' ? Math.max(w.from, Math.min(w.to, x)) : w.at
      const nz = w.axis === 'x' ? w.at : Math.max(w.from, Math.min(w.to, z))
      const dx = x - nx
      const dz = z - nz
      const d = Math.hypot(dx, dz)
      if (d >= clear) continue
      if (d < 1e-5) {
        if (w.axis === 'x') z = w.at + clear
        else x = w.at + clear
        continue
      }
      x = nx + (dx / d) * clear
      z = nz + (dz / d) * clear
    }
  }
  return [x, z]
}
