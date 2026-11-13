import { Suspense, lazy, useEffect, useRef } from 'react'
import { Hud } from './ui/Hud'
import { Planning } from './ui/Planning'
import {
  Briefing, Debrief, EventModal, HowTo, Menu, Resolution, Results, SciencePanel, Toasts,
} from './ui/Screens'
import { useGame } from './store/useGame'

/**
 * three.js, the r3f reconciler and the postprocessing chain are by far the
 * heaviest thing in the bundle, and the menu needs none of them. Splitting
 * them behind a lazy boundary lets the first screen paint while they are
 * still arriving, and `prefetch` below starts that download immediately, so
 * by the time anyone has read the menu and clicked Start the chunk is warm.
 */
const Scene = lazy(() => import('./world/Scene').then((m) => ({ default: m.Scene })))
const prefetchScene = () => { void import('./world/Scene') }

/**
 * Drives the Field Ops clock. Kept outside the 3D tree so the EVA window keeps
 * running even while a modal is covering the canvas.
 */
function FieldClock() {
  const phase = useGame((s) => s.phase)
  const tick = useGame((s) => s.tickFieldOps)
  const last = useRef(performance.now())

  useEffect(() => {
    if (phase !== 'fieldOps') return
    last.current = performance.now()
    let raf = 0
    const loop = () => {
      const now = performance.now()
      const dt = Math.min((now - last.current) / 1000, 0.25)
      last.current = now
      tick(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, tick])

  return null
}

/** Stands in for the canvas for the one frame before the world chunk lands. */
function SceneFallback() {
  return <div className="canvas-fallback" aria-hidden="true" />
}

export default function App() {
  const phase = useGame((s) => s.phase)
  const eventResolved = useGame((s) => s.eventResolved)
  const activeEvent = useGame((s) => s.activeEvent)

  // Warm the world chunk the moment the app is interactive rather than when
  // the player commits to a mission.
  useEffect(prefetchScene, [])

  // The 3D world is mounted for every in-mission phase so the outpost stays
  // visible behind the panels — a modal over a live Mars reads far better
  // than a modal over a flat colour.
  const inMission = phase !== 'menu' && phase !== 'howto'

  return (
    <div className="app">
      {inMission && (
        <div className="canvas-wrap">
          <Suspense fallback={<SceneFallback />}>
            <Scene />
          </Suspense>
        </div>
      )}

      <FieldClock />

      {phase === 'menu' && <Menu />}
      {phase === 'howto' && <HowTo />}
      {phase === 'briefing' && <Briefing />}
      {phase === 'planning' && <Planning />}
      {phase === 'fieldOps' && activeEvent && !eventResolved && <EventModal />}
      {phase === 'fieldOps' && (!activeEvent || eventResolved) && <Hud />}
      {phase === 'resolution' && <Resolution />}
      {phase === 'debrief' && <Debrief />}
      {phase === 'results' && <Results />}
      {phase === 'science' && <SciencePanel />}

      <Toasts />
    </div>
  )
}
