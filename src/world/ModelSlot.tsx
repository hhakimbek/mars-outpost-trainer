import { Component, Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { MODELS, type ModelSlotId } from './models'

/**
 * READY-MADE 3D MODELS, WITHOUT A HARD DEPENDENCY ON THEM
 * ======================================================
 *
 * Every object in this trainer is built from primitives in code. That was a
 * deliberate choice — it keeps the repository small enough to clone over a
 * bad connection, every silhouette is tuned against the thing it represents,
 * and there is no licence to track. But a real NASA model of a rover or a
 * lander is better than a good approximation of one, and the project should
 * be able to use one the moment somebody drops it in.
 *
 * So: a slot. Each slot names a file under `public/models/`. If `models.ts`
 * lists a file for the slot, it is loaded and used. If it does not, or if the
 * file is missing or broken at runtime, the procedural mesh renders instead
 * and nothing is lost. Nobody has to edit a component to switch.
 *
 * HOW TO ADD A MODEL
 * ------------------
 * 1. Get a .glb. NASA 3D Resources (nasa3d.arc.nasa.gov) and the NASA/JPL
 *    Solar System Treks catalogues publish rovers, landers and instruments,
 *    most of them public domain — check each model's own usage terms.
 * 2. Put it in `public/models/`, e.g. `public/models/rover.glb`.
 * 3. Add the entry to MODELS in `world/models.ts`:
 *       rover: { file: 'rover.glb', scale: 1.4, yaw: Math.PI / 2, lift: 0 }
 * 4. That is all. The procedural rover stops being drawn.
 *
 * Mind the size. A detailed rover is often tens of megabytes, which is a long
 * clone and a long first paint for every player — `public/` is served as-is
 * and is not code-split. Decimate it first, or host it and load by URL.
 */

interface SlotProps {
  slot: ModelSlotId
  /** Drawn when there is no model, or when loading one fails. */
  children: React.ReactNode
}

/**
 * Catches a failed load and shows the procedural mesh instead.
 *
 * A model slot must never be able to take the scene down: a typo in a
 * filename or a half-downloaded .glb should cost the player a nicer rover,
 * not the whole mission.
 */
class ModelBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) {
    console.warn('[models] falling back to the procedural mesh:', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function LoadedModel({ slot }: { slot: ModelSlotId }) {
  const def = MODELS[slot]!
  const { scene } = useGLTF(`models/${def.file}`)
  const group = useRef<THREE.Group>(null)

  // Cloned, because the same file may fill more than one slot and a scene
  // graph cannot be in two places at once.
  const model = useMemo(() => scene.clone(true), [scene])

  useLayoutEffect(() => {
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
  }, [model])

  return (
    <group
      ref={group}
      scale={def.scale ?? 1}
      rotation={[0, def.yaw ?? 0, 0]}
      position={[0, def.lift ?? 0, 0]}
    >
      <primitive object={model} />
    </group>
  )
}

/**
 * Renders the slot's model if there is one, and the children if there is not.
 *
 * The children are the procedural mesh, so the call site reads as "use the
 * real model here, and this if there isn't one".
 */
export function ModelSlot({ slot, children }: SlotProps) {
  if (!MODELS[slot]) return <>{children}</>
  return (
    <ModelBoundary fallback={children}>
      <Suspense fallback={children}>
        <LoadedModel slot={slot} />
      </Suspense>
    </ModelBoundary>
  )
}
