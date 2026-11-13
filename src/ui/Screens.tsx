import { useState } from 'react'
import { C } from '../sim/constants'
import { BADGE_INFO } from '../sim/scoring'
import { computeGeneration } from '../sim/simulation'
import { eventForSol } from '../data/events'
import { STRUCTURES } from '../data/structures'
import { useGame } from '../store/useGame'
import { GaugeRow } from './Gauges'
import type { LearningCard } from '../sim/types'

// ===========================================================================
//  shared bits
// ===========================================================================

function Learn({ card }: { card: LearningCard }) {
  return (
    <div className="learn">
      <div className="learn-q">What happened</div>
      <p>{card.what}</p>
      <div className="learn-q">Why it happened</div>
      <p>{card.why}</p>
      <div className="learn-q">Real Mars science <span className={`tag ${card.tag}`}>{card.tag}</span></div>
      <p>{card.realScience}</p>
      <p style={{ marginTop: 8 }}>
        <a href={card.sourceUrl} target="_blank" rel="noreferrer noopener">↗ {card.sourceLabel}</a>
      </p>
    </div>
  )
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts)
  const dismiss = useGame((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.warning ? 'warn' : ''}`} onClick={() => dismiss(t.id)}>
          <span>{t.warning ? '⚠' : '✓'}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

// ===========================================================================
//  BRIEFING
// ===========================================================================

export function Briefing() {
  const state = useGame((s) => s.state)
  const setPhase = useGame((s) => s.setPhase)
  const event = eventForSol(state.sol)
  const lastSol = state.log.filter((l) => l.sol === state.sol - 1)
  const warnings = lastSol.filter((l) => l.warning).slice(0, 3)

  return (
    <div className="screen">
      <div className="panel pad" style={{ width: 'min(760px, 100%)' }}>
        <div className="label">Sol Briefing</div>
        <div className="title">SOL {state.sol} <span className="accent">/ {state.totalSols}</span></div>
        <div className="subtitle mt-s">{state.env.headline}</div>

        <div className="divider" />

        <div className="grid-2">
          <div className="card">
            <div className="label">Forecast</div>
            <div className="small mt-s stack gap-s">
              <div className="row spread">
                <span className="body-dim">Solar output</span>
                <span className="num">{Math.round(computeGeneration(state.env, state.stocks.cleanliness, state.arrayFault))} kWh</span>
              </div>
              <div className="row spread">
                <span className="body-dim">Optical depth (tau)</span>
                <span className="num">{state.env.tau.toFixed(2)}</span>
              </div>
              <div className="row spread">
                <span className="body-dim">Temperature</span>
                <span className="num">{state.env.highTemp}° / {state.env.lowTemp}°C</span>
              </div>
              <div className="row spread">
                <span className="body-dim">Array cleanliness</span>
                <span className="num">{Math.round(state.stocks.cleanliness * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="label">Since yesterday</div>
            {warnings.length === 0 ? (
              <div className="small body-dim mt-s">
                {state.sol === 1 ? 'The outpost is new. Nothing has gone wrong yet.' : 'No alerts overnight.'}
              </div>
            ) : (
              <ul className="small mt-s stack gap-s">
                {warnings.map((w, i) => (
                  <li key={i} style={{ listStyle: 'none', color: 'var(--caution)' }}>⚠ {w.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {event && (
          <div className="card mt-m" style={{ borderColor: 'var(--rust)' }}>
            <div className="label" style={{ color: 'var(--rust)' }}>Today&rsquo;s objective</div>
            <div className="h3 mt-s">{event.title}</div>
            <div className="small body-dim mt-s">{event.objective}</div>
          </div>
        )}

        <div className="btn-row mt-l">
          <button className="btn primary lg" onClick={() => setPhase('planning')}>
            Open planning →
          </button>
          <button className="btn ghost" onClick={() => setPhase('science')}>Mission science</button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
//  EVENT MODAL
// ===========================================================================

export function EventModal() {
  const event = useGame((s) => s.activeEvent)
  const resolved = useGame((s) => s.eventResolved)
  const choose = useGame((s) => s.chooseEventOption)
  const setPhase = useGame((s) => s.setPhase)
  // Telemetry lines may be computed from the live mission, so the modal needs
  // the state, not just the authored event.
  const state = useGame((s) => s.state)
  const [picked, setPicked] = useState<number | null>(null)

  if (!event) return null

  const chosen = picked !== null ? event.choices[picked] : null

  return (
    <div className="screen">
      <div className={`panel event-modal sev-${event.severity}`}>
        <div className="event-head">
          <div className="row spread">
            <div className="label">{event.category} · Sol {event.sol}</div>
            <span className={`chip ${event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'caution' : 'info'}`}>
              {event.severity.toUpperCase()}
            </span>
          </div>
          <div className="h2 mt-s">{event.title}</div>
        </div>

        <div className="event-body scroll" style={{ maxHeight: '64vh' }}>
          <p className="small">{event.situation}</p>

          <dl className="telemetry">
            {Object.entries(event.telemetry).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{typeof v === 'function' ? v(state) : v}</dd>
              </div>
            ))}
          </dl>

          {!resolved && !chosen && (
            <>
              <div className="label">Your decision</div>
              {event.choices.map((c, i) => (
                <button key={c.id} className="choice" onClick={() => { setPicked(i); choose(i) }}>
                  <div className="choice-label">{c.label}</div>
                  <div className="choice-cost">{c.cost}</div>
                </button>
              ))}
            </>
          )}

          {chosen && (
            <>
              <div className="card mt-m" style={{
                borderColor: chosen.quality === 'optimal' ? 'var(--ok)'
                  : chosen.quality === 'poor' ? 'var(--danger)' : 'var(--caution)',
              }}>
                <div className="row spread">
                  <div className="label">You chose</div>
                  <span className={`chip ${chosen.quality === 'optimal' ? 'ok' : chosen.quality === 'poor' ? 'danger' : 'caution'}`}>
                    {chosen.quality.toUpperCase()}
                  </span>
                </div>
                <div className="h3 mt-s">{chosen.label}</div>
                <p className="small body-dim mt-s">{chosen.reasoning}</p>
              </div>

              <div className="divider" />
              <div className="label">What the other options would have done</div>
              {event.choices.filter((_, i) => i !== picked).map((c) => (
                <div key={c.id} className="card mt-s">
                  <div className="h3">{c.label}</div>
                  <p className="tiny body-dim mt-s">{c.reasoning}</p>
                </div>
              ))}

              <Learn card={event.learning} />

              <button className="btn primary wide lg mt-m" onClick={() => setPhase('fieldOps')}>
                Continue to the outpost →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
//  RESOLUTION
// ===========================================================================

export function Resolution() {
  const result = useGame((s) => s.lastResult)
  const state = useGame((s) => s.state)
  const setPhase = useGame((s) => s.setPhase)

  if (!result) return null
  const sol = state.sol - 1

  return (
    <div className="screen">
      <div className="panel pad" style={{ width: 'min(760px, 100%)' }}>
        <div className="label">Sol {sol} — Resolution</div>
        <div className="h2">What the outpost did while the crew slept</div>

        <div className="grid-2 mt-m">
          <div className="card">
            <div className="label">Energy</div>
            <div className="small mt-s stack gap-s">
              <div className="row spread"><span className="body-dim">Generated</span><span className="num">{result.power.generation.toFixed(1)} kWh</span></div>
              <div className="row spread"><span className="body-dim">Used</span><span className="num">{result.power.delivered.toFixed(1)} kWh</span></div>
              <div className="row spread"><span className="body-dim">Battery drawn</span><span className="num">{result.power.batteryDraw.toFixed(1)} kWh</span></div>
              {result.power.wasted > 0.5 && (
                <div className="row spread" style={{ color: 'var(--caution)' }}>
                  <span>Wasted</span><span className="num">{result.power.wasted.toFixed(1)} kWh</span>
                </div>
              )}
              {result.power.brownedOut.length > 0 && (
                <div className="row spread" style={{ color: 'var(--danger)' }}>
                  <span>Browned out</span><span className="tiny">{result.power.brownedOut.join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="label">Net change</div>
            <div className="small mt-s stack gap-s">
              {([
                ['Oxygen', result.deltas.o2, 'kg', 'o2'],
                ['Water', result.deltas.water, 'L', 'water'],
                ['Food', result.deltas.food, 'meals', 'food'],
                ['Science', result.deltas.science, 'pts', 'rad'],
              ] as const).map(([name, v, unit, accent]) => (
                <div className="row spread" key={name}>
                  <span className="body-dim">{name}</span>
                  <span className={`num ${v >= 0 ? 'pos' : 'neg'}`} style={{ color: v === 0 ? 'var(--text-dim)' : undefined }}>
                    {v >= 0 ? '+' : ''}{v.toFixed(1)} <span style={{ color: `var(--${accent})`, fontSize: 10 }}>{unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="label mt-m">Flight log</div>
        <div className="log mt-s">
          {result.solLog.map((l, i) => (
            <div key={i} className={`log-row ${l.warning ? 'warn' : ''}`}>
              <span className="log-cat">{l.category.toUpperCase()}</span>
              <span>{l.message}</span>
              <span className={`log-delta ${l.delta > 0 ? 'pos' : l.delta < 0 ? 'neg' : ''}`}>
                {l.delta !== 0 ? `${l.delta > 0 ? '+' : ''}${l.delta.toFixed(1)}` : ''}
              </span>
            </div>
          ))}
        </div>

        <button className="btn primary wide lg mt-m" onClick={() => setPhase('debrief')}>
          Debrief →
        </button>
      </div>
    </div>
  )
}

// ===========================================================================
//  DEBRIEF
// ===========================================================================

export function Debrief() {
  const state = useGame((s) => s.state)
  const nextSol = useGame((s) => s.nextSol)
  const restartSol = useGame((s) => s.restartSol)
  const score = useGame((s) => s.score())

  const sol = state.sol - 1
  const event = eventForSol(sol)
  const decision = state.decisions.find((d) => d.sol === sol)
  const aborted = state.outcome === 'aborted'
  const finished = state.sol > state.totalSols

  return (
    <div className="screen">
      <div className="panel pad" style={{ width: 'min(760px, 100%)' }}>
        <div className="label">Sol {sol} — Debrief</div>
        <div className="h2">{aborted ? 'Mission in jeopardy' : 'Sol complete'}</div>

        <GaugeRow />

        {decision && (
          <div className="card mt-m">
            <div className="label">Your decision today</div>
            <div className="h3 mt-s">{decision.label}</div>
            <p className="small body-dim mt-s">{decision.reasoning}</p>
          </div>
        )}

        {event && <Learn card={event.learning} />}

        <div className="card mt-m">
          <div className="row spread">
            <span className="label">Score so far</span>
            <span className="h2 num">{score.total}<span className="small body-dim"> / 1000</span></span>
          </div>
        </div>

        {aborted && (
          <div className="card mt-m" style={{ borderColor: 'var(--danger)' }}>
            <div className="h3" style={{ color: 'var(--danger)' }}>⚠ A crew member is in a critical medical state</div>
            <p className="small body-dim mt-s">
              The mission will be aborted and the crew returned to orbit. You can retry this sol
              and make different calls — that is what a trainer is for.
            </p>
          </div>
        )}

        <div className="btn-row mt-l">
          {aborted || finished ? (
            <button className="btn primary lg" onClick={nextSol}>See mission results →</button>
          ) : (
            <button className="btn primary lg" onClick={nextSol}>Begin Sol {state.sol} →</button>
          )}
          <button className="btn ghost" onClick={restartSol}>↻ Retry Sol {sol}</button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
//  RESULTS
// ===========================================================================

export function Results() {
  const state = useGame((s) => s.state)
  const score = useGame((s) => s.score())
  const startCampaign = useGame((s) => s.startCampaign)
  const quitToMenu = useGame((s) => s.quitToMenu)
  const cadetName = useGame((s) => s.cadetName)
  const setCadetName = useGame((s) => s.setCadetName)

  const success = state.outcome === 'success'
  const maxDose = Math.max(...state.crew.map((m) => m.dose))

  const rows = [
    ['Crew survival & health', score.crewSurvival, 220],
    ['Life support integrity', score.lifeSupport, 200],
    ['Resource efficiency', score.efficiency, 180],
    ['Radiation safety', score.radiation, 140],
    ['Decision quality', score.decisions, 140],
    ['Maintenance & repairs', score.maintenance, 60],
    ['Science returned', score.science, 60],
  ] as const

  const download = () => {
    const report = {
      cadet: cadetName || 'Unnamed cadet',
      seed: state.seed,
      outcome: state.outcome,
      solsCompleted: Math.min(state.sol - 1, state.totalSols),
      score,
      finalStocks: state.stocks,
      crew: state.crew.map((m) => ({
        name: m.name, role: m.role,
        health: Math.round(m.health), doseMsv: Number(m.dose.toFixed(3)),
      })),
      decisions: state.decisions,
      flightLog: state.log,
      disclaimer:
        'Educational simulation. Values are simplified and are not a flight-certified ' +
        'engineering model. Not affiliated with or endorsed by NASA.',
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mars-mission-report-seed-${state.seed}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="screen">
      <div className="panel pad scroll" style={{ width: 'min(820px, 100%)', maxHeight: '92vh' }}>
        <div className="center">
          <div className="label">{success ? 'Mission Complete' : 'Mission Aborted'}</div>
          <div className="title mt-s">
            {success ? <>OUTPOST <span className="accent">SECURED</span></> : <>CREW <span className="accent">EVACUATED</span></>}
          </div>
          <div className="stars mt-s">
            {'★'.repeat(score.stars)}{'☆'.repeat(3 - score.stars)}
          </div>
          <div className="h2 mt-s">{score.rating}</div>
          <div className="num" style={{ fontSize: 44, fontWeight: 700, marginTop: 8 }}>
            {score.total}<span className="subtitle"> / 1000</span>
          </div>
        </div>

        <div className="divider" />

        <div className="label">Score breakdown</div>
        {rows.map(([name, value, max]) => (
          <div className="score-row" key={name}>
            <span>{name}</span>
            <span className="num body-dim">{value}/{max}</span>
            <span className="score-track">
              <span className="score-fill" style={{ width: `${(value / max) * 100}%` }} />
            </span>
          </div>
        ))}

        <div className="divider" />

        <div className="grid-2">
          <div className="card">
            <div className="label">Final stocks</div>
            <div className="small mt-s stack gap-s">
              <div className="row spread"><span className="body-dim">Oxygen</span><span className="num">{state.stocks.o2.toFixed(1)} kg</span></div>
              <div className="row spread"><span className="body-dim">Water</span><span className="num">{Math.round(state.stocks.water)} L</span></div>
              <div className="row spread"><span className="body-dim">Food</span><span className="num">{Math.round(state.stocks.food)} meals</span></div>
              <div className="row spread"><span className="body-dim">Battery</span><span className="num">{state.stocks.battery.toFixed(1)} kWh</span></div>
              <div className="row spread"><span className="body-dim">Science</span><span className="num">{Math.round(state.stocks.science)} pts</span></div>
            </div>
          </div>
          <div className="card">
            <div className="label">Crew</div>
            <div className="small mt-s stack gap-s">
              {state.crew.map((m) => (
                <div className="row spread" key={m.name}>
                  <span className="body-dim">{m.shortRole} {m.name}</span>
                  <span className="num">♥{Math.round(m.health)} ☢{m.dose.toFixed(2)}</span>
                </div>
              ))}
              <div className="divider" style={{ margin: '6px 0' }} />
              <div className="tiny body-dim">
                Highest dose {maxDose.toFixed(2)} mSv — {Math.round((maxDose / C.DOSE_BUDGET) * 100)}% of the
                mission allowance, and {((maxDose / C.CAREER_LIMIT) * 100).toFixed(1)}% of NASA&rsquo;s
                ~{C.CAREER_LIMIT} mSv career limit.
              </div>
            </div>
          </div>
        </div>

        <div className="label mt-m">Badges</div>
        <div className="badges">
          {Object.entries(BADGE_INFO).map(([key, info]) => (
            <span
              key={key}
              className={`badge ${score.badges.includes(key) ? 'earned' : 'locked'}`}
              title={info.detail}
            >
              {score.badges.includes(key) ? '✓ ' : '· '}{info.name}
            </span>
          ))}
        </div>

        <div className="label mt-m">Decision history</div>
        <div className="log mt-s">
          {state.decisions.map((d, i) => (
            <div key={i} className="log-row">
              <span className="log-cat">SOL {d.sol}</span>
              <span>{d.label}</span>
              <span className={`chip ${d.quality === 'optimal' ? 'ok' : d.quality === 'poor' ? 'danger' : 'caution'}`}>
                {d.quality.toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        <div className="divider" />

        <div className="row gap-s" style={{ flexWrap: 'wrap' }}>
          <input
            value={cadetName}
            onChange={(e) => setCadetName(e.target.value)}
            placeholder="Cadet name for the report"
            className="btn ghost"
            style={{ cursor: 'text', minWidth: 230 }}
          />
          <button className="btn" onClick={download}>⬇ Download mission report</button>
        </div>

        <div className="btn-row mt-m">
          <button className="btn primary lg" onClick={() => startCampaign(state.seed)}>
            ↻ Replay this seed ({state.seed})
          </button>
          <button className="btn" onClick={() => startCampaign()}>New mission</button>
          <button className="btn ghost" onClick={quitToMenu}>Main menu</button>
        </div>

        <p className="disclaimer mt-m">
          This is an educational simulation. Its resource values and mission calculations are
          simplified and are not a flight-certified engineering model. This project is not
          affiliated with, endorsed by, or validated by NASA. All crew members are fictional.
        </p>
      </div>
    </div>
  )
}

// ===========================================================================
//  SCIENCE PANEL
// ===========================================================================

export function SciencePanel() {
  const setPhase = useGame((s) => s.setPhase)
  const phase = useGame((s) => s.phase)
  const back = phase === 'science' ? 'briefing' : 'menu'

  const facts: { title: string; body: string; tag: 'REAL' | 'SIMPLIFIED'; src: string; url: string }[] = [
    {
      title: 'Mars has almost no breathable atmosphere',
      body: 'Surface pressure is about 6 millibars — under 1% of Earth at sea level — and the air is ' +
        'roughly 95% carbon dioxide. A habitat is a pressure vessel, and any breach vents breathable air.',
      tag: 'REAL', src: 'NASA — Mars Facts', url: 'https://science.nasa.gov/mars/facts/',
    },
    {
      title: 'Sunlight on Mars is about 43% of Earth’s',
      body: 'Mars receives roughly 586 W/m² on average against Earth’s 1361 W/m², because it orbits ' +
        'about 1.5 times farther from the Sun. Every solar-powered mission is designed around that.',
      tag: 'REAL', src: 'NASA — Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
    },
    {
      title: 'Dust is the enemy of solar power',
      body: 'Airborne dust blocks sunlight and settled dust blocks more. A planet-encircling storm in 2018 ' +
        'ended the Opportunity rover’s mission. Curiosity and Perseverance use a nuclear power source instead.',
      tag: 'REAL', src: 'NASA — Opportunity', url: 'https://science.nasa.gov/mission/mars-exploration-rover-opportunity/',
    },
    {
      title: 'Oxygen can be made from Martian air',
      body: 'NASA’s MOXIE instrument aboard Perseverance ran solid-oxide electrolysis on Martian carbon ' +
        'dioxide and produced breathable oxygen on the surface of another planet. It costs energy.',
      tag: 'REAL', src: 'NASA — Perseverance / MOXIE', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    },
    {
      title: 'Water must be recycled, not carried',
      body: 'The ISS recovers roughly 90–98% of its water, including moisture from cabin air. ' +
        'A closed loop multiplies every litre you launched; without one, no long mission is possible.',
      tag: 'REAL', src: 'NASA — Life support systems', url: 'https://www.nasa.gov/exploration-research-and-technology/life-support-systems/',
    },
    {
      title: 'Radiation is cumulative and needs mass',
      body: 'Curiosity’s RAD instrument measured a surface dose equivalent of about 0.64 mSv per sol. ' +
        'Galactic cosmic rays are a constant background needing bulk shielding; solar particle events are ' +
        'spikes a shielded room can handle. NASA’s career limit is about 600 mSv.',
      tag: 'REAL', src: 'NASA — Curiosity RAD', url: 'https://science.nasa.gov/mission/msl-curiosity/',
    },
    {
      title: 'Growing food takes time, not just power',
      body: 'NASA has grown lettuce and other crops aboard the ISS in Veggie and the Advanced Plant Habitat, ' +
        'taking weeks per harvest. Martian regolith also contains toxic perchlorate salts that must be removed first.',
      tag: 'REAL', src: 'NASA — Growing plants in space', url: 'https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/',
    },
    {
      title: 'Nobody on Earth can help you in real time',
      body: 'A radio signal takes 4 to 24 minutes each way depending on where the planets are. ' +
        'A Mars crew has to be able to decide for itself — which is why you are the one deciding.',
      tag: 'REAL', src: 'NASA — Humans in space', url: 'https://www.nasa.gov/humans-in-space/',
    },
    {
      title: 'What this game simplifies',
      body: 'All resources use a single simplified rate per sol. Power is one pooled number rather than ' +
        'separate AC/DC buses and voltages. Crop growth is four sols for any crop. Dust accumulates faster ' +
        'than reality so you can see it inside a 7-sol mission. Radiation uses one dose figure per zone.',
      tag: 'SIMPLIFIED', src: 'See the constants table in the source', url: 'https://science.nasa.gov/mars/',
    },
  ]

  return (
    <div className="screen">
      <div className="panel pad scroll" style={{ width: 'min(820px, 100%)', maxHeight: '92vh' }}>
        <div className="row spread">
          <div>
            <div className="label">Mission Science</div>
            <div className="h2">What is real, and what we simplified</div>
          </div>
          <button className="btn ghost" onClick={() => setPhase(back)}>Close</button>
        </div>

        <div className="divider" />

        <div className="stack gap-m">
          {facts.map((f) => (
            <div className="card" key={f.title}>
              <div className="row spread">
                <div className="h3">{f.title}</div>
                <span className={`tag ${f.tag}`}>{f.tag}</span>
              </div>
              <p className="small body-dim mt-s">{f.body}</p>
              <a className="tiny" href={f.url} target="_blank" rel="noreferrer noopener"
                 style={{ color: 'var(--o2)' }}>↗ {f.src}</a>
            </div>
          ))}
        </div>

        <p className="disclaimer mt-m">
          This is an educational simulation. Its resource values and mission calculations are
          simplified and are not a flight-certified engineering model. This project is not
          affiliated with, endorsed by, or validated by NASA.
        </p>
      </div>
    </div>
  )
}

// ===========================================================================
//  HOW TO PLAY
// ===========================================================================

export function HowTo() {
  const setPhase = useGame((s) => s.setPhase)
  return (
    <div className="screen">
      <div className="panel pad scroll" style={{ width: 'min(760px, 100%)', maxHeight: '92vh' }}>
        <div className="row spread">
          <div>
            <div className="label">How to play</div>
            <div className="h2">You command the outpost. You do not do everything.</div>
          </div>
          <button className="btn ghost" onClick={() => setPhase('menu')}>Close</button>
        </div>

        <div className="divider" />

        <div className="card">
          <div className="h3">Two budgets, and they are the whole game</div>
          <p className="small body-dim mt-s">
            <strong>Power</strong> — your solar array makes a fixed number of kilowatt-hours per sol.
            Life support, heating, the oxygen generator, the water recycler, the greenhouse, comms and
            the rover all draw from that one number. Giving one system more always means giving another less.
          </p>
          <p className="small body-dim mt-s">
            <strong>Crew-hours</strong> — three astronauts, eight working hours each, minus two hours each
            for exercise and medical. That is 18 hours to spend. Cleaning the solar array costs 3.
            A hull repair costs 4. You cannot do everything.
          </p>
        </div>

        <div className="card mt-m">
          <div className="h3">Each sol runs in five steps</div>
          <ol className="small body-dim mt-s" style={{ paddingLeft: 18 }}>
            <li>Briefing — the forecast and today&rsquo;s objective</li>
            <li>Planning — set power modes and assign crew. Watch the forecast strip update live</li>
            <li>Field operations — walk the outpost in 3D and carry out the work you scheduled</li>
            <li>Resolution — the simulation runs and shows every number that changed, and why</li>
            <li>Debrief — what happened, what the alternatives would have cost, what it teaches</li>
          </ol>
        </div>

        <div className="card mt-m">
          <div className="h3">Controls</div>
          <div className="key-table mt-s">
            <span className="k">W A S D</span><span>Walk (relative to the camera) — the arrow keys do the same</span>
            <span className="k">Mouse</span><span>Look around (click the view once to capture the mouse)</span>
            <span className="k">Shift</span><span>Run</span>
            <span className="k">Space</span><span>Jump — at 0.38 g you go noticeably higher</span>
            <span className="k">E</span><span>Hold to carry out scheduled work at a structure</span>
            <span className="k">H</span><span>Plant a crop, at the greenhouse (a ripe crop is harvested for you)</span>
            <span className="k">V</span><span>Switch between first-person and over-the-shoulder view</span>
            <span className="k">Tab</span><span>Switch which astronaut you control</span>
            <span className="k">P</span><span>Open the planning screen</span>
            <span className="k">Esc</span><span>Release the mouse</span>
          </div>
        </div>

        <div className="card mt-m" style={{ borderColor: 'var(--caution)' }}>
          <div className="h3" style={{ color: 'var(--caution)' }}>Three things players get wrong</div>
          <p className="small body-dim mt-s">
            <strong>Planning is not doing.</strong> A task you assign shows ○ until you walk to the
            structure and hold E. An unperformed repair does nothing.
          </p>
          <p className="small body-dim mt-s">
            <strong>Plant early.</strong> A crop takes four sols. On Sol 6 you will need food, and no
            amount of power can grow it faster.
          </p>
          <p className="small body-dim mt-s">
            <strong>Dose never goes down.</strong> Rotate who does the EVA work, and install regolith
            shielding before the Sol 5 particle event, not during it.
          </p>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
//  MAIN MENU
// ===========================================================================

export function Menu() {
  const openSiteSelect = useGame((s) => s.openSiteSelect)
  const setPhase = useGame((s) => s.setPhase)
  const load = useGame((s) => s.load)
  const hasSave = useGame((s) => s.hasSave())
  const [seedText, setSeedText] = useState('')

  // Starting a mission now goes to orbit first: the landing site is the first
  // real decision, and it is made before the outpost exists.
  const start = () => {
    const parsed = parseInt(seedText, 10)
    openSiteSelect(Number.isFinite(parsed) && seedText.trim() !== '' ? parsed : undefined)
  }

  return (
    <div className="screen">
      <div className="panel pad" style={{ width: 'min(700px, 100%)' }}>
        <div className="label">Junior Astronaut</div>
        <div className="title">MARS OUTPOST <span className="accent">TRAINER</span></div>
        <p className="subtitle mt-m">
          You are the Mission Commander of a three-person Mars outpost. Earth is 4 to 24
          light-minutes away, so nobody can tell you what to do in time. Keep your crew alive
          for seven sols by deciding, every single sol, where the power goes and who does the work.
        </p>

        <div className="grid-2 mt-l">
          <div className="card">
            <div className="label">The challenge</div>
            <p className="small body-dim mt-s">
              Balance life support, radiation shielding, power and food production — and feel the
              trade-offs that decide whether a mission succeeds.
            </p>
          </div>
          <div className="card">
            <div className="label">Mission profile</div>
            <div className="small body-dim mt-s stack gap-s">
              <div className="row spread"><span>Crew</span><span className="num">3</span></div>
              <div className="row spread"><span>Duration</span><span className="num">7 sols</span></div>
              <div className="row spread"><span>Session</span><span className="num">15–25 min</span></div>
              <div className="row spread"><span>Ages</span><span className="num">10–16</span></div>
            </div>
          </div>
        </div>

        <div className="btn-row mt-l">
          <button className="btn primary lg" onClick={start}>▶ Start mission</button>
          {hasSave && (
            <button className="btn lg" onClick={() => { if (!load()) openSiteSelect() }}>
              Continue
            </button>
          )}
          <button className="btn ghost" onClick={() => setPhase('howto')}>How to play</button>
          <button className="btn ghost" onClick={() => setPhase('science')}>Mission science</button>
        </div>

        <div className="row gap-s mt-m">
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="Optional seed (same seed = same mission)"
            className="btn ghost"
            style={{ cursor: 'text', flex: 1 }}
          />
        </div>

        <p className="disclaimer mt-l">
          This is an educational simulation. Its resource values and mission calculations are
          simplified and are not a flight-certified engineering model. This project is not
          affiliated with, endorsed by, or validated by NASA. All crew members are fictional.
        </p>
      </div>
    </div>
  )
}

/** Used by the briefing screen's outpost legend. */
export function OutpostLegend() {
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
