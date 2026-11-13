# Junior Astronaut — Mars Outpost Trainer

A 3D browser game for the NASA-themed challenge *Build a Junior Astronaut Mission Trainer*.

You are the Mission Commander of a three-person Mars outpost. Earth is 4–24 light-minutes
away, so nobody can tell you what to do in time. Keep your crew alive for seven sols by
deciding, every single sol, **where the power goes and who does the work.**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run test:sim   # 17 deterministic simulation checks
```

Desktop browser with WebGL. No backend, no accounts, no network calls at runtime.

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
| `Tab` | Switch controlled astronaut · `P` Planning · `Esc` Release mouse |

## How a sol runs

Briefing → Planning → Field Ops (3D) → Resolution → Debrief → next sol

**Planning is not doing.** A task shows ○ until you walk to the structure and hold E.
An unperformed repair does nothing. This is deliberate.

## Architecture

```
src/sim/        pure TypeScript model — no React, no three, no Date.now(), no Math.random()
src/store/      one zustand store: the single source of truth
src/world/      3D — terrain, structures, astronaut, camera rig, sky, dust
src/ui/         HUD, planning, event modal, resolution, debrief, results, science
src/data/       the 7 sols and the 8 structures, as data
test/sim.test.ts  deterministic + fuzz + mechanics checks
```

`src/sim/` may not import React, three, or the store. Given a state and a set of decisions it
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

`npm run test:sim` covers determinism, 400 fuzzed playthroughs for NaN and negative stocks,
the storm forcing a brownout, life support never being shed below LOW, dose accumulating by
zone, crop lead time in both directions, and score bounds.

## Science sources

Mars Fact Sheet (NSSDC) · Curiosity RAD surface dose · MOXIE oxygen from CO₂ · ISS ECLSS
water recovery · Opportunity and the 2018 global dust storm · Veggie and the Advanced Plant
Habitat · NASA career dose limits. Each is linked from the Mission Science panel and from the
learning card of the event it belongs to.

## Disclaimer

This is an educational simulation. Its resource values and mission calculations are simplified
and are not a flight-certified engineering model. This project is not affiliated with, endorsed
by, or validated by NASA. All crew members are fictional.
