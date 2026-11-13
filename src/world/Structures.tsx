import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { STRUCTURES } from '../data/structures'
import { terrainHeight } from './noise'
import { hullPanels, solarCells, hazardStripe, dustStreak, softGlow } from './textures'
import { useGame } from '../store/useGame'
import { bedStage } from '../sim/greenhouse'
import { CROPS, type CropId } from '../data/crops'
import type { CropBed } from '../sim/types'

// ===========================================================================
//  shared small parts
// ===========================================================================

/** Dust that has drifted up against the base of a structure. */
function DustSkirt({ inner, outer }: { inner: number; outer: number }) {
  return (
    <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <ringGeometry args={[inner, outer, 32]} />
      <meshStandardMaterial color="#8e3c1b" roughness={1} transparent opacity={0.6} depthWrite={false} />
    </mesh>
  )
}

/** A short run of handrail, built from posts and a top rail. */
function Handrail({ length, posts = 4 }: { length: number; posts?: number }) {
  return (
    <group>
      {Array.from({ length: posts }, (_, i) => (
        <mesh key={i} castShadow position={[(i / (posts - 1) - 0.5) * length, 0.45, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.9, 6]} />
          <meshStandardMaterial color="#8d98a6" metalness={0.75} roughness={0.35} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, length, 6]} />
        <meshStandardMaterial color="#9aa7b4" metalness={0.75} roughness={0.3} />
      </mesh>
    </group>
  )
}

/** A bundle of cable snaking along the ground between two points. */
function CableRun({ to, sag = 0.25 }: { to: [number, number]; sag?: number }) {
  const geometry = useMemo(() => {
    const steps = 22
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = to[0] * t
      const z = to[1] * t
      const dip = Math.sin(t * Math.PI) * sag
      pts.push(new THREE.Vector3(x, terrainHeight(x, z) + 0.07 - dip * 0.1, z))
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, 0.055, 6, false)
  }, [to, sag])

  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color="#20242c" roughness={0.75} metalness={0.2} />
    </mesh>
  )
}

/** Status indicator that pulses slowly when the system is live. */
function StatusLight({
  position, on, onColor = '#3fd68c', offColor = '#f2555a', size = 0.14,
}: {
  position: [number, number, number]
  on: boolean
  onColor?: string
  offColor?: string
  size?: number
}) {
  const ref = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((state) => {
    if (!ref.current) return
    const pulse = on ? 1.6 + Math.sin(state.clock.elapsedTime * 2.4) * 0.6 : 2.2
    ref.current.emissiveIntensity = pulse
  })
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 12, 12]} />
      <meshStandardMaterial
        ref={ref}
        color={on ? onColor : offColor}
        emissive={on ? onColor : offColor}
        emissiveIntensity={2}
        toneMapped={false}
      />
    </mesh>
  )
}

// ===========================================================================
//  HABITAT
// ===========================================================================

function Habitat({ shield }: { shield: boolean }) {
  const hull = useMemo(() => hullPanels(), [])
  const hazard = useMemo(() => hazardStripe(), [])
  const streak = useMemo(() => dustStreak(), [])

  return (
    <group>
      {/* ---- main pressure cylinder ---- */}
      <mesh castShadow receiveShadow position={[0, 2.2, 0]}>
        <cylinderGeometry args={[4.0, 4.1, 4.4, 36]} />
        <meshStandardMaterial map={hull} color="#f2ece2" roughness={0.56} metalness={0.14} />
      </mesh>

      {/* dust weathering over the lower hull */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[4.03, 4.13, 2.2, 36, 1, true]} />
        <meshStandardMaterial map={streak} transparent opacity={0.8} roughness={1} depthWrite={false} />
      </mesh>

      {/* ---- dome ---- */}
      <mesh castShadow position={[0, 4.4, 0]}>
        <sphereGeometry args={[4.0, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial map={hull} color="#f7f2e8" roughness={0.5} metalness={0.16} />
      </mesh>

      {/* dome meridian ribs */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={`rib${i}`} castShadow position={[0, 4.4, 0]} rotation={[0, a, 0]}>
            <torusGeometry args={[4.02, 0.055, 6, 20, Math.PI / 2]} />
            <meshStandardMaterial color="#9aa7b4" metalness={0.65} roughness={0.35} />
          </mesh>
        )
      })}

      {/* ---- structural ribs on the cylinder ---- */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={`vrib${i}`} castShadow position={[Math.cos(a) * 4.12, 2.2, Math.sin(a) * 4.12]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.16, 4.5, 0.46]} />
            <meshStandardMaterial color="#8d98a6" roughness={0.42} metalness={0.58} />
          </mesh>
        )
      })}

      {/* waist belt */}
      <mesh castShadow position={[0, 3.3, 0]}>
        <torusGeometry args={[4.12, 0.09, 8, 40]} />
        <meshStandardMaterial color="#9aa7b4" metalness={0.7} roughness={0.32} />
      </mesh>

      {/* ---- airlock, with hazard surround ---- */}
      <group position={[0, 0, 4.4]}>
        <mesh castShadow receiveShadow position={[0, 1.5, 0.5]}>
          <cylinderGeometry args={[1.4, 1.45, 3.0, 20]} />
          <meshStandardMaterial map={hull} color="#ded6c8" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, 1.5, 2.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.18, 1.18, 0.14, 20]} />
          <meshStandardMaterial map={hazard} roughness={0.7} />
        </mesh>
        {/* hatch — brushed metal, not a dark disc. At #1d2938 it read as a
            hole punched through the habitat rather than a door. */}
        <mesh castShadow position={[0, 1.5, 2.16]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.92, 0.92, 0.18, 24]} />
          <meshStandardMaterial color="#9aa5b4" roughness={0.38} metalness={0.72} />
        </mesh>
        {/* radial stiffening ribs */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 1.5, 2.26]} rotation={[0, 0, (i * Math.PI) / 4]}>
            <boxGeometry args={[1.66, 0.085, 0.04]} />
            <meshStandardMaterial color="#7f8a99" roughness={0.45} metalness={0.6} />
          </mesh>
        ))}
        {/* porthole */}
        <mesh position={[0, 1.92, 2.28]}>
          <circleGeometry args={[0.17, 18]} />
          <meshStandardMaterial
            color="#20405c" roughness={0.1} metalness={0.3}
            emissive="#2e5c80" emissiveIntensity={0.5}
          />
        </mesh>
        <mesh position={[0, 1.92, 2.27]}>
          <torusGeometry args={[0.19, 0.028, 6, 18]} />
          <meshStandardMaterial color="#6f7a88" metalness={0.65} roughness={0.4} />
        </mesh>
        {/* hatch wheel */}
        <mesh position={[0, 1.5, 2.3]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38, 0.06, 6, 16]} />
          <meshStandardMaterial color="#c9622b" metalness={0.6} roughness={0.4} />
        </mesh>
        <StatusLight position={[0.95, 2.3, 2.1]} on />
        {/* entry steps */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} castShadow receiveShadow position={[0, 0.18 + i * 0.26, 2.9 - i * 0.42]}>
            <boxGeometry args={[1.8 - i * 0.12, 0.14, 0.42]} />
            <meshStandardMaterial color="#8d98a6" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        <group position={[1.1, 0.9, 2.6]} rotation={[0, Math.PI / 2, 0]}>
          <Handrail length={1.6} posts={3} />
        </group>
        <group position={[-1.1, 0.9, 2.6]} rotation={[0, Math.PI / 2, 0]}>
          <Handrail length={1.6} posts={3} />
        </group>
      </group>

      {/* ---- secondary module, connected by a tunnel ---- */}
      <group position={[-6.4, 0, -1.4]}>
        <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
          <cylinderGeometry args={[2.1, 2.15, 3.0, 24]} />
          <meshStandardMaterial map={hull} color="#e8e1d4" roughness={0.58} metalness={0.15} />
        </mesh>
        <mesh castShadow position={[0, 3.0, 0]}>
          <sphereGeometry args={[2.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial map={hull} color="#efe8db" roughness={0.52} metalness={0.16} />
        </mesh>
        <mesh position={[0, 1.6, 2.08]}>
          <circleGeometry args={[0.55, 18]} />
          <meshStandardMaterial color="#ffd9a0" emissive="#ffb855" emissiveIntensity={1.3} toneMapped={false} />
        </mesh>
      </group>

      {/* connecting tunnel */}
      <mesh castShadow receiveShadow position={[-3.3, 1.4, -0.7]} rotation={[0, 0.21, Math.PI / 2]}>
        <cylinderGeometry args={[1.0, 1.0, 4.6, 16]} />
        <meshStandardMaterial color="#d8d0c2" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* tunnel hoops */}
      {[-1.6, -0.5, 0.6].map((o) => (
        <mesh key={o} position={[-3.3 + o, 1.4, -0.7 + o * 0.21]} rotation={[0, 0.21, Math.PI / 2]}>
          <torusGeometry args={[1.02, 0.05, 6, 16]} />
          <meshStandardMaterial color="#9aa7b4" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* ---- windows with warm interior spill ---- */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <group key={`win${i}`} position={[Math.cos(a) * 4.04, 2.7, Math.sin(a) * 4.04]} rotation={[0, -a + Math.PI / 2, 0]}>
            <mesh>
              <circleGeometry args={[0.62, 22]} />
              <meshStandardMaterial color="#ffd9a0" emissive="#ffb855" emissiveIntensity={1.7} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -0.02]}>
              <torusGeometry args={[0.66, 0.06, 6, 22]} />
              <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        )
      })}

      {/* ---- comms dish and mast ---- */}
      <group position={[2.6, 0, -2.6]}>
        <mesh castShadow position={[0, 3.2, 0]}>
          <cylinderGeometry args={[0.09, 0.12, 6.4, 8]} />
          <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh castShadow position={[0, 6.4, 0.25]} rotation={[-0.75, 0.3, 0]}>
          <sphereGeometry args={[0.95, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
          <meshStandardMaterial color="#e4ded2" roughness={0.4} metalness={0.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 6.1, 0.55]}>
          <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
          <meshStandardMaterial color="#c9622b" metalness={0.5} roughness={0.5} />
        </mesh>
        <StatusLight position={[0.18, 5.4, 0]} on size={0.07} onColor="#7dd3fc" />
      </group>

      {/* ---- floodlights on the hull ---- */}
      {[[3.4, -2.2], [-3.4, 2.2]].map(([lx, lz], i) => (
        <group key={`flood${i}`} position={[lx, 4.0, lz]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.22, 0.4]} />
            <meshStandardMaterial color="#6f7a88" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.1, 0.22]} rotation={[1.1, 0, 0]}>
            <circleGeometry args={[0.13, 12]} />
            <meshStandardMaterial color="#fff4dd" emissive="#ffe9c4" emissiveIntensity={3} toneMapped={false} />
          </mesh>
          <spotLight
            position={[0, -0.1, 0.3]} angle={0.7} penumbra={0.6}
            intensity={6} distance={16} color="#ffeccc"
            target-position={[lx * 2, 0, lz * 2]}
          />
        </group>
      ))}

      {/* ---- regolith shielding, visible once installed ---- */}
      {shield && (
        <group>
          <mesh receiveShadow castShadow position={[0, 1.3, 0]}>
            <cylinderGeometry args={[5.2, 6.4, 2.6, 28]} />
            <meshStandardMaterial color="#8a3c1c" roughness={1} flatShading />
          </mesh>
          <mesh receiveShadow position={[0, 4.6, 0]}>
            <sphereGeometry args={[4.35, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
            <meshStandardMaterial color="#7d3b1d" roughness={1} flatShading />
          </mesh>
        </group>
      )}

      <DustSkirt inner={3.9} outer={6.8} />
    </group>
  )
}

// ===========================================================================
//  SOLAR ARRAY
// ===========================================================================

function SolarArray({ cleanliness }: { cleanliness: number }) {
  const cells = useMemo(() => solarCells(), [])
  const dust = 1 - cleanliness

  return (
    <group>
      {/* central mast and tracking pivot */}
      <mesh castShadow position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.2, 0.26, 2.0, 12]} />
        <meshStandardMaterial color="#7f8a98" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 2.05, 0]}>
        <sphereGeometry args={[0.3, 14, 10]} />
        <meshStandardMaterial color="#5c6572" metalness={0.8} roughness={0.28} />
      </mesh>

      {/* torque tube the panels hang from */}
      <mesh castShadow position={[0, 2.0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 10.2, 10]} />
        <meshStandardMaterial color="#8d98a6" metalness={0.75} roughness={0.3} />
      </mesh>

      {[-1, 0, 1].map((col) =>
        [-1, 1].map((row) => (
          <group key={`${col}:${row}`} position={[col * 3.2, 0, row * 2.3]}>
            {/* panel, tilted toward the sun */}
            <group position={[0, 1.9, 0]} rotation={[-0.46, 0, 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[3.0, 0.07, 2.1]} />
                <meshStandardMaterial
                  map={cells} color="#ffffff"
                  roughness={0.14} metalness={0.72} envMapIntensity={1.4}
                />
              </mesh>
              {/* frame */}
              <mesh castShadow position={[0, -0.05, 0]}>
                <boxGeometry args={[3.1, 0.08, 2.2]} />
                <meshStandardMaterial color="#aeb6c0" metalness={0.8} roughness={0.3} />
              </mesh>
              {/* cross-braces, read as real structure from a distance */}
              {[-0.7, 0, 0.7].map((o) => (
                <mesh key={o} position={[o * 1.4, -0.11, 0]}>
                  <boxGeometry args={[0.07, 0.1, 2.15]} />
                  <meshStandardMaterial color="#8d98a6" metalness={0.75} roughness={0.35} />
                </mesh>
              ))}
              {/* dust layer: opacity tracks the cleanliness number exactly */}
              <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[3.0, 2.1]} />
                <meshStandardMaterial
                  color="#c08050" roughness={1} transparent
                  opacity={Math.min(dust * 1.4, 0.88)} depthWrite={false}
                />
              </mesh>
            </group>

            {/* support leg and foot */}
            <mesh castShadow position={[0, 0.95, 0]}>
              <cylinderGeometry args={[0.08, 0.1, 1.9, 8]} />
              <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh receiveShadow position={[0, 0.06, 0]}>
              <cylinderGeometry args={[0.42, 0.5, 0.12, 12]} />
              <meshStandardMaterial color="#6f7a88" metalness={0.5} roughness={0.55} />
            </mesh>
          </group>
        )),
      )}

      {/* junction box at the foot of the mast */}
      <group position={[1.4, 0, 1.0]}>
        <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[0.8, 0.84, 0.5]} />
          <meshStandardMaterial color="#5c6572" metalness={0.55} roughness={0.45} />
        </mesh>
        <StatusLight position={[0, 0.72, 0.27]} on={cleanliness > 0.5} size={0.08} />
      </group>

      <DustSkirt inner={0.4} outer={2.0} />
    </group>
  )
}

// ===========================================================================
//  GREENHOUSE
// ===========================================================================

/**
 * One plant, shaped by its crop.
 *
 * Each crop has a different silhouette because the player has to be able to
 * tell, from inside the rack, which bed holds what — a wheat stalk, a lettuce
 * rosette, a tomato with fruit on it and a potato bush are four readable
 * shapes. Size follows `grown` continuously rather than snapping between
 * stages, so a bed visibly develops across the mission.
 */
function Plant({
  crop, grown, condition,
}: {
  crop: CropId
  /** 0..1 of the way to harvest. */
  grown: number
  /** 0..1 crop health. Below ~0.35 the plant starts to look it. */
  condition: number
}) {
  if (grown <= 0.02) return null

  const sick = condition < 0.35
  const def = CROPS[crop]
  // A struggling plant goes yellow-olive and droops; a dead one is brown.
  const leafA = sick ? '#8f7f36' : '#2fbd6e'
  const leafB = sick ? '#a89248' : '#4ade80'
  const droop = sick ? -0.85 : -0.2

  if (crop === 'lettuce') {
    // A rosette: no real stem, broad leaves fanning out and up from the base.
    const h = 0.06 + grown * 0.2
    const leaves = 7
    return (
      <group>
        {Array.from({ length: leaves }, (_, i) => {
          const a = (i / leaves) * Math.PI * 2
          const r = 0.05 + grown * 0.12
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * r, h * 0.55, Math.sin(a) * r]}
              rotation={[droop - 0.5, a, 0.2]}
              scale={[1, 0.45, 1]}
            >
              <sphereGeometry args={[0.07 + grown * 0.09, 7, 5]} />
              <meshStandardMaterial
                color={i % 2 ? leafA : leafB} roughness={0.7} flatShading
              />
            </mesh>
          )
        })}
      </group>
    )
  }

  if (crop === 'wheat') {
    // Thin stalks with a seed head that only appears near harvest.
    const h = 0.1 + grown * 0.62
    const stalks = 5
    return (
      <group>
        {Array.from({ length: stalks }, (_, i) => {
          const a = i * 1.9
          const off = 0.035
          return (
            <group key={i} position={[Math.cos(a) * off, 0, Math.sin(a) * off]}>
              <mesh position={[0, h / 2, 0]} rotation={[0, 0, (i - 2) * 0.05]}>
                <cylinderGeometry args={[0.006, 0.01, h, 5]} />
                <meshStandardMaterial color={sick ? '#9a8c4a' : '#86b94e'} roughness={0.85} />
              </mesh>
              {grown > 0.6 && (
                <mesh position={[0, h + 0.045, 0]}>
                  <capsuleGeometry args={[0.018, 0.08, 4, 6]} />
                  <meshStandardMaterial
                    color={def.tint} roughness={0.8} flatShading
                  />
                </mesh>
              )}
            </group>
          )
        })}
      </group>
    )
  }

  if (crop === 'tomato') {
    // A staked stem with leaf clusters, and fruit that ripens green to red.
    const h = 0.1 + grown * 0.55
    const clusters = Math.max(2, Math.round(grown * 5))
    return (
      <group>
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[0.014, 0.022, h, 6]} />
          <meshStandardMaterial color={sick ? '#7a6a32' : '#2b8f52'} roughness={0.8} />
        </mesh>
        {/* the stake, because a dwarf tomato still has to be tied up */}
        <mesh position={[0.055, h * 0.55, 0]}>
          <cylinderGeometry args={[0.006, 0.006, h * 1.1, 4]} />
          <meshStandardMaterial color="#b9b2a6" roughness={0.6} metalness={0.3} />
        </mesh>
        {Array.from({ length: clusters }, (_, i) => {
          const t = (i + 1) / (clusters + 1)
          const a = i * 2.3
          return (
            <group key={i} position={[Math.cos(a) * 0.06, h * t, Math.sin(a) * 0.06]}>
              <mesh rotation={[droop, a, 0.3]}>
                <sphereGeometry args={[0.07, 7, 5]} />
                <meshStandardMaterial color={i % 2 ? leafA : leafB} roughness={0.72} flatShading />
              </mesh>
              {grown > 0.55 && i % 2 === 0 && (
                <mesh position={[0.05, -0.04, 0]}>
                  <sphereGeometry args={[0.028 + grown * 0.016, 8, 6]} />
                  <meshStandardMaterial
                    color={grown > 0.85 ? def.tint : '#8fbf5a'} roughness={0.35}
                  />
                </mesh>
              )}
            </group>
          )
        })}
      </group>
    )
  }

  // potato: a low bush, with the tubers implied by mounded medium below
  const h = 0.08 + grown * 0.34
  const leaves = Math.max(4, Math.round(grown * 9))
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.016, 0.026, h, 6]} />
        <meshStandardMaterial color={sick ? '#7a6a32' : '#357f45'} roughness={0.85} />
      </mesh>
      {Array.from({ length: leaves }, (_, i) => {
        const t = 0.25 + (i / leaves) * 0.75
        const a = i * 2.1
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * (0.05 + t * 0.07), h * t, Math.sin(a) * (0.05 + t * 0.07)]}
            rotation={[droop - 0.3, a, 0.25]}
            scale={[1, 0.6, 1.3]}
          >
            <sphereGeometry args={[0.055, 6, 5]} />
            <meshStandardMaterial color={i % 2 ? leafA : leafB} roughness={0.78} flatShading />
          </mesh>
        )
      })}
      {grown > 0.8 && (
        <mesh position={[0, 0.02, 0]} scale={[1, 0.45, 1]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color={def.tint} roughness={0.9} />
        </mesh>
      )}
    </group>
  )
}

/**
 * The rack.
 *
 * Four trays, one per simulated bed, laid out two deep and two high so each
 * one is visible from the door. The tray a bed occupies never changes, so
 * "bed 3" in the planning screen is always the same tray in the world.
 */
function Greenhouse({ beds, lit }: { beds: CropBed[]; lit: number }) {
  const glow = useMemo(() => softGlow(), [])

  // tray z and y for bed 0..3, in planning order
  const trays: [number, number][] = [[-1.3, 0.65], [1.3, 0.65], [-1.3, 1.55], [1.3, 1.55]]

  return (
    <group>
      {/* ---- arched glazing ---- */}
      <mesh castShadow position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 6.4, 24, 1, true, 0, Math.PI]} />
        <meshPhysicalMaterial
          color="#d6ecff" transparent opacity={0.22} roughness={0.06}
          metalness={0} transmission={0.75} thickness={0.5}
          side={THREE.DoubleSide} envMapIntensity={1.2}
        />
      </mesh>
      {/* end caps */}
      {[-3.2, 3.2].map((z) => (
        <mesh key={z} position={[0, 1.6, z]} rotation={[0, 0, 0]}>
          <circleGeometry args={[2.2, 24, 0, Math.PI]} />
          <meshPhysicalMaterial
            color="#d6ecff" transparent opacity={0.3} roughness={0.07}
            transmission={0.6} thickness={0.4} side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* ---- arch trusses: the thing that makes it read as a greenhouse ---- */}
      {[-3.1, -2.1, -1.0, 0, 1.0, 2.1, 3.1].map((z) => (
        <mesh key={`arch${z}`} castShadow position={[0, 1.6, z]} rotation={[0, 0, 0]}>
          <torusGeometry args={[2.22, 0.055, 6, 24, Math.PI]} />
          <meshStandardMaterial color="#e8e2d6" metalness={0.5} roughness={0.42} />
        </mesh>
      ))}
      {/* ridge beam and purlins */}
      {[0, -1.55, 1.55].map((x) => (
        <mesh key={`purlin${x}`} castShadow position={[x, x === 0 ? 3.8 : 3.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 6.4, 6]} />
          <meshStandardMaterial color="#e8e2d6" metalness={0.5} roughness={0.42} />
        </mesh>
      ))}

      {/* ---- base sill ---- */}
      <mesh receiveShadow castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[4.6, 0.4, 6.6]} />
        <meshStandardMaterial color="#cfc7ba" roughness={0.75} metalness={0.1} />
      </mesh>

      {/* ---- four hydroponic beds, one tray each ---- */}
      {trays.map(([z, y], bedIndex) => {
        const bed = beds[bedIndex]
        const stage = bed ? bedStage(bed) : 'empty'
        const planted = !!bed?.crop && stage !== 'empty'
        const dead = stage === 'wilted'
        // A dead bed still shows the collapsed remains: an empty tray and a
        // failed crop have to look different, or the player cannot tell that
        // something went wrong without opening a menu.
        const grown = !planted ? 0 : dead ? 0.22 : 0.08 + bed.progress * 0.92
        const condition = dead ? 0 : (bed?.health ?? 100) / 100

        return (
          <group key={bedIndex} position={[0, y, z]}>
            {/* nutrient tray */}
            <mesh receiveShadow>
              <boxGeometry args={[3.4, 0.12, 0.85]} />
              <meshStandardMaterial color="#4a3a2e" roughness={0.95} />
            </mesh>
            {/* tray frame */}
            <mesh position={[0, -0.09, 0]}>
              <boxGeometry args={[3.5, 0.06, 0.95]} />
              <meshStandardMaterial color="#9aa7b4" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* the hydroponic feed line along the back of the tray */}
            <mesh position={[0, 0.03, -0.38]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.022, 0.022, 3.3, 6]} />
              <meshStandardMaterial color="#6f7d8b" metalness={0.5} roughness={0.45} />
            </mesh>
            {/* a bed label plate, so the trays match the planning numbers */}
            <mesh position={[-1.78, 0.04, 0]}>
              <boxGeometry args={[0.12, 0.1, 0.3]} />
              <meshStandardMaterial
                color={planted && !dead ? CROPS[bed.crop as CropId].tint : '#6b7480'}
                roughness={0.6}
                emissive={planted && !dead ? CROPS[bed.crop as CropId].tint : '#000000'}
                emissiveIntensity={planted && !dead ? 0.35 : 0}
                toneMapped={false}
              />
            </mesh>
            {planted && bed.crop && (
              [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].map((x, i) => (
                <group key={x} position={[x, 0.06, 0]} rotation={[0, i * 1.1, 0]}>
                  <Plant crop={bed.crop as CropId} grown={grown} condition={condition} />
                </group>
              ))
            )}
          </group>
        )
      })}

      {/* rack uprights */}
      {[-1.7, 1.7].map((x) =>
        [-1.9, 1.9].map((z) => (
          <mesh key={`${x}:${z}`} castShadow position={[x, 1.1, z]}>
            <boxGeometry args={[0.07, 2.0, 0.07]} />
            <meshStandardMaterial color="#8d98a6" metalness={0.6} roughness={0.4} />
          </mesh>
        )),
      )}

      {/* ---- grow lights ----
           Narrow LED bars over each rack, not glowing slabs. Horticultural
           LEDs really are magenta (they drop the green band plants reflect
           rather than absorb), but a full-width emissive panel reads as a
           sheet of pink plastic and swamps the whole outpost in colour, so
           the emitters stay thin and the spill is left to the lights. */}
      {[0.98, 1.88].map((y) =>
        [-0.95, 0.95].map((x) => (
          <group key={`${y}-${x}`} position={[x, y + 0.44, 0]}>
            {/* housing */}
            <mesh castShadow>
              <boxGeometry args={[0.16, 0.1, 4.9]} />
              <meshStandardMaterial color="#9aa3b0" metalness={0.5} roughness={0.5} />
            </mesh>
            {/* the emitting face, pointing down at the crop */}
            <mesh position={[0, -0.055, 0]}>
              <boxGeometry args={[0.11, 0.015, 4.75]} />
              <meshStandardMaterial
                color="#ffd9f0" emissive="#ff63c4"
                emissiveIntensity={lit * 2.6} toneMapped={false}
              />
            </mesh>
          </group>
        )),
      )}
      {lit > 0 && (
        <>
          <pointLight position={[0, 1.42, -1.6]} color="#ff8ed6" intensity={lit * 4.5} distance={7} decay={2} />
          <pointLight position={[0, 1.42, 1.6]} color="#ff8ed6" intensity={lit * 4.5} distance={7} decay={2} />
          <pointLight position={[0, 2.32, 0]} color="#ff8ed6" intensity={lit * 4} distance={7} decay={2} />
          {/* a faint haze inside the glazing, not a billboard across the roof */}
          <sprite position={[0, 1.55, 0]} scale={[3.4, 1.9, 1]}>
            <spriteMaterial
              map={glow} color="#ff7fcd" transparent
              opacity={lit * 0.13} depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </>
      )}

      {/* ---- door ---- */}
      <mesh castShadow position={[0, 1.0, 3.34]}>
        <boxGeometry args={[1.1, 1.9, 0.12]} />
        <meshStandardMaterial color="#b9b2a6" metalness={0.3} roughness={0.6} />
      </mesh>
      <StatusLight position={[0.7, 1.9, 3.36]} on={lit > 0} onColor="#ff7ed0" size={0.08} />

      {/* ---- external water tank ---- */}
      <group position={[3.0, 0, -2.2]}>
        <mesh castShadow receiveShadow position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 1.8, 16]} />
          <meshStandardMaterial color="#4f7fd4" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[0, 1.82, 0]}>
          <cylinderGeometry args={[0.62, 0.62, 0.08, 16]} />
          <meshStandardMaterial color="#9aa7b4" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>

      <DustSkirt inner={2.3} outer={4.2} />
    </group>
  )
}

// ===========================================================================
//  PROCESSORS  (water recycler / oxygen generator)
// ===========================================================================

function Processor({ tint, running, kind }: { tint: string; running: boolean; kind: 'water' | 'oxygen' }) {
  const hull = useMemo(() => hullPanels(), [])
  const plume = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!plume.current) return
    const t = state.clock.elapsedTime
    plume.current.children.forEach((child, i) => {
      const phase = (t * 0.6 + i * 0.25) % 1
      child.position.y = 2.6 + phase * 2.4
      child.scale.setScalar(0.2 + phase * 0.95)
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
      mat.opacity = running ? (1 - phase) * 0.35 : 0
    })
  })

  return (
    <group>
      {/* main housing */}
      <mesh castShadow receiveShadow position={[0, 1.15, 0]}>
        <boxGeometry args={[2.5, 2.3, 2.5]} />
        <meshStandardMaterial map={hull} color="#cfc7ba" roughness={0.62} metalness={0.28} />
      </mesh>

      {/* corner posts */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}:${sz}`} castShadow position={[sx * 1.26, 1.15, sz * 1.26]}>
            <boxGeometry args={[0.12, 2.35, 0.12]} />
            <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.33} />
          </mesh>
        )),
      )}

      {/* process drum on top */}
      <mesh castShadow position={[0, 2.62, 0]}>
        <cylinderGeometry args={[0.78, 0.92, 0.76, 18]} />
        <meshStandardMaterial color={tint} roughness={0.38} metalness={0.5} />
      </mesh>
      <mesh position={[0, 3.02, 0]}>
        <torusGeometry args={[0.8, 0.055, 6, 18]} />
        <meshStandardMaterial color="#9aa7b4" metalness={0.75} roughness={0.28} />
      </mesh>

      {/* exhaust stack */}
      <mesh castShadow position={[0.55, 3.1, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 1.0, 10]} />
        <meshStandardMaterial color="#7f8a98" metalness={0.65} roughness={0.4} />
      </mesh>

      {/* vapour plume when running */}
      <group ref={plume} position={[0.55, 0, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 2.6, 0]}>
            <sphereGeometry args={[0.3, 8, 6]} />
            <meshStandardMaterial
              color={kind === 'water' ? '#dff4ff' : '#eaf6ff'}
              transparent opacity={0} depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* pipework */}
      {[-0.75, 0.75].map((x) => (
        <group key={x}>
          <mesh castShadow position={[x, 1.1, 1.42]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 1.7, 12]} />
            <meshStandardMaterial color={tint} metalness={0.6} roughness={0.36} />
          </mesh>
          <mesh position={[x, 1.1, 2.2]}>
            <torusGeometry args={[0.17, 0.045, 6, 14]} />
            <meshStandardMaterial color="#8d98a6" metalness={0.75} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* control panel */}
      <mesh position={[0, 1.55, 1.27]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[1.1, 0.7, 0.07]} />
        <meshStandardMaterial color="#1a2230" roughness={0.4} metalness={0.4} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.3, 1.62, 1.33]}>
          <boxGeometry args={[0.16, 0.1, 0.02]} />
          <meshStandardMaterial
            color={running ? tint : '#2b3340'}
            emissive={running ? tint : '#000'}
            emissiveIntensity={running ? 1.6 : 0}
            toneMapped={false}
          />
        </mesh>
      ))}

      <StatusLight position={[0, 2.15, 1.3]} on={running} />
      <DustSkirt inner={1.3} outer={2.6} />
    </group>
  )
}

// ===========================================================================
//  BATTERY BANK
// ===========================================================================

function Battery({ charge }: { charge: number }) {
  const hull = useMemo(() => hullPanels(), [])
  const segments = 10
  const litSegments = Math.round(charge * segments)

  return (
    <group>
      {[-1.0, 0, 1.0].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.95, 0]}>
            <boxGeometry args={[0.9, 1.9, 1.9]} />
            <meshStandardMaterial map={hull} color="#6f7a88" roughness={0.52} metalness={0.45} />
          </mesh>
          {/* cooling fins */}
          {[-0.5, 0, 0.5].map((z) => (
            <mesh key={z} castShadow position={[0, 1.45, z]}>
              <boxGeometry args={[0.95, 0.06, 0.3]} />
              <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}

      {/* segmented charge display */}
      <group position={[0, 2.1, 1.0]}>
        <mesh>
          <boxGeometry args={[2.8, 0.3, 0.1]} />
          <meshStandardMaterial color="#121924" roughness={0.6} />
        </mesh>
        {Array.from({ length: segments }, (_, i) => (
          <mesh key={i} position={[-1.26 + i * 0.28, 0, 0.07]}>
            <boxGeometry args={[0.22, 0.18, 0.04]} />
            <meshStandardMaterial
              color={i < litSegments ? '#fbbf24' : '#1f2a38'}
              emissive={i < litSegments ? '#fbbf24' : '#000'}
              emissiveIntensity={i < litSegments ? 2 : 0}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {/* bus duct */}
      <mesh castShadow position={[0, 0.3, -1.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 3.0, 10]} />
        <meshStandardMaterial color="#20242c" roughness={0.7} metalness={0.3} />
      </mesh>

      <DustSkirt inner={1.5} outer={2.8} />
    </group>
  )
}

// ===========================================================================
//  ROVER
// ===========================================================================

function Rover({ charged }: { charged: boolean }) {
  const hull = useMemo(() => hullPanels(), [])

  return (
    <group>
      {/* chassis */}
      <mesh castShadow position={[0, 1.15, 0]}>
        <boxGeometry args={[4.4, 1.3, 2.3]} />
        <meshStandardMaterial map={hull} color="#c9622b" roughness={0.58} metalness={0.3} />
      </mesh>
      {/* lower skirt */}
      <mesh castShadow position={[0, 0.65, 0]}>
        <boxGeometry args={[4.0, 0.45, 2.0]} />
        <meshStandardMaterial color="#8a4420" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* pressurised cab */}
      <mesh castShadow position={[0.85, 2.05, 0]}>
        <boxGeometry args={[2.0, 1.4, 2.1]} />
        <meshStandardMaterial map={hull} color="#ded6c8" roughness={0.55} metalness={0.25} />
      </mesh>
      {/* windscreen */}
      <mesh position={[1.87, 2.15, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.08, 1.0, 1.85]} />
        <meshPhysicalMaterial
          color="#9ad4ff" transparent opacity={0.42}
          roughness={0.06} metalness={0.1} transmission={0.6} thickness={0.3}
        />
      </mesh>
      {/* side windows */}
      {[-1.06, 1.06].map((z) => (
        <mesh key={z} position={[0.85, 2.2, z]}>
          <boxGeometry args={[1.5, 0.75, 0.06]} />
          <meshPhysicalMaterial color="#9ad4ff" transparent opacity={0.38} roughness={0.07} transmission={0.6} />
        </mesh>
      ))}

      {/* roof rack and antenna */}
      <mesh castShadow position={[0.85, 2.8, 0]}>
        <boxGeometry args={[1.9, 0.1, 2.0]} />
        <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0.1, 3.3, -0.8]}>
        <cylinderGeometry args={[0.03, 0.03, 1.1, 6]} />
        <meshStandardMaterial color="#9aa7b4" metalness={0.75} roughness={0.3} />
      </mesh>

      {/* drill assembly at the rear, for the ice run */}
      <group position={[-2.0, 1.0, 0]}>
        <mesh castShadow position={[-0.35, 0.3, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.8, 0.5, 0.6]} />
          <meshStandardMaterial color="#5c6572" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[-0.7, -0.25, 0]}>
          <cylinderGeometry args={[0.1, 0.06, 1.3, 10]} />
          <meshStandardMaterial color="#aeb6c0" metalness={0.85} roughness={0.22} />
        </mesh>
      </group>

      {/* six wheels on rocker bogies */}
      {[-1.6, 0, 1.6].map((x) =>
        [-1.25, 1.25].map((z) => (
          <group key={`${x}:${z}`} position={[x, 0.6, z]}>
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.6, 0.6, 0.42, 16]} />
              <meshStandardMaterial color="#2b2b30" roughness={0.92} />
            </mesh>
            {/* tread cleats */}
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2
              return (
                <mesh key={i} position={[Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0]} rotation={[0, 0, a]}>
                  <boxGeometry args={[0.1, 0.07, 0.46]} />
                  <meshStandardMaterial color="#3a3a42" roughness={0.9} />
                </mesh>
              )
            })}
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.2, 0.2, 0.46, 10]} />
              <meshStandardMaterial color="#9aa7b4" metalness={0.7} roughness={0.35} />
            </mesh>
          </group>
        )),
      )}

      {/* headlights */}
      {[-0.7, 0.7].map((z) => (
        <mesh key={z} position={[2.22, 1.35, z]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.16, 14]} />
          <meshStandardMaterial
            color="#fff4dd" emissive="#ffe9c4"
            emissiveIntensity={charged ? 3 : 0.2} toneMapped={false}
          />
        </mesh>
      ))}
      <StatusLight position={[-2.3, 1.9, 0]} on={charged} />

      {/* charge cable, plugged in when charging */}
      {charged && (
        <mesh castShadow position={[-1.0, 0.25, 1.3]} rotation={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.6} />
        </mesh>
      )}
    </group>
  )
}

// ===========================================================================
//  HULL BREACH
// ===========================================================================

function Breach({ active }: { active: boolean }) {
  const vent = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!vent.current || !active) return
    const t = state.clock.elapsedTime
    vent.current.children.forEach((child, i) => {
      const phase = (t * 1.3 + i * 0.22) % 1
      child.position.set(0.25 + phase * 1.9, 1.7 + phase * 1.3, 0)
      child.scale.setScalar(0.12 + phase * 0.7)
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
      mat.opacity = (1 - phase) * 0.6
    })
  })

  if (!active) return null

  return (
    <group>
      {/* torn plating */}
      <mesh castShadow position={[0, 1.6, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[1.0, 0.1, 0.55]} />
        <meshStandardMaterial color="#2a1a14" roughness={0.9} metalness={0.3} />
      </mesh>
      {[-0.25, 0.3].map((o, i) => (
        <mesh key={i} castShadow position={[o, 1.72, 0.1]} rotation={[0.4, i * 0.8, 0.6]}>
          <boxGeometry args={[0.4, 0.03, 0.26]} />
          <meshStandardMaterial color="#9aa7b4" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}

      {/* venting vapour */}
      <group ref={vent}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.3, 8, 6]} />
            <meshStandardMaterial color="#e8f6ff" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* warning strobe at 1 Hz — never faster, for accessibility */}
      <mesh position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color="#f2555a" emissive="#f2555a" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 2.0, 0]} color="#f2555a" intensity={4} distance={7} />
    </group>
  )
}

// ===========================================================================
//  BEACON
// ===========================================================================

function Beacon({ color }: { color: string }) {
  const h = 7.5
  const ref = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    if (!ref.current) return
    ref.current.emissiveIntensity = 2 + Math.sin(state.clock.elapsedTime * 1.6) * 0.8
  })

  return (
    <group>
      <mesh castShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.055, h, 6]} />
        <meshStandardMaterial color="#8d98a6" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, h, 0]}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial ref={ref} color={color} emissive={color} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <pointLight position={[0, h, 0]} color={color} intensity={1.4} distance={7} />
      {/* guy wires */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.45, h * 0.35, Math.sin(a) * 0.45]}
            rotation={[Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]}
          >
            <cylinderGeometry args={[0.012, 0.012, h * 0.72, 4]} />
            <meshStandardMaterial color="#6f7a88" metalness={0.6} roughness={0.5} />
          </mesh>
        )
      })}
    </group>
  )
}

// ===========================================================================
//  ROOT
// ===========================================================================

export function Structures() {
  const state = useGame((s) => s.state)
  const plan = useGame((s) => s.plan)

  const placed = useMemo(
    () => STRUCTURES.map((d) => ({ d, y: terrainHeight(d.pos[0], d.pos[2]) })),
    [],
  )

  return (
    <group>
      {/* power and data cables radiating from the habitat */}
      <group position={[0, 0, 0]}>
        <CableRun to={[-16, -9]} />
        <CableRun to={[15, -10]} />
        <CableRun to={[10, 12]} />
        <CableRun to={[-10, 12]} />
        <CableRun to={[-19, 4]} />
      </group>

      {placed.map(({ d, y }) => (
        <group key={d.id} position={[d.pos[0], y, d.pos[2]]} rotation={[0, d.rot ?? 0, 0]}>
          {d.id === 'habitat' && <Habitat shield={state.shieldInstalled} />}
          {d.id === 'solar' && <SolarArray cleanliness={state.stocks.cleanliness} />}
          {d.id === 'greenhouse' && (
            <Greenhouse beds={state.greenhouse.beds} lit={plan.modes.greenhouse / 3} />
          )}
          {d.id === 'water' && (
            <Processor tint="#4f7fd4" kind="water" running={plan.modes.waterRecycler > 0} />
          )}
          {d.id === 'oxygen' && (
            <Processor tint="#7dd3fc" kind="oxygen" running={plan.modes.oxygenGenerator > 0} />
          )}
          {d.id === 'battery' && <Battery charge={Math.min(state.stocks.battery / 40, 1)} />}
          {d.id === 'rover' && <Rover charged={plan.modes.roverCharge > 0} />}
          {d.id === 'breach' && <Breach active={state.o2Leak > 0} />}
          {d.id !== 'breach' && d.id !== 'habitat' && <Beacon color={d.tint} />}
        </group>
      ))}
    </group>
  )
}
