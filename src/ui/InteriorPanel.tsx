import { useEffect } from 'react'
import { C } from '../sim/constants'
import { FLOOR_AREA_M2, roomById, stationById, type Station } from '../data/habitat'
import { HABITAT_OPS, opBlockedReason, type HabitatOpId } from '../sim/habitatOps'
import { SAMPLE_INFO, type SampleKind } from '../world/iceField'
import { useGame } from '../store/useGame'
import { useField } from '../world/fieldState'

/**
 * The indoor half of the HUD.
 *
 * Outside, the prompt tells you what a structure is and whether there is a
 * shift open at it. Inside there are four kinds of station and they behave
 * differently — a shift is held, an operation is a single press with a price,
 * a readout is just numbers, and the suit rack takes you out — so the prompt
 * has to say which of those it is before the player presses anything.
 */

const MODE_LABEL = ['OFF', 'LOW', 'NOMINAL', 'HIGH']

/** The live numbers behind each readout station. */
function Readout({ id }: { id: string }) {
  const state = useGame((s) => s.state)
  const projection = useGame((s) => s.projection())
  const setPhase = useGame((s) => s.setPhase)
  const plan = useGame((s) => s.plan)
  const analyse = useGame((s) => s.analyseRack)

  if (id === 'planningConsole') {
    return (
      <div className="stack gap-s mt-s">
        <div className="small">
          Sol {state.sol} of {state.totalSols} · {state.crew.length} crew ·{' '}
          {Math.round(FLOOR_AREA_M2)} m² pressurised
        </div>
        <button className="btn primary" onClick={() => setPhase('planning')}>
          <span className="prompt-key">P</span> Open the sol plan
        </button>
      </div>
    )
  }

  if (id === 'commsTerminal') {
    return (
      <div className="stack gap-s mt-s small">
        <div className="row spread">
          <span className="body-dim">Comms</span>
          <span className="num">{MODE_LABEL[plan.modes.commsScience]}</span>
        </div>
        <div className="row spread">
          <span className="body-dim">Telemetry</span>
          <span className="num" style={{ color: projection.telemetry ? 'var(--ok)' : 'var(--danger)' }}>
            {projection.telemetry ? 'LINK UP' : 'NO LINK'}
          </span>
        </div>
        <div className="tiny body-dim">
          {projection.telemetry
            ? 'The forecast on the planning screen is arriving. One-way light time to Earth right now is between 4 and 24 minutes.'
            : 'Comms is unfunded, so the forecast is unavailable. The outpost keeps running — you just cannot see ahead.'}
        </div>
      </div>
    )
  }

  if (id === 'sampleRack') {
    const held = state.samplesHeld
    const worth = held.reduce((t, k) => t + SAMPLE_INFO[k].value, 0)
    const counts = held.reduce<Partial<Record<SampleKind, number>>>((m, k) => {
      m[k] = (m[k] ?? 0) + 1
      return m
    }, {})
    return (
      <div className="stack gap-s mt-s small">
        <div className="row spread">
          <span className="body-dim">In the rack</span>
          <span className="num">{held.length} / {C.ROVER_CARGO}</span>
        </div>
        {held.length === 0 ? (
          <div className="tiny body-dim">
            Empty. Rocks are collected out in the field — drive the rover to a flagged site and
            press F.
          </div>
        ) : (
          <>
            {(Object.keys(counts) as SampleKind[]).map((k) => (
              <div key={k} className="row spread tiny">
                <span>{SAMPLE_INFO[k].name}{counts[k]! > 1 ? ` ×${counts[k]}` : ''}</span>
                <span className="num">+{SAMPLE_INFO[k].value * counts[k]!}</span>
              </div>
            ))}
            <button className="btn primary" onClick={() => analyse()}>
              <span className="prompt-key">E</span> Analyse all — +{Math.round(worth)} science
            </button>
          </>
        )}
        <div className="row spread tiny body-dim">
          <span>Analysed so far</span>
          <span className="num">{state.samplesAnalysed}</span>
        </div>
      </div>
    )
  }

  if (id === 'microscope') {
    const beds = state.greenhouse.beds.filter((b) => b.crop).length
    return (
      <div className="stack gap-s mt-s small">
        <div className="row spread">
          <span className="body-dim">Science banked</span>
          <span className="num">{Math.round(state.stocks.science)} pts</span>
        </div>
        <div className="row spread">
          <span className="body-dim">Samples catalogued</span>
          <span className="num">{Math.round(state.stocks.science / 4)}</span>
        </div>
        <div className="row spread">
          <span className="body-dim">Beds under cultivation</span>
          <span className="num">{beds} / {state.greenhouse.beds.length}</span>
        </div>
      </div>
    )
  }

  if (id === 'pantry') {
    const burn = state.crew.length
    const sols = burn > 0 ? state.stocks.food / burn : 0
    return (
      <div className="stack gap-s mt-s small">
        <div className="row spread">
          <span className="body-dim">Meals on hand</span>
          <span className="num">{Math.round(state.stocks.food)}</span>
        </div>
        <div className="row spread">
          <span className="body-dim">Covers</span>
          <span className="num" style={{ color: sols < 2 ? 'var(--danger)' : undefined }}>
            {sols.toFixed(1)} sols
          </span>
        </div>
        <div className="row spread">
          <span className="body-dim">Grown here so far</span>
          <span className="num">{Math.round(state.greenhouse.totalMeals)} meals</span>
        </div>
      </div>
    )
  }

  if (id === 'eclssRack') {
    const co2 = state.co2 * 100
    return (
      <div className="stack gap-s mt-s small">
        <div className="row spread">
          <span className="body-dim">Cabin CO₂</span>
          <span className="num" style={{ color: co2 > 70 ? 'var(--danger)' : co2 > 45 ? 'var(--caution)' : 'var(--ok)' }}>
            {co2.toFixed(0)}% of limit
          </span>
        </div>
        <div className="row spread">
          <span className="body-dim">Cabin temperature</span>
          <span className="num" style={{ color: state.habTemp < 10 ? 'var(--danger)' : undefined }}>
            {state.habTemp.toFixed(1)} °C
          </span>
        </div>
        <div className="row spread">
          <span className="body-dim">Life support</span>
          <span className="num">{MODE_LABEL[plan.modes.lifeSupport]}</span>
        </div>
        <div className="row spread">
          <span className="body-dim">Equipment wear</span>
          <span className="num">{Math.round(state.wear * 100)}%</span>
        </div>
      </div>
    )
  }

  return null
}

function StationPrompt({ station }: { station: Station }) {
  const state = useGame((s) => s.state)
  const controlled = useGame((s) => s.controlled)
  const assignments = useGame((s) => s.assignments)
  const runOp = useGame((s) => s.runHabitatOp)
  const beginAirlock = useGame((s) => s.beginAirlock)
  const hold = useField((s) => s.holdProgress)

  const crewName = state.crew[controlled]?.name ?? ''

  // ---- a scheduled shift -------------------------------------------------
  if (station.kind === 'task' && station.task) {
    const open = assignments.some((a) => a.task === station.task && !a.fieldConfirmed)
    const mine = station.crewIndex === undefined || station.crewIndex === controlled
    const assignee = assignments.find((a) => a.task === station.task && !a.fieldConfirmed)
    return (
      <>
        {!open ? (
          <div className="mt-s tiny" style={{ color: 'var(--caution)' }}>
            No {station.task} shift scheduled today — assign it in planning (P)
          </div>
        ) : !mine ? (
          <div className="mt-s tiny" style={{ color: 'var(--caution)' }}>
            This is not {crewName}’s bunk. Switch crew with TAB — people sleep in their own quarters.
          </div>
        ) : (
          <>
            <div className="mt-s small">
              <span className="prompt-key">E</span>
              Hold to work the shift
              {assignee ? ` — ${state.crew[assignee.crewIndex]?.shortRole} assigned` : ''}
            </div>
            <div className="hold-bar"><div className="hold-fill" style={{ width: `${hold * 100}%` }} /></div>
          </>
        )}
      </>
    )
  }

  // ---- a habitat operation ----------------------------------------------
  if (station.kind === 'action' && station.op) {
    const op = station.op as HabitatOpId
    const def = HABITAT_OPS[op]
    const blocked = opBlockedReason(state, op)
    return (
      <div className="stack gap-s mt-s">
        <div className="small">
          <span className="body-dim">Costs</span> {def.cost}
        </div>
        <div className="small">
          <span className="body-dim">Buys</span> {def.gain}
        </div>
        {blocked ? (
          <div className="tiny" style={{ color: 'var(--caution)' }}>{blocked}</div>
        ) : (
          <button className="btn primary" onClick={() => runOp(op)}>
            <span className="prompt-key">E</span> {def.name}
          </button>
        )}
        <div className="tiny body-dim">{def.source}</div>
      </div>
    )
  }

  // ---- the way out -------------------------------------------------------
  if (station.kind === 'transit') {
    return (
      <div className="stack gap-s mt-s">
        <button className="btn primary" onClick={() => beginAirlock('out')}>
          <span className="prompt-key">E</span> Suit up and cycle out
        </button>
        <div className="tiny body-dim">
          The cycle costs {C.AIRLOCK_SECONDS.toFixed(1)}s of the EVA window each way. Inside, that
          window is not running at all.
        </div>
      </div>
    )
  }

  return <Readout id={station.id} />
}

/** The room you are standing in, named, with its one-line purpose. */
export function RoomChip() {
  const roomId = useField((s) => s.roomId)
  const room = roomId ? roomById(roomId as never) : undefined
  if (!room) return null
  return (
    <div className="room-chip">
      <span className="room-dot" style={{ background: room.tint }} />
      <span className="stack">
        <span className="room-name">{room.name}</span>
        <span className="tiny body-dim">{room.fn}</span>
      </span>
    </div>
  )
}

/** The station prompt, and the key handling that goes with it. */
export function InteriorPrompt() {
  const stationId = useField((s) => s.stationId)
  const station = stationId ? stationById(stationId) : undefined
  const state = useGame((s) => s.state)
  const runOp = useGame((s) => s.runHabitatOp)
  const beginAirlock = useGame((s) => s.beginAirlock)
  const setPhase = useGame((s) => s.setPhase)
  const analyseRack = useGame((s) => s.analyseRack)
  const airlockDir = useGame((s) => s.airlockDir)

  // Single-press stations are handled here rather than in the 3D controller,
  // because they are decisions rather than work: nothing about them needs a
  // frame loop, and keeping them here means the button and the key run the
  // very same code path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!station || airlockDir) return
      if (e.code !== 'KeyE') return
      if (station.kind === 'action' && station.op) {
        if (!opBlockedReason(state, station.op as HabitatOpId)) runOp(station.op as HabitatOpId)
      } else if (station.kind === 'transit') {
        beginAirlock('out')
      } else if (station.id === 'planningConsole') {
        setPhase('planning')
      } else if (station.id === 'sampleRack') {
        analyseRack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [station, state, runOp, beginAirlock, setPhase, analyseRack, airlockDir])

  if (!station) return null
  const room = roomById(station.room)!

  return (
    <div className="prompt">
      <div className="row gap-s" style={{ alignItems: 'baseline' }}>
        <span className="crew-dot" style={{ background: room.tint }} />
        <div className="h3">{station.name}</div>
      </div>
      <div className="tiny body-dim mt-s">{station.fn}</div>
      <StationPrompt station={station} />
    </div>
  )
}

/**
 * Everything the indoor HUD draws, behind one export.
 *
 * This module pulls in the whole deck plan — every room's prose, every
 * station — which is 20 kB that a player standing on the surface has no use
 * for. One export means App can load the lot lazily, next to the interior
 * scene it belongs with, instead of carrying it in the main chunk.
 */
export function InteriorHud() {
  return (
    <>
      <RoomChip />
      <InteriorPrompt />
    </>
  )
}
