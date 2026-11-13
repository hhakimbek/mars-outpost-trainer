import { useEffect, useMemo, useState } from 'react'
import { C } from '../sim/constants'
import { ICE_THRESHOLD, SAMPLE_INFO, iceAt, sampleSites } from '../world/iceField'
import { patchRemaining } from '../sim/expedition'
import { rover } from '../world/roverState'
import { useGame } from '../store/useGame'
import { useField } from '../world/fieldState'

/**
 * The instrument panel of the rover.
 *
 * The expedition is a search problem, and a search problem needs an
 * instrument: without the radar the player is drilling at random, and random
 * drilling teaches nothing except that Mars is annoying. The readout is
 * deliberately an instrument reading — a percentage return and a depth —
 * rather than a yes/no, so there is something to steer by.
 */

/** Reads the live rover transform at a slow, human rate rather than at 60 Hz. */
function useRadar(seed: number, siteId: string, on: boolean) {
  const [v, setV] = useState({ c: 0, x: 0, z: 0, d: 0 })
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => {
      const c = iceAt(rover.x, rover.z, seed, siteId)
      setV({ c, x: rover.x, z: rover.z, d: Math.round((0.4 + (1 - c) * 3.4) * 10) / 10 })
    }, 140)
    return () => clearInterval(id)
  }, [seed, siteId, on])
  return v
}

export function ExpeditionHud() {
  const driving = useGame((s) => s.driving)
  const state = useGame((s) => s.state)
  const takeSample = useGame((s) => s.takeSample)
  const hold = useField((s) => s.holdProgress)
  const sampleId = useField((s) => s.sampleId)

  const radar = useRadar(state.seed, state.siteId, driving)

  // sampleSites is a pure function of the seed and the site, so the rock the
  // controller picked can be looked up here without passing it through a
  // store. Memoised on the id, which only changes when you drive past one.
  const site = useMemo(() => {
    if (!sampleId) return null
    const p = sampleSites(state.seed, state.siteId).find((q) => q.id === sampleId)
    return p ? SAMPLE_INFO[p.kind] : null
  }, [sampleId, state.seed, state.siteId])

  if (!driving) return null

  const pct = Math.round(radar.c * 100)
  const good = radar.c >= ICE_THRESHOLD
  const left = patchRemaining(state, radar.x, radar.z)
  const charge = state.roverKwh
  const chargePct = Math.min(charge / C.ROVER_KWH_CAP, 1)
  const rangeM = Math.round((charge / C.ROVER_KWH_PER_100M) * 100)
  const homeM = Math.round(Math.hypot(radar.x, radar.z))
  const stranded = rangeM < homeM

  return (
    <div className="rover-hud">
      <div className="rover-panel">
        <div className="label">Ground-Penetrating Radar</div>
        <div className="radar-read">
          <div className={`radar-num num ${good ? 'good' : ''}`}>{pct}%</div>
          <div className="stack">
            <span className="tiny body-dim">return · {radar.d} m to reflector</span>
            <span className="tiny" style={{ color: good ? 'var(--ok)' : 'var(--text-faint)' }}>
              {good
                ? left > 0.5
                  ? `drillable · about ${Math.round(left)} L under this spot`
                  : 'drillable, but this lens is worked out'
                : `below the ${Math.round(ICE_THRESHOLD * 100)}% the drill needs`}
            </span>
          </div>
        </div>
        <div className="radar-track">
          <div className="radar-threshold" style={{ left: `${ICE_THRESHOLD * 100}%` }} />
          <div className={`radar-fill ${good ? 'good' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="tiny body-dim mt-s">
          {Math.round(radar.x)}, {Math.round(radar.z)} m from the habitat centre · {homeM} m home
        </div>
      </div>

      <div className="rover-panel">
        <div className="row spread">
          <span className="label">Rover charge</span>
          <span className="num">{charge.toFixed(1)} kWh</span>
        </div>
        <div className="radar-track">
          <div className={`radar-fill ${stranded ? '' : 'good'}`} style={{ width: `${chargePct * 100}%` }} />
        </div>
        <div className="tiny" style={{ color: stranded ? 'var(--danger)' : 'var(--text-dim)' }}>
          {rangeM} m of driving left{stranded ? ' — that is less than the distance home' : ''}
          {charge >= C.DRILL_KWH
            ? ` · ${Math.floor(charge / C.DRILL_KWH)} drill hole(s) if you stop here`
            : ' · not enough for a hole'}
        </div>
        <div className="row spread mt-s">
          <span className="tiny body-dim">Sample rack</span>
          <span className="num tiny">{state.samplesHeld.length} / {C.ROVER_CARGO}</span>
        </div>
      </div>

      <div className="rover-keys">
        <div><span className="prompt-key">W S</span> drive · <span className="prompt-key">A D</span> steer</div>
        <div>
          <span className="prompt-key">E</span>
          Hold to drill (stationary)
          {hold > 0 && <div className="hold-bar"><div className="hold-fill" style={{ width: `${hold * 100}%` }} /></div>}
        </div>
        {site && (
          <div className="rover-sample">
            <span className="prompt-key">F</span>
            Collect {site.name.toLowerCase()}
            <div className="tiny body-dim mt-s">{site.why}</div>
            <button className="btn ghost" onClick={() => takeSample(sampleId!)}>Collect</button>
          </div>
        )}
        <div><span className="prompt-key">Q</span> Climb out</div>
      </div>
    </div>
  )
}
