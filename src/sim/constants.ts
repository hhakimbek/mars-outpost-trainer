/**
 * Every tunable number in the simulation lives here.
 *
 * Each value carries a tag so the UI can always tell a learner which numbers
 * come from published science and which are game-design choices:
 *   REAL   - published figure
 *   REAL~  - derived from a published figure, rounded for gameplay
 *   GAME   - pure gameplay value, no real-world claim
 */

export const C = {
  // ---------------------------------------------------------------- planet
  SOL_HOURS: 24.66,              // REAL   24h 39m 35s
  MARS_GRAVITY: 3.721,           // REAL   m/s^2 (0.379 g)
  MARS_PRESSURE_MBAR: 6.1,       // REAL   ~0.6% of Earth sea level
  MARS_CO2_FRACTION: 0.953,      // REAL   atmosphere is ~95% CO2
  MARS_IRRADIANCE: 586,          // REAL   W/m^2 mean, vs 1361 at Earth (~43%)
  MARS_MEAN_TEMP_C: -63,         // REAL   global mean surface temperature
  COMM_DELAY_MIN: [4, 24],       // REAL   one-way light time, minutes

  // ------------------------------------------------------------ crew needs
  CREW_COUNT: 3,
  O2_PER_CREW: 0.84,             // REAL   kg/person/sol
  WATER_PER_CREW: 4.0,           // REAL~  L/person/sol, drink + food prep + minimal hygiene
  MEALS_PER_CREW: 3,             // GAME   ~2800 kcal/person/sol
  CREW_HOURS_EACH: 8,            // GAME
  CREW_HOURS_MANDATORY: 2,       // GAME   exercise + medical, not assignable

  // -------------------------------------------------------- starting stock
  // Every buffer is sized against the seven-sol mission. A tank that lasts
  // fifty sols is not a resource, it is scenery — the old 450 L of water could
  // not be exhausted by any play, so the recycler and the ice run meant
  // nothing.
  START_O2: 12.0,                // GAME   ~5 sols of crew consumption
  START_WATER: 120,              // GAME   ~10 sols at nominal recycling
  START_FOOD: 54,                // GAME   exactly 6 sols — a harvest is required
  START_BATTERY: 30,

  CAP_O2: 18,
  CAP_WATER: 260,
  CAP_FOOD: 80,
  CAP_BATTERY: 40,               // GAME

  // ---------------------------------------------------------------- power
  // Sized against the plan it has to fund. Life support, thermal, the oxygen
  // generator and the recycler at NOMINAL come to 34 kWh; the greenhouse makes
  // it 46 and the comms link 48. A clear sol leaves about 4 kWh of slack, a
  // hazy one forces a real choice, and the storm forces a crisis.
  //
  // At the original 60 kWh there was 11 kWh of slack every single sol and the
  // player never had to choose anything.
  ARRAY_CLEAR_KWH: 52,           // GAME   grounded in irradiance x area x efficiency
  DUST_PER_SOL: 0.045,           // GAME   accelerated so array cleaning is a live decision
  STORM_SOLAR_FACTOR: 0.15,      // REAL~  global dust storms cut insolation ~80-90%
  BATTERY_MAX_DISCHARGE: 0.75,   // GAME   reserve floor protects restart capability
  O2_KWH_PER_KG: 3.85,           // GAME   simplified solid-oxide electrolysis cost
  RECYCLER_NOMINAL: 0.90,        // REAL~  ISS water recovery is ~90-98%
  RECYCLER_LOW: 0.62,            // GAME
  RECYCLER_HIGH: 0.97,           // GAME   HIGH must buy something, or it is a trap

  // ------------------------------------------------- air quality (lifeSupport)
  // CO2 is scrubbed by the life-support loop. Below NOMINAL it builds up, and
  // that is what makes throttling life support a real gamble rather than a
  // free 3 kWh. Figures are normalised 0..1 against a 1% cabin fraction.
  CO2_RISE_LOW: 0.30,            // GAME   per sol at LOW
  CO2_HOLD_NOMINAL: -0.08,       // GAME   slowly recovers
  CO2_SCRUB_HIGH: -0.40,         // GAME
  CO2_SYMPTOM: 0.45,             // GAME   headaches, slowed work above this
  CO2_DANGER: 0.75,              // GAME   real health loss above this
  CO2_HEALTH_LOSS: 9,            // GAME   per sol in the danger band
  CO2_WORK_PENALTY: 0.78,        // GAME   task efficiency multiplier

  // ------------------------------------------------------ thermal management
  // Mars nights reach below -80 C. The heater loop holds the habitat in band;
  // running it cold saves power and costs crew health, plant growth and water
  // through a frozen condensate line.
  HAB_TARGET_C: 21,              // GAME
  HAB_COLD_C: 10,                // GAME   below this the crew suffers
  // Heater output in degrees per sol, against a loss proportional to how far
  // the habitat is above the outside air. Equilibrium is
  //   T = outside + heat / loss
  // which is why a colder night makes the LOW setting dangerous rather than
  // merely uncomfortable. The earlier "fraction of the gap closed" model could
  // never hold 20 C against a -50 C night at any setting.
  THERMAL_HEAT: [0, 14, 24, 32],  // GAME   degrees C per sol, by mode
  THERMAL_LOSS: 0.33,             // GAME   per sol, per degree above outside
  COLD_HEALTH_LOSS: 6,           // GAME   per sol below HAB_COLD_C
  COLD_WATER_LOSS: 7,            // GAME   L/sol lost to a frozen line
  COLD_GROWTH: 0.55,             // GAME   growth multiplier when cold
  WARM_GROWTH: 1.12,             // GAME   growth multiplier at HIGH

  // ------------------------------------------------- comms and science (link)
  // The link is the trainer's information economy: telemetry and the forecast
  // cost power. Switching comms off saves 3 kWh and blinds the player.
  SCIENCE_PER_SOL: [0, 4, 8, 14], // GAME   by comms mode
  TELEMETRY_MIN_MODE: 1,          // GAME   below this, no forecast at all

  // ------------------------------------------------------------- equipment
  // Hardware wears out. Inspection is the only way to see it coming, which is
  // what makes spending two crew-hours on "nothing" a real decision.
  WEAR_PER_SOL: 0.09,            // GAME
  WEAR_STORM: 0.16,              // GAME   extra, on a dust-storm sol
  WEAR_INSPECTION: -0.22,        // GAME   a thorough check resets some wear
  FAULT_BASE_CHANCE: 0.10,       // GAME
  FAULT_WEAR_CHANCE: 0.55,       // GAME   multiplied by current wear
  ARRAY_FAULT_PENALTY: 0.70,     // GAME   generation multiplier on a dead string
  THERMAL_FAULT_COST: 4,         // GAME   extra kWh the heater draws when faulty
  LEAK_RATE: 1.1,                // GAME   kg O2/sol through an unpatched breach

  // ------------------------------------------------------------ greenhouse
  GROWTH_SOLS: 4,                // GAME   fast crop (lettuce / microgreens class)
  HARVEST_MEALS: 18,             // GAME   per harvest at full care
  HARVEST_MIN_MEALS: 9,          // GAME   a neglected crop yields half
  GREENHOUSE_WATER: 15,          // GAME   L/sol
  GREENHOUSE_RECOVERY: 0.5,      // GAME   condensate recapture

  // ------------------------------------------------------------- radiation
  DOSE_EVA: 0.030,               // REAL~  from ~0.64 mSv/sol unshielded surface dose
  DOSE_ROVER: 0.022,             // GAME
  DOSE_HABITAT: 0.012,           // GAME   habitat shell ~55% reduction
  DOSE_SHELTER: 0.004,           // GAME   regolith-shielded core
  SPE_MULTIPLIER: 50,            // GAME   solar particle event spike
  DOSE_BUDGET: 30,               // GAME   mission allowance; NASA career limit ~600 mSv
  CAREER_LIMIT: 600,             // REAL   NASA career effective dose limit, mSv
  SHIELD_REDUCTION: 0.35,        // GAME   permanent habitat dose cut

  // ------------------------------------------------------------ crew-hours
  ICE_RUN_YIELD: 40,             // GAME   L per trip
  ICE_RUN_POWER: 6,              // GAME   kWh

  // ----------------------------------------------------------- health rules
  HEALTH_LOSS_O2: 25,
  HEALTH_LOSS_WATER: 20,
  HEALTH_LOSS_FOOD: 10,
  HEALTH_ABORT: 20,
  FATIGUE_PER_HOUR: 6,
  FATIGUE_RECOVERY: 18,

  // ---------------------------------------------------------------- mission
  TOTAL_SOLS: 7,
  EVA_SECONDS: 180,              // GAME   Field Ops window in real seconds
  EVA_HOURS: 6,                  // GAME   in-game hours that window represents
  INTERACT_RANGE: 4.5,           // GAME   metres
} as const

export const TASK_HOURS = {
  none: 0,
  plantCrop: 2,
  cleanArray: 3,
  repair: 4,
  tendGreenhouse: 2,
  science: 3,
  iceRun: 5,
  regolithShield: 6,
  inspection: 2,
  extraRest: 2,
} as const

export const SUBSYSTEM_COST = {
  //                 off  low  nominal  high
  lifeSupport:      [0,   5,   8,   10],
  thermal:          [0,   6,  10,   13],
  oxygenGenerator:  [0,   6,  10,   14],
  waterRecycler:    [0,   3,   6,    8],
  greenhouse:       [0,   6,  12,   16],
  commsScience:     [0,   2,   3,    5],
  roverCharge:      [0,   6,   6,    6],
} as const

/** Lower number is shed last during a brownout. */
export const SUBSYSTEM_PRIORITY = {
  lifeSupport: 0,
  thermal: 1,
  oxygenGenerator: 2,
  waterRecycler: 3,
  greenhouse: 4,
  roverCharge: 5,
  commsScience: 6,
} as const

/** Life support and thermal can be throttled to LOW but never switched off. */
export const CANNOT_TURN_OFF = ['lifeSupport', 'thermal'] as const
