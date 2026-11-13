import type { Task } from '../sim/types'

export interface StructureDef {
  id: string
  name: string
  short: string
  pos: [number, number, number]
  rot?: number
  radius: number          // collision + interaction radius, metres
  task?: Task             // the crew task this structure satisfies
  tint: string
  fn: string              // one-line function summary
  learn: string           // the learning card body
}

/**
 * The outpost, laid out as a readable arc around the habitat. Nothing is more
 * than ~30 m from the centre, so a player never gets lost, and every structure
 * has its own silhouette so it reads from a distance.
 */
export const STRUCTURES: StructureDef[] = [
  {
    id: 'habitat', name: 'Main Habitat', short: 'HAB',
    pos: [0, 0, 0], radius: 5.5, tint: '#e8e2d8',
    fn: 'Pressurised living space, life support, and the shielded storm core.',
    learn:
      'The habitat is a pressure vessel. Outside it the air is about 6 millibars and ' +
      '95% carbon dioxide — under 1% of Earth’s sea-level pressure. Its hull also puts ' +
      'mass between the crew and space, which is the only thing that reduces radiation.',
  },
  {
    id: 'solar', name: 'Solar Array', short: 'PWR',
    pos: [-16, 0, -9], rot: 0.35, radius: 4.2, task: 'cleanArray', tint: '#2b3a52',
    fn: 'Generates all the outpost’s electricity. Dust reduces its output every sol.',
    learn:
      'Mars receives about 586 W/m² of sunlight — roughly 43% of Earth’s. Dust in the air ' +
      'blocks more of it, and dust settling on the panels blocks more still. Cleaning is a ' +
      'manual EVA job.',
  },
  {
    id: 'greenhouse', name: 'Greenhouse', short: 'BIO',
    pos: [15, 0, -10], rot: -0.3, radius: 4.6, task: 'tendGreenhouse', tint: '#9fe8c0',
    fn: 'Grows food. Needs power for grow lights, water, and four sols of time.',
    learn:
      'Crops convert light, water and nutrients into food over days. You cannot speed biology ' +
      'up with extra power. Martian regolith also contains perchlorate salts that are toxic ' +
      'and must be removed before the soil can be used.',
  },
  {
    id: 'water', name: 'Water Recycler', short: 'H2O',
    pos: [10, 0, 12], rot: 0.9, radius: 3.4, tint: '#4f7fd4',
    fn: 'Recovers up to 90% of the water the crew uses. Needs electricity.',
    learn:
      'A closed loop multiplies every litre you brought. At 90% recovery one litre serves the ' +
      'crew around ten times. The ISS recovers roughly 90–98% of its water, including moisture ' +
      'from cabin air.',
  },
  {
    id: 'oxygen', name: 'Oxygen Generator', short: 'O2',
    pos: [-10, 0, 12], rot: -0.8, radius: 3.4, tint: '#7dd3fc',
    fn: 'Splits CO₂ from the Martian atmosphere into breathable oxygen. Needs electricity.',
    learn:
      'NASA’s MOXIE experiment on the Perseverance rover did exactly this: it ran solid-oxide ' +
      'electrolysis on Martian air and produced oxygen, proving the principle on the surface ' +
      'of another planet.',
  },
  {
    id: 'battery', name: 'Battery Bank', short: 'BAT',
    pos: [-19, 0, 4], radius: 2.8, tint: '#fbbf24',
    fn: 'Stores surplus energy for the night and for emergencies.',
    learn:
      'Batteries store energy; they never create it. Surplus above their capacity is simply ' +
      'lost, and a battery you deep-discharged today is a battery with no margin tomorrow.',
  },
  {
    id: 'rover', name: 'Pressurised Rover', short: 'RVR',
    pos: [21, 0, 6], rot: 1.2, radius: 3.6, task: 'iceRun', tint: '#c9622b',
    fn: 'Drives to the subsurface ice site. Must be charged before use.',
    learn:
      'Curiosity and Perseverance use a nuclear power source rather than solar panels, ' +
      'precisely because dust storms and dust accumulation make solar power unreliable ' +
      'on the Martian surface.',
  },
  {
    id: 'reactor', name: 'Fission Surface Power', short: 'FSP',
    pos: [-28, 0, 20], rot: -0.5, radius: 4.0, task: 'startReactor', tint: '#a3e635',
    fn: 'Backup nuclear power. Flat output day, night and dust storm — once it is started.',
    learn:
      'NASA\u2019s Kilopower project built and ran a real one of these: KRUSTY, a compact ' +
      'uranium-235 fission reactor with Stirling convertors, full-power tested in 2018 in ' +
      '1\u201310 kWe sizes. The baseline for a crewed outpost was four 10 kWe units. It sits far ' +
      'from the habitat behind a shadow shield, and it is the only power source on Mars that ' +
      'does not care whether the sun is out.',
  },
  {
    id: 'breach', name: 'Hull Breach', short: 'FIX',
    pos: [4.5, 0, 5.2], radius: 2.4, task: 'repair', tint: '#f2555a',
    fn: 'A damaged hull panel venting oxygen. Hold E to apply sealant.',
    learn:
      'Raising oxygen production hides a leak but does not fix it — and the cost repeats every ' +
      'single sol. Finding the root cause is almost always cheaper than outrunning it.',
  },
]

export const structureById = (id: string): StructureDef | undefined =>
  STRUCTURES.find((s) => s.id === id)
