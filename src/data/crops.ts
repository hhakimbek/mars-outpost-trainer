import type { Mode } from '../sim/types'

/**
 * The four crops, and what each one costs to grow.
 *
 * Tagged the same way `sim/constants.ts` is:
 *   REAL   - published figure
 *   REAL~  - published figure, simplified
 *   GAME   - gameplay value, no real-world claim
 *
 * `idealTempC` is the temperature of a *lit* rack, not of the habitat: the
 * lamps add a few degrees, so a rack running at NOMINAL light sits near 24 C.
 * Choosing a cooler light setting favours the lettuce and the potato; a hotter
 * one favours the tomato and the wheat. That is a real environmental decision,
 * not a dial.
 *
 * `growSols` is GAME everywhere and deliberately so. Real lettuce takes about
 * a month and a real potato three; the mission is seven sols. Compressing
 * growth is the only way a player can ever see a harvest, so the compression
 * is stated openly — `realDays` carries the published figure, the Mission
 * Science panel shows both, and the ratios between the crops are preserved:
 * lettuce is still the quick, low-calorie one and the potato is still the slow,
 * calorie-dense one.
 */
export type CropId = 'lettuce' | 'wheat' | 'tomato' | 'potato'

export interface CropDef {
  id: CropId
  name: string
  /** The cultivar actually flown or studied, where there is one. REAL */
  cultivar: string
  /** Sols from seed to harvest at full care. GAME */
  growSols: number
  /** Real days to harvest on Earth or in orbit. REAL~ */
  realDays: number
  /** Meals a healthy bed yields at harvest. GAME */
  meals: number
  /** Litres per sol while growing. GAME, scaled by real transpiration rates. */
  waterPerSol: number
  /** Share of the nutrient reservoir drawn per sol, 0..1. GAME */
  nutrientPerSol: number
  /** Below this grow-light mode the crop cannot grow at all. GAME */
  minLight: Mode
  /** Ideal rack temperature, degrees C. REAL~ */
  idealTempC: number
  /** How fast health falls outside its comfort band, per sol. GAME */
  fragility: number
  /**
   * Health restored to every crew member when this bed is harvested. GAME
   *
   * This is the fresh-food effect, and it is the reason to grow a tomato at
   * all. NASA treats crop growing aboard spacecraft as a psychological
   * countermeasure as much as a food source: the Veggie crews reported real
   * morale value in tending the plants and eating something fresh, and the
   * 2022 tomato harvest was an event aboard the station. A bulk calorie crop
   * like wheat does none of that.
   *
   * Without it the wheat bed was strictly better than the tomato bed on every
   * axis — faster, bigger, thirstier by less — which made one of the four
   * crops a trap rather than a choice.
   */
  morale: number
  /** A short colour for the 3D bed and the UI. */
  tint: string
  blurb: string
  source: string
}

export const CROPS: Record<CropId, CropDef> = {
  lettuce: {
    id: 'lettuce',
    name: 'Red romaine lettuce',
    cultivar: "'Outredgeous'",
    growSols: 3,
    realDays: 33,
    meals: 10,
    waterPerSol: 4,
    nutrientPerSol: 0.04,
    minLight: 1,
    idealTempC: 21,
    fragility: 0.8,
    morale: 3,
    tint: '#7ec850',
    blurb:
      'The quick crop. Low in calories but ready fastest, tolerant of dim light, and it is ' +
      'the only one on this list that will forgive you a bad sol.',
    source:
      "NASA Veggie, 2015: 'Outredgeous' red romaine was the first crop grown and eaten in " +
      'orbit. Roughly 33 days from seed to harvest.',
  },
  wheat: {
    id: 'wheat',
    name: 'Dwarf wheat',
    cultivar: "'Apogee'",
    growSols: 5,
    realDays: 70,
    meals: 20,
    waterPerSol: 7,
    nutrientPerSol: 0.07,
    minLight: 2,
    idealTempC: 23,
    fragility: 1.0,
    morale: 0,
    tint: '#d9b566',
    blurb:
      'Bread and calories, but it wants bright light and a lot of water. Thirsty and ' +
      'unforgiving — it will not grow at all on dimmed lights.',
    source:
      "'Apogee' dwarf wheat was bred at Utah State University for spaceflight and grown " +
      'aboard Mir. About 70 days to grain on the ground.',
  },
  tomato: {
    id: 'tomato',
    name: 'Dwarf tomato',
    cultivar: "'Red Robin'",
    growSols: 5,
    realDays: 95,
    meals: 16,
    waterPerSol: 8,
    nutrientPerSol: 0.08,
    minLight: 2,
    idealTempC: 25,
    fragility: 1.3,
    morale: 8,
    tint: '#e05a3d',
    blurb:
      'The most demanding bed in the rack: the thirstiest, the hungriest for nutrients and ' +
      'the quickest to suffer if the habitat goes cold. It yields fewer meals than wheat — ' +
      'but a harvest of something fresh does more for four people seven months from home ' +
      'than the same calories in flour.',
    source:
      "'Red Robin' dwarf tomatoes were grown in Veggie and harvested aboard the ISS in 2022 " +
      '— the station’s first tomato crop. Around 95 days on the ground.',
  },
  potato: {
    id: 'potato',
    name: 'Potato',
    cultivar: 'Andean varieties',
    growSols: 6,
    realDays: 110,
    meals: 28,
    waterPerSol: 6,
    nutrientPerSol: 0.06,
    minLight: 2,
    idealTempC: 20,
    fragility: 0.9,
    morale: 1,
    tint: '#b98a5a',
    blurb:
      'The calorie crop. Slowest to mature and it will not be ready inside a short mission ' +
      'unless it goes in on Sol 1 — but one bed feeds the crew for days.',
    source:
      'The International Potato Center and NASA have tested Andean potato varieties in ' +
      'simulated Martian soil conditions. 90 to 120 days on Earth.',
  },
}

export const CROP_LIST: CropDef[] = [CROPS.lettuce, CROPS.wheat, CROPS.tomato, CROPS.potato]

export const cropById = (id: CropId): CropDef => CROPS[id]

/** How many hydroponic beds the rack holds. GAME */
export const BED_COUNT = 4
