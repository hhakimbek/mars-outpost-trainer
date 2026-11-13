import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { C } from '../sim/constants'
import { ICE_THRESHOLD, SAMPLE_INFO, iceAt, sampleSites } from './iceField'
import { patchId } from '../sim/expedition'
import { terrainHeight, terrainNormal } from './noise'
import { Rover } from './Structures'
import { ModelSlot } from './ModelSlot'
import { handoff, rover } from './roverState'
import { useGame } from '../store/useGame'
import { useField } from './fieldState'

/**
 * THE EXPEDITION
 * ==============
 *
 * Everything that happens more than thirty metres from the habitat: driving
 * the rover, sounding the ground for subsurface ice, drilling it, and picking
 * up the rocks that become science back at the laboratory bench.
 *
 * The rover is not part of the outpost any more. It lives at whatever
 * position it was last parked at (see `roverState`), which is what makes
 * running it flat a mistake with consequences rather than a soft reset.
 */

const BOARD_RANGE = 4.4
const SAMPLE_RANGE = 3.6
const DRILL_SECONDS = 2.6
/** How often the energy spent driving is written back to the mission state. */
const SPEND_INTERVAL = 0.5

// ===========================================================================
//  FIELD MARKERS
// ===========================================================================

/**
 * The rocks worth collecting, and the holes already drilled.
 *
 * Sample sites get a cairn and a pip so they are findable from a distance —
 * a real field party flags what it means to come back for, and a player with
 * 150 m of identical regolith needs the same help. Drilled holes are marked
 * because a worked-out lens still reads on the radar, and nothing is more
 * annoying than re-drilling your own hole.
 */
function FieldMarkers() {
  const seed = useGame((s) => s.state.seed)
  const siteId = useGame((s) => s.state.siteId)
  const taken = useGame((s) => s.state.samplesTaken)
  const drilled = useGame((s) => s.state.drilled)
  const focused = useField((s) => s.sampleId)

  const sites = useMemo(() => sampleSites(seed, siteId), [seed, siteId])
  const pips = useRef<THREE.Group>(null)

  useFrame((st) => {
    if (!pips.current) return
    const t = st.clock.elapsedTime
    pips.current.children.forEach((c, i) => {
      c.position.y = 1.5 + Math.sin(t * 1.4 + i) * 0.08
      c.rotation.y = t * 0.7
    })
  })

  // A drilled patch is keyed by its patch cell, so the marker goes at the
  // centre of the cell rather than at whatever metre the drill happened to
  // stop on. Same arithmetic as the simulation uses.
  const holes = useMemo(() => Object.keys(drilled).map((k) => {
    const [cx, cz] = k.slice(1).split('_').map(Number)
    const x = cx * C.DRILL_PATCH
    const z = cz * C.DRILL_PATCH
    return { k, x, z, y: terrainHeight(x, z) }
  }), [drilled])

  return (
    <group>
      {sites.filter((p) => !taken.includes(p.id)).map((p) => {
        const y = terrainHeight(p.x, p.z)
        const on = focused === p.id
        return (
          <group key={p.id} position={[p.x, y, p.z]}>
            {/* the rock itself */}
            <mesh castShadow receiveShadow position={[0, 0.22, 0]} rotation={[0.3, p.x, 0.2]}>
              <dodecahedronGeometry args={[0.34, 0]} />
              <meshStandardMaterial
                color={p.kind === 'claystone' ? '#9a8f7a'
                  : p.kind === 'sulfate' ? '#cbb892'
                    : p.kind === 'olivine' ? '#6f7f5c'
                      : p.kind === 'breccia' ? '#7a6155' : '#5c5147'}
                roughness={0.95} />
            </mesh>
            {/* the flag that makes it findable */}
            <mesh castShadow position={[0.4, 0.6, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 1.2, 6]} />
              <meshStandardMaterial color="#d6d2c8" roughness={0.8} />
            </mesh>
            <mesh position={[0.56, 1.1, 0]}>
              <planeGeometry args={[0.3, 0.18]} />
              <meshStandardMaterial
                color="#a78bfa" emissive="#a78bfa" emissiveIntensity={on ? 2 : 0.8}
                side={THREE.DoubleSide} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[SAMPLE_RANGE * 0.42, SAMPLE_RANGE * 0.48, 22]} />
              <meshBasicMaterial
                color="#a78bfa" transparent opacity={on ? 0.8 : 0.22}
                toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
      <group ref={pips}>
        {sites.filter((p) => !taken.includes(p.id)).map((p) => (
          <mesh key={p.id} position={[p.x, terrainHeight(p.x, p.z) + 1.5, p.z]}>
            <octahedronGeometry args={[focused === p.id ? 0.13 : 0.08]} />
            <meshBasicMaterial color="#a78bfa" toneMapped={false} transparent opacity={0.9} />
          </mesh>
        ))}
      </group>

      {holes.map((h) => (
        <group key={h.k} position={[h.x, h.y, h.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <circleGeometry args={[0.5, 16]} />
            <meshStandardMaterial color="#2e2520" roughness={1} />
          </mesh>
          {/* spoil heap */}
          <mesh castShadow position={[0.55, 0.08, 0.2]}>
            <coneGeometry args={[0.42, 0.22, 10]} />
            <meshStandardMaterial color="#a86a42" roughness={1} />
          </mesh>
          <mesh castShadow position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1.0, 5]} />
            <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ===========================================================================
//  THE ROVER CONTROLLER
// ===========================================================================

interface Keys { [code: string]: boolean }

export function Expedition() {
  const { camera } = useThree()
  const group = useRef<THREE.Group>(null)

  const phase = useGame((s) => s.phase)
  const driving = useGame((s) => s.driving)
  const inside = useGame((s) => s.inside)
  const state = useGame((s) => s.state)
  const spendDrive = useGame((s) => s.spendDrive)
  const drillAt = useGame((s) => s.drillAt)
  const takeSample = useGame((s) => s.takeSample)
  const leaveRover = useGame((s) => s.leaveRover)
  const modalOpen = useGame((s) => !!s.activeEvent && !s.eventResolved)

  const setSample = useField((s) => s.setSample)
  const setHold = useField((s) => s.setHold)

  const keys = useRef<Keys>({})
  const speed = useRef(0)
  const hold = useRef(0)
  const spendAcc = useRef(0)
  const spendTimer = useRef(0)
  const sampleRef = useRef<string | null>(null)
  const camPos = useRef(new THREE.Vector3())
  const scratch = useMemo(() => ({ v: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3() }), [])

  const sites = useMemo(
    () => sampleSites(state.seed, state.siteId), [state.seed, state.siteId])

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true }
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false }
    const blur = () => { keys.current = {} }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)

    // ---- place the vehicle, driven or parked ----
    if (group.current) {
      const y = terrainHeight(rover.x, rover.z)
      group.current.position.set(rover.x, y, rover.z)
      // The chassis follows the slope it is standing on, which is most of
      // what sells a six-wheeled vehicle on rough ground.
      const [nx, ny, nz] = terrainNormal(rover.x, rover.z)
      scratch.n.set(nx, ny, nz)
      scratch.q.setFromUnitVectors(scratch.up, scratch.n)
      group.current.quaternion.copy(scratch.q)
      group.current.rotateY(rover.heading)
    }

    if (!driving || phase !== 'fieldOps' || modalOpen || inside) return

    // ---- drive ----
    const throttle = (keys.current['KeyW'] ? 1 : 0) - (keys.current['KeyS'] ? 1 : 0)
    const steer = (keys.current['KeyA'] ? 1 : 0) - (keys.current['KeyD'] ? 1 : 0)

    // Top speed is deliberately low. Curiosity's is 0.14 km/h; a crewed rover
    // is faster but it is still a vehicle picking its way over boulders, and
    // the whole point of the field is that distance costs something.
    const target = throttle * (keys.current['ShiftLeft'] ? 7.5 : 4.6)
    speed.current += (target - speed.current) * Math.min(dt * 2.2, 1)
    if (Math.abs(speed.current) < 0.02) speed.current = 0

    // Steering only bites while moving, like a real vehicle.
    rover.heading += steer * dt * 1.15 * Math.min(Math.abs(speed.current) / 2.2, 1)
      * Math.sign(speed.current || 1)

    const dx = -Math.sin(rover.heading) * speed.current * dt
    const dz = -Math.cos(rover.heading) * speed.current * dt
    const moved = Math.hypot(dx, dz)
    rover.x += dx
    rover.z += dz
    rover.spin += speed.current * dt * 2

    // Keep it in the bowl.
    const r = Math.hypot(rover.x, rover.z)
    if (r > 150) { rover.x *= 150 / r; rover.z *= 150 / r }

    // ---- energy, written back a couple of times a second ----
    spendAcc.current += moved
    spendTimer.current += dt
    if (spendTimer.current >= SPEND_INTERVAL) {
      if (spendAcc.current > 0.01) spendDrive(spendAcc.current)
      spendAcc.current = 0
      spendTimer.current = 0
    }

    // ---- chase camera ----
    const y = terrainHeight(rover.x, rover.z)
    scratch.v.set(
      rover.x + Math.sin(rover.heading) * 9.5,
      y + 5.2,
      rover.z + Math.cos(rover.heading) * 9.5,
    )
    if (camPos.current.lengthSq() === 0) camPos.current.copy(scratch.v)
    camPos.current.lerp(scratch.v, Math.min(dt * 3.2, 1))
    camera.position.copy(camPos.current)
    camera.lookAt(rover.x, y + 1.6, rover.z)

    // ---- the nearest rock within reach ----
    let near: string | null = null
    let bestD = SAMPLE_RANGE
    for (const p of sites) {
      if (state.samplesTaken.includes(p.id)) continue
      const d = Math.hypot(rover.x - p.x, rover.z - p.z)
      if (d < bestD) { bestD = d; near = p.id }
    }
    if (near !== sampleRef.current) {
      sampleRef.current = near
      setSample(near)
    }

    // ---- F collects, E drills ----
    if (keys.current['KeyF'] && near) {
      keys.current['KeyF'] = false
      takeSample(near)
    }

    if (keys.current['KeyE'] && Math.abs(speed.current) < 0.2) {
      hold.current = Math.min(hold.current + dt / DRILL_SECONDS, 1)
      setHold(hold.current)
      if (hold.current >= 1) {
        hold.current = 0
        setHold(0)
        drillAt(rover.x, rover.z)
      }
    } else if (hold.current > 0) {
      hold.current = Math.max(hold.current - dt * 1.4, 0)
      setHold(hold.current)
    }

    // ---- Q gets out, beside the vehicle ----
    if (keys.current['KeyQ']) {
      keys.current['KeyQ'] = false
      handoff.to = [
        rover.x + Math.cos(rover.heading) * 2.6,
        rover.z - Math.sin(rover.heading) * 2.6,
      ]
      setSample(null)
      sampleRef.current = null
      leaveRover()
    }
  })

  return (
    <group>
      <group ref={group}>
        {/* A real NASA model goes here the moment one is dropped into
            public/models/ — see world/ModelSlot.tsx. Until then this is the
            procedural vehicle, and nothing about the scene depends on which
            of the two is drawn. */}
        <ModelSlot slot="rover">
          <Rover charged={state.roverKwh > 0} />
        </ModelSlot>
        {/* the ground-penetrating radar boom, which is the instrument the
            whole expedition is steered by */}
        <group position={[-2.3, 0.5, 0]}>
          <mesh castShadow position={[0, 0.1, 0]}>
            <boxGeometry args={[1.3, 0.12, 1.6]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <boxGeometry args={[1.2, 0.06, 1.5]} />
            <meshStandardMaterial
              color="#67e8f9" emissive="#67e8f9"
              emissiveIntensity={driving ? 1.4 : 0.3} toneMapped={false} />
          </mesh>
        </group>
        {/* the drill mast */}
        <mesh castShadow position={[-1.4, 1.0, 0.9]}>
          <cylinderGeometry args={[0.1, 0.1, 1.8, 10]} />
          <meshStandardMaterial color="#aab3bd" metalness={0.75} roughness={0.3} />
        </mesh>
      </group>
      <FieldMarkers />
    </group>
  )
}

/** Exported so the HUD can read the same field the controller steers by. */
export function roverRadar(seed: number, siteId: string) {
  const v = iceAt(rover.x, rover.z, seed, siteId)
  return {
    concentration: v,
    reachable: v >= ICE_THRESHOLD,
    patch: patchId(rover.x, rover.z),
    x: rover.x,
    z: rover.z,
  }
}

export { SAMPLE_INFO, BOARD_RANGE }
