import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { C } from '../sim/constants'
import { STRUCTURES, structureById } from '../data/structures'
import { terrainHeight } from './noise'
import { softGlow } from './textures'
import { useGame } from '../store/useGame'
import { useField } from './fieldState'
import type { Zone } from '../sim/types'

const EYE = 1.7
const GRAVITY = -C.MARS_GRAVITY // 3.721 m/s^2, about 0.379 g

interface Keys { [code: string]: boolean }

// ===========================================================================
//  SUIT
// ===========================================================================

/**
 * EVA suit, built from primitives.
 *
 * The parts that make a suit read as a suit are the hard torso, the backpack,
 * the gold visor and the joint rings — so those get the detail, and the rest
 * stays cheap. Everything is one group so the walk cycle can swing limbs.
 */
function SuitMesh({ color, walking, speed }: { color: string; walking: number; speed: number }) {
  const swing = Math.sin(walking) * 0.55 * Math.min(speed, 1)
  const bob = Math.abs(Math.cos(walking)) * 0.035 * Math.min(speed, 1)

  const white = '#f2ede4'
  const shadeWhite = '#ddd6ca'
  const joint = '#b9b2a6'

  return (
    <group position={[0, bob, 0]}>
      {/* ---- hard upper torso ---- */}
      <mesh castShadow position={[0, 1.08, 0]}>
        <boxGeometry args={[0.56, 0.5, 0.36]} />
        <meshStandardMaterial color={white} roughness={0.52} metalness={0.08} />
      </mesh>
      {/* soft lower torso */}
      <mesh castShadow position={[0, 0.76, 0]}>
        <capsuleGeometry args={[0.255, 0.24, 4, 16]} />
        <meshStandardMaterial color={shadeWhite} roughness={0.72} />
      </mesh>
      {/* chest-to-shoulder bridge, so the hard torso does not end in a cliff */}
      <mesh castShadow position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.14, 16]} />
        <meshStandardMaterial color={white} roughness={0.55} />
      </mesh>
      {/* waist ring */}
      <mesh position={[0, 0.88, 0]}>
        <torusGeometry args={[0.26, 0.035, 6, 16]} />
        <meshStandardMaterial color={joint} metalness={0.5} roughness={0.42} />
      </mesh>
      {/* shoulder ring */}
      <mesh position={[0, 1.3, 0]}>
        <torusGeometry args={[0.24, 0.035, 6, 16]} />
        <meshStandardMaterial color={joint} metalness={0.5} roughness={0.42} />
      </mesh>

      {/* ---- chest control module ---- */}
      <mesh castShadow position={[0, 1.12, 0.2]}>
        <boxGeometry args={[0.3, 0.22, 0.08]} />
        <meshStandardMaterial color="#5c6572" roughness={0.45} metalness={0.4} />
      </mesh>
      {[-0.08, 0, 0.08].map((x, i) => (
        <mesh key={x} position={[x, 1.16, 0.25]}>
          <boxGeometry args={[0.05, 0.03, 0.01]} />
          <meshStandardMaterial
            color={i === 1 ? '#3fd68c' : '#fbbf24'}
            emissive={i === 1 ? '#3fd68c' : '#fbbf24'}
            emissiveIntensity={1.8} toneMapped={false}
          />
        </mesh>
      ))}
      {/* mission patch */}
      <mesh position={[0.16, 1.05, 0.19]}>
        <circleGeometry args={[0.055, 14]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* ---- helmet ---- */}
      <mesh castShadow position={[0, 1.57, 0]}>
        <sphereGeometry args={[0.27, 22, 18]} />
        <meshStandardMaterial color="#f8f5ef" roughness={0.35} metalness={0.1} />
      </mesh>
      {/* Gold sun visor.
          SphereGeometry measures phi from the -X axis, so the original
          phiStart of -PI/2.6 put the visor on the side of the helmet and left
          the face a blank white sphere. Centring the span on PI/2 puts it on
          +Z, which is the direction the suit faces. */}
      <mesh position={[0, 1.58, 0.015]}>
        <sphereGeometry args={[0.278, 24, 18, Math.PI / 2 - Math.PI / 2.4, Math.PI / 1.2, Math.PI / 3.8, Math.PI / 2.3]} />
        <meshPhysicalMaterial
          color="#c8a04a" roughness={0.08} metalness={0.95}
          clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.6}
        />
      </mesh>
      {/* visor brow and chin, so the gold has a machined edge to sit in */}
      <mesh position={[0, 1.735, 0.055]} rotation={[Math.PI / 2 - 0.42, 0, 0]}>
        <torusGeometry args={[0.215, 0.025, 6, 20, Math.PI * 1.15]} />
        <meshStandardMaterial color={joint} metalness={0.62} roughness={0.38} />
      </mesh>
      <mesh position={[0, 1.425, 0.055]} rotation={[Math.PI / 2 + 0.42, 0, 0]}>
        <torusGeometry args={[0.215, 0.022, 6, 20, Math.PI * 1.15]} />
        <meshStandardMaterial color={joint} metalness={0.62} roughness={0.38} />
      </mesh>
      {/* neck ring */}
      <mesh position={[0, 1.36, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.08, 14]} />
        <meshStandardMaterial color={joint} metalness={0.55} roughness={0.4} />
      </mesh>
      {/* helmet lamps */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.19, 1.68, 0.14]}>
          <cylinderGeometry args={[0.035, 0.035, 0.06, 10]} />
          <meshStandardMaterial color="#fff6e2" emissive="#ffe9c4" emissiveIntensity={2.6} toneMapped={false} />
        </mesh>
      ))}
      {/* antenna */}
      <mesh position={[-0.2, 1.78, -0.1]} rotation={[0.2, 0, 0.3]}>
        <cylinderGeometry args={[0.008, 0.008, 0.26, 4]} />
        <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* ---- life-support backpack ---- */}
      <mesh castShadow position={[0, 1.04, -0.31]}>
        <boxGeometry args={[0.5, 0.66, 0.26]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.22} />
      </mesh>
      {/* oxygen tanks */}
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} castShadow position={[x, 1.04, -0.46]}>
          <capsuleGeometry args={[0.07, 0.4, 4, 10]} />
          <meshStandardMaterial color="#aeb6c0" metalness={0.75} roughness={0.28} />
        </mesh>
      ))}
      {/* hoses from pack to torso */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.26, 1.2, -0.12]} rotation={[0, 0, s * 0.5]}>
          <torusGeometry args={[0.12, 0.022, 5, 12, Math.PI]} />
          <meshStandardMaterial color="#3a4150" roughness={0.75} />
        </mesh>
      ))}

      {/* ---- arms ---- */}
      {[-1, 1].map((s) => (
        <group key={`arm${s}`} position={[s * 0.33, 1.2, 0]} rotation={[swing * s, 0, s * 0.16]}>
          {/* shoulder cap: without it the arm reads as a separate stick
              floating beside the torso, which is most of what makes a figure
              look like assembled primitives */}
          <mesh castShadow position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.115, 14, 12]} />
            <meshStandardMaterial color={white} roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, -0.17, 0]}>
            <capsuleGeometry args={[0.085, 0.22, 4, 10]} />
            <meshStandardMaterial color={white} roughness={0.68} />
          </mesh>
          {/* elbow ring */}
          <mesh position={[0, -0.33, 0]}>
            <torusGeometry args={[0.085, 0.022, 5, 12]} />
            <meshStandardMaterial color={joint} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh castShadow position={[0, -0.47, 0.02]} rotation={[0.25, 0, 0]}>
            <capsuleGeometry args={[0.078, 0.2, 4, 10]} />
            <meshStandardMaterial color={shadeWhite} roughness={0.7} />
          </mesh>
          {/* pressure-garment ribbing: the detail that separates a soft suit
              from a smooth white tube */}
          {[-0.09, -0.19, -0.27].map((ry) => (
            <mesh key={ry} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.088, 0.011, 5, 12]} />
              <meshStandardMaterial color={shadeWhite} roughness={0.82} />
            </mesh>
          ))}
          {/* glove */}
          <mesh castShadow position={[0, -0.63, 0.06]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color="#5c6572" roughness={0.65} />
          </mesh>
        </group>
      ))}

      {/* ---- legs ---- */}
      {[-1, 1].map((s) => (
        <group key={`leg${s}`} position={[s * 0.14, 0.62, 0]} rotation={[-swing * s, 0, 0]}>
          {/* hip cap, same reason as the shoulder */}
          <mesh castShadow position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.135, 14, 12]} />
            <meshStandardMaterial color={shadeWhite} roughness={0.66} />
          </mesh>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.105, 0.24, 4, 10]} />
            <meshStandardMaterial color={white} roughness={0.7} />
          </mesh>
          {/* knee ring */}
          <mesh position={[0, -0.34, 0]}>
            <torusGeometry args={[0.1, 0.022, 5, 12]} />
            <meshStandardMaterial color={joint} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh castShadow position={[0, -0.48, 0]}>
            <capsuleGeometry args={[0.095, 0.2, 4, 10]} />
            <meshStandardMaterial color={shadeWhite} roughness={0.72} />
          </mesh>
          {[-0.1, -0.21, -0.3].map((ry) => (
            <mesh key={ry} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.112, 0.012, 5, 12]} />
              <meshStandardMaterial color={shadeWhite} roughness={0.84} />
            </mesh>
          ))}
          {/* boot */}
          <mesh castShadow position={[0, -0.64, 0.04]}>
            <boxGeometry args={[0.17, 0.12, 0.3]} />
            <meshStandardMaterial color="#3a4150" roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Dust kicked up by footfalls. */
function FootDust({ active, phase }: { active: boolean; phase: number }) {
  const glow = useMemo(() => softGlow(), [])
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!group.current) return
    group.current.children.forEach((child, i) => {
      const t = ((phase * 0.25 + i * 0.33) % 1)
      child.position.set((i - 1) * 0.18, t * 0.4, -t * 0.5)
      child.scale.setScalar(0.25 + t * 0.7)
      const sprite = child as THREE.Sprite
      sprite.material.opacity = active ? (1 - t) * 0.26 : 0
    })
  })

  return (
    <group ref={group}>
      {[0, 1, 2].map((i) => (
        <sprite key={i} scale={[0.5, 0.5, 1]}>
          <spriteMaterial map={glow} color="#c08050" transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

// ===========================================================================
//  CONTROLLER
// ===========================================================================

export function Astronaut() {
  const group = useRef<THREE.Group>(null)
  const { camera, gl } = useThree()

  const phase = useGame((s) => s.phase)
  const controlled = useGame((s) => s.controlled)
  const crew = useGame((s) => s.state.crew)
  const confirmFieldTask = useGame((s) => s.confirmFieldTask)
  const assignments = useGame((s) => s.assignments)
  const setZone = useGame((s) => s.setZone)

  const setFocus = useField((s) => s.setFocus)
  const setHold = useField((s) => s.setHold)
  const setPointerLocked = useField((s) => s.setPointerLocked)
  // An open event briefing covers the canvas. The phase is still fieldOps
  // underneath it, so without this the player walks the astronaut around —
  // and can finish a hold-E task — while reading a modal they cannot see past.
  const modalOpen = useGame((s) => !!s.activeEvent && !s.eventResolved)

  const keys = useRef<Keys>({})
  const yaw = useRef(Math.PI)
  const pitch = useRef(-0.14)
  const yawSmooth = useRef(Math.PI)
  const pitchSmooth = useRef(-0.14)
  const velY = useRef(0)
  const grounded = useRef(true)
  const walkPhase = useRef(0)
  const moveSpeed = useRef(0)
  const holdRef = useRef(0)
  const focusRef = useRef<string | null>(null)
  const zoneRef = useRef<Zone>('habitat')
  const pos = useRef(new THREE.Vector3(0, 0, 11))
  const camPos = useRef(new THREE.Vector3(0, 5, 18))
  const camVel = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3(0, 1.6, 0))
  const fov = useRef(68)

  const color = crew[controlled]?.color ?? '#7dd3fc'

  // Which structures still have outstanding field work this sol.
  const openTasks = useMemo(
    () => new Set(assignments.filter((a) => !a.fieldConfirmed).map((a) => a.task)),
    [assignments],
  )

  // Reusable scratch objects so the frame loop allocates nothing.
  const scratch = useMemo(
    () => ({
      desired: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      look: new THREE.Vector3(),
    }),
    [],
  )

  // ------------------------------------------------------------- input

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true
      // Space scrolls the page and the arrows scroll it too — neither should
      // move anything but the astronaut while the field window is open.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
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

  useEffect(() => {
    const canvas = gl.domElement

    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      yaw.current -= e.movementX * 0.0022
      pitch.current = Math.min(Math.max(pitch.current - e.movementY * 0.0019, -1.0), 0.6)
    }
    const onLockChange = () => setPointerLocked(document.pointerLockElement === canvas)
    const onClick = () => {
      if (phase === 'fieldOps' && document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock()
      }
    }

    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [gl, phase, setPointerLocked])

  // Release the mouse whenever we leave field operations.
  useEffect(() => {
    if (phase !== 'fieldOps' && document.pointerLockElement) document.exitPointerLock()
  }, [phase])

  // Dev-only camera hook, so the scene can be driven from outside the browser
  // while iterating on the look of the outpost. Stripped from production.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __motCam?: unknown }).__motCam = {
      place(x: number, z: number, lookYaw: number, pitchTo = -0.14) {
        pos.current.set(x, terrainHeight(x, z), z)
        yaw.current = lookYaw
        yawSmooth.current = lookYaw
        pitch.current = pitchTo
        pitchSmooth.current = pitchTo
        camPos.current.set(x, terrainHeight(x, z) + 6, z + 6)
        camVel.current.set(0, 0, 0)
      },
      arm: 0,
    }
  }, [])

  // ------------------------------------------------------------- update

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const active = phase === 'fieldOps' && !modalOpen

    // ---- movement input ----
    let moveX = 0
    let moveZ = 0
    if (active) {
      if (keys.current['KeyW'] || keys.current['ArrowUp']) moveZ -= 1
      if (keys.current['KeyS'] || keys.current['ArrowDown']) moveZ += 1
      if (keys.current['KeyA'] || keys.current['ArrowLeft']) moveX -= 1
      if (keys.current['KeyD'] || keys.current['ArrowRight']) moveX += 1
    }

    const sprinting = !!keys.current['ShiftLeft'] || !!keys.current['ShiftRight']
    const speed = sprinting ? 7.4 : 4.3

    const len = Math.hypot(moveX, moveZ)

    // Smoothed input magnitude drives the walk cycle and camera pull-back, so
    // starting and stopping eases instead of snapping.
    moveSpeed.current += ((len > 0 ? (sprinting ? 1.6 : 1) : 0) - moveSpeed.current) * Math.min(dt * 7, 1)

    if (len > 0) {
      moveX /= len
      moveZ /= len
      const sin = Math.sin(yaw.current)
      const cos = Math.cos(yaw.current)
      // camera-relative, flattened so looking down never drives into the ground
      const worldX = moveX * cos - moveZ * sin
      const worldZ = moveX * sin + moveZ * cos
      pos.current.x += worldX * speed * dt
      pos.current.z += worldZ * speed * dt
      walkPhase.current += dt * (sprinting ? 13 : 8.5)
    }

    // ---- collision: push out of structure footprints ----
    for (const s of STRUCTURES) {
      if (s.id === 'breach') continue
      const dx = pos.current.x - s.pos[0]
      const dz = pos.current.z - s.pos[2]
      const dist = Math.hypot(dx, dz)
      const minDist = s.radius * 0.62
      if (dist < minDist && dist > 0.0001) {
        pos.current.x = s.pos[0] + (dx / dist) * minDist
        pos.current.z = s.pos[2] + (dz / dist) * minDist
      }
    }

    // keep inside the crater
    const r = Math.hypot(pos.current.x, pos.current.z)
    if (r > 88) {
      pos.current.x *= 88 / r
      pos.current.z *= 88 / r
    }

    // ---- gravity and jump, at 0.379 g ----
    const ground = terrainHeight(pos.current.x, pos.current.z)
    if (active && keys.current['Space'] && grounded.current) {
      velY.current = 4.6
      grounded.current = false
    }
    velY.current += GRAVITY * dt
    pos.current.y += velY.current * dt

    if (pos.current.y <= ground) {
      pos.current.y = ground
      velY.current = 0
      grounded.current = true
    }

    if (group.current) {
      group.current.position.copy(pos.current)
      if (len > 0) {
        const target = Math.atan2(
          moveX * Math.cos(yaw.current) - moveZ * Math.sin(yaw.current),
          moveX * Math.sin(yaw.current) + moveZ * Math.cos(yaw.current),
        )
        const cur = group.current.rotation.y
        let diff = target - cur
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        group.current.rotation.y = cur + diff * Math.min(dt * 11, 1)
      }
    }

    // ================= third-person camera =================
    // Yaw and pitch are smoothed separately from position, so a flick of the
    // mouse eases rather than snapping the whole frame.
    yawSmooth.current += (yaw.current - yawSmooth.current) * Math.min(dt * 16, 1)
    pitchSmooth.current += (pitch.current - pitchSmooth.current) * Math.min(dt * 14, 1)

    const devArm = import.meta.env.DEV
      ? ((window as unknown as { __motCam?: { arm?: number } }).__motCam?.arm ?? 0)
      : 0
    const armLength = devArm > 0 ? devArm : 5.0 + moveSpeed.current * 0.9
    const shoulder = 1.4
    const sinY = Math.sin(yawSmooth.current)
    const cosY = Math.cos(yawSmooth.current)
    const cosP = Math.cos(pitchSmooth.current)

    scratch.desired.set(
      pos.current.x + sinY * armLength * cosP + cosY * shoulder,
      pos.current.y + EYE + 0.6 - Math.sin(pitchSmooth.current) * armLength,
      pos.current.z + cosY * armLength * cosP - sinY * shoulder,
    )

    // Collision-aware boom: if a structure sits between the astronaut and the
    // camera, pull the camera in rather than letting it clip through a wall.
    //
    // This is solved analytically against the same cylinders the player
    // collides with, not with a scene raycast. A raycast here would have to
    // walk the whole scene graph every frame, and it trips over sprites and
    // points, which need a camera set on the raycaster and are not occluders
    // anyway.
    const boomOrigin = scratch.look.set(pos.current.x, pos.current.y + EYE, pos.current.z)
    scratch.dir.copy(scratch.desired).sub(boomOrigin)
    const boomDist = scratch.dir.length()

    if (boomDist > 0.001) {
      scratch.dir.divideScalar(boomDist)
      const dx = scratch.dir.x
      const dz = scratch.dir.z
      const h2 = dx * dx + dz * dz

      let maxT = boomDist
      if (h2 > 1e-6) {
        for (const s of STRUCTURES) {
          if (s.id === 'breach') continue
          const rad = s.radius * 0.95
          const fx = boomOrigin.x - s.pos[0]
          const fz = boomOrigin.z - s.pos[2]
          const b = 2 * (fx * dx + fz * dz)
          const c = fx * fx + fz * fz - rad * rad
          const disc = b * b - 4 * h2 * c
          if (disc <= 0) continue
          const t = (-b - Math.sqrt(disc)) / (2 * h2)
          if (t <= 0.5 || t >= maxT) continue
          // Only an occluder if the boom would pass *through* the building,
          // not over its roof.
          const y = boomOrigin.y + scratch.dir.y * t
          if (y < terrainHeight(s.pos[0], s.pos[2]) + s.radius * 1.5) maxT = t
        }
      }

      if (maxT < boomDist) {
        scratch.desired.copy(boomOrigin).addScaledVector(scratch.dir, Math.max(maxT - 0.4, 1.2))
      }
    }

    // never let the camera sink below the terrain
    const camGround = terrainHeight(scratch.desired.x, scratch.desired.z) + 0.7
    if (scratch.desired.y < camGround) scratch.desired.y = camGround

    // Critically damped spring: smooth, no overshoot, and it keeps up during a
    // sprint instead of trailing behind the way a plain lerp does.
    const stiffness = 58
    const damping = 2 * Math.sqrt(stiffness)
    camVel.current.x += ((scratch.desired.x - camPos.current.x) * stiffness - camVel.current.x * damping) * dt
    camVel.current.y += ((scratch.desired.y - camPos.current.y) * stiffness - camVel.current.y * damping) * dt
    camVel.current.z += ((scratch.desired.z - camPos.current.z) * stiffness - camVel.current.z * damping) * dt
    camPos.current.addScaledVector(camVel.current, dt)
    camera.position.copy(camPos.current)

    // Smoothed look target, aimed slightly ahead when moving.
    scratch.look.set(
      pos.current.x - sinY * moveSpeed.current * 0.5,
      pos.current.y + EYE - 0.1,
      pos.current.z - cosY * moveSpeed.current * 0.5,
    )
    lookTarget.current.lerp(scratch.look, Math.min(dt * 11, 1))
    camera.lookAt(lookTarget.current)

    // Slight FOV widening on a sprint reads as speed without motion blur.
    const targetFov = 68 + moveSpeed.current * 4.5
    fov.current += (targetFov - fov.current) * Math.min(dt * 5, 1)
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - fov.current) > 0.01) {
      cam.fov = fov.current
      cam.updateProjectionMatrix()
    }

    if (!active) return

    // ---- radiation zone from position ----
    const hab = Math.hypot(pos.current.x, pos.current.z)
    const rov = structureById('rover')
    const rovDist = rov ? Math.hypot(pos.current.x - rov.pos[0], pos.current.z - rov.pos[2]) : 99

    const zone: Zone =
      hab < 4.0 ? 'shelter' :
      hab < 7.5 ? 'habitat' :
      rovDist < 4.0 ? 'rover' : 'eva'

    if (zone !== zoneRef.current) {
      zoneRef.current = zone
      setZone(controlled, zone)
    }

    // ---- focus the nearest actionable structure ----
    let best: string | null = null
    let bestDist: number = C.INTERACT_RANGE

    for (const s of STRUCTURES) {
      const d = Math.hypot(pos.current.x - s.pos[0], pos.current.z - s.pos[2]) - s.radius * 0.5
      if (d < bestDist) { bestDist = d; best = s.id }
    }

    if (best !== focusRef.current) {
      focusRef.current = best
      holdRef.current = 0
      setFocus(best)
      setHold(0)
    }

    // ---- hold E to perform the work ----
    const def = best ? structureById(best) : undefined
    const canWork = !!def?.task && openTasks.has(def.task)

    if (keys.current['KeyE'] && canWork && def?.task) {
      holdRef.current = Math.min(holdRef.current + dt / 2.2, 1)
      setHold(holdRef.current)
      if (holdRef.current >= 1) {
        confirmFieldTask(def.task)
        holdRef.current = 0
        setHold(0)
      }
    } else if (holdRef.current > 0) {
      // Releasing early abandons it: a half-cleaned panel is not cleaned.
      holdRef.current = Math.max(holdRef.current - dt * 1.6, 0)
      setHold(holdRef.current)
    }
  })

  return (
    <group ref={group}>
      <SuitMesh color={color} walking={walkPhase.current} speed={moveSpeed.current} />
      <FootDust active={moveSpeed.current > 0.2 && grounded.current} phase={walkPhase.current} />
      {/* helmet lamp */}
      <spotLight
        position={[0, 1.65, 0.3]} angle={0.8} penumbra={0.7}
        intensity={3.2} distance={14} color="#ffeccc"
      />
    </group>
  )
}
