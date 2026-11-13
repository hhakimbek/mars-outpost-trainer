import { computeGeneration } from '../sim/simulation'
import type { MissionEvent } from '../sim/types'

/**
 * The seven authored sols. Events are DATA, so extending the MVP to the full
 * 30-sol campaign means adding entries here — no code changes.
 *
 * Every sol must have: a forced trade-off, a learning objective, and at least
 * two meaningful choices with different time horizons.
 */
export const EVENTS: MissionEvent[] = [
  {
    id: 'sol1-arrival',
    sol: 1,
    title: 'ARRIVAL & SYSTEMS CHECK',
    category: 'Orientation',
    severity: 'info',
    objective: 'Learn that the outpost is one connected system, and that power is the master constraint.',
    situation:
      'Your crew has landed. Every machine here is healthy, but the solar array cannot ' +
      'run everything at once. Walk the outpost, then open the planning screen and decide ' +
      'where today’s energy goes.',
    telemetry: {
      'Solar output (forecast)': (m) => `${Math.round(computeGeneration(m.env, m.stocks.cleanliness, m.arrayFault))} kWh today`,
      'Nominal demand (all systems)': '48 kWh with the greenhouse lit',
      'Crew': '3 — all nominal',
      'Earth round-trip delay': '~28 minutes',
    },
    choices: [
      {
        id: 'brief-crew',
        label: 'Charge the battery to full before anything else',

        cost: 'Battery to full, nothing else gained',
        effects: { battery: 9, wear: -0.04 },
        quality: 'optimal',
        reasoning:
          'Preparation. The forecast already shows a regional dust storm building, and on ' +
          'that sol the array will produce almost nothing — a charged battery is the only ' +
          'thing standing between the crew and a cold, dark habitat.',
      },
      {
        id: 'ask-earth',
        label: 'Bank the spare power as oxygen instead',

        cost: '−6 kWh, +2.2 kg O₂ banked',
        effects: { o2: 2.2, battery: -6 },
        quality: 'acceptable',
        reasoning:
          'Not wrong — 2.2 kg of oxygen is almost a sol of breathing for three people. ' +
          'But it spends the energy you will want in the battery when the storm arrives, ' +
          'and nobody on Earth can warn you in time: the signal takes 4 to 24 minutes each way.',
      },
    ],
    learning: {
      what: 'You could not set every system to NOMINAL at the same time.',
      why:
        'The solar array produces a fixed amount of energy per sol. Life support, heating, ' +
        'oxygen production, water recycling and the greenhouse all draw from that same pool. ' +
        'Giving one system more always means giving another less.',
      realScience:
        'Mars receives about 586 W/m² of sunlight on average — roughly 43% of what Earth ' +
        'receives — because it orbits about 1.5 times farther from the Sun. Every solar-powered ' +
        'Mars mission is designed around that limit.',
      sourceLabel: 'NASA — Mars Fact Sheet',
      sourceUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
      tag: 'REAL',
    },
  },

  {
    id: 'sol2-water',
    sol: 2,
    title: 'WATER MARGIN',
    category: 'Life Support',
    severity: 'caution',
    objective: 'Understand closed-loop recycling versus hauling new water.',
    situation:
      'Overnight telemetry shows the water recycler spent the night in LOW mode. ' +
      'It only recovered about 62% of what the crew used, instead of 90%. Your reserve ' +
      'is draining faster than planned.',
    telemetry: {
      'Recycler mode last night': 'LOW (62% recovery)',
      'Crew water use': '12 L/sol',
      'Net loss at LOW': '−4.6 L/sol',
      'Net loss at NOMINAL': '−1.2 L/sol',
    },
    choices: [
      {
        id: 'recycler-nominal',
        label: 'Run the recycler at NOMINAL',

        cost: '−4 kWh today, +6 L recovered backlog',
        effects: { water: 6, battery: -4 },
        quality: 'optimal',
        reasoning:
          'Correct. Three extra kilowatt-hours cuts your water loss by almost 75%. ' +
          'Recovering what you already have is far cheaper than finding more.',
      },
      {
        id: 'ration',
        label: 'Ration crew water to 3 L per person',

        cost: '+9 L now, crew health −5, fatigue +10',
        effects: { water: 9, healthAll: -5, fatigueAll: 10 },
        future: [{ onSol: 4, healthAll: -3, message: 'Rationing water has caught up with the crew — mild dehydration, performance down.' }],
        quality: 'poor',
        reasoning:
          'This saves water today and costs you crew health the day after tomorrow. ' +
          'Rationing a consumable your machinery could have recovered is the wrong trade.',
      },
      {
        id: 'ice-run',
        label: 'Send the rover to the ice site',

        cost: '+36 L, −9 kWh, 5 crew-hours, +0.12 mSv each',
        effects: { water: 36, battery: -9, crewHoursLost: 5, doseAll: 0.12 },
        quality: 'acceptable',
        reasoning:
          'It works and it adds 40 L, but it costs five crew-hours and radiation exposure ' +
          'for water you could have simply not lost. Use it to build a reserve, not to patch a leak.',
      },
    ],
    learning: {
      what: 'Fixing the recycler recovered far more water than hauling new water would have.',
      why:
        'A closed loop multiplies every litre you brought. At 90% recovery, one litre serves ' +
        'the crew roughly ten times before it is gone. At 62% it serves fewer than three.',
      realScience:
        'Aboard the International Space Station, the Environmental Control and Life Support ' +
        'System recovers around 90–98% of water, including moisture from cabin air and urine. ' +
        'No long-duration crewed mission is possible without it.',
      sourceLabel: 'NASA — ISS Environmental Control and Life Support System',
      sourceUrl: 'https://www.nasa.gov/exploration-research-and-technology/life-support-systems/',
      tag: 'REAL',
    },
  },

  {
    id: 'sol3-storm',
    sol: 3,
    title: 'DUST STORM',
    category: 'Power',
    severity: 'critical',
    objective: 'Set priorities when there is genuinely not enough energy.',
    situation:
      'A regional dust storm has reached the outpost. The sky has gone deep ochre and ' +
      'solar output has collapsed to about 15% of nominal. You cannot run everything. ' +
      'Life support and heating cannot be switched off. Decide what you sacrifice.',
    telemetry: {
      'Solar output today': (m) =>
        `${Math.round(computeGeneration(m.env, m.stocks.cleanliness, m.arrayFault))} kWh — array ${Math.round(m.stocks.cleanliness * 100)}% clean`,
      'Battery available': (m) => `${m.stocks.battery.toFixed(1)} kWh stored`,
      'Mandatory load (LS + thermal, at LOW)': '11 kWh',
      'Optical depth (tau)': '5.8',
    },
    choices: [
      {
        id: 'greenhouse-off',
        label: 'Shut the greenhouse down for one sol',

        cost: 'Crop loses a sol, −10 science',
        effects: { greenhouseStall: 1, science: -10 },
        quality: 'optimal',
        reasoning:
          'The best answer. The greenhouse is the only large load whose loss is reversible: ' +
          'a crop can wait a sol. Oxygen and heat cannot.',
      },
      {
        id: 'o2-off',
        label: 'Switch off the oxygen generator, live on stored O₂',

        cost: '−2.8 kg O₂ and the cabin air degrades',
        effects: { o2: -2.8, co2: 0.14 },
        quality: 'poor',
        reasoning:
          'Dangerous. You have roughly eight sols of stored oxygen and the storm may last ' +
          'longer than one. Never spend your life-support buffer to save a crop.',
      },
      {
        id: 'deep-discharge',
        label: 'Deep-discharge the battery to hold everything at nominal',

        cost: 'Battery to ~10%, wear +12%',
        effects: { battery: -24, wear: 0.12 },
        future: [{ onSol: 4, battery: -4, message: 'The battery pack recovered badly from the deep discharge — 4 kWh of capacity is gone.' }],
        quality: 'acceptable',
        reasoning:
          'Defensible for one sol, but it leaves you with no margin tomorrow. ' +
          'Batteries store energy; they do not create it.',
      },
    ],
    learning: {
      what: 'Dust cut your solar power by about 85%, and the panels are now fouled.',
      why:
        'Airborne dust both blocks sunlight and settles on the panels. The first effect ends ' +
        'with the storm; the second stays until someone goes outside and cleans them.',
      realScience:
        'In 2018 a planet-encircling dust storm ended NASA’s Opportunity rover mission by ' +
        'starving its solar panels. The InSight lander slowly lost most of its power to dust ' +
        'accumulation. This is exactly why Curiosity and Perseverance carry a nuclear power ' +
        'source instead of solar panels.',
      sourceLabel: 'NASA — Opportunity and the 2018 global dust storm',
      sourceUrl: 'https://science.nasa.gov/mission/mars-exploration-rover-opportunity/',
      tag: 'REAL',
    },
  },

  {
    id: 'sol4-leak',
    sol: 4,
    title: 'OXYGEN LEAK',
    category: 'Life Support',
    severity: 'critical',
    objective: 'Treat the cause, not the symptom — and do the physical work.',
    situation:
      'A pressure sensor has found a slow leak in the habitat hull: about 1.1 kg of oxygen ' +
      'per sol, and it will not stop on its own. Somebody has to suit up, walk to the breach ' +
      'and patch it.',
    telemetry: {
      'Leak rate': '1.1 kg O₂/sol',
      'Stored oxygen': 'check your gauge — the tank holds 18 kg',
      'Repair cost': '4 crew-hours (EVA)',
      'Generator at HIGH': '+1.0 kg O₂/sol for +4 kWh',
    },
    choices: [
      {
        id: 'patch-now',
        label: 'Suit up and patch the breach today',

        cost: '4 crew-hours + EVA dose, leak closed',
        effects: { o2Leak: 0, crewHoursLost: 4, doseAll: 0.18 },
        quality: 'optimal',
        reasoning:
          'Right call. Four crew-hours ends the loss permanently, and the dose from one ' +
          'EVA is small next to a kilogram of oxygen vented every sol for the rest of the ' +
          'mission. Fix the cause, not the symptom.',
      },
      {
        id: 'seal-module',
        label: 'Seal off the affected module and live in less space',

        cost: 'Leak cut to 0.4 kg/sol, crowded and cold',
        effects: { o2Leak: 0.4, healthAll: -3, fatigueAll: 15, habTemp: -3 },
        future: [{ onSol: 6, healthAll: -3, message: 'Living in half the habitat has worn the crew down.' }],
        quality: 'acceptable',
        reasoning:
          'A legitimate emergency measure that stops the loss without an EVA. ' +
          'But it costs volume, heat and morale, and the hull is still damaged.',
      },
      {
        id: 'outrun',
        label: 'Run the oxygen generator at HIGH to outrun the leak',

        cost: 'Leak untouched at 1.1 kg/sol, −10 kWh',
        effects: { o2Leak: 1.1, battery: -10 },
        future: [{ onSol: 5, o2: -1.3, message: 'The breach is still open. Another 1.3 kg of oxygen vented overnight.' }, { onSol: 6, o2: -1.3, message: 'Still venting. The generator cannot outrun a hole.' }],
        quality: 'poor',
        reasoning:
          'This is the classic mistake: treating the symptom while burning your power budget. ' +
          'The hole is still there, and now you are paying for it every single sol.',
      },
    ],
    learning: {
      what: 'Only patching the hull actually stopped the oxygen loss.',
      why:
        'Increasing production hides a leak but does not fix it. The cost compounds every sol, ' +
        'and the energy spent masking the problem is energy unavailable for everything else.',
      realScience:
        'Mars’ atmosphere is about 95% carbon dioxide at roughly 6 millibars — under 1% of ' +
        'Earth’s sea-level pressure. A habitat is a pressure vessel, and anything that ' +
        'breaches it vents breathable air into a near-vacuum.',
      sourceLabel: 'NASA — Mars Facts',
      sourceUrl: 'https://science.nasa.gov/mars/facts/',
      tag: 'REAL',
    },
  },

  {
    id: 'sol5-radiation',
    sol: 5,
    title: 'SOLAR PARTICLE EVENT',
    category: 'Radiation',
    severity: 'critical',
    objective: 'Understand shielding, shelter, and why dose is cumulative.',
    situation:
      'Solar observatories have detected a particle event heading for Mars. Within hours the ' +
      'radiation dose rate at the surface will be roughly fifty times normal. Mars has no ' +
      'global magnetic field and almost no atmosphere to stop it. Get your crew inside.',
    telemetry: {
      'Dose rate — surface (EVA)': '~1.50 mSv/hour during the event',
      'Dose rate — habitat': '~0.60 mSv/hour',
      'Dose rate — shielded core': '~0.008 mSv/hour',
      'Mission allowance': '30 mSv per person',
    },
    choices: [
      {
        id: 'shelter-all',
        label: 'All crew to the shielded core immediately',

        cost: 'Lose the whole work shift (8 crew-hours)',
        effects: { crewHoursLost: 8, doseAll: 0.05 },
        quality: 'optimal',
        reasoning:
          'Correct and unglamorous. You lose a day of work and almost no dose. ' +
          'Mass between your crew and space is the only thing that actually helps.',
      },
      {
        id: 'finish-first',
        label: 'Finish the critical task first, then shelter',

        cost: 'Keep every crew-hour, +6.5 mSv each',
        effects: { doseAll: 6.5 },
        quality: 'poor',
        reasoning:
          'You gained a few crew-hours and spent a sixth of one person’s entire mission ' +
          'dose allowance. Dose never goes back down. This is almost never worth it.',
      },
      {
        id: 'shield-now',
        label: 'Pile regolith over the habitat before it hits',

        cost: '6 crew-hours, +1.8 mSv, shielding is permanent',
        effects: { shieldInstalled: true, crewHoursLost: 6, doseAll: 1.8 },
        quality: 'acceptable',
        reasoning:
          'Excellent long-term thinking — a permanent 35% reduction — but it is six hours ' +
          'of EVA under a rising dose rate. The right sol to have done this was Sol 2.',
      },
    ],
    learning: {
      what: 'Only mass reduced your crew’s dose. Distance and timing did not.',
      why:
        'There are two different hazards. Galactic cosmic rays are a constant faint background ' +
        'that needs a great deal of mass to stop. Solar particle events are sudden spikes that ' +
        'a small shielded room handles well. Dose accumulates across the whole mission and can ' +
        'never be undone.',
      realScience:
        'The Radiation Assessment Detector on NASA’s Curiosity rover measured a surface dose ' +
        'equivalent of roughly 0.64 mSv per sol — several hundred times the background rate ' +
        'most people on Earth receive. NASA’s career limit for an astronaut is about 600 mSv.',
      sourceLabel: 'NASA — Curiosity RAD radiation measurements',
      sourceUrl: 'https://science.nasa.gov/mission/msl-curiosity/',
      tag: 'REAL',
    },
  },

  {
    id: 'sol6-food',
    sol: 6,
    title: 'FOOD GAP',
    category: 'Food Production',
    severity: 'warning',
    objective: 'Learn that food production has a lead time that cannot be shortened.',
    situation:
      'Food reserves are down to about two sols. If you planted a crop earlier and kept it ' +
      'powered and watered, it is close to harvest. If you did not, there is nothing in the ' +
      'greenhouse to harvest and no way to change that today.',
    telemetry: {
      'Food remaining': 'check your gauge',
      'Crew consumption': '9 meals/sol',
      'Harvest yield': '18 meals (if ready)',
      'Growth time from seed': '4 sols',
    },
    choices: [
      {
        id: 'greenhouse-high',
        label: 'Greenhouse to HIGH with full water',

        cost: '−18 L, −8 kWh, crop jumps forward',
        effects: { greenhouseBoost: 0.3, water: -18, battery: -8 },
        quality: 'optimal',
        reasoning:
          'The right move if a crop is growing. Light and water are the two inputs you ' +
          'control; the fourth sol of growth is the one you cannot buy.',
      },
      {
        id: 'ration-food',
        label: 'Ration meals to two per person',

        cost: '+3 meals, crew health −7, fatigue +12',
        effects: { food: 3, healthAll: -7, fatigueAll: 12 },
        quality: 'acceptable',
        reasoning:
          'Buys you one sol at a real cost in crew condition. Reasonable as a bridge to a ' +
          'harvest you can actually see coming — pointless if nothing is planted.',
      },
      {
        id: 'cut-comms',
        label: 'Cut comms and science to fund the greenhouse',

        cost: '−22 science, +4 kWh back into the crop',
        effects: { science: -22, greenhouseBoost: 0.18, battery: 4 },
        quality: 'acceptable',
        reasoning:
          'Mission-safe and score-costly. Science is the only load here whose loss hurts ' +
          'nothing but your final report, which makes it the correct first thing to cut.',
      },
    ],
    learning: {
      what: 'Food could not be produced on demand, no matter how much power you had.',
      why:
        'A crop converts light, water and nutrients into food over days. Extra energy speeds ' +
        'it up slightly, but biology sets the floor. The decision that fed your crew today ' +
        'was made four sols ago.',
      realScience:
        'NASA has grown lettuce, mizuna and other crops aboard the ISS in the Veggie and ' +
        'Advanced Plant Habitat facilities, which take weeks per harvest. Martian regolith ' +
        'also contains perchlorate salts that are toxic to humans and must be removed before ' +
        'the soil can be used for agriculture.',
      sourceLabel: 'NASA — Growing plants in space',
      sourceUrl: 'https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/',
      tag: 'REAL',
    },
  },

  {
    id: 'sol7-final',
    sol: 7,
    title: 'FINAL ASSESSMENT',
    category: 'Review',
    severity: 'info',
    objective: 'Consolidate: connect your own decisions back to the principles.',
    situation:
      'A message from Mission Control, sent eighteen minutes ago: "Commander, the resupply ' +
      'window opens tomorrow. Before then, stabilise your systems and file your report. ' +
      'We have been reading your telemetry. Well flown."',
    telemetry: {
      'Sols completed': '6 of 7',
      'Crew': 'check your crew panel',
      'Regolith shielding': 'installed or not — it is in your score',
      'Message age on arrival': '18 minutes',
    },
    choices: [
      {
        id: 'stabilise',
        label: 'Stabilise all systems and file the report',

        cost: 'Systems tidied, crew rested',
        effects: { science: 10, wear: -0.15, healthAll: 4 },
        quality: 'optimal',
        reasoning:
          'The right ending. Leave your buffers in a healthy middle: enough margin to absorb ' +
          'a surprise, not so much that you starved your own systems to hoard it.',
      },
      {
        id: 'push-science',
        label: 'Spend the last sol on science',

        cost: '+28 science, 3 crew-hours, +0.2 mSv, wear +8%',
        effects: { science: 28, crewHoursLost: 3, doseAll: 0.2, wear: 0.08 },
        quality: 'acceptable',
        reasoning:
          'A fair call if your margins are comfortable and your dose budget has room. ' +
          'A gamble if either is tight. Knowing which situation you are in is the skill.',
      },
    ],
    learning: {
      what: 'You commanded an outpost for seven sols under a hard energy constraint.',
      why:
        'Every sol you chose what to give up. That is what engineering a mission actually is: ' +
        'not finding a plan with no cost, but choosing which cost you can live with.',
      realScience:
        'Real mission planning works exactly this way. NASA’s baseline values for crew ' +
        'consumption, power, mass and radiation dose are traded against each other for years ' +
        'before a single component is built.',
      sourceLabel: 'NASA — Human exploration research',
      sourceUrl: 'https://www.nasa.gov/humans-in-space/',
      tag: 'REAL',
    },
  },
]

export const eventForSol = (sol: number): MissionEvent | undefined =>
  EVENTS.find((e) => e.sol === sol)
