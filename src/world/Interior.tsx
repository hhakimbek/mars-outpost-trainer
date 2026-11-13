import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import {
  CEILING, DOORS, ROOMS, SHELL, SPAWN, STATIONS, WALLS, WALL_T, resolveWalls, roomAt,
  type Room, type Station,
} from '../data/habitat'
import { useGame } from '../store/useGame'
import { useField } from './fieldState'

/**
 * THE HABITAT INTERIOR
 * ====================
 *
 * A second world, at a second scale. Outside is 180 m across and lit by one
 * hard sun; inside is 16 m across and lit by panels. They share nothing —
 * no sky, no fog, no terrain — so they are separate scenes on separate
 * canvases, and only one is ever mounted.
 *
 * Everything structural here is generated from `data/habitat.ts`. There is no
 * hand-placed wall in this file: the geometry, the collision and the floor
 * plan the HUD names are all the same numbers, so the room you are standing
 * in is always the room the game says you are in.
 */

const EYE = 1.68

// ===========================================================================
//  SHELL GEOMETRY
// ===========================================================================

/** Every wall run as one box, instanced into a single draw call. */
function Walls() {
  const ref = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    WALLS.forEach((w, i) => {
      const len = w.to - w.from
      const mid = (w.from + w.to) / 2
      m.compose(
        new THREE.Vector3(
          w.axis === 'x' ? mid : w.at,
          CEILING / 2,
          w.axis === 'x' ? w.at : mid,
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(
          w.axis === 'x' ? len : WALL_T,
          CEILING,
          w.axis === 'x' ? WALL_T : len,
        ),
      )
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, WALLS.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#d8d2c6" roughness={0.82} metalness={0.04} />
    </instancedMesh>
  )
}

/**
 * Door frames.
 *
 * Each one is a lintel plus two posts in the room's accent colour, which is
 * what turns a gap in a wall into something you can read as a doorway from
 * the far end of the spine. External hatches get a heavier frame and a warning
 * stripe, because they are pressure boundaries and should not look like a
 * bedroom door.
 */
function DoorFrames() {
  return (
    <group>
      {DOORS.map((d, i) => {
        const h = d.external ? 2.05 : 2.1
        const along = d.width + 0.22
        const tint = d.external ? '#fb923c' : '#64748b'
        const pos = (o: number): [number, number, number] =>
          d.axis === 'x' ? [d.centre + o, 0, d.at] : [d.at, 0, d.centre + o]
        const postArgs: [number, number, number] =
          d.axis === 'x' ? [0.1, h, WALL_T + 0.06] : [WALL_T + 0.06, h, 0.1]
        const lintelArgs: [number, number, number] =
          d.axis === 'x' ? [along, 0.16, WALL_T + 0.06] : [WALL_T + 0.06, 0.16, along]
        return (
          <group key={i}>
            {[-d.width / 2 - 0.05, d.width / 2 + 0.05].map((o) => (
              <mesh key={o} position={[pos(o)[0], h / 2, pos(o)[2]]} castShadow>
                <boxGeometry args={postArgs} />
                <meshStandardMaterial color={tint} roughness={0.5} metalness={0.4} />
              </mesh>
            ))}
            <mesh position={[pos(0)[0], h + 0.08, pos(0)[2]]} castShadow>
              <boxGeometry args={lintelArgs} />
              <meshStandardMaterial color={tint} roughness={0.5} metalness={0.4} />
            </mesh>
            {/* threshold strip on the floor — a cheap, strong navigation cue */}
            <mesh position={[pos(0)[0], 0.006, pos(0)[2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={
                d.axis === 'x' ? [d.width, WALL_T + 0.1] : [WALL_T + 0.1, d.width]} />
              <meshStandardMaterial
                color={tint} emissive={tint}
                emissiveIntensity={d.external ? 1.1 : 0.45} roughness={0.6} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Floor: one panel per room in its own shade, so the plan reads from inside. */
function Floors() {
  return (
    <group>
      {ROOMS.map((r) => {
        const w = r.rect[2] - r.rect[0]
        const d = r.rect[3] - r.rect[1]
        const corridor = r.id === 'corridor'
        return (
          <mesh
            key={r.id}
            position={[(r.rect[0] + r.rect[2]) / 2, 0, (r.rect[1] + r.rect[3]) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial
              color={corridor ? '#5d6470' : '#6c7280'}
              roughness={corridor ? 0.72 : 0.86}
              metalness={0.08}
            />
          </mesh>
        )
      })}
      {/* Centre line down the spine. Analog habitats paint one for the same
          reason aircraft do: it tells you which way is out without a sign. */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SHELL[2] - SHELL[0], 0.12]} />
        <meshStandardMaterial color="#e2b457" emissive="#e2b457" emissiveIntensity={0.3} roughness={0.7} />
      </mesh>
    </group>
  )
}

/** Ceiling panels with a light strip in every room. */
function Ceiling() {
  return (
    <group>
      {ROOMS.map((r) => {
        const w = r.rect[2] - r.rect[0]
        const d = r.rect[3] - r.rect[1]
        const cx = (r.rect[0] + r.rect[2]) / 2
        const cz = (r.rect[1] + r.rect[3]) / 2
        const long = w >= d
        return (
          <group key={r.id}>
            <mesh position={[cx, CEILING, cz]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#c7c1b6" roughness={0.9} side={THREE.FrontSide} />
            </mesh>
            {/* the luminaire */}
            <mesh position={[cx, CEILING - 0.05, cz]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={long ? [w * 0.55, 0.22] : [0.22, d * 0.55]} />
              <meshBasicMaterial color="#fdf6e8" toneMapped={false} />
            </mesh>

          </group>
        )
      })}
    </group>
  )
}

// ===========================================================================
//  ROOM FITTINGS
// ===========================================================================

const Box = ({
  p, s, color, rough = 0.7, metal = 0.1, emissive, ei = 0,
}: {
  p: [number, number, number]; s: [number, number, number]; color: string
  rough?: number; metal?: number; emissive?: string; ei?: number
}) => (
  <mesh position={p} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial
      color={color} roughness={rough} metalness={metal}
      emissive={emissive ?? '#000000'} emissiveIntensity={ei}
    />
  </mesh>
)

/** A wall-mounted screen. Used in half the rooms, so it is worth a component. */
function Screen({
  p, rot = 0, w = 0.7, h = 0.44, tint = '#7dd3fc',
}: { p: [number, number, number]; rot?: number; w?: number; h?: number; tint?: string }) {
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.04]} />
        <meshStandardMaterial color="#2b313b" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.026]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

const METAL = '#9aa3ae'
const DARK = '#3f4650'

function CommandFit() {
  return (
    <group>
      {/* console run along the back wall */}
      <Box p={[-6.2, 0.38, 4.5]} s={[3.0, 0.76, 0.7]} color={DARK} metal={0.5} rough={0.45} />
      <Box p={[-6.2, 0.79, 4.5]} s={[3.1, 0.06, 0.8]} color={METAL} metal={0.6} rough={0.35} />
      {[-7.1, -6.2, -5.3].map((x, i) => (
        <Screen key={x} p={[x, 1.42, 4.78]} w={0.78} h={0.5}
          tint={['#7dd3fc', '#a3e635', '#fbbf24'][i]} />
      ))}
      {/* the chair */}
      <Box p={[-6.2, 0.24, 3.6]} s={[0.5, 0.08, 0.5]} color="#4b5563" />
      <Box p={[-6.2, 0.14, 3.6]} s={[0.1, 0.28, 0.1]} color={METAL} metal={0.6} />
      <Box p={[-6.2, 0.56, 3.36]} s={[0.5, 0.56, 0.08]} color="#4b5563" />
      {/* the downlink terminal on the west wall */}
      <Box p={[-7.6, 1.1, 2.4]} s={[0.12, 0.9, 0.9]} color={DARK} metal={0.5} />
      <Screen p={[-7.46, 1.2, 2.4]} rot={Math.PI / 2} w={0.7} h={0.5} tint="#c084fc" />
      <Box p={[-7.6, 0.3, 2.4]} s={[0.3, 0.6, 1.0]} color={METAL} metal={0.4} />
    </group>
  )
}

function LabFit() {
  return (
    <group>
      {/* analysis bench */}
      <Box p={[-2.6, 0.45, 4.5]} s={[3.2, 0.9, 0.7]} color="#cfd6de" rough={0.4} metal={0.3} />
      <Box p={[-2.6, 0.92, 4.5]} s={[3.3, 0.05, 0.78]} color="#e7ecf2" rough={0.25} metal={0.2} />
      {/* fume hood */}
      <Box p={[-1.4, 1.5, 4.6]} s={[0.9, 1.1, 0.55]} color="#aab4c0" rough={0.35} metal={0.4} />
      <mesh position={[-1.4, 1.45, 4.33]}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshStandardMaterial color="#bfe9ff" transparent opacity={0.3} roughness={0.1} />
      </mesh>
      {/* sample racks: the mission's collected material, lined up */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[-3.6 + (i % 3) * 0.22, 1.02, 4.32 + Math.floor(i / 3) * 0.2]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 0.16, 10]} />
          <meshStandardMaterial color={i % 2 ? '#b45309' : '#a16207'} roughness={0.8} />
        </mesh>
      ))}
      {/* microscope station on the spine wall */}
      <Box p={[-4.0, 0.45, 2.1]} s={[0.9, 0.9, 0.6]} color={DARK} metal={0.4} />
      <Box p={[-4.0, 1.02, 2.1]} s={[0.26, 0.26, 0.26]} color={METAL} metal={0.7} rough={0.3} />
      <mesh position={[-4.0, 1.28, 2.1]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.34, 10]} />
        <meshStandardMaterial color="#2b313b" roughness={0.4} metalness={0.6} />
      </mesh>
      <Screen p={[-4.5, 1.5, 2.1]} rot={-0.4} w={0.5} h={0.34} tint="#a78bfa" />
    </group>
  )
}

function GalleyFit() {
  return (
    <group>
      {/* galley counter */}
      <Box p={[1.0, 0.45, 4.5]} s={[3.2, 0.9, 0.68]} color="#b9c2cc" rough={0.45} metal={0.35} />
      <Box p={[1.0, 0.92, 4.5]} s={[3.3, 0.05, 0.76]} color="#dfe6ee" rough={0.3} metal={0.3} />
      {/* rehydration unit and oven */}
      <Box p={[0.1, 1.3, 4.7]} s={[0.7, 0.66, 0.4]} color={DARK} metal={0.5} />
      <Screen p={[0.1, 1.35, 4.49]} w={0.42} h={0.28} tint="#fbbf24" />
      <Box p={[1.9, 1.3, 4.7]} s={[0.7, 0.66, 0.4]} color="#8d969f" metal={0.5} />
      {/* overhead lockers */}
      <Box p={[1.0, 1.95, 4.78]} s={[3.1, 0.5, 0.36]} color="#cbd2da" rough={0.6} />
      {/* the wardroom table — the largest shared surface in the habitat */}
      <Box p={[1.0, 0.72, 2.6]} s={[1.9, 0.07, 0.95]} color="#d6cbb4" rough={0.55} />
      <Box p={[1.0, 0.36, 2.6]} s={[0.18, 0.72, 0.18]} color={METAL} metal={0.6} />
      <Box p={[1.0, 0.03, 2.6]} s={[0.8, 0.06, 0.6]} color={METAL} metal={0.6} />
      {/* four seats, because there are four of them */}
      {[[-0.1, 2.0], [2.1, 2.0], [-0.1, 3.2], [2.1, 3.2]].map(([x, z], i) => (
        <group key={i}>
          <Box p={[x, 0.42, z]} s={[0.42, 0.07, 0.42]} color="#5b6370" />
          <Box p={[x, 0.22, z]} s={[0.09, 0.4, 0.09]} color={METAL} metal={0.6} />
        </group>
      ))}
      {/* pantry on the spine wall */}
      <Box p={[2.45, 1.0, 2.1]} s={[0.55, 2.0, 0.6]} color="#aeb7c1" rough={0.6} />
      {[0.5, 1.0, 1.5].map((y) => (
        <Box key={y} p={[2.45, y, 1.82]} s={[0.5, 0.03, 0.06]} color="#6b7684" metal={0.5} />
      ))}
    </group>
  )
}

function StorageFit() {
  return (
    <group>
      {/* shelving run along the north wall */}
      {[3.5, 4.4, 5.3].map((x) => (
        <group key={x}>
          <Box p={[x, 1.1, 4.72]} s={[0.8, 2.2, 0.5]} color="#9fa8b3" rough={0.7} />
          {[0.5, 1.0, 1.5, 1.95].map((y) => (
            <Box key={y} p={[x, y, 4.46]} s={[0.78, 0.04, 0.04]} color="#6b7684" metal={0.5} />
          ))}
        </group>
      ))}
      {/* crates on the shelves */}
      {[[3.5, 0.62], [4.4, 1.12], [5.3, 0.62], [3.5, 1.6], [5.3, 2.05]].map(([x, y], i) => (
        <Box key={i} p={[x, y, 4.5]} s={[0.4, 0.22, 0.34]}
          color={['#d97706', '#64748b', '#0f766e', '#b45309', '#475569'][i]} rough={0.8} />
      ))}
      {/* the ECLSS rack: the machine that makes inside different from outside */}
      <Box p={[7.3, 1.1, 3.4]} s={[0.6, 2.2, 1.6]} color="#8d969f" rough={0.45} metal={0.45} />
      {[2.9, 3.4, 3.9].map((z, i) => (
        <mesh key={z} position={[6.96, 1.5, z]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.8, 12]} />
          <meshStandardMaterial
            color={['#7dd3fc', '#a3e635', '#f472b6'][i]} roughness={0.35} metalness={0.3} />
        </mesh>
      ))}
      <Screen p={[6.96, 2.1, 3.4]} rot={-Math.PI / 2} w={0.5} h={0.3} tint="#a3e635" />
      {/* ducting along the ceiling, running the length of the room */}
      <mesh position={[5.4, CEILING - 0.22, 2.0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 4.8, 12]} />
        <meshStandardMaterial color="#aab2bb" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* workbench */}
      <Box p={[4.4, 0.45, 1.6]} s={[1.6, 0.9, 0.6]} color={DARK} metal={0.5} />
      <Box p={[4.4, 0.92, 1.6]} s={[1.7, 0.05, 0.68]} color="#b6bec7" metal={0.5} rough={0.35} />
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} p={[3.9 + i * 0.3, 1.34, 1.38]} s={[0.07, 0.3, 0.05]} color="#5b6370" metal={0.7} />
      ))}
    </group>
  )
}

function MedicalFit() {
  return (
    <group>
      {/* examination couch */}
      <Box p={[-4.3, 0.55, -4.2]} s={[1.9, 0.14, 0.72]} color="#e7eaf0" rough={0.5} />
      <Box p={[-4.3, 0.24, -4.2]} s={[1.5, 0.48, 0.5]} color="#6b7684" metal={0.4} />
      <Box p={[-5.1, 0.69, -4.2]} s={[0.4, 0.14, 0.66]} color="#cbd5e1" rough={0.5} />
      {/* vitals monitor */}
      <Screen p={[-3.3, 1.5, -4.6]} rot={0.3} w={0.6} h={0.42} tint="#f472b6" />
      {/* pharmacy locker and sharps bin */}
      <Box p={[-5.5, 1.0, -2.2]} s={[0.5, 2.0, 0.9]} color="#cfd6de" rough={0.6} />
      <mesh position={[-5.24, 1.2, -2.2]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={0.8} />
      </mesh>
      <Box p={[-3.2, 0.3, -2.0]} s={[0.4, 0.6, 0.4]} color="#eab308" rough={0.8} />
    </group>
  )
}

/** One crew quarter. Identical fittings, the occupant's colour on the locker. */
function QuartersFit({ room, tint }: { room: Room; tint: string }) {
  const cx = (room.rect[0] + room.rect[2]) / 2
  return (
    <group>
      {/* bunk against the outboard wall — mass between the sleeper and space */}
      <Box p={[cx, 0.33, -4.2]} s={[1.75, 0.14, 0.78]} color="#4b5563" />
      <Box p={[cx, 0.16, -4.2]} s={[1.6, 0.32, 0.6]} color={DARK} />
      <Box p={[cx, 0.47, -4.2]} s={[1.72, 0.14, 0.74]} color="#8b93a1" rough={0.95} />
      <Box p={[cx - 0.66, 0.59, -4.2]} s={[0.36, 0.12, 0.5]} color="#e2e8f0" rough={1} />
      {/* blanket in the occupant's colour, the one personal thing in the room */}
      <Box p={[cx + 0.25, 0.56, -4.2]} s={[1.1, 0.06, 0.72]} color={tint} rough={0.95} />
      {/* desk and stool */}
      <Box p={[cx, 0.72, -2.3]} s={[1.2, 0.05, 0.5]} color="#d6cbb4" rough={0.6} />
      <Box p={[cx - 0.5, 0.36, -2.3]} s={[0.07, 0.72, 0.07]} color={METAL} metal={0.6} />
      <Box p={[cx + 0.5, 0.36, -2.3]} s={[0.07, 0.72, 0.07]} color={METAL} metal={0.6} />
      <Screen p={[cx, 1.25, -2.52]} w={0.5} h={0.34} tint={tint} />
      {/* personal locker */}
      <Box p={[cx + 0.75, 0.9, -3.1]} s={[0.4, 1.8, 0.5]} color="#aeb7c1" rough={0.65} />
      <mesh position={[cx + 0.54, 1.3, -3.1]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

function SanitationFit() {
  return (
    <group>
      <Box p={[5.7, 0.45, -4.0]} s={[0.9, 0.9, 0.55]} color="#cfd6de" rough={0.4} metal={0.2} />
      <mesh position={[5.7, 0.92, -4.0]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.12, 14]} />
        <meshStandardMaterial color="#e7ecf2" roughness={0.25} metalness={0.3} />
      </mesh>
      <mesh position={[5.7, 1.25, -4.3]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color={METAL} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* the waste-to-recycler column: this is where the loop starts */}
      <Box p={[5.7, 1.0, -2.0]} s={[0.7, 2.0, 0.5]} color="#9fa8b3" rough={0.6} />
      <mesh position={[5.7, 1.0, -1.72]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 1.9, 12]} />
        <meshStandardMaterial color="#67e8f9" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  )
}

function AirlockFit() {
  return (
    <group>
      {/* outer hatch, on the south shell wall */}
      <mesh position={[7.15, 1.05, -4.93]} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.14, 20]} />
        <meshStandardMaterial color="#b9c2cc" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[7.15, 1.05, -4.82]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.3, 0.05, 8, 20]} />
        <meshStandardMaterial color="#fb923c" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* two suits on the rack — the other two are being worn or stowed */}
      {[6.72, 7.58].map((x, i) => (
        <group key={x} position={[x, 0, -2.0]}>
          <Box p={[0, 1.15, 0]} s={[0.4, 0.62, 0.3]} color="#f2ede4" rough={0.55} />
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.2, 14, 12]} />
            <meshStandardMaterial color="#f8f5ef" roughness={0.3} metalness={0.1} />
          </mesh>
          <mesh position={[0, 1.6, 0.14]}>
            <sphereGeometry args={[0.185, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
            <meshStandardMaterial
              color="#d9a441" metalness={0.95} roughness={0.12}
              emissive="#8a6418" emissiveIntensity={0.25} side={THREE.DoubleSide} />
          </mesh>
          <Box p={[0, 1.2, -0.24]} s={[0.34, 0.5, 0.2]} color="#dfd9cd" rough={0.6} />
          <Box p={[0, 0.62, 0]} s={[0.3, 0.6, 0.24]} color="#e6e0d4" rough={0.7} />
          <mesh position={[0, 1.95, 0]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <meshStandardMaterial color={METAL} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.16, 0.16]}>
            <boxGeometry args={[0.06, 0.03, 0.01]} />
            <meshStandardMaterial
              color={i ? '#3fd68c' : '#fbbf24'} emissive={i ? '#3fd68c' : '#fbbf24'}
              emissiveIntensity={2} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* dust mitigation: the brushes that keep perchlorate out of the hab */}
      <Box p={[7.15, 1.4, -3.3]} s={[1.3, 0.1, 0.1]} color="#64748b" metal={0.5} />
      <Box p={[7.15, 0.08, -3.3]} s={[1.2, 0.12, 0.7]} color="#4b5563" rough={0.95} />
    </group>
  )
}

function RoverDockFit() {
  return (
    <group>
      {/* the docking tunnel ring, on the west shell wall */}
      <mesh position={[-7.92, 1.1, -3.0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.8, 0.8, 0.16, 20, 1, true]} />
        <meshStandardMaterial color="#b9c2cc" roughness={0.45} metalness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-7.84, 1.1, -3.0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.8, 0.06, 8, 24]} />
        <meshStandardMaterial color="#c9622b" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* cargo staging for whatever the rover brings back */}
      <Box p={[-6.4, 0.25, -4.3]} s={[0.9, 0.5, 0.7]} color="#64748b" rough={0.8} />
      <Box p={[-6.4, 0.6, -4.3]} s={[0.95, 0.05, 0.75]} color="#475569" />
      <Box p={[-6.9, 0.3, -2.0]} s={[0.7, 0.6, 0.6]} color="#0f766e" rough={0.8} />
    </group>
  )
}

function Fittings() {
  return (
    <group>
      <CommandFit />
      <LabFit />
      <GalleyFit />
      <StorageFit />
      <MedicalFit />
      <SanitationFit />
      <AirlockFit />
      <RoverDockFit />
      {ROOMS.filter((r) => r.crewIndex !== undefined).map((r) => (
        <QuartersFit key={r.id} room={r} tint={r.tint} />
      ))}
    </group>
  )
}

// ===========================================================================
//  STATION MARKERS
// ===========================================================================

/**
 * A floor ring and a floating pip at every station.
 *
 * The interior is full of fittings, and without this the player has to guess
 * which of six boxes in the lab is the one that does something. The ring
 * brightens when it is the focused station, which is the only feedback that
 * matters here.
 */
function StationMarkers({ focused }: { focused: string | null }) {
  const pips = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (pips.current) {
      const t = state.clock.elapsedTime
      pips.current.children.forEach((c, i) => {
        c.position.y = 1.72 + Math.sin(t * 1.6 + i * 0.9) * 0.05
        c.rotation.y = t * 0.8
      })
    }
  })

  return (
    <group>
      {STATIONS.map((st) => {
        const room = ROOMS.find((r) => r.id === st.room)!
        const on = focused === st.id
        return (
          <mesh
            key={st.id}
            position={[st.pos[0], 0.012, st.pos[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[st.range * 0.5, st.range * 0.58, 26]} />
            <meshBasicMaterial
              color={room.tint} transparent opacity={on ? 0.85 : 0.26}
              toneMapped={false} side={THREE.DoubleSide} depthWrite={false}
            />
          </mesh>
        )
      })}
      <group ref={pips}>
        {STATIONS.map((st) => {
          const room = ROOMS.find((r) => r.id === st.room)!
          const on = focused === st.id
          return (
            <mesh key={st.id} position={[st.pos[0], 1.72, st.pos[1]]}>
              <octahedronGeometry args={[on ? 0.1 : 0.062]} />
              <meshBasicMaterial color={room.tint} toneMapped={false} transparent opacity={on ? 1 : 0.5} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

// ===========================================================================
//  THE WALKER
// ===========================================================================

interface Keys { [code: string]: boolean }

/** The crew member you are controlling, seen from behind in third person. */
function Figure({ color, walking, speed }: { color: string; walking: number; speed: number }) {
  const swing = Math.sin(walking) * 0.5 * Math.min(speed, 1)
  return (
    <group>
      <mesh castShadow position={[0, 1.08, 0]}>
        <capsuleGeometry args={[0.2, 0.44, 4, 14]} />
        <meshStandardMaterial color="#e8e3d8" roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 1.52, 0]}>
        <sphereGeometry args={[0.15, 16, 14]} />
        <meshStandardMaterial color="#d9c6a8" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.24, 0.19]}>
        <circleGeometry args={[0.05, 12]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh castShadow position={[s * 0.26, 1.02, swing * s * 0.18]} rotation={[swing * s, 0, 0]}>
            <capsuleGeometry args={[0.062, 0.42, 4, 8]} />
            <meshStandardMaterial color="#cfc8ba" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[s * 0.11, 0.42, -swing * s * 0.2]} rotation={[-swing * s, 0, 0]}>
            <capsuleGeometry args={[0.078, 0.52, 4, 8]} />
            <meshStandardMaterial color="#5b6370" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Walker() {
  const { camera, gl } = useThree()
  const group = useRef<THREE.Group>(null)

  const controlled = useGame((s) => s.controlled)
  const crew = useGame((s) => s.state.crew)
  const firstPerson = useGame((s) => s.firstPerson)
  const assignments = useGame((s) => s.assignments)
  const confirmFieldTask = useGame((s) => s.confirmFieldTask)
  const setZone = useGame((s) => s.setZone)
  const airlockDir = useGame((s) => s.airlockDir)
  const modalOpen = useGame((s) => !!s.activeEvent && !s.eventResolved)

  const setStation = useField((s) => s.setStation)
  const setRoom = useField((s) => s.setRoom)
  const setHold = useField((s) => s.setHold)
  const setPointerLocked = useField((s) => s.setPointerLocked)

  const keys = useRef<Keys>({})
  const yaw = useRef(Math.PI)
  const pitch = useRef(-0.05)
  const pos = useRef(new THREE.Vector3(SPAWN[0], 0, SPAWN[1]))
  const camPos = useRef(new THREE.Vector3(SPAWN[0], 2.1, SPAWN[1] + 2.6))
  const walkPhase = useRef(0)
  const moveSpeed = useRef(0)
  const holdRef = useRef(0)
  const stationRef = useRef<string | null>(null)
  const roomRef = useRef<string | null>(null)
  const scratch = useMemo(() => ({ look: new THREE.Vector3(), want: new THREE.Vector3() }), [])

  const color = crew[controlled]?.color ?? '#7dd3fc'

  const openTasks = useMemo(
    () => new Set(assignments.filter((a) => !a.fieldConfirmed).map((a) => a.task)),
    [assignments],
  )

  // Inside the habitat the crew member is in the shielded core. That is the
  // physical reason to be here and it is reported to the simulation, not
  // implied: the dosimeter on the HUD slows down the moment you step in.
  useEffect(() => {
    setZone(controlled, 'shelter')
  }, [controlled, setZone])

  // ---- input ----
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

  useEffect(() => {
    const canvas = gl.domElement
    const onClick = () => { if (!document.pointerLockElement) void canvas.requestPointerLock() }
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      yaw.current -= e.movementX * 0.0022
      pitch.current = Math.max(-1.1, Math.min(1.0, pitch.current - e.movementY * 0.0019))
    }
    const onLock = () => setPointerLocked(document.pointerLockElement === canvas)
    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('pointerlockchange', onLock)
    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointerlockchange', onLock)
      setPointerLocked(false)
    }
  }, [gl, setPointerLocked])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const frozen = modalOpen || !!airlockDir

    // ---- walk ----
    let mx = 0
    let mz = 0
    if (!frozen) {
      if (keys.current['KeyW'] || keys.current['ArrowUp']) mz -= 1
      if (keys.current['KeyS'] || keys.current['ArrowDown']) mz += 1
      if (keys.current['KeyA'] || keys.current['ArrowLeft']) mx -= 1
      if (keys.current['KeyD'] || keys.current['ArrowRight']) mx += 1
    }
    const len = Math.hypot(mx, mz)
    // Indoors is a walk, not a bound: no suit, no 0.38 g jumping, and a low
    // ceiling. The speed is deliberately well under the surface sprint.
    const speed = keys.current['ShiftLeft'] ? 3.0 : 1.9
    moveSpeed.current += ((len > 0 ? 1 : 0) - moveSpeed.current) * Math.min(dt * 9, 1)

    if (len > 0) {
      mx /= len; mz /= len
      const sin = Math.sin(yaw.current)
      const cos = Math.cos(yaw.current)
      pos.current.x += (mx * cos - mz * sin) * speed * dt
      pos.current.z += (mx * sin + mz * cos) * speed * dt
      walkPhase.current += dt * 9
    }

    const [cx, cz] = resolveWalls(pos.current.x, pos.current.z)
    pos.current.x = cx
    pos.current.z = cz

    // ---- body ----
    if (group.current) {
      group.current.position.set(pos.current.x, 0, pos.current.z)
      group.current.rotation.y = yaw.current + Math.PI
      group.current.visible = !firstPerson
    }

    // ---- camera ----
    const sinY = Math.sin(yaw.current)
    const cosY = Math.cos(yaw.current)
    const sinP = Math.sin(pitch.current)
    const cosP = Math.cos(pitch.current)

    if (firstPerson) {
      const bob = Math.sin(walkPhase.current * 2) * 0.022 * moveSpeed.current
      camera.position.set(pos.current.x, EYE + bob, pos.current.z)
      scratch.look.set(
        pos.current.x - sinY * cosP,
        EYE + bob + sinP,
        pos.current.z - cosY * cosP,
      )
      camera.lookAt(scratch.look)
    } else {
      // Third person indoors needs a short boom, and it has to be allowed to
      // pass through the wall behind you or every doorway would shove the
      // camera into the next room. Solved by pulling the boom in until it is
      // clear, which is the same trick the surface rig uses on structures.
      let boom = 2.35
      for (let i = 0; i < 6; i++) {
        const tx = pos.current.x + sinY * boom * cosP
        const tz = pos.current.z + cosY * boom * cosP
        const [rx, rz] = resolveWalls(tx, tz)
        if (Math.hypot(rx - tx, rz - tz) < 0.02) break
        boom -= 0.34
        if (boom < 0.55) { boom = 0.55; break }
      }
      scratch.want.set(
        pos.current.x + sinY * boom * cosP,
        Math.min(EYE + 0.34 - sinP * boom, CEILING - 0.18),
        pos.current.z + cosY * boom * cosP,
      )
      camPos.current.lerp(scratch.want, Math.min(dt * 12, 1))
      camera.position.copy(camPos.current)
      camera.lookAt(pos.current.x, 1.25, pos.current.z)
    }

    if (frozen) return

    // ---- which room am I in ----
    const room = roomAt(pos.current.x, pos.current.z)
    if ((room?.id ?? null) !== roomRef.current) {
      roomRef.current = room?.id ?? null
      setRoom(room?.id ?? null)
    }

    // ---- focus the nearest station I am actually standing at ----
    let best: Station | null = null
    let bestD = Infinity
    for (const st of STATIONS) {
      const d = Math.hypot(pos.current.x - st.pos[0], pos.current.z - st.pos[1])
      if (d < st.range && d < bestD) { bestD = d; best = st }
    }
    if ((best?.id ?? null) !== stationRef.current) {
      stationRef.current = best?.id ?? null
      holdRef.current = 0
      setStation(best?.id ?? null)
      setHold(0)
    }

    // ---- hold E to work a scheduled shift ----
    // Action and transit stations are a single press and are handled by the
    // HUD; only real shifts take time, exactly as outside.
    const canWork = !!best && best.kind === 'task' && !!best.task
      && openTasks.has(best.task)
      && (best.crewIndex === undefined || best.crewIndex === controlled)

    if (keys.current['KeyE'] && canWork && best?.task) {
      holdRef.current = Math.min(holdRef.current + dt / 2.0, 1)
      setHold(holdRef.current)
      if (holdRef.current >= 1) {
        confirmFieldTask(best.task)
        holdRef.current = 0
        setHold(0)
      }
    } else if (holdRef.current > 0) {
      holdRef.current = Math.max(holdRef.current - dt * 1.6, 0)
      setHold(holdRef.current)
    }
  })

  return (
    <group ref={group}>
      <Figure color={color} walking={walkPhase.current} speed={moveSpeed.current} />
    </group>
  )
}

// ===========================================================================
//  SCENE
// ===========================================================================

/**
 * Where the five lamps go.
 *
 * Every room used to carry its own point light, which is thirteen real lights
 * in one scene — thirteen sets of shader uniforms evaluated for every
 * fragment of every fitting, for a space sixteen metres across. The emissive
 * luminaire panels on the ceiling do most of the visual work for nothing, so
 * the actual lights are now five: one down the spine and one over each
 * quarter of the floor plan, positioned to cover the rooms rather than to
 * match them one for one.
 */
const LAMPS: [number, number, number][] = [
  [-4.0, 0, 7],    // west spine
  [4.0, 0, 7],     // east spine
  [-4.6, 3.0, 5],  // command and lab
  [3.2, 3.0, 5],   // galley and storage
  [0.0, -3.0, 5],  // the whole south row
]

function InteriorLighting() {
  return (
    <>
      {LAMPS.map(([x, z, i]) => (
        <pointLight
          key={`${x},${z}`}
          position={[x, CEILING - 0.3, z]}
          intensity={i}
          distance={11}
          decay={1.7}
          color="#fff2dd"
        />
      ))}
      {/* A sealed can has no sky. The ambient term stands in for light bounced
          off white walls, which indoors is most of what you see by. */}
      <ambientLight intensity={0.85} color="#fff4e4" />
      <hemisphereLight args={['#fff1dc', '#5b5047', 0.6]} />
      {/* one soft key from above the spine, for shape on the fittings */}
      <directionalLight
        position={[2, 9, 3]} intensity={0.9} color="#fff6e8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-11} shadow-camera-right={11}
        shadow-camera-top={8} shadow-camera-bottom={-8}
        shadow-camera-near={0.5} shadow-camera-far={24}
        shadow-bias={-0.0008}
      />
    </>
  )
}

/** A window in the galley, so the habitat does not feel like a submarine. */
function Viewport() {
  return (
    <group position={[1.0, 1.5, 4.99]}>
      <mesh>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color="#d99a62" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[0.42, 0.5, 24]} />
        <meshStandardMaterial color="#9aa3ae" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* a sliver of ground, so it reads as a view and not a lamp */}
      <mesh position={[0, -0.22, 0.004]}>
        <planeGeometry args={[0.7, 0.3]} />
        <meshBasicMaterial color="#8a4f2d" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0, -0.6]} intensity={2.2} distance={3} color="#e0a86e" />
    </group>
  )
}

export function InteriorScene() {
  const focused = useField((s) => s.stationId)

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 70, near: 0.05, far: 60, position: [SPAWN[0], 2.1, SPAWN[1] + 2.6] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, scene }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap
        // Indoors there is nothing beyond the walls, so the clear colour only
        // shows through the doorway gaps for a frame. Dark, not black.
        scene.background = new THREE.Color('#15181d')
      }}
    >
      <InteriorLighting />
      <Floors />
      <Walls />
      <DoorFrames />
      <Ceiling />
      <Fittings />
      <Viewport />
      <StationMarkers focused={focused} />
      <Walker />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom intensity={0.34} luminanceThreshold={0.75} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
        <Vignette offset={0.3} darkness={0.32} eskil={false} blendFunction={BlendFunction.NORMAL} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  )
}
