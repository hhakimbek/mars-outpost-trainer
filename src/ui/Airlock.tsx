import { useGame } from '../store/useGame'

/**
 * The airlock cycle.
 *
 * Covers the moment where one canvas unmounts and the other mounts, which is
 * the practical reason it exists — but the captions are the real one. An
 * airlock is the single clearest statement of what Mars is: on one side 1 bar
 * of breathable air, on the other 6 millibars of carbon dioxide.
 */
export function AirlockOverlay() {
  const dir = useGame((s) => s.airlockDir)
  const t = useGame((s) => s.airlockT)
  if (!dir) return null

  const out = dir === 'out'
  const steps = out
    ? ['Suit integrity check', 'Inner hatch sealed', 'Pumping down to 6 mbar', 'Outer hatch open']
    : ['Outer hatch sealed', 'Dust mitigation', 'Repressurising to 1 bar', 'Inner hatch open']
  const step = Math.min(steps.length - 1, Math.floor(t * steps.length))

  return (
    <div className="airlock-overlay">
      <div className="airlock-card">
        <div className="label">{out ? 'EGRESS' : 'INGRESS'}</div>
        <div className="h2">{out ? 'Cycling to the surface' : 'Cycling into the habitat'}</div>
        <div className="airlock-steps">
          {steps.map((s, i) => (
            <div key={s} className={`airlock-step ${i <= step ? 'on' : ''}`}>
              <span>{i < step ? '✓' : i === step ? '◆' : '·'}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div className="airlock-track"><div className="airlock-fill" style={{ width: `${t * 100}%` }} /></div>
        <div className="tiny body-dim mt-s">
          {out
            ? 'Outside the pressure is about 0.6% of Earth’s at sea level, and the air is 95% carbon dioxide.'
            : 'Perchlorate dust is brushed off the suits at the hatch. It is toxic, and it never comes inboard.'}
        </div>
      </div>
    </div>
  )
}
