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

## The four challenge pillars, as real mechanics

| Pillar | How it works |
|---|---|
| **Life support** | O₂ and water are produced by machines that eat power; stop one and a countdown starts |
| **Radiation shielding** | Cumulative per-crew dose in mSv, rate by zone, regolith shielding as a crew-hour investment, a Sol 5 particle event you must shelter from |
| **Power** | A hard per-sol kWh budget with discrete modes and graceful brownout |
| **Food production** | The greenhouse needs power, water **and four sols of growth time** |

## Controls

| Key | Action |
|---|---|
| `W A S D` | Walk (camera-relative) |
| Mouse | Look — click the view once to capture the pointer |
| `Shift` | Run · `Space` Jump (0.38 g, noticeably floaty) |
| `E` | Hold to carry out scheduled work at a structure |
| `H` | Plant or harvest, at the greenhouse |
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
src/world/        3D — globe, terrain, structures, astronaut, camera rig, sky, dust
  marsTopography  the height field and albedo: lat/lon in, elevation out. No three, no React.
  MarsGlobe       the orbital planet, its markers and the descent camera move
src/ui/           HUD, orbit panel, planning, event modal, resolution, debrief, results, science
src/data/         the 7 sols, the 8 structures, the Mars landmarks and the 6 landing sites
test/             sim · world · globe · flow · balance
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

`npm test` runs five suites, 99 checks, no browser required:

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
- **balance** — three stars is reachable but has to be earned, and a careless run cannot
  reach two.

## Science sources

Mars Fact Sheet (NSSDC) · Curiosity RAD surface dose · MOXIE oxygen from CO₂ · ISS ECLSS
water recovery · Opportunity and the 2018 global dust storm · Veggie and the Advanced Plant
Habitat · NASA career dose limits. Each is linked from the Mission Science panel and from the
learning card of the event it belongs to.

Globe topography: MOLA (Mars Orbiter Laser Altimeter, Mars Global Surveyor) elevations quoted
against the areoid datum; landing sites from NASA's own site-selection studies and from the
landed record — Viking 2, Opportunity, Curiosity, InSight, Zhurong and Perseverance.

## Disclaimer

This is an educational simulation. Its resource values and mission calculations are simplified
and are not a flight-certified engineering model. This project is not affiliated with, endorsed
by, or validated by NASA. All crew members are fictional.
