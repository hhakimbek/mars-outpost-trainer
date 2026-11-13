import { SUBSYSTEM_COST, TASK_HOURS, C } from '../sim/constants'
import { canTurnOff, settleAllocation, subsystemCost } from '../sim/simulation'
import { MODE_NAMES } from '../sim/types'
import type { Mode, Subsystem, Task } from '../sim/types'
import { useGame } from '../store/useGame'
import { GaugeRow } from './Gauges'
import { RackPanel } from './RackPanel'

const SUB_INFO: Record<Subsystem, { name: string; fn: string }> = {
  lifeSupport:     { name: 'Life Support',     fn: 'CO₂ scrubbing, air circulation, lights. Cannot be switched off.' },
  thermal:         { name: 'Thermal Control',  fn: 'Keeps the cabin habitable. Cannot be switched off.' },
  oxygenGenerator: { name: 'Oxygen Generator', fn: 'Splits CO₂ from Martian air. ~2.6 kg O₂ at nominal.' },
  waterRecycler:   { name: 'Water Recycler',   fn: 'Recovers 90% of crew water at nominal, 62% at low.' },
  greenhouse:      { name: 'Greenhouse',       fn: 'Grow lights and heating. More light means faster growth.' },
  commsScience:    { name: 'Comms & Science',  fn: 'Earns science points. Safe to cut — costs score only.' },
  roverCharge:     { name: 'Rover Charge',     fn: 'Required before any ice-extraction run.' },
}

const TASKS: Task[] = [
  'cleanArray', 'repair', 'tendGreenhouse', 'mixNutrients', 'science',
  'iceRun', 'regolithShield', 'inspection', 'extraRest', 'plantCrop',
  'startReactor',
]

const TASK_LABEL: Record<Task, string> = {
  plantCrop: 'Plant a crop',
  none: '—',
  cleanArray: 'Clean solar array',
  repair: 'Repair',
  tendGreenhouse: 'Tend a bed',
  mixNutrients: 'Mix nutrient batch',
  science: 'Science survey',
  iceRun: 'Rover ice run',
  regolithShield: 'Pile regolith shielding',
  inspection: 'Maintenance inspection',
  extraRest: 'Extra rest',
  startReactor: 'Start fission unit',
}

export function Planning() {
  const state = useGame((s) => s.state)
  const plan = useGame((s) => s.plan)
  const setMode = useGame((s) => s.setMode)
  const setBatteryAuth = useGame((s) => s.setBatteryAuth)
  const assignments = useGame((s) => s.assignments)
  const assignTask = useGame((s) => s.assignTask)
  const removeAssignment = useGame((s) => s.removeAssignment)
  const confirmPlan = useGame((s) => s.confirmPlan)
  const setPhase = useGame((s) => s.setPhase)
  const proj = useGame((s) => s.projection())
  // A countdown longer than the mission left is reported as stable, exactly as
  // the gauges do — otherwise the forecast and the gauge contradict each other.
  const horizon = Math.max(state.totalSols - state.sol + 1, 1)
  const left = (n: number) => (n < 0 || n > horizon ? 'stable' : `${n} sols left`)
  const usedHours = useGame((s) => s.usedCrewHours())
  const maxHours = useGame((s) => s.maxCrewHours())

  const settle = settleAllocation(plan, state.stocks, state.env, {
    arrayFault: state.arrayFault, thermalFault: state.thermalFault, reactor: state.reactor,
  })
  const subsystems = Object.keys(SUBSYSTEM_COST) as Subsystem[]

  const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1))

  return (
    <div className="screen">
      <div className="planning">
        <div className="row spread">
          <div>
            <div className="label">Sol {state.sol} — Planning</div>
            <div className="h2">Where does today&rsquo;s energy go, and who does the work?</div>
          </div>
          <button className="btn ghost" onClick={() => setPhase('fieldOps')}>Back to outpost</button>
        </div>

        <GaugeRow />

        <div className="planning-cols">
          {/* ------------------------------------------------ power budget */}
          <div className="panel">
            <div className="budget-head">
              <div>
                <div className="label">Power Budget</div>
                <div className="tiny body-dim">
                  Array {Math.round(settle.solar)} kWh
                  {state.env.dustStorm && <span style={{ color: 'var(--caution)' }}> (dust storm)</span>}
                  {settle.reactor > 0 && (
                    <span style={{ color: 'var(--ok)' }}>
                      {' + fission '}{Math.round(settle.reactor)} kWh
                    </span>
                  )}
                  {' + battery '}{Math.round(settle.batteryDraw)} kWh
                </div>
              </div>
              <div className="budget-nums">
                <div className="budget-num">
                  <div className="label">Available</div>
                  <div className="v num">{settle.available.toFixed(1)}</div>
                </div>
                <div className="budget-num">
                  <div className="label">Allocated</div>
                  <div className="v num">{settle.requested.toFixed(1)}</div>
                </div>
                <div className={`budget-num ${proj.overAllocated ? 'over' : 'ok'}`}>
                  <div className="label">Remaining</div>
                  <div className="v num">{fmt(proj.powerBalance)}</div>
                </div>
              </div>
            </div>

            {subsystems.map((sub) => (
              <div className="sub-row" key={sub}>
                <div>
                  <div className="sub-name">{SUB_INFO[sub].name}</div>
                  <div className="sub-fn">{SUB_INFO[sub].fn}</div>
                </div>
                <div className="mode-group">
                  {([0, 1, 2, 3] as Mode[]).map((m) => (
                    <button
                      key={m}
                      className={`mode-btn ${plan.modes[sub] === m ? 'on' : ''}`}
                      disabled={m === 0 && !canTurnOff(sub)}
                      onClick={() => setMode(sub, m)}
                      title={m === 0 && !canTurnOff(sub)
                        ? `${SUB_INFO[sub].name} keeps the crew alive and cannot be switched off. LOW is the floor.`
                        : `${MODE_NAMES[m]} — ${subsystemCost(sub, m)} kWh`}
                    >
                      {MODE_NAMES[m]}
                    </button>
                  ))}
                </div>
                <div className="sub-cost">{subsystemCost(sub, plan.modes[sub])} kWh</div>
              </div>
            ))}

            <div className="sub-row">
              <div>
                <div className="sub-name">Battery discharge authorisation</div>
                <div className="sub-fn">
                  Batteries store energy, they do not create it. Draw deep today and tomorrow starts empty.
                </div>
              </div>
              <input
                type="range" min={0} max={1} step={0.05}
                value={plan.batteryAuth}
                onChange={(e) => setBatteryAuth(Number(e.target.value))}
                style={{ width: 160 }}
                aria-label="Battery discharge authorisation"
              />
              <div className="sub-cost">{Math.round(plan.batteryAuth * 100)}%</div>
            </div>
          </div>

          {/* -------------------------------------------- crew assignment */}
          <div className="panel">
            <div className="budget-head">
              <div>
                <div className="label">Crew Hours</div>
                <div className="tiny body-dim">
                  {state.crew.length} crew &times; {C.CREW_HOURS_EACH} h, minus{' '}
                  {C.CREW_HOURS_MANDATORY} h each for exercise and medical
                </div>
              </div>
              <div className={`budget-num ${usedHours > maxHours ? 'over' : 'ok'}`}>
                <div className="label">Used</div>
                <div className="v num">{usedHours} / {maxHours}</div>
              </div>
            </div>

            <div className="crew-assign">
              {state.crew.map((m, ci) => {
                const mine = assignments
                  .map((a, idx) => ({ ...a, idx }))
                  .filter((a) => a.crewIndex === ci)
                const personHours = mine.reduce((t, a) => t + TASK_HOURS[a.task], 0)

                return (
                  <div className="crew-card" key={m.name}>
                    <div className="crew-card-head">
                      <span className="crew-dot" style={{ background: m.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="h3">{m.shortRole} {m.name}</div>
                        <div className="crew-role">
                          {m.role} · ♥ {Math.round(m.health)} · fatigue {Math.round(m.fatigue)} · ☢ {m.dose.toFixed(2)} mSv
                        </div>
                      </div>
                      <span className={`chip ${personHours > C.CREW_HOURS_EACH ? 'danger' : 'info'}`}>
                        {personHours}/{C.CREW_HOURS_EACH} H
                      </span>
                    </div>

                    {mine.length > 0 && (
                      <div className="assign-list">
                        {mine.map((a) => (
                          <span key={a.idx} className={`assign-tag ${a.fieldConfirmed ? '' : 'pending'}`}>
                            {TASK_LABEL[a.task]} · {TASK_HOURS[a.task]}h
                            {!a.fieldConfirmed && ' ○'}
                            <button onClick={() => removeAssignment(a.idx)} aria-label="Remove task">×</button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="task-picker">
                      {TASKS.map((t) => (
                        <button
                          key={t}
                          className="task-btn"
                          disabled={personHours + TASK_HOURS[t] > C.CREW_HOURS_EACH}
                          onClick={() => assignTask(t, ci)}
                          title={personHours + TASK_HOURS[t] > C.CREW_HOURS_EACH
                            ? `${m.name} has ${C.CREW_HOURS_EACH - personHours} h left today; this needs ${TASK_HOURS[t]} h. Give it to someone else.`
                            : `${TASK_HOURS[t]} of ${m.name}'s ${C.CREW_HOURS_EACH} assignable hours`}
                        >
                          + {TASK_LABEL[t]} ({TASK_HOURS[t]}h)
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* --------------------------------------------- the hydroponic rack */}
        <RackPanel />

        {/* ------------------------------------------------- live forecast */}
        <div className="panel">
          <div className="budget-head">
            <div className="label">Forecast at these settings</div>
            <div className="tiny body-dim">Updates live as you change anything</div>
          </div>
          <div className="projection">
            <div className="proj-item">
              <div className="proj-v num" style={{ color: 'var(--o2)' }}>{fmt(proj.netO2)} kg</div>
              <div className="proj-sub">
                Oxygen / sol · {left(proj.o2Sols)}
              </div>
            </div>
            <div className="proj-item">
              <div className="proj-v num" style={{ color: 'var(--water)' }}>{fmt(proj.netWater)} L</div>
              <div className="proj-sub">
                Water / sol · {left(proj.waterSols)}
              </div>
            </div>
            <div className="proj-item">
              <div className="proj-v num" style={{ color: 'var(--food)' }}>{fmt(proj.netFood)}</div>
              <div className="proj-sub">
                Meals / sol · {left(proj.foodSols)}
              </div>
            </div>
            <div className="proj-item">
              <div className="proj-v num" style={{ color: proj.overAllocated ? 'var(--danger)' : 'var(--power)' }}>
                {fmt(proj.powerBalance)} kWh
              </div>
              <div className="proj-sub">Energy balance</div>
            </div>
            {/* The habitat itself is a resource. Air and heat are what the
                life-support and thermal settings actually buy, so they have to
                be as visible as the tanks. */}
            <div className="proj-item">
              <div className="proj-v num" style={{ color: proj.nextCo2 >= 0.45 ? 'var(--danger)' : 'var(--o2)' }}>
                {Math.round(proj.nextCo2 * 100)}%
              </div>
              <div className="proj-sub">
                Cabin CO₂ · {proj.nextCo2 >= 0.75 ? 'dangerous' : proj.nextCo2 >= 0.45 ? 'climbing' : 'clear'}
              </div>
            </div>
            <div className="proj-item">
              <div className="proj-v num" style={{ color: proj.nextHabTemp < 10 ? 'var(--danger)' : 'var(--power)' }}>
                {Math.round(proj.nextHabTemp)} °C
              </div>
              <div className="proj-sub">
                Habitat · {proj.nextHabTemp < 10 ? 'too cold' : 'in band'}
              </div>
            </div>
          </div>
          {!proj.telemetry && (
            <div className="proj-warn crit">
              <span>✕</span>
              <span>
                Comms is unpowered, so there is no forecast at all. Give the link
                at least LOW if you want to see what your plan will do.
              </span>
            </div>
          )}

          {/* Every risk this plan carries, not just the first one. A commander
              who can only see one problem at a time cannot weigh two against
              each other. */}
          {proj.risks.slice(0, 4).map((r, i) => (
            <div key={r} className={`proj-warn ${i === 0 && proj.overAllocated ? 'crit' : ''}`}>
              <span>{i === 0 && proj.overAllocated ? '✕' : '⚠'}</span>
              <span>{r}</span>
            </div>
          ))}
          {(state.reactor === 'stowed' || state.reactor === 'scrammed') && (
            <div className="proj-warn">
              <span>☢</span>
              <span>
                <strong>The fission unit is cold.</strong>{' '}
                {state.reactor === 'scrammed'
                  ? 'It scrammed and has not been restarted.'
                  : 'It has never been started.'}{' '}
                A startup shift costs {TASK_HOURS.startReactor} crew-hours, {C.REACTOR_START_KWH} kWh
                of battery and a little dose — and from the following sol it adds{' '}
                {C.REACTOR_KWH} kWh every sol, in any weather.
              </span>
            </div>
          )}
          {settle.wasted > 0.5 && !proj.overAllocated && (
            <div className="proj-warn">
              <span>⚠</span>
              <span>
                {Math.round(settle.wasted)} kWh will be wasted — the battery cannot hold it.
                Spend it on the greenhouse or science instead.
              </span>
            </div>
          )}
        </div>

        <div className="row spread">
          <div className="tiny body-dim" style={{ maxWidth: 520 }}>
            Tasks marked ○ must still be carried out in the field: walk to the structure and hold E.
          </div>
          <button
            className="btn primary lg"
            disabled={proj.overAllocated}
            onClick={confirmPlan}
            title={proj.overAllocated
              ? `The plan asks for ${Math.abs(proj.powerBalance).toFixed(1)} kWh more than the outpost can supply. Throttle a subsystem or authorise more battery.`
              : 'Lock in this plan and start the field window'}
          >
            {proj.overAllocated
              ? `Over budget by ${Math.abs(proj.powerBalance).toFixed(1)} kWh`
              : 'Confirm plan and go outside →'}
          </button>
        </div>
      </div>
    </div>
  )
}
