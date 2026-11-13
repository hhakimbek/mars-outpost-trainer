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
 * The globe is its own chunk for the same reason: it carries the whole
 * topography model and a 33k-vertex planet, and a player who loads a save goes
 * straight to the surface without ever seeing it.
 */
const GlobeScene = lazy(() => import('./world/MarsGlobe').then((m) => ({ default: m.GlobeScene })))

/**
 * The orbit panel goes with it. It reads the height field to show the relief
 * under each marker, so leaving it in the main chunk would pull the whole
 * topography model onto the menu screen, which never draws a planet.
 */
const SiteSelect = lazy(() => import('./ui/SiteSelect').then((m) => ({ default: m.SiteSelect })))

/**
 * The habitat interior is a third scene, at a third scale: 16 metres across,
 * lit by ceiling panels, with no sky and no terrain. It shares nothing with
 * the surface, so it is its own chunk and only one of the two is ever mounted.
 */
const InteriorScene = lazy(() =>
  import('./world/Interior').then((m) => ({ default: m.InteriorScene })))

/**
 * Drives the Field Ops clock. Kept outside the 3D tree so the EVA window keeps
 * running even while a modal is covering the canvas.
 */
function FieldClock() {
  const phase = useGame((s) => s.phase)
  const tick = useGame((s) => s.tickFieldOps)
  const tickAirlock = useGame((s) => s.tickAirlock)
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
      // The airlock runs on the same clock. Driving it from outside the 3D
      // tree means the cycle keeps going across the moment where one canvas
      // unmounts and the other mounts — which is exactly when it happens.
      tickAirlock(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, tick, tickAirlock])

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
  const selectedSiteId = useGame((s) => s.selectedSiteId)
  const selectSite = useGame((s) => s.selectSite)
  const landingComplete = useGame((s) => s.landingComplete)
  const inside = useGame((s) => s.inside)

  // Warm the world chunk the moment the app is interactive rather than when
  // the player commits to a mission.
  useEffect(prefetchScene, [])

  // Orbit and descent are the globe; everything from the briefing onward is
  // the surface. They are different scenes at wildly different scales, so they
  // are different canvases and only one is ever mounted.
  const inOrbit = phase === 'orbit' || phase === 'descent'

  // The 3D world is mounted for every in-mission phase so the outpost stays
  // visible behind the panels — a modal over a live Mars reads far better
  // than a modal over a flat colour.
  const inMission = phase !== 'menu' && phase !== 'howto' && !inOrbit
  const onSurface = inMission && !inside

  return (
    <div className="app">
      {onSurface && (
        <div className="canvas-wrap">
          <Suspense fallback={<SceneFallback />}>
            <Scene />
          </Suspense>
        </div>
      )}

      {inMission && inside && (
        <div className="canvas-wrap">
          <Suspense fallback={<SceneFallback />}>
            <InteriorScene />
          </Suspense>
        </div>
      )}

      {inOrbit && (
        <div className="canvas-wrap">
          <Suspense fallback={<SceneFallback />}>
            <GlobeScene
              selectedId={selectedSiteId}
              onSelect={selectSite}
              descending={phase === 'descent'}
              onArrived={landingComplete}
            />
          </Suspense>
        </div>
      )}

      <FieldClock />

      {phase === 'menu' && <Menu />}
      {phase === 'howto' && <HowTo />}
      {inOrbit && (
        <Suspense fallback={null}>
          <SiteSelect />
        </Suspense>
      )}
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
