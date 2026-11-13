import { BUILDABLES, TECHS, buildById } from '../data/research'
import type { BuildId, TechId } from '../data/research'
import { OBJECTIVES } from '../data/objectives'
import { TASK_HOURS } from '../sim/constants'
import {
  buildBlockedReason, builtCount, hasTech, techBlockedReason,
} from '../sim/research'
import { useGame } from '../store/useGame'

/**
 * Research, construction and the mission's objectives.
 *
 * These three belong on one screen because they are one loop: doing the
 * mission earns science, science buys technology, technology unlocks
 * construction, and construction makes the next sols easier. Split across
 * three panels it reads as three unrelated menus.
 */

export function ResearchPanel() {
  const state = useGame((s) => s.state)
  const researchTech = useGame((s) => s.researchTech)
  const queueBuild = useGame((s) => s.queueBuild)
  const assignments = useGame((s) => s.assignments)

  const buildScheduled = assignments.some((a) => a.task === 'build')
  const canBuild = hasTech(state, 'sintering')

  return (
    <div className="panel mt-m">
      <div className="row spread">
        <div>
          <div className="label">Research &amp; Construction</div>
          <div className="tiny body-dim">
            Science is spent here. Everything bought is permanent, so the earlier it is
            bought the more sols it pays back over.
          </div>
        </div>
        <div className="budget-num">
          <div className="label">Science banked</div>
          <div className="v num">{Math.floor(state.stocks.science)}</div>
        </div>
      </div>

      <div className="tech-grid mt-s">
        {TECHS.map((t) => {
          const done = hasTech(state, t.id)
          const blocked = done ? null : techBlockedReason(state, t.id)
          return (
            <button
              key={t.id}
              className={`tech-card ${done ? 'done' : blocked ? 'locked' : 'ready'}`}
              disabled={done || !!blocked}
              onClick={() => researchTech(t.id as TechId)}
              title={t.real}
            >
              <div className="row spread">
                <span className="tech-name">{t.name}</span>
                <span className="num tiny">{done ? '✓' : `${t.cost}`}</span>
              </div>
              <div className="tiny body-dim mt-s">{t.effect}</div>
              {blocked && <div className="tiny tech-block">{blocked}</div>}
            </button>
          )
        })}
      </div>

      <div className="label mt-m">Construction</div>
      {!canBuild ? (
        <div className="tiny body-dim">
          Locked until Regolith Sintering is researched. There is no materials budget here on
          purpose: on Mars the feedstock is the ground, so a build costs energy and crew-hours
          and nothing else.
        </div>
      ) : (
        <>
          <div className="tiny body-dim">
            Queue one, then schedule a Build shift ({TASK_HOURS.build} crew-hours) and carry it
            out in the field.
          </div>
          <div className="tech-grid mt-s">
            {BUILDABLES.map((b) => {
              const have = builtCount(state, b.id)
              const blocked = buildBlockedReason(state, b.id)
              const queued = state.pendingBuild === b.id
              return (
                <button
                  key={b.id}
                  className={`tech-card ${queued ? 'ready' : blocked ? 'locked' : ''}`}
                  disabled={!!blocked && !queued}
                  onClick={() => queueBuild(queued ? null : b.id as BuildId)}
                  title={b.real}
                >
                  <div className="row spread">
                    <span className="tech-name">{b.name}</span>
                    <span className="num tiny">{have}/{b.max} · {b.energy} kWh</span>
                  </div>
                  <div className="tiny body-dim mt-s">{b.effect}</div>
                  {queued && (
                    <div className="tiny" style={{ color: 'var(--ok)' }}>
                      Queued{buildScheduled ? '' : ' — now assign a Build shift'}
                    </div>
                  )}
                  {blocked && !queued && <div className="tiny tech-block">{blocked}</div>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {state.pendingBuild && !buildScheduled && (
        <div className="proj-warn mt-s">
          <span>⚠</span>
          <span>
            {buildById(state.pendingBuild as BuildId)?.name} is queued but nobody is scheduled to
            build it. Assign a Build shift below.
          </span>
        </div>
      )}
    </div>
  )
}

/** The mission's objectives, with live progress. */
export function ObjectivePanel() {
  const state = useGame((s) => s.state)
  const done = state.objectivesMet

  return (
    <div className="panel mt-m">
      <div className="label">Mission Objectives</div>
      <div className="tiny body-dim">
        Surviving seven sols is the floor. These are what the mission was sent to do — each pays
        science the first time it is met.
      </div>
      <div className="obj-list mt-s">
        {OBJECTIVES.map((o) => {
          const met = done.includes(o.id)
          const p = met ? 1 : o.progress(state)
          return (
            <div key={o.id} className={`obj-row ${met ? 'met' : ''}`} title={o.why}>
              <span className="obj-mark">{met ? '✓' : '○'}</span>
              <div className="stack" style={{ flex: 1 }}>
                <div className="row spread">
                  <span className="obj-name">{o.name}</span>
                  <span className="tiny num body-dim">+{o.reward}</span>
                </div>
                <span className="tiny body-dim">{o.brief}</span>
                <div className="obj-track">
                  <div className="obj-fill" style={{ width: `${p * 100}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
