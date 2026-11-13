import { Suspense, lazy, useEffect } from 'react'
import { C } from '../sim/constants'
import { structureById, STRUCTURES } from '../data/structures'
import { eventForSol } from '../data/events'
import { OBJECTIVES } from '../data/objectives'
import { useGame } from '../store/useGame'
import { useField } from '../world/fieldState'
import { bedStage, greenhouseSummary } from '../sim/greenhouse'
import { cropById } from '../data/crops'
import { GaugeRow, HabitatStrip } from './Gauges'
import { AirlockOverlay } from './Airlock'


/**
 * The indoor HUD travels with the deck plan, so it loads with the interior
 * rather than with the menu. The airlock cycle covers the download: by the
 * time the hatch opens the chunk has long since landed.
 */
const InteriorHud = lazy(() =>
  import('./InteriorPanel').then((m) => ({ default: m.InteriorHud })))

/**
 * The rover's instrument panel reads the ice field, which carries the whole
 * noise model with it. Loaded with the expedition rather than with the menu.
 */
const ExpeditionHud = lazy(() =>
  import('./ExpeditionHud').then((m) => ({ default: m.ExpeditionHud })))

const ZONE_LABEL: Record<string, string> = {
  shelter: 'SHIELDED CORE', habitat: 'HABITAT', rover: 'ROVER', eva: 'EVA — SURFACE',
}

export function Hud() {
  const state = useGame((s) => s.state)
  const phase = useGame((s) => s.phase)
  const controlled = useGame((s) => s.controlled)
  const setControlled = useGame((s) => s.setControlled)
  const setPhase = useGame((s) => s.setPhase)
  const toggleView = useGame((s) => s.toggleView)
  const firstPerson = useGame((s) => s.firstPerson)
  const selectedCrop = useGame((s) => s.selectedCrop)
  const cycleSelectedCrop = useGame((s) => s.cycleSelectedCrop)
  const harvestCrop = useGame((s) => s.harvestCrop)
  const endSol = useGame((s) => s.endSol)
  const assignments = useGame((s) => s.assignments)
  const outstanding = useGame((s) => s.fieldWorkOutstanding())
  const evaLeft = useGame((s) => s.evaSecondsLeft)
  const plantCrop = useGame((s) => s.plantCrop)
  const inside = useGame((s) => s.inside)
  const airlockDir = useGame((s) => s.airlockDir)
  const beginAirlock = useGame((s) => s.beginAirlock)
  const driving = useGame((s) => s.driving)
  const boardRover = useGame((s) => s.boardRover)

  const focusedId = useField((s) => s.focusedId)
  const holdProgress = useField((s) => s.holdProgress)
  const locked = useField((s) => s.pointerLocked)
  const nearRover = useField((s) => s.nearRover)

  const focused = focusedId ? structureById(focusedId) : undefined
  const openTask = focused?.task && assignments.some((a) => a.task === focused.task && !a.fieldConfirmed)
  const event = eventForSol(state.sol)
  const member = state.crew[controlled]
  const rack = greenhouseSummary(state.greenhouse)

  // Keyboard shortcuts that belong to the HUD rather than the 3D controller.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'fieldOps') return
      if (e.code === 'Tab') {
        e.preventDefault()
        setControlled((controlled + 1) % state.crew.length)
      }
      if (e.code === 'KeyP') setPhase('planning')
      if (e.code === 'KeyV') toggleView()
      if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock()
      if (e.code === 'KeyH' && focused?.id === 'greenhouse') {
        // One key for the rack: bring in anything ripe first, otherwise sow.
        if (!harvestCrop()) plantCrop()
      }
      if (e.code === 'KeyC' && focused?.id === 'greenhouse') cycleSelectedCrop()
      // Outside, the habitat is the one structure with no shift at it, so E
      // there is free to mean the thing it obviously means.
      if (e.code === 'KeyE' && !inside && !airlockDir && focused?.id === 'habitat') {
        beginAirlock('in')
      }
      // Climbing aboard takes priority over any structure prompt: if you are
      // standing at the rover, E means the rover.
      if (e.code === 'KeyE' && !inside && !driving && nearRover) boardRover()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, controlled, state.crew.length, setControlled, setPhase, toggleView, focused,
      plantCrop, harvestCrop, cycleSelectedCrop])

  if (phase !== 'fieldOps') return null

  const wxCls = state.env.spe ? 'wx spe' : state.env.dustStorm ? 'wx storm' : 'wx'

  return (
    <div className="overlay">
      <div className="hud-top">
        <div className="stack gap-s">
          <div className="sol-pill">
            <div className="label">Field Operations</div>
            <div className="sol-num num">SOL {state.sol} / {state.totalSols}</div>
            <div className={wxCls}>{state.env.headline}</div>
          </div>
          <div className="objectives">
            <div className="label">Today</div>
            <ul>
              <li><span>{event ? '◆' : '·'}</span><span>{event?.objective ?? 'Keep the outpost running.'}</span></li>
              {/* The nearest mission objective, so the long game is visible
                  from the field rather than only on the planning screen. */}
              {(() => {
                const open = OBJECTIVES
                  .filter((o) => !state.objectivesMet.includes(o.id))
                  .sort((a, b) => b.progress(state) - a.progress(state))[0]
                if (!open) {
                  return <li><span style={{ color: 'var(--ok)' }}>✓</span>
                    <span style={{ color: 'var(--ok)' }}>Every mission objective met.</span></li>
                }
                return (
                  <li title={open.why}>
                    <span>◇</span>
                    <span>
                      {open.name} — {Math.round(open.progress(state) * 100)}%
                    </span>
                  </li>
                )
              })()}
              {assignments.map((a, i) => (
                <li key={i}>
                  <span>{a.fieldConfirmed ? '✓' : '○'}</span>
                  <span style={{ color: a.fieldConfirmed ? 'var(--ok)' : undefined }}>
                    {a.task} — {state.crew[a.crewIndex]?.shortRole}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <GaugeRow />
        <HabitatStrip />

        <div className="crew-strip">
          {state.crew.map((m, i) => (
            <button
              key={m.name}
              className={`crew-chip ${i === controlled ? 'active' : ''}`}
              onClick={() => setControlled(i)}
            >
              <span className="crew-dot" style={{ background: m.color }} />
              <span className="crew-meta">
                <span className="crew-name">{m.shortRole} {m.name}</span>
                <span className="crew-stats">
                  <span>♥ {Math.round(m.health)}</span>
                  <span>⚡ {Math.round(100 - m.fatigue)}</span>
                  <span>☢ {m.dose.toFixed(2)}</span>
                </span>
              </span>
            </button>
          ))}
          <div className="crew-chip" style={{ justifyContent: 'center' }}>
            <span className="tiny body-dim">
              ZONE: {inside ? 'HABITAT INTERIOR' : ZONE_LABEL[member?.zone ?? 'habitat']}
            </span>
          </div>
        </div>
      </div>

      {inside && (
        <Suspense fallback={null}>
          <InteriorHud />
        </Suspense>
      )}
      <AirlockOverlay />
      {driving && (
        <Suspense fallback={null}>
          <ExpeditionHud />
        </Suspense>
      )}

      {!locked && !driving && (
        <div className="lock-hint">
          <div className="h3">Click to look around</div>
          <div className="small body-dim mt-s">
            WASD to walk · E to {inside ? 'use a station' : 'work'} · Esc to release the mouse
          </div>
        </div>
      )}

      {!inside && !driving && nearRover && (
        <div className="prompt">
          <div className="h3">Pressurised Rover</div>
          <div className="tiny body-dim mt-s">
            {state.roverKwh > 0
              ? `${state.roverKwh.toFixed(1)} kWh aboard — about ` +
                `${Math.round((state.roverKwh / C.ROVER_KWH_PER_100M) * 100)} m of driving`
              : 'Flat. Give roverCharge power in the plan and it will be charged overnight.'}
          </div>
          <div className="mt-s small">
            <span className="prompt-key">E</span>
            Climb aboard and drive out to prospect
          </div>
        </div>
      )}

      {!inside && !driving && !nearRover && focused && (
        <div className="prompt">
          <div className="h3">{focused.name}</div>
          <div className="tiny body-dim mt-s">{focused.fn}</div>
          {openTask && focused.task ? (
            <>
              <div className="mt-s small">
                <span className="prompt-key">E</span>
                Hold to {focused.task} — {state.crew[controlled]?.shortRole} on site
              </div>
              <div className="hold-bar">
                <div className="hold-fill" style={{ width: `${holdProgress * 100}%` }} />
              </div>
            </>
          ) : focused.id === 'greenhouse' ? (
            <div className="mt-s small stack gap-s">
              <div>
                <span className="prompt-key">H</span>
                {rack.ready > 0
                  ? `Harvest ${rack.ready} ripe bed${rack.ready === 1 ? '' : 's'} ` +
                    `(${Math.round(rack.mealsReady)} meals)`
                  : rack.planted < state.greenhouse.beds.length
                    ? `Sow ${cropById(selectedCrop).name.toLowerCase()} in the next free bed`
                    : 'Every bed is planted'}
              </div>
              <div>
                <span className="prompt-key">C</span>
                Next sowing: {cropById(selectedCrop).name} ·{' '}
                {cropById(selectedCrop).growSols} sols ·{' '}
                {cropById(selectedCrop).meals} meals ·{' '}
                {cropById(selectedCrop).waterPerSol} L/sol
                {cropById(selectedCrop).morale > 0
                  ? ` · ♥ +${cropById(selectedCrop).morale} crew`
                  : ''}
              </div>
              <div className="tiny body-dim">
                {state.greenhouse.beds.map((b, i) => {
                  const st = bedStage(b)
                  const mark = st === 'empty' ? '·' : st === 'wilted' ? '×'
                    : st === 'ready' ? '●' : '○'
                  return (
                    <span key={i} style={{ marginRight: 9 }}>
                      {mark} {i + 1}
                      {b.crop ? ` ${cropById(b.crop).name.split(' ').pop()}` : ''}
                      {st !== 'empty' && st !== 'wilted' ? ` ${Math.round(b.progress * 100)}%` : ''}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : focused.id === 'habitat' ? (
            <div className="mt-s small">
              <span className="prompt-key">E</span>
              Cycle the airlock and go inside
            </div>
          ) : focused.task ? (
            <div className="mt-s tiny" style={{ color: 'var(--caution)' }}>
              Not scheduled today — assign it in planning (P)
            </div>
          ) : null}
        </div>
      )}

      <div className="hud-bottom">
        <div className="row gap-s">
          <button className="btn ghost" onClick={() => setPhase('planning')}>
            <span className="prompt-key">P</span> Planning
          </button>
          <button className="btn ghost" onClick={() => setControlled((controlled + 1) % state.crew.length)}>
            <span className="prompt-key">TAB</span> Switch crew
          </button>
          <button className="btn ghost" onClick={toggleView}>
            <span className="prompt-key">V</span> {firstPerson ? 'Third person' : 'First person'}
          </button>
        </div>

        <div className="eva-bar">
          <div className="row spread tiny body-dim" style={{ marginBottom: 4 }}>
            <span>{inside ? 'EVA WINDOW — HELD' : 'EVA WINDOW'}</span>
            <span className="num">{Math.ceil(evaLeft)}s</span>
          </div>
          <div className={`eva-track ${inside ? 'held' : ''}`}>
            <div className="eva-fill" style={{ width: `${(evaLeft / C.EVA_SECONDS) * 100}%` }} />
          </div>
        </div>

        <button
          className="btn primary lg"
          onClick={endSol}
          title={outstanding ? 'Some scheduled field work is still undone' : 'Resolve this sol'}
        >
          END SOL {outstanding ? '⚠' : '→'}
        </button>
      </div>
    </div>
  )
}

/** Small legend used on the briefing screen so the outpost map reads. */
export function StructureLegend() {
  return (
    <div className="grid-2">
      {STRUCTURES.filter((s) => s.id !== 'breach').map((s) => (
        <div key={s.id} className="row gap-s small">
          <span className="crew-dot" style={{ background: s.tint }} />
          <span>{s.name}</span>
        </div>
      ))}
    </div>
  )
}
