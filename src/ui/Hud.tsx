import { useEffect } from 'react'
import { C } from '../sim/constants'
import { structureById, STRUCTURES } from '../data/structures'
import { eventForSol } from '../data/events'
import { useGame } from '../store/useGame'
import { useField } from '../world/fieldState'
import { GaugeRow, HabitatStrip } from './Gauges'

const ZONE_LABEL: Record<string, string> = {
  shelter: 'SHIELDED CORE', habitat: 'HABITAT', rover: 'ROVER', eva: 'EVA — SURFACE',
}

export function Hud() {
  const state = useGame((s) => s.state)
  const phase = useGame((s) => s.phase)
  const controlled = useGame((s) => s.controlled)
  const setControlled = useGame((s) => s.setControlled)
  const setPhase = useGame((s) => s.setPhase)
  const endSol = useGame((s) => s.endSol)
  const assignments = useGame((s) => s.assignments)
  const outstanding = useGame((s) => s.fieldWorkOutstanding())
  const evaLeft = useGame((s) => s.evaSecondsLeft)
  const plantCrop = useGame((s) => s.plantCrop)

  const focusedId = useField((s) => s.focusedId)
  const holdProgress = useField((s) => s.holdProgress)
  const locked = useField((s) => s.pointerLocked)

  const focused = focusedId ? structureById(focusedId) : undefined
  const openTask = focused?.task && assignments.some((a) => a.task === focused.task && !a.fieldConfirmed)
  const event = eventForSol(state.sol)
  const member = state.crew[controlled]

  // Keyboard shortcuts that belong to the HUD rather than the 3D controller.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'fieldOps') return
      if (e.code === 'Tab') {
        e.preventDefault()
        setControlled((controlled + 1) % state.crew.length)
      }
      if (e.code === 'KeyP') setPhase('planning')
      if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock()
      if (e.code === 'KeyH' && focused?.id === 'greenhouse') {
        plantCrop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, controlled, state.crew.length, setControlled, setPhase, focused, plantCrop])

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
            <span className="tiny body-dim">ZONE: {ZONE_LABEL[member?.zone ?? 'habitat']}</span>
          </div>
        </div>
      </div>

      {!locked && (
        <div className="lock-hint">
          <div className="h3">Click to look around</div>
          <div className="small body-dim mt-s">WASD to walk · E to work · Esc to release the mouse</div>
        </div>
      )}

      {focused && (
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
            <div className="mt-s small">
              <span className="prompt-key">H</span>
              {state.greenhouse.stage === 'ready' ? 'Harvest the crop'
                : state.greenhouse.stage === 'empty' || state.greenhouse.stage === 'wilted' ? 'Plant a crop'
                : `Crop is ${state.greenhouse.stage} — ${Math.round(state.greenhouse.progress * 100)}% grown`}
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
        </div>

        <div className="eva-bar">
          <div className="row spread tiny body-dim" style={{ marginBottom: 4 }}>
            <span>EVA WINDOW</span>
            <span className="num">{Math.ceil(evaLeft)}s</span>
          </div>
          <div className="eva-track">
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
