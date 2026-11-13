# Two-minute demo run

Everything below was walked through in a real browser against the production
build on **seed 7**. Every button label, every number and every screen name is
what the build actually shows — not a plan for what it should show.

Seed 7 is used because its seven sols open with tension and keep contrast:

| Sol | Conditions | Event |
|----|----|----|
| 1 | Dust haze, **41 kWh** (array makes 52 on a clear sol) | Arrival & systems check |
| 2 | Exceptionally clear, array at 112% of nominal | Water margin |
| 3 | **Regional dust storm**, array at 15% — tau 5.8 | Dust storm |
| 4 | Nominal | Oxygen leak |
| 5 | Nominal | **Solar particle event** |
| 6 | Nominal | Food gap |
| 7 | Nominal | Final assessment |

The storm always falls on Sol 3 and the particle event on Sol 5, in every
seed — the sols are authored, the weather around them is not.

---

## Before you present

Five minutes beforehand, not five seconds:

1. **Build and serve.** `npm run build && npm run preview` → `http://localhost:4173/`.
   Do not demo from `npm run dev`; the dev server recompiles on the fly and
   can stall mid-click.
2. **Open two tabs on that address.**
   - **Tab A** — the live run. Leave it on the main menu.
   - **Tab B** — the ending. Play a full mission through on seed 7 ahead of
     time and leave it parked on the **mission results** screen. Two minutes
     is not enough to play seven sols, and the scoring screen is worth
     showing. Hit **↻ Replay this seed (7)** on it afterwards to reset.
3. **Load Tab A once and let it sit.** The first load pulls the 3D world
   chunk; after that it is cached and the outpost appears instantly.
4. **Type `7` into the seed box** on Tab A's menu, but do not press start.
5. **Full screen (F11), and close anything that can pop a notification.**

---

## The run — 2:00

Times are cumulative. The clicks take no time; the time is your talking.

### 0:00 – 0:12 · The premise
**Screen:** main menu.
> "Three astronauts, seven sols, and one solar array that cannot run
> everything at once. You are the commander — and Earth is 4 to 24 light
> minutes away, so nobody can tell you what to do in time."

Click **▶ Start mission**.

### 0:12 – 0:30 · The forecast drives the day
**Screen:** Sol 1 briefing. Point at **Solar output 41 kWh**.
> "Today there is dust in the sky. The array normally makes 52 kilowatt-hours;
> today it makes 41. Every decision after this follows from that one number."

Click **Open planning →**.

### 0:30 – 1:05 · The core loop — this is the demo
**Screen:** planning. This is the screen worth the most time.

1. **Show the refusal first.** Click **HIGH** on four or five subsystems. The
   primary button changes to **"Over budget by 20.2 kWh"** and goes dead.
   > "The game will not let you command a plan that physics cannot fund."
2. **Now show that even 'sensible' does not fit.** Set everything to
   **NOMINAL**. It is still **3.2 kWh over**.
   > "Running everything at normal is not an option today either. Something
   > has to give."
3. **Make the cut.** Set **Rover Charge → OFF** and **Comms & Science → LOW**.
   The button becomes **Confirm plan and go outside →**.
   > "The rover isn't going anywhere today, and the science link can run quiet.
   > That is the whole game: nothing is free, and you choose what to lose."
4. **Point at the live forecast row** — oxygen, water, meals, cabin CO₂,
   habitat temperature, each with sols remaining.
   > "It tells you what your plan will do before you commit to it."

Click **Confirm plan and go outside →**.

### 1:05 – 1:30 · The outpost in 3D
**Screen:** the Sol 1 event briefing opens over the live outpost. Read the
title, then click **Continue to the outpost →**.

Click once on the view to capture the mouse. Walk with **W A S D** (the arrow
keys work too), **Shift** to run, **Space** to jump.
> "0.38 g — you jump about two and a half times as high as on Earth."

Walk to the solar array and **hold E** until the ring fills.
> "Scheduling work is not doing it. The task sat marked with a circle until
> somebody actually walked out and did it."

**Do not wait for the EVA bar.** The field window is three real minutes, which
is longer than this whole demo.

### 1:30 – 1:45 · A decision with teeth
Click **END SOL →**, then step through **Debrief →**.
> "Every sol it shows what changed, what the other choice would have cost, and
> the real NASA figure behind it."

### 1:45 – 2:00 · The score
**Switch to Tab B** — the finished mission.
> "Seven sols later: a score out of 1000 across crew survival, life support,
> efficiency, radiation, decision quality, maintenance and science — plus
> badges for the things you got right. Three stars needs about 820, and you
> only get there by answering the mission events well, not just by surviving."

Close on the disclaimer line at the bottom of the menu if asked about NASA.

---

## If something goes wrong

| Symptom | What to do |
|---|---|
| Mouse will not capture | Click once directly on the 3D view. If the pointer is already locked, **Esc** releases it. |
| Primary button is dead | It now says why — read the label. It is over the power budget; drop a subsystem. |
| Walked somewhere boring | **P** opens planning from anywhere in the field. |
| Astronaut stuck on a wall | **Tab** switches to another crew member, who is standing elsewhere. |
| Lost the thread entirely | Tab B is already on the results screen. Go there and talk about scoring. |
| Hard failure | Reload the tab, type seed `7`, press start. The mission is deterministic — you get the identical sol back. |

## Resetting between runs

On the results screen: **↻ Replay this seed (7)** gives the same mission
again, **New mission** gives a fresh random one, **Main menu** goes back to
the start. All three have been run end to end; a second mission starts cleanly
at Sol 1 with no state carried over from the first.

## Questions you will get

- **"Is this NASA data?"** The planetary and crew figures are published values
  — 24 h 39 m sol, 3.721 m/s², 586 W/m² mean irradiance, 0.84 kg of oxygen per
  person per day, ~90% ISS water recovery. Every constant in the code is
  tagged `REAL`, `REAL~` or `GAME` so a learner can tell which is which. The
  project is not affiliated with or endorsed by NASA, and the disclaimer says
  so on the menu.
- **"How long is a real session?"** 15–25 minutes for all seven sols.
- **"Can you lose?"** Yes, in several different ways — starving the crew,
  letting the cabin air and heat go, or never maintaining anything. All three
  failure paths are covered by the test suite.
- **"Who is it for?"** Ages 10–16, three crew, seven sols.
