import { C, TASK_HOURS } from '../sim/constants'
import { CROP_LIST, cropById } from '../data/crops'
import type { CropId } from '../data/crops'
import { bedStage, greenhouseSummary } from '../sim/greenhouse'
import { useGame } from '../store/useGame'

/**
 * The hydroponic rack, as a planning surface.
 *
 * The brief for this screen is that a player should be able to see why a bed
 * is behind without reading the log: the environment it is growing in is shown
 * next to the crop that wants a different one. Everything here is projected at
 * the greenhouse mode currently selected in the power budget, so changing that
 * dial visibly changes the rack.
 */
export function RackPanel() {
  const state = useGame((s) => s.state)
  const plan = useGame((s) => s.plan)
  const assignments = useGame((s) => s.assignments)
  const assignTask = useGame((s) => s.assignTask)
  const removeAssignment = useGame((s) => s.removeAssignment)

  const gh = state.greenhouse
  const mode = plan.modes.greenhouse
  const rack = greenhouseSummary(gh)
  const growingBeds = rack.planted - rack.ready

  // The same arithmetic the rack will run tonight, so the panel cannot lie.
  const projTemp = state.habTemp + C.GH_LAMP_HEAT[mode]
  const projCo2 = C.GH_CO2_PPM[mode]
  const transpired = gh.humidity + C.GH_HUMIDITY_PER_BED * growingBeds
  const removable = Math.min(
    C.GH_DEHUMIDIFY[mode], Math.max(transpired - C.GH_HUMIDITY_TARGET[mode], 0))
  const projHumidity = Math.min(Math.max(transpired - removable, 0), 1)
  const mouldy = projHumidity >= C.GH_HUMIDITY_HIGH

  const nutrientDraw = gh.beds.reduce((t, b) => {
    const st = bedStage(b)
    if (st === 'empty' || st === 'wilted' || st === 'ready' || !b.crop) return t
    return t + cropById(b.crop).nutrientPerSol
  }, 0)
  const mixing = assignments.filter((a) => a.task === 'mixNutrients').length
  const projNutrients = Math.min(Math.max(
    gh.nutrients + mixing * C.GH_NUTRIENT_REFILL +
      (plan.modes.waterRecycler === 3 ? C.GH_NUTRIENT_FROM_RECYCLER : 0) - nutrientDraw, 0), 1)

  /**
   * Who takes a rack shift.
   *
   * The scientist first — the role bonus is real — then whoever still has the
   * hours. Making the player pick a crew member before they can pick a crop
   * turned one decision into three clicks.
   */
  const assignee = (hours: number): number => {
    const used = (ci: number) => assignments
      .filter((a) => a.crewIndex === ci)
      .reduce((t, a) => t + TASK_HOURS[a.task], 0)
    const order = [2, 3, 1, 0].filter((ci) => ci < state.crew.length)
    return order.find((ci) => used(ci) + hours <= C.CREW_HOURS_EACH) ?? -1
  }

  const sow = (bed: number, crop: CropId) => {
    const ci = assignee(TASK_HOURS.plantCrop)
    if (ci >= 0) assignTask('plantCrop', ci, bed, crop)
  }

  const tend = (bed: number) => {
    const ci = assignee(TASK_HOURS.tendGreenhouse)
    if (ci >= 0) assignTask('tendGreenhouse', ci, bed)
  }

  return (
    <div className="panel">
      <div className="budget-head">
        <div>
          <div className="label">Hydroponic Rack</div>
          <div className="tiny body-dim">
            {rack.planted} of {gh.beds.length} beds planted
            {rack.ready > 0 && ` · ${Math.round(rack.mealsReady)} meals ready to come in`}
            {rack.waterDraw > 0 && ` · ${Math.round(rack.waterDraw)} L/sol drawn, ` +
              `${Math.round(C.GREENHOUSE_RECOVERY * 100)}% recovered`}
          </div>
        </div>
        <div className={`budget-num ${mouldy ? 'over' : 'ok'}`}>
          <div className="label">Grow lights</div>
          <div className="v num">{['OFF', 'LOW', 'NOM', 'HIGH'][mode]}</div>
        </div>
      </div>

      {/* -------------------------------------------- the shared environment */}
      <div className="rack-env">
        <EnvCell
          label="Rack temp" value={`${Math.round(projTemp)} °C`}
          note={`habitat ${Math.round(state.habTemp)} °C + ${C.GH_LAMP_HEAT[mode]} from the lamps`}
          bad={false}
        />
        <EnvCell
          label="Humidity" value={`${Math.round(projHumidity * 100)}%`}
          note={mouldy
            ? `${growingBeds} beds out-transpire the dehumidifier at this setting — mould`
            : `${growingBeds} growing bed${growingBeds === 1 ? '' : 's'}, dehumidifier keeping up`}
          bad={mouldy}
        />
        <EnvCell
          label="CO₂" value={`${projCo2} ppm`}
          note={projCo2 > 420
            ? `enriched from the outside air, which is 95% CO₂ — +${Math.round(
                C.GH_CO2_BONUS * ((projCo2 - 420) / (1500 - 420)) * 100)}% growth`
            : 'habitat ambient — no enrichment at this setting'}
          bad={false}
        />
        <EnvCell
          label="Nutrients" value={`${Math.round(projNutrients * 100)}%`}
          note={projNutrients <= 0.001
            ? 'empty — growth drops to a third and the crops lose condition'
            : `${Math.round(nutrientDraw * 100)}%/sol drawn by the planted beds`}
          bad={projNutrients <= 0.12}
        />
      </div>

      {/* --------------------------------------------------------- the beds */}
      <div className="beds">
        {gh.beds.map((bed, i) => {
          const stage = bedStage(bed)
          const def = bed.crop ? cropById(bed.crop) : null
          const free = stage === 'empty' || stage === 'wilted'
          const queued = assignments
            .map((a, idx) => ({ ...a, idx }))
            .filter((a) => a.bed === i && (a.task === 'plantCrop' || a.task === 'tendGreenhouse'))

          return (
            <div className={`bed${free ? ' free' : ''}`} key={i}>
              <div className="row spread">
                <span className="bed-num">BED {i + 1}</span>
                {def && !free && (
                  <span className="bed-dot" style={{ background: def.tint }} />
                )}
              </div>

              {free ? (
                <>
                  <div className="tiny body-dim mt-s">
                    {stage === 'wilted'
                      ? 'Crop lost — replant from seed'
                      : 'Empty'}
                  </div>
                  <div className="crop-picker mt-s">
                    {CROP_LIST.map((c) => (
                      <button
                        key={c.id}
                        className="crop-btn"
                        style={{ borderColor: c.tint }}
                        onClick={() => sow(i, c.id)}
                        title={
                          `${c.name} ${c.cultivar} — ${c.growSols} sols, ${c.meals} meals, ` +
                          `${c.waterPerSol} L/sol, needs ${['OFF', 'LOW', 'NOMINAL', 'HIGH'][c.minLight]} ` +
                          `light, likes ${c.idealTempC} °C` +
                          (c.morale > 0
                            ? `, and lifts every crew member +${c.morale} condition at harvest.`
                            : `, no fresh-food benefit.`) +
                          `\n\n${c.blurb}\n\nReal world: ${c.source}`
                        }
                      >
                        <span className="crop-name">{c.name.split(' ').pop()}</span>
                        <span className="crop-stat num">
                          {c.growSols} sol · {c.meals} meals{c.morale > 0 ? ` · ♥+${c.morale}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="bed-crop">{def?.name}</div>
                  <div className="tiny body-dim">{def?.cultivar}</div>
                  <div className="bed-bars mt-s">
                    <Bar
                      label="Grown" v={bed.progress}
                      colour={stage === 'ready' ? 'var(--food)' : 'var(--rust)'}
                    />
                    <Bar
                      label="Condition" v={bed.health / 100}
                      colour={bed.health < 40 ? 'var(--danger)'
                        : bed.health < 70 ? 'var(--caution)' : 'var(--ok)'}
                    />
                  </div>
                  <div className="tiny body-dim mt-s">
                    {stage === 'ready'
                      ? 'Ready — the harvest lands when the sol resolves'
                      : mode < (def?.minLight ?? 0)
                        ? `Will not grow below ${['OFF', 'LOW', 'NOMINAL', 'HIGH'][def!.minLight]} light`
                        : `Wants ${def?.idealTempC} °C · rack is ${Math.round(projTemp)} °C`}
                  </div>
                  {stage !== 'ready' && (
                    <button className="task-btn mt-s" onClick={() => tend(i)}>
                      + Tend this bed ({TASK_HOURS.tendGreenhouse}h)
                    </button>
                  )}
                </>
              )}

              {queued.length > 0 && (
                <div className="assign-list mt-s">
                  {queued.map((a) => (
                    <span key={a.idx} className="assign-tag">
                      {a.task === 'plantCrop'
                        ? `Sow ${a.crop ? cropById(a.crop).name.split(' ').pop() : ''}`
                        : 'Tend'}
                      {' · '}{state.crew[a.crewIndex]?.shortRole}
                      <button onClick={() => removeAssignment(a.idx)} aria-label="Remove task">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="tiny body-dim mt-m">
        Growth times are compressed for a seven-sol mission — real lettuce takes about a
        month and a real potato three. The ratios between the crops, their water and nutrient
        demands and their light and temperature preferences follow the published figures,
        which are quoted on each crop.
      </p>
    </div>
  )
}

function EnvCell({
  label, value, note, bad,
}: {
  label: string; value: string; note: string; bad: boolean
}) {
  return (
    <div className={`env-cell${bad ? ' bad' : ''}`}>
      <div className="label">{label}</div>
      <div className="env-v num">{value}</div>
      <div className="tiny body-dim">{note}</div>
    </div>
  )
}

function Bar({ label, v, colour }: { label: string; v: number; colour: string }) {
  return (
    <div className="bed-bar">
      <span className="tiny body-dim">{label}</span>
      <span className="bed-track">
        <span
          className="bed-fill"
          style={{ width: `${Math.min(Math.max(v, 0), 1) * 100}%`, background: colour }}
        />
      </span>
      <span className="tiny num">{Math.round(v * 100)}%</span>
    </div>
  )
}
