import { useEffect, useState } from 'react'
import { useGame } from '../store/useGame'
import { LANDING_SITES, siteById } from '../data/marsFeatures'
import { RELIEF_EXAGGERATION, marsElevation } from '../world/marsTopography'

/** A compact -1..+1 style bar for one site property, against the baseline. */
function Trait({
  label, value, unit, better,
}: {
  label: string
  /** 1.0 is the baseline site. */
  value: number
  unit?: string
  /** Which direction is good, for the colour. */
  better: 'high' | 'low'
}) {
  const pct = Math.min(Math.max((value - 0.4) / 1.2, 0), 1)
  const good = better === 'high' ? value > 1.03 : value < 0.97
  const bad = better === 'high' ? value < 0.97 : value > 1.03
  const color = good ? 'var(--ok)' : bad ? 'var(--caution)' : 'var(--text-dim)'

  return (
    <div className="trait">
      <span className="trait-label">{label}</span>
      <span className="trait-track">
        <span className="trait-fill" style={{ width: `${pct * 100}%`, background: color }} />
        <span className="trait-base" />
      </span>
      <span className="trait-val num" style={{ color }}>
        {unit ? `${value > 0 ? '+' : ''}${value}${unit}` : `${Math.round(value * 100)}%`}
      </span>
    </div>
  )
}

export function SiteSelect() {
  const selectedId = useGame((s) => s.selectedSiteId)
  const selectSite = useGame((s) => s.selectSite)
  const commitLanding = useGame((s) => s.commitLanding)
  const quitToMenu = useGame((s) => s.quitToMenu)
  const phase = useGame((s) => s.phase)

  const site = siteById(selectedId)
  const descending = phase === 'descent'

  // Elevation read off the same height field the globe is built from, so the
  // panel can never disagree with the terrain under the marker.
  const [localRelief, setLocalRelief] = useState(0)
  useEffect(() => {
    setLocalRelief(marsElevation(site.lat, site.lon))
  }, [site])

  if (descending) return <DescentOverlay />

  return (
    <div className="orbit-ui">
      <div className="orbit-head">
        <div className="label">Mission planning · approach</div>
        <div className="title sm">SELECT A LANDING SITE</div>
        <p className="small body-dim mt-s" style={{ maxWidth: 440 }}>
          Six places NASA has actually studied. Every one of them is a trade — sunlight
          against water, safety against science. What you pick here changes how the next
          seven sols run, not how they look.
        </p>
      </div>

      <div className="orbit-panel panel">
        <div className="site-list">
          {LANDING_SITES.map((s) => (
            <button
              key={s.id}
              className={`site-btn${s.id === selectedId ? ' on' : ''}`}
              onClick={() => selectSite(s.id)}
            >
              <span className="site-btn-name">{s.name}</span>
              <span className="site-btn-coord num">
                {Math.abs(s.lat).toFixed(1)}&deg;{s.lat >= 0 ? 'N' : 'S'}
              </span>
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="scroll site-detail">
          <div className="row spread">
            <div>
              <div className="h3">{site.name}</div>
              <div className="tiny body-dim">{site.region}</div>
            </div>
            {site.heritage && <span className="chip info">{site.heritage}</span>}
          </div>

          <div className="site-coords mt-m">
            <div className="row spread">
              <span className="tiny body-dim">Latitude</span>
              <span className="num">
                {Math.abs(site.lat).toFixed(2)}&deg;{site.lat >= 0 ? 'N' : 'S'}
              </span>
            </div>
            <div className="row spread">
              <span className="tiny body-dim">Longitude</span>
              <span className="num">{site.lon.toFixed(2)}&deg;E</span>
            </div>
            <div className="row spread">
              <span className="tiny body-dim">Elevation</span>
              <span className="num">
                {site.elevationKm > 0 ? '+' : ''}{site.elevationKm.toFixed(1)} km
              </span>
            </div>
            <div className="row spread">
              <span className="tiny body-dim">Globe model</span>
              <span className="num">
                {localRelief > 0 ? '+' : ''}{localRelief.toFixed(1)} km
              </span>
            </div>
          </div>

          <div className="label mt-l">What it does to the mission</div>
          <div className="traits mt-s">
            <Trait label="Solar output" value={site.solar} better="high" />
            <Trait label="Ice yield" value={site.ice} better="high" />
            <Trait label="Science value" value={site.science} better="high" />
            <Trait label="Dust risk" value={site.dust} better="low" />
          </div>
          <div className="trait mt-s">
            <span className="trait-label">Night low</span>
            <span className="trait-track">
              <span
                className="trait-fill"
                style={{
                  width: `${Math.min(Math.max((site.nightTempC + 20) / 30, 0), 1) * 100}%`,
                  background: site.nightTempC < -2 ? 'var(--caution)' : 'var(--ok)',
                }}
              />
              <span className="trait-base" />
            </span>
            <span className="trait-val num">
              {site.nightTempC > 0 ? '+' : ''}{site.nightTempC} &deg;C
            </span>
          </div>

          <div className="card mt-l">
            <div className="label">Why go here</div>
            <p className="small body-dim mt-s">{site.why}</p>
          </div>

          <div className="card mt-s">
            <div className="label" style={{ color: 'var(--caution)' }}>What it costs you</div>
            <p className="small body-dim mt-s">{site.risk}</p>
          </div>

          <p className="tiny body-dim mt-l">
            Coordinates and elevations are published figures. The relief between the named
            landmarks is procedural, and the globe exaggerates height {RELIEF_EXAGGERATION}&times; —
            drawn true to scale, Mars is smoother than a billiard ball and Olympus Mons would
            be invisible.
          </p>
        </div>

        <div className="btn-row orbit-actions">
          <button className="btn primary lg" onClick={commitLanding}>
            ▼ Land at {site.name}
          </button>
          <button className="btn ghost" onClick={quitToMenu}>Back</button>
        </div>
      </div>

      <div className="orbit-hint tiny body-dim">
        Drag to turn the planet · click a marker to inspect a site
      </div>
    </div>
  )
}

/**
 * The descent.
 *
 * Deliberately short and almost empty: the globe is doing the work behind it,
 * and the only thing worth saying is what cannot be changed any more.
 */
function DescentOverlay() {
  const site = siteById(useGame((s) => s.selectedSiteId))
  const landingComplete = useGame((s) => s.landingComplete)
  const [step, setStep] = useState(0)

  // The globe drives the real timing and calls landingComplete on touchdown.
  // These captions are purely a readout of where that animation has got to,
  // so they are driven off the same four-second budget.
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 1100),
      setTimeout(() => setStep(2), 2300),
      setTimeout(() => setStep(3), 3400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  // A safety net: if the canvas never mounts — a context-lost WebGL failure,
  // for instance — the player must still reach the mission rather than being
  // stranded on a black screen.
  useEffect(() => {
    const t = setTimeout(landingComplete, 9000)
    return () => clearTimeout(t)
  }, [landingComplete])

  const steps = [
    'Deorbit burn complete',
    'Entry interface — peak heating',
    'Parachute deployed, heat shield away',
    'Powered descent · touchdown',
  ]

  return (
    <div className="descent-ui">
      <div className="descent-card panel pad">
        <div className="label">Descending to</div>
        <div className="title sm">{site.name.toUpperCase()}</div>
        <div className="tiny body-dim mt-s num">
          {Math.abs(site.lat).toFixed(2)}&deg;{site.lat >= 0 ? 'N' : 'S'} {site.lon.toFixed(2)}&deg;E
        </div>
        <div className="descent-steps mt-m">
          {steps.map((label, i) => (
            <div key={label} className={`descent-step${i <= step ? ' on' : ''}`}>
              <span className="descent-dot" />
              <span className="small">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
