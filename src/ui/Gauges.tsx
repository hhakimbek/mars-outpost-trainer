import { C } from '../sim/constants'
import { useGame } from '../store/useGame'

type Accent = 'o2' | 'water' | 'power' | 'food' | 'rad'

interface GaugeProps {
  name: string
  icon: string
  value: number
  unit: string
  frac: number
  accent: Accent
  sols?: number
  trend?: number
  note?: string
  /** Sols left in the mission; a longer countdown is shown as stable. */
  horizon?: number
}

/**
 * One gauge. Deliberately carries icon + name + number + unit + bar + a
 * sols-remaining chip: a ten-year-old must be able to read it in two seconds,
 * and nothing here depends on colour alone.
 */
export function Gauge({ name, icon, value, unit, frac, accent, sols, trend, note, horizon }: GaugeProps) {
  // A countdown longer than the mission is not information, it is noise:
  // "100 sols left" on a seven-sol mission reads as "this can never run out",
  // which is exactly the wrong lesson about a closed life-support loop.
  if (sols !== undefined && horizon !== undefined && sols > horizon) sols = -1
  const critical = (sols !== undefined && sols >= 0 && sols <= 2) || frac <= 0.12
  const warn = !critical && ((sols !== undefined && sols >= 0 && sols <= 4) || frac <= 0.3)
  const cls = critical ? 'gauge crit' : warn ? 'gauge warn' : 'gauge'

  const arrow = trend === undefined ? '' : trend > 0.01 ? '▲' : trend < -0.01 ? '▼' : '▬'
  const arrowCls = trend === undefined ? '' : trend > 0.01 ? 'pos' : trend < -0.01 ? 'neg' : 'body-dim'

  return (
    <div className={cls}>
      <div className="gauge-head">
        <span className="gauge-name">{icon} {name}</span>
        {arrow && <span className={`tiny num ${arrowCls}`}>{arrow}</span>}
      </div>
      <div>
        <span className="gauge-val num" style={{ color: `var(--${accent})` }}>
          {value < 10 ? value.toFixed(1) : Math.round(value)}
        </span>
        <span className="gauge-unit">{unit}</span>
      </div>
      <div className="gauge-bar">
        <div
          className="gauge-fill"
          style={{ width: `${Math.min(Math.max(frac, 0), 1) * 100}%`, background: `var(--${accent})` }}
        />
      </div>
      <div className="gauge-foot">
        {note ? (
          <span className="body-dim">{note}</span>
        ) : sols === undefined ? (
          <span />
        ) : sols < 0 ? (
          <span className="chip ok">STABLE</span>
        ) : (
          <span className={`chip ${sols <= 2 ? 'danger' : sols <= 4 ? 'caution' : 'info'}`}>
            {sols} SOL{sols === 1 ? '' : 'S'} LEFT
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * A compact strip for the state of the habitat itself: the air, the
 * temperature and the hardware. These are not stores that can be spent, they
 * are conditions that the plan sets — and before this strip existed the player
 * had no way to see that throttling life support was costing them anything.
 */
export function HabitatStrip() {
  const s = useGame((st) => st.state)

  const faults: string[] = []
  if (s.o2Leak > 0) faults.push('hull breach')
  if (s.recyclerClogged) faults.push('recycler clogged')
  if (s.arrayFault) faults.push('array string down')
  if (s.thermalFault) faults.push('heater loop')

  const co2Cls = s.co2 >= C.CO2_DANGER ? 'danger' : s.co2 >= C.CO2_SYMPTOM ? 'caution' : 'ok'
  const tempCls = s.habTemp < C.HAB_COLD_C ? 'danger' : 'ok'
  const wearCls = s.wear > 0.6 ? 'danger' : s.wear > 0.35 ? 'caution' : 'ok'

  return (
    <div className="hab-strip">
      <span className={`chip ${co2Cls}`}>CO₂ {Math.round(s.co2 * 100)}%</span>
      <span className={`chip ${tempCls}`}>{Math.round(s.habTemp)} °C</span>
      <span className={`chip ${wearCls}`}>WEAR {Math.round(s.wear * 100)}%</span>
      {faults.length > 0 ? (
        <span className="chip danger">⚙ {faults.join(' · ')}</span>
      ) : (
        <span className="chip ok">⚙ all systems nominal</span>
      )}
    </div>
  )
}

/** The five mission gauges, shown identically in the HUD and in planning. */
export function GaugeRow() {
  const s = useGame((st) => st.state)
  const proj = useGame((st) => st.projection())

  const maxDose = Math.max(...s.crew.map((m) => m.dose))
  const horizon = Math.max(s.totalSols - s.sol + 1, 1)

  return (
    <div className="gauge-row">
      <Gauge
        name="OXYGEN" icon="◯" value={s.stocks.o2} unit="kg"
        frac={s.stocks.o2 / C.CAP_O2} accent="o2"
        sols={proj.o2Sols} horizon={horizon} trend={proj.netO2}
      />
      <Gauge
        name="WATER" icon="≈" value={s.stocks.water} unit="L"
        frac={s.stocks.water / C.CAP_WATER} accent="water"
        sols={proj.waterSols} horizon={horizon} trend={proj.netWater}
      />
      <Gauge
        name="POWER" icon="⚡" value={s.stocks.battery} unit="kWh"
        frac={s.stocks.battery / C.CAP_BATTERY} accent="power"
        note={`array ${Math.round(s.stocks.cleanliness * 100)}% clean`}
      />
      <Gauge
        name="FOOD" icon="❖" value={s.stocks.food} unit="meals"
        frac={s.stocks.food / C.CAP_FOOD} accent="food"
        sols={proj.foodSols} horizon={horizon} trend={proj.netFood}
      />
      <Gauge
        name="RADIATION" icon="☢" value={maxDose} unit="mSv"
        frac={maxDose / C.DOSE_BUDGET} accent="rad"
        note={`${Math.round((maxDose / C.DOSE_BUDGET) * 100)}% of allowance`}
      />
    </div>
  )
}
