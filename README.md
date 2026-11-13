# Junior Astronaut — Mars Outpost Trainer

A 3D browser game for the NASA-themed challenge *Build a Junior Astronaut Mission Trainer*.

You are the Mission Commander of a three-person Mars outpost. Earth is 4–24 light-minutes
away, so nobody can tell you what to do in time. First you choose where on Mars to land —
and then you keep your crew alive for seven sols by deciding, every single sol,
**where the power goes and who does the work.**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm test           # 99 checks across five suites
```

Individual suites: `test:sim`, `test:world`, `test:globe`, `test:flow`, `test:balance`.

Desktop browser with WebGL. No backend, no accounts, no network calls at runtime.

## Where you land is the first decision

The mission opens in orbit, over a Mars globe built from published topography. Six candidate
landing sites are marked — all six are places NASA has actually studied, at their real
coordinates:

| Site | Latitude | Why | What it costs |
|---|---|---|---|
| **Jezero Crater** | 18.4°N | Preserved river delta; strong sun | Deep ice — no easy water |
| **Arcadia Planitia** | 46.7°N | Clean ice 1–2 m down | −28% solar, nights 14 °C colder |
| **Gale Crater** | 5.4°S | Best sunlight on the list; mild nights | Almost no ice, and a dust trap |
| **Utopia Planitia** | 46.7°N | Buried ice sheet the volume of Lake Superior | High-latitude solar penalty |
| **Hellas Planitia** | 42.4°S | Deepest basin — thickest air on Mars | Where global dust storms are born |
| **Elysium Planitia** | 4.5°N | Flattest, safest, most predictable plain | Little ice, little to study |

The choice is not a skin. The site multiplies array output, ice yield per rover run, science
per downlink and dust severity, and shifts the nightly low — so it changes the power budget
you are handed on Sol 1 and every sol after. At Arcadia the *default* plan is already over
budget before you touch anything. A test asserts that no site is better than another on every
axis, so there is no correct answer to look up.

### How honest the globe is

- **Real:** every landmark's coordinates, diameter and relief — Olympus Mons at 18.65°N
  226.2°E rising 21.9 km, Valles Marineris as a 4000 km rift up to 7 km deep, Hellas 8.2 km
  below datum, the crustal dichotomy that puts the northern lowlands ~4.5 km under the
  southern highlands, and the albedo pattern that makes Syrtis Major dark and Arabia Terra
  bright. Mostly MOLA-derived figures, listed with sources in `src/data/marsFeatures.ts`.
- **Procedural:** the metre-by-metre relief *between* those landmarks. A real MOLA raster is
  tens to hundreds of megabytes — larger than this entire game — so the globe places the
  real landmarks correctly and fills the gaps with deterministic noise, weighted so the old
  southern crust is cratered and the resurfaced northern plains are smooth.
  `src/world/marsTopography.ts` documents the one function to change if a real raster is ever
  shipped.
- **Exaggerated, and labelled as such:** height is drawn 22×. Mars's full relief is under 1%
  of its radius; true to scale the planet is smoother than a billiard ball and Olympus Mons is
  invisible. The orbit panel says so on screen, because that is itself a surprising fact.

The globe test suite checks this rather than trusting it: that Olympus is the high point and
Hellas the low one, that the rift is a trough along its whole length and not just at a nominal
centre, that the north sits kilometres below the south, that elevation never leaves the real
−8.2 … +21.9 km envelope, and that the whole field is deterministic — you land on the planet
you picked a site from.

## The mechanic that makes it a trainer

Most space STEM content shows four separate bars. This gives you **two shared budgets that
everything competes for** — which is what a real mission constraint feels like.

**Power — kWh per sol.** The solar array, life support, thermal, the oxygen generator, the
water recycler, the greenhouse, comms and the rover all draw from one number. On Sol 3 a dust
storm cuts generation from ~52 kWh to ~8 kWh and you *must* give something up. Life support
and thermal cannot be switched off — only throttled, with a cost.

**Crew-hours — 18 assignable per sol.** Three astronauts, 8 working hours each, minus 2 hours
each for exercise and medical. Cleaning the array costs 3. A hull repair costs 4. Piling
regolith over the habitat for permanent radiation shielding costs 6 — and only pays off later.

Every sol has a moment where you cannot have everything, and the debrief tells you exactly
what the alternative would have cost.

## The challenge pillars, as real mechanics

| Pillar | How it works |
|---|---|
| **Life support** | O₂ and water are produced by machines that eat power; stop one and a countdown starts |
| **Radiation shielding** | Cumulative per-crew dose in mSv, rate by zone, regolith shielding as a crew-hour investment, a Sol 5 particle event you must shelter from |
| **Power** | A hard per-sol kWh budget with discrete modes and graceful brownout — plus a fission unit that has to be started before it is needed |
| **Food production** | Four hydroponic beds, four crops, one shared environment of temperature, humidity, CO₂ and nutrients |
| **Water from the ground** | A real subsurface ice field you have to drive out and sound for |
| **The habitat itself** | Thirteen rooms you walk around, where three of the shifts you schedule actually happen |
| **Progression** | Science buys technology, technology unlocks construction, construction makes the next sols easier |

## Three places, three scales

The trainer has three scenes and only ever mounts one.

**Orbit** is the planet: a MOLA-derived height field with Olympus Mons, Valles Marineris and
the crustal dichotomy where they really are, and six landing sites with different solar, ice,
night temperature, dust and science ratings. What you pick here changes the simulation for the
whole mission.

**The surface** is a 150 m bowl around the outpost. Eight structures, a drivable pressurised
rover, a ground-penetrating radar, ice lenses that work out, and flagged rocks worth carrying
home. The rover holds exactly the energy the sol's plan charged into it, and driving and
drilling compete for it.

**The habitat interior** is 160 m² across thirteen rooms, entered by cycling the airlock. The
plan follows NASA's Mars Dune Alpha — the 3D-printed habitat used for the CHAPEA analog
missions, in which a crew of four lived for 378 days. That is also where this trainer's crew of
four comes from. Command and comms, laboratory, galley and wardroom, storage with the ECLSS
rack, medical bay, four private crew quarters, hygiene, the rover dock and the airlock.

Every wall, doorway and collision in the interior is generated from the rectangles in
`src/data/habitat.ts`, so the floor plan and the thing you walk around cannot drift apart. The
test suite flood-fills the deck plan using the same collision solver the game moves the player
with, and proves every room is reachable through a door.

## The expedition

Plan a rover charge → drive out → watch the radar → stop when the return clears the threshold →
drill → collect the flagged rocks → drive home → analyse them at the laboratory bench.

Subsurface ice on Mars is patchy: Odyssey mapped hydrogen within a metre of the surface over
most of the planet poleward of about 45°, Phoenix dug into solid ice at 68° N, and near the
equator it is deeper and rarer. The bowl reproduces the *shape* of that problem rather than
pretending to reproduce a particular square kilometre of it — and the site you chose from
orbit moves the whole field. Arcadia: 44% of its ground drillable. Jezero: 21%. Gale: 5%.

A hole costs energy whether it finds anything or not. A lens is a finite volume and works out.
A rock in a bag is worth nothing until it reaches the bench.

## Research, construction and objectives

Science used to be a score. It now buys a seven-technology tree, every entry a programme that
is really being worked on and every one of them moving a number in the simulation — a closed
Sabatier loop, a MOXIE scale-up, an electrodynamic dust shield, perchlorate remediation, the
storm shelter protocol, autonomous drilling, and regolith sintering, which unlocks building.

**Construction costs energy and crew-hours and no materials at all.** That is not a
simplification: in-situ resource utilisation means the feedstock is the ground you are standing
on, so what a structure really costs on Mars is the power to sinter it and the shift to put it
up.

Six mission objectives sit above all of it, each paying science the first time it is met.
Surviving seven sols is the floor, not the game.

## Ready-made 3D models

Everything is built from primitives in code: the repository clones small, every silhouette is
tuned against the thing it represents, and there is no licence to track. But a real NASA model
is better than a good approximation of one, so there are slots for them.

Drop a `.glb` into `public/models/`, add one line to `src/world/models.ts`, and that object
switches over. A missing or broken file falls back to the procedural mesh automatically — a bad
model can never take the scene down. See `public/models/README.md` for where NASA publishes
them and why you should decimate first.

## Controls

| Key | Action |
|---|---|
| `W A S D` | Walk (camera-relative) |
| Mouse | Look — click the view once to capture the pointer |
| `Shift` | Run · `Space` Jump (0.38 g, noticeably floaty) |
| `E` | Hold to carry out scheduled work at a structure or an indoor station |
| `E` | At the habitat: cycle the airlock. At the rover: climb aboard. At the suit rack: go back out |
| `H` | Plant or harvest, at the greenhouse · `C` cycle which crop |
| `W S` / `A D` | In the rover: throttle and steer |
| `E` | In the rover, stationary: hold to drill · `F` collect a flagged sample · `Q` climb out |
| `V` | Switch between first-person and over-the-shoulder view |
| `Tab` | Switch controlled astronaut · `P` Planning · `Esc` Release mouse |

## How a mission runs

Orbit (choose a site) → descent → then, for each of seven sols:
Briefing → Planning → Field Ops (3D) → Resolution → Debrief

**Planning is not doing.** A task shows ○ until you walk to the structure and hold E.
An unperformed repair does nothing. This is deliberate.

## Architecture

```
src/sim/          pure TypeScript model — no React, no three, no Date.now(), no Math.random()
src/store/        one zustand store: the single source of truth
src/world/        3D — globe, terrain, structures, astronaut, rover, habitat interior, sky
  marsTopography  the height field and albedo: lat/lon in, elevation out. No three, no React.
  MarsGlobe       the orbital planet, its markers and the descent camera move
  Interior        the habitat, generated entirely from the deck plan in data/habitat.ts
  Expedition      the rover controller, the radar and the field markers
  iceField        subsurface ice, deposits and sample sites. Pure: no three, no React.
  valueNoise      the noise primitives, split out so the ice field does not drag
                  the terrain model into the main bundle
  ModelSlot       the .glb slot, with the procedural mesh as its fallback
src/ui/           HUD, orbit panel, planning, interior panel, rover instruments, research,
                  event modal, resolution, debrief, results, science
src/data/         the 7 sols, the 9 structures, the Mars landmarks, the 6 landing sites,
                  the 4 crops, the 13-room deck plan, the technology tree, the objectives
test/             sim · world · globe · flow · crops · habitat · power · field · research · balance
```

`src/sim/` may not import React, three, or the store, and `src/world/marsTopography.ts`
may not import three either — which is why the orbit panel can quote the relief under a
marker without dragging a 33k-vertex planet onto the menu screen. Given a state and a set of decisions it
returns a new state. That rule is what makes the mission reproducible from a seed, lets the
whole campaign be tested headlessly, and guarantees the HUD and the simulation can never
disagree about a number.

## Simulation notes

- **Deterministic.** Same seed + same decisions → identical outcome. One seeded `mulberry32`
  stream; the cursor is part of saved state. Share a seed, compare commanders.
- **Real units.** `kg O₂`, `L`, `kWh`, `meals`, `mSv` — never a bare 0–100 bar, because a
  unitless number teaches nothing.
- **Tagged constants.** Every value in `src/sim/constants.ts` is marked `REAL`, `REAL~` or
  `GAME`, and the Mission Science panel surfaces the distinction.
- **Live forecast.** The planning screen shows sols-remaining per resource, updating as you
  drag. Seeing the consequence *before* committing is what makes it a trainer.
- **Per-sol checkpoints.** Retry a sol without losing the mission.
- **No astronaut dies on screen.** Critical failure is a medical emergency and a mission abort
  with partial score. This is a product for schools.

## Test output

`npm test` runs ten suites, no browser required. Several of them have already caught real
design faults rather than typos — a greenhouse death spiral, bunk doors narrower than the
crew, an ice field that was two thirds drillable, a day of prospecting worth five times the
crew's water, and a dehumidifier ladder that had quietly stopped matching its own comment:

- **sim** — determinism, 400 fuzzed playthroughs for NaN and negative stocks, the storm
  forcing a brownout, life support never shed below LOW, dose by zone, crop lead time in both
  directions, score bounds.
- **world** — every structure pad is flat, terrain is finite, bounded and deterministic.
- **globe** — spherical geometry round-trips, the landmarks are where they belong, the
  dichotomy is real, albedo is in range, and the landing site actually reaches the simulation
  (a high-latitude site must generate less power; an ice-rich one must deliver a bigger ice
  run; Sol 3 must remain a crisis at all six sites).
- **flow** — menu → orbit → descent → surface, backing out commits nothing, and all six
  sites play seven sols without the forecast going non-finite.
- **crops** — no crop dominates another, growth takes about as long as advertised, light is a
  hard gate, humidity decides how many beds the rack can carry, and the forecast tells the truth.
- **habitat** — no two rooms overlap, every door connects two rooms, every station is where it
  claims to be, and a flood fill from the airlock proves every room is reachable on foot. No
  habitat operation is ever free.
- **power** — the fission unit starts cold, costs a shift, a dose and a block of battery,
  delivers from the next sol, and on the storm sol of the reference seed it is the larger of
  the two sources. It cannot carry the outpost alone.
- **field** — the bowl is a search problem at every landing site, the radar reads the same
  field the drill works, a lens works out, a dry hole still costs the energy, and a perfect sol
  of drilling is worth having without replacing the recycler.
- **research** — no technology is inert: if one is added that moves no number in the
  simulation, the suite fails. Four effects are additionally checked end to end through a
  resolved sol.
- **balance** — three stars is reachable but has to be earned, and a careless run cannot
  reach two.

## Science sources

Mars Fact Sheet (NSSDC) · Curiosity RAD surface dose · MOXIE oxygen from CO₂ · ISS ECLSS
water recovery · Opportunity and the 2018 global dust storm · Veggie and the Advanced Plant
Habitat · NASA career dose limits. Each is linked from the Mission Science panel and from the
learning card of the event it belongs to.

Habitat: NASA's Mars Dune Alpha and the CHAPEA analog missions · ISS and analog crews on the
shared meal as a countermeasure. Power: the Kilopower project and its KRUSTY full-power test,
2018. Ice: Mars Odyssey neutron spectrometer, Phoenix, and NASA's SWIM subsurface ice mapping.
Geology: Curiosity's sulfate-bearing unit on Mount Sharp and Perseverance's olivine-rich floor
unit in Jezero. Technology: the ISS Sabatier reactor, MOXIE, the electrodynamic dust shield,
Phoenix's perchlorate detection, and regolith sintering for construction.

Globe topography: MOLA (Mars Orbiter Laser Altimeter, Mars Global Surveyor) elevations quoted
against the areoid datum; landing sites from NASA's own site-selection studies and from the
landed record — Viking 2, Opportunity, Curiosity, InSight, Zhurong and Perseverance.

## Disclaimer

This is an educational simulation. Its resource values and mission calculations are simplified
and are not a flight-certified engineering model. This project is not affiliated with, endorsed
by, or validated by NASA. All crew members are fictional.
