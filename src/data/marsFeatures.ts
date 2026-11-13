/**
 * Mars topography and candidate landing sites.
 *
 * Every coordinate, diameter and elevation below is a published figure, mostly
 * MOLA-derived (Mars Orbiter Laser Altimeter, Mars Global Surveyor), quoted
 * against the Mars areoid datum. They are tagged the same way `sim/constants.ts`
 * tags its numbers, so the Mission Science panel can always tell a learner
 * which part of the globe is measurement and which part is procedural fill:
 *
 *   REAL   - published figure, used as-is
 *   REAL~  - published figure, rounded or simplified for rendering
 *   GAME   - a gameplay value with no real-world claim
 *
 * What is NOT real: the metre-by-metre relief between these features. A true
 * MOLA height field is a multi-hundred-megabyte raster, so the globe places
 * the real landmarks at their real positions and sizes and fills the gaps with
 * deterministic noise. The globe is therefore recognisable and correctly
 * proportioned, but it is not a survey. `src/world/marsTopography.ts` documents
 * how to drop a real MOLA tile in if one is ever shipped with the build.
 */

export type FeatureKind = 'volcano' | 'basin' | 'canyon' | 'rise' | 'plain' | 'cap'

export interface MarsFeature {
  id: string
  name: string
  kind: FeatureKind
  /** Degrees north, -90..90. REAL */
  lat: number
  /** Degrees east, 0..360. REAL */
  lon: number
  /** Characteristic radius on the surface, km. REAL~ */
  radiusKm: number
  /**
   * Height above (+) or below (-) the surrounding datum, km. REAL~
   * For a canyon this is the depth of the trough.
   */
  reliefKm: number
  /** Albedo nudge, -1 dark .. +1 bright. REAL~ for named albedo features. */
  albedo: number
  /**
   * For a feature that is long rather than round (a canyon), the line it runs
   * along as [lat, lon] waypoints. The relief is then measured from the
   * nearest point on that line instead of from a single centre.
   */
  path?: [number, number][]
  blurb: string
}

/**
 * The landmarks a person would actually recognise on a globe, plus the
 * hemispheric dichotomy that dominates real MOLA topography.
 *
 * The dichotomy is handled separately in the height function rather than as a
 * feature here: it is a hemisphere-wide offset of roughly 5 km between the
 * cratered southern highlands and the smooth northern lowlands, and it is the
 * single largest thing in Mars's topography.
 */
export const MARS_FEATURES: MarsFeature[] = [
  // ---------------------------------------------------------- Tharsis volcanoes
  {
    id: 'olympus', name: 'Olympus Mons', kind: 'volcano',
    lat: 18.65, lon: 226.2, radiusKm: 300, reliefKm: 21.9, albedo: 0.18,
    blurb:
      'The tallest volcano in the solar system: about 21.9 km above datum and some 600 km ' +
      'across, ringed by a scarp up to 8 km high. Its shallow slopes mean a person standing ' +
      'on it would not perceive a mountain at all — the summit is beyond the horizon.',
  },
  {
    id: 'ascraeus', name: 'Ascraeus Mons', kind: 'volcano',
    lat: 11.8, lon: 255.5, radiusKm: 180, reliefKm: 18.1, albedo: 0.12,
    blurb: 'Northernmost of the three Tharsis Montes, 18.1 km above datum.',
  },
  {
    id: 'pavonis', name: 'Pavonis Mons', kind: 'volcano',
    lat: 0.8, lon: 247.0, radiusKm: 190, reliefKm: 14.0, albedo: 0.12,
    blurb: 'The middle Tharsis volcano, sitting almost exactly on the equator.',
  },
  {
    id: 'arsia', name: 'Arsia Mons', kind: 'volcano',
    lat: -8.35, lon: 239.9, radiusKm: 220, reliefKm: 17.7, albedo: 0.12,
    blurb: 'Southernmost Tharsis volcano; its flanks hold cave-like pit entrances.',
  },
  {
    id: 'alba', name: 'Alba Mons', kind: 'volcano',
    lat: 40.5, lon: 250.4, radiusKm: 500, reliefKm: 6.8, albedo: 0.08,
    blurb: 'Low but enormous — over 1000 km across with slopes under one degree.',
  },
  {
    id: 'elysium', name: 'Elysium Mons', kind: 'volcano',
    lat: 25.0, lon: 147.2, radiusKm: 120, reliefKm: 14.1, albedo: 0.10,
    blurb: 'The main peak of the Elysium rise, on the other side of the planet from Tharsis.',
  },
  {
    id: 'tharsis', name: 'Tharsis Rise', kind: 'rise',
    lat: 0, lon: 265, radiusKm: 2500, reliefKm: 5.0, albedo: 0.10,
    blurb:
      'A continent-sized volcanic bulge covering a quarter of the planet. It is massive ' +
      'enough to have shifted Mars’s spin axis and to have stressed the crust into ' +
      'opening Valles Marineris.',
  },

  // ------------------------------------------------------------------- canyon
  {
    id: 'marineris', name: 'Valles Marineris', kind: 'canyon',
    lat: -13.9, lon: 301.4, radiusKm: 115, reliefKm: 8.0, albedo: -0.10,
    // Noctis Labyrinthus through Ius, Melas and Coprates to Eos Chasma. REAL~
    // The waypoints follow the rift axis, so the trough is deepest along the
    // whole 4000 km rather than only at a nominal centre point.
    path: [
      [-7.0, 262.0], [-8.0, 272.0], [-8.5, 282.0], [-10.5, 290.0],
      [-12.5, 296.0], [-13.9, 301.4], [-13.5, 308.0], [-11.5, 317.0], [-9.5, 325.0],
    ],
    blurb:
      'A rift system roughly 4000 km long, up to 200 km wide and 7 km deep — long enough ' +
      'to span the continental United States, and deep enough to swallow the Grand Canyon ' +
      'several times over.',
  },

  // ------------------------------------------------------------------- basins
  {
    id: 'hellas', name: 'Hellas Planitia', kind: 'basin',
    lat: -42.4, lon: 70.5, radiusKm: 1150, reliefKm: -8.2, albedo: 0.22,
    blurb:
      'The deepest point on Mars, about 8.2 km below datum. The atmospheric column above it ' +
      'is thick enough that surface pressure there can exceed the triple point of water.',
  },
  {
    id: 'argyre', name: 'Argyre Planitia', kind: 'basin',
    lat: -49.7, lon: 316.0, radiusKm: 900, reliefKm: -5.2, albedo: 0.20,
    blurb: 'A large southern impact basin, about 1800 km across.',
  },
  {
    id: 'isidis', name: 'Isidis Planitia', kind: 'basin',
    lat: 12.9, lon: 87.0, radiusKm: 750, reliefKm: -4.5, albedo: -0.05,
    blurb: 'An ancient impact basin; Jezero crater sits on its western rim.',
  },
  {
    id: 'utopia', name: 'Utopia Planitia', kind: 'basin',
    lat: 46.7, lon: 117.5, radiusKm: 1650, reliefKm: -4.8, albedo: 0.04,
    blurb:
      'The largest recognised impact basin on Mars. Radar sounding has mapped a buried ' +
      'ice deposit here holding roughly as much water as Lake Superior.',
  },

  // ------------------------------------------------------------------- plains
  {
    id: 'amazonis', name: 'Amazonis Planitia', kind: 'plain',
    lat: 24.8, lon: 196.0, radiusKm: 1000, reliefKm: -3.4, albedo: 0.14,
    blurb: 'Among the smoothest, youngest-looking plains on the planet.',
  },
  {
    id: 'arcadia', name: 'Arcadia Planitia', kind: 'plain',
    lat: 47.2, lon: 184.3, radiusKm: 900, reliefKm: -3.9, albedo: 0.10,
    blurb:
      'A northern plain repeatedly studied as a settlement target because water ice sits ' +
      'within a metre or two of the surface across large areas.',
  },
  {
    id: 'chryse', name: 'Chryse Planitia', kind: 'plain',
    lat: 28.4, lon: 319.7, radiusKm: 750, reliefKm: -3.0, albedo: 0.06,
    blurb: 'Viking 1 landed here in 1976; outflow channels drain into it.',
  },

  // ---------------------------------------------------------- albedo features
  {
    id: 'syrtis', name: 'Syrtis Major', kind: 'plain',
    lat: 8.4, lon: 69.5, radiusKm: 600, reliefKm: 0.4, albedo: -0.45,
    blurb:
      'The dark patch visible through a small telescope from Earth — a low volcanic shield ' +
      'swept clear of bright dust by wind, exposing dark basaltic sand.',
  },
  {
    id: 'arabia', name: 'Arabia Terra', kind: 'rise',
    lat: 21.0, lon: 6.0, radiusKm: 1800, reliefKm: 1.2, albedo: 0.30,
    blurb: 'A heavily cratered, dust-mantled highland — one of the brightest regions on Mars.',
  },
  {
    id: 'acidalia', name: 'Acidalia Planitia', kind: 'plain',
    lat: 46.7, lon: 339.0, radiusKm: 1100, reliefKm: -4.2, albedo: -0.28,
    blurb: 'A dark northern plain, conspicuous in Earth-based images.',
  },

  // --------------------------------------------------------------- polar caps
  {
    id: 'boreum', name: 'Planum Boreum', kind: 'cap',
    lat: 90, lon: 0, radiusKm: 600, reliefKm: 2.0, albedo: 0.95,
    blurb:
      'The north polar cap: layered water ice about 2 km thick, covered each winter by a ' +
      'seasonal veneer of frozen carbon dioxide.',
  },
  {
    id: 'australe', name: 'Planum Australe', kind: 'cap',
    lat: -90, lon: 0, radiusKm: 500, reliefKm: 2.5, albedo: 0.92,
    blurb:
      'The south polar cap, where the carbon-dioxide layer persists through summer.',
  },
]

// ===========================================================================
//  LANDING SITES
// ===========================================================================

/**
 * How a site changes the mission.
 *
 * These multipliers are the whole point of letting the player choose: a site
 * is not a skin, it is a different seven sols. Each one is derived from a real
 * property of the place, and each is a trade — there is no site that is best
 * at everything.
 *
 * Jezero is the baseline (every multiplier 1.0) because the campaign's power
 * and water balance was tuned around a moderate-latitude, moderate-ice site.
 */
export interface LandingSite {
  id: string
  name: string
  region: string
  /** REAL, degrees north */
  lat: number
  /** REAL, degrees east */
  lon: number
  /** REAL~, km relative to the areoid */
  elevationKm: number
  /** Multiplies peak array output. Driven by latitude and typical dust opacity. */
  solar: number
  /** Multiplies the litres recovered by one rover ice run. */
  ice: number
  /** Added to the nightly low, degrees C. Negative is colder. */
  nightTempC: number
  /** Multiplies the chance and severity of dust events. */
  dust: number
  /** Multiplies science points earned per sol. */
  science: number
  /** The real reason this place is on NASA's shortlists. */
  why: string
  /** The honest downside. */
  risk: string
  /** Real mission that has landed here, if any. */
  heritage?: string
}

export const LANDING_SITES: LandingSite[] = [
  {
    id: 'jezero',
    name: 'Jezero Crater',
    region: 'Isidis Planitia, western rim',
    lat: 18.38, lon: 77.58, elevationKm: -2.6,
    solar: 1.0, ice: 1.0, nightTempC: 0, dust: 1.0, science: 1.0,
    why:
      'A 45 km crater holding a preserved river delta — clay and carbonate deposits laid ' +
      'down by standing water over 3.5 billion years ago. Low latitude keeps the solar ' +
      'array productive year-round.',
    risk: 'Subsurface ice is deep here. Water must come from the recycler, not from the ground.',
    heritage: 'Perseverance, 2021',
  },
  {
    id: 'arcadia',
    name: 'Arcadia Planitia',
    region: 'Northern lowlands',
    lat: 46.7, lon: 184.0, elevationKm: -3.9,
    solar: 0.72, ice: 1.9, nightTempC: -14, dust: 0.85, science: 0.85,
    why:
      'Radar and fresh impact craters show clean water ice within one to two metres of the ' +
      'surface across huge areas. An ice run here is a short dig, not an expedition.',
    risk:
      'At 47 degrees north the sun is low: the array loses roughly a quarter of its output ' +
      'and the nights are far colder, so the heater eats the savings.',
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    region: 'Aeolis Mensae',
    lat: -5.4, lon: 137.8, elevationKm: -4.5,
    solar: 1.12, ice: 0.55, nightTempC: +6, dust: 1.35, science: 1.1,
    why:
      'Nearly equatorial, so the array sees the strongest sunlight available on Mars and ' +
      'the nights are the mildest. Mount Sharp exposes a readable stack of sedimentary layers.',
    risk:
      'Almost no accessible ice, and the crater is a known dust trap — storms and settling ' +
      'dust hit the array harder here than anywhere else on this list.',
    heritage: 'Curiosity, 2012',
  },
  {
    id: 'utopia',
    name: 'Utopia Planitia',
    region: 'Northern lowlands',
    lat: 46.7, lon: 117.5, elevationKm: -4.8,
    solar: 0.74, ice: 1.7, nightTempC: -12, dust: 0.9, science: 0.95,
    why:
      'A buried ice sheet mapped by radar sounding holds roughly the volume of Lake Superior. ' +
      'The plain is flat and well characterised by two landed missions.',
    risk: 'High latitude costs solar output, and the ice is under a dust mantle that must be dug through.',
    heritage: 'Viking 2, 1976 · Zhurong, 2021',
  },
  {
    id: 'hellas',
    name: 'Hellas Planitia',
    region: 'Southern highlands basin',
    lat: -42.4, lon: 70.5, elevationKm: -7.2,
    solar: 0.78, ice: 0.8, nightTempC: +4, dust: 1.5, science: 1.2,
    why:
      'The deepest basin on Mars. The atmospheric column overhead is about twice as thick ' +
      'as at datum, which raises surface pressure above water’s triple point and makes ' +
      'the oxygen generator measurably more efficient.',
    risk:
      'Hellas is where global dust storms are often born. Expect the worst storm season on ' +
      'the planet and a southern-latitude solar penalty.',
  },
  {
    id: 'elysium',
    name: 'Elysium Planitia',
    region: 'Equatorial plains',
    lat: 4.5, lon: 135.6, elevationKm: -2.6,
    solar: 1.08, ice: 0.6, nightTempC: +5, dust: 0.95, science: 0.8,
    why:
      'Deliberately boring: the flattest, safest, most predictable plain NASA could find for ' +
      'InSight. Strong equatorial sun and few surprises.',
    risk: 'Little ice and little to study. A safe landing is not the same as a rich mission.',
    heritage: 'InSight, 2018',
  },
]

export const DEFAULT_SITE_ID = 'jezero'

export const siteById = (id: string): LandingSite =>
  LANDING_SITES.find((s) => s.id === id) ?? LANDING_SITES[0]
