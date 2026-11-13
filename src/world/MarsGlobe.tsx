import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  MARS_RADIUS_KM, RELIEF_EXAGGERATION, lonLatToVec, marsAlbedoVec, marsElevationVec, type Vec3,
} from './marsTopography'
import { LANDING_SITES, type LandingSite } from '../data/marsFeatures'
import { softGlow } from './textures'

/** Scene units for the planet's radius. Everything else is derived from it. */
const GLOBE_R = 2

/** Mesh resolution. 256x128 is ~33k vertices and builds in well under a second. */
const SEG_LON = 256
const SEG_LAT = 128

// ===========================================================================
//  THE PLANET
// ===========================================================================

/**
 * Builds the globe geometry once.
 *
 * Positions come from the shared height field, so the surface a player clicks
 * on in orbit is the same surface the landing-site table describes. Colour is
 * baked into vertex colours: albedo decides the hue, elevation brightens the
 * highlands, and the polar caps come out of the albedo function on their own.
 */
function usePlanetGeometry(): THREE.BufferGeometry {
  return useMemo(() => {
    const geo = new THREE.SphereGeometry(GLOBE_R, SEG_LON, SEG_LAT)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)

    // Mars in true colour is butterscotch and rust, not fire-engine red.
    // These are sampled towards the darker, less saturated end because the
    // rim light and the additive atmosphere both add brightness on top.
    const darkBasalt = new THREE.Color('#5b3526')
    const rust = new THREE.Color('#8e5334')
    const ochre = new THREE.Color('#b8793f')
    const dust = new THREE.Color('#d2a473')
    const frost = new THREE.Color('#e9e6e2')

    const tmp = new THREE.Color()
    const dir: Vec3 = [0, 0, 0]

    for (let i = 0; i < pos.count; i++) {
      dir[0] = pos.getX(i) / GLOBE_R
      dir[1] = pos.getY(i) / GLOBE_R
      dir[2] = pos.getZ(i) / GLOBE_R

      const elevKm = marsElevationVec(dir)
      const albedo = marsAlbedoVec(dir)

      // Displace along the normal. The sphere is a unit direction times radius,
      // so the normal is the direction itself.
      const scale = GLOBE_R * (1 + (elevKm / MARS_RADIUS_KM) * RELIEF_EXAGGERATION)
      pos.setXYZ(i, dir[0] * scale, dir[1] * scale, dir[2] * scale)

      // Albedo ramp: dark swept basalt -> rust -> ochre -> bright dust.
      if (albedo < 0.34) tmp.copy(darkBasalt).lerp(rust, albedo / 0.34)
      else if (albedo < 0.62) tmp.copy(rust).lerp(ochre, (albedo - 0.34) / 0.28)
      else tmp.copy(ochre).lerp(dust, Math.min((albedo - 0.62) / 0.26, 1))

      // Ice is a different material, not a brighter dust — it has to go cold
      // and desaturated or the caps read as pale sand.
      if (albedo > 0.84) tmp.lerp(frost, Math.min((albedo - 0.84) / 0.14, 1))

      // High ground catches more light and holds less dark sand.
      tmp.offsetHSL(0, 0, Math.min(Math.max(elevKm, -8), 20) * 0.006)

      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])
}

/**
 * The thin CO2 atmosphere, as a back-face shell with a Fresnel rim.
 *
 * Mars's atmosphere is about 6 mbar — under one percent of Earth's — so this
 * is deliberately faint and narrow. A thick blue halo would be a different
 * planet.
 */
function AtmosphereShell() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color('#d9a071') } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
            float a = pow(rim, 3.4) * 0.75;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    [],
  )
  return (
    <mesh scale={GLOBE_R * 1.035}>
      <sphereGeometry args={[1, 48, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

/** A deterministic star field. Deep space, so no twinkle and no colour cast. */
function Stars() {
  const geometry = useMemo(() => {
    const count = 1800
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    let seed = 1337
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < count; i++) {
      // uniform on a sphere
      const u = rand() * 2 - 1
      const t = rand() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const d = 60 + rand() * 20
      positions[i * 3] = r * Math.cos(t) * d
      positions[i * 3 + 1] = u * d
      positions[i * 3 + 2] = r * Math.sin(t) * d
      sizes[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    return geo
  }, [])

  const sprite = useMemo(() => softGlow(), [])

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={sprite} size={0.42} color="#cfd8e6" transparent opacity={0.85}
        sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ===========================================================================
//  SITE MARKERS
// ===========================================================================

/**
 * Where a site's pin sits in globe-local space.
 *
 * It uses the same height field as the mesh, so the pin stands on the terrain
 * rather than hovering over or sinking into it.
 */
function siteAnchor(site: LandingSite): THREE.Vector3 {
  const dir = lonLatToVec(site.lat, site.lon)
  const elevKm = marsElevationVec(dir)
  const scale = GLOBE_R * (1 + (elevKm / MARS_RADIUS_KM) * RELIEF_EXAGGERATION)
  return new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(scale)
}

function SiteMarker({
  site, selected, dimmed, onSelect,
}: {
  site: LandingSite
  selected: boolean
  dimmed: boolean
  onSelect: (id: string) => void
}) {
  const anchor = useMemo(() => siteAnchor(site), [site])
  const normal = useMemo(() => anchor.clone().normalize(), [anchor])
  const ring = useRef<THREE.Mesh>(null)
  const pulse = useRef<THREE.Mesh>(null)

  // Orient the pin so it stands up out of the surface.
  const quat = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
    return q
  }, [normal])

  useFrame((state) => {
    if (!selected) return
    const t = state.clock.elapsedTime
    if (pulse.current) {
      const k = (t % 1.6) / 1.6
      pulse.current.scale.setScalar(0.06 + k * 0.16)
      const m = pulse.current.material as THREE.MeshBasicMaterial
      m.opacity = (1 - k) * 0.55
    }
    if (ring.current) ring.current.rotation.z = t * 0.6
  })

  const color = selected ? '#ffd166' : '#8fd3ff'
  const opacity = dimmed ? 0.3 : 1

  return (
    <group position={anchor} quaternion={quat}>
      {/* generous invisible hit target — the visible pin is only a few pixels */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(site.id) }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = '' }}
      >
        <sphereGeometry args={[0.075, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* the stem */}
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.09, 6]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>

      {/* the head */}
      <mesh position={[0, 0.095, 0]}>
        <sphereGeometry args={[selected ? 0.022 : 0.015, 12, 10]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>

      {/* footprint ring on the ground */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0.028, 0.038, 24]} />
        <meshBasicMaterial
          color={color} transparent opacity={opacity * (selected ? 0.95 : 0.5)}
          side={THREE.DoubleSide} depthWrite={false} toneMapped={false}
        />
      </mesh>

      {selected && (
        <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <ringGeometry args={[0.7, 1, 28]} />
          <meshBasicMaterial
            color={color} transparent opacity={0.5} side={THREE.DoubleSide}
            depthWrite={false} toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}

// ===========================================================================
//  ORIENTATION
// ===========================================================================

/**
 * Globe rotation that brings a given site to face the camera.
 *
 * The globe group is rotated X-then-Y (three.js 'XYZ' order with z = 0), so
 * solving for a direction v to land on +Z is exact rather than iterative:
 *   yaw   turns v into the YZ plane
 *   pitch lifts it onto the +Z axis
 */
function orientationFor(lat: number, lon: number): { pitch: number; yaw: number } {
  const [vx, vy, vz] = lonLatToVec(lat, lon)
  const yaw = Math.atan2(-vx, vz)
  const pitch = Math.atan2(vy, Math.hypot(vx, vz))
  return { pitch, yaw }
}

/** Unwraps `to` to the revolution nearest `from`, so the globe never spins the long way. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return from + d
}

export interface DescentState {
  /** 0 while in orbit, ramping to 1 at touchdown. */
  progress: number
}

/**
 * The rotating planet, its markers, and the descent camera move.
 *
 * Drag state is read from refs owned by the parent so the pointer handlers can
 * live on the DOM element rather than on a mesh — dragging has to work when
 * the pointer is over empty space, not only over the planet.
 */
function Planet({
  selectedId, onSelect, descending, onArrived, dragRef, spinRef,
}: {
  selectedId: string
  onSelect: (id: string) => void
  descending: boolean
  onArrived: () => void
  dragRef: React.MutableRefObject<{ dx: number; dy: number; active: boolean }>
  spinRef: React.MutableRefObject<boolean>
}) {
  const geometry = usePlanetGeometry()
  const group = useRef<THREE.Group>(null)
  const { camera } = useThree()

  const pitch = useRef(0.25)
  const yaw = useRef(0.6)
  const camDist = useRef(6.2)
  const descent = useRef(0)
  const fired = useRef(false)

  // Reset the descent whenever the player comes back to orbit.
  useEffect(() => {
    if (!descending) { descent.current = 0; fired.current = false }
  }, [descending])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const site = LANDING_SITES.find((s) => s.id === selectedId)

    if (descending && site) {
      // ---- committed: swing the site under the camera and fall towards it
      descent.current = Math.min(descent.current + dt / 4.2, 1)
      const p = descent.current
      // ease-in: slow swing, then an accelerating drop
      const ease = p * p * (3 - 2 * p)

      const target = orientationFor(site.lat, site.lon)
      const ty = shortestAngle(yaw.current, target.yaw)
      yaw.current += (ty - yaw.current) * Math.min(dt * 2.2, 1)
      pitch.current += (target.pitch - pitch.current) * Math.min(dt * 2.2, 1)

      // 6.2 units out to just above the surface
      camDist.current = 6.2 - (6.2 - GLOBE_R * 1.012) * Math.pow(ease, 2.1)

      if (p >= 1 && !fired.current) { fired.current = true; onArrived() }
    } else {
      // ---- in orbit: drag to turn, idle spin when untouched
      const drag = dragRef.current
      if (drag.dx !== 0 || drag.dy !== 0) {
        yaw.current += drag.dx * 0.005
        pitch.current = Math.min(Math.max(pitch.current + drag.dy * 0.005, -1.35), 1.35)
        drag.dx = 0
        drag.dy = 0
      } else if (spinRef.current && !drag.active) {
        // One revolution in about two and a half minutes — enough to show the
        // far side without making a site hard to click.
        yaw.current += dt * 0.042
      }
      camDist.current += (6.2 - camDist.current) * Math.min(dt * 2, 1)
    }

    if (group.current) group.current.rotation.set(pitch.current, yaw.current, 0)
    camera.position.set(0, 0, camDist.current)
    camera.lookAt(0, 0, 0)
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} castShadow={false}>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0.0} />
      </mesh>
      <AtmosphereShell />
      {LANDING_SITES.map((s) => (
        <SiteMarker
          key={s.id}
          site={s}
          selected={s.id === selectedId}
          dimmed={descending && s.id !== selectedId}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

// ===========================================================================
//  SCENE
// ===========================================================================

export function GlobeScene({
  selectedId, onSelect, descending, onArrived,
}: {
  selectedId: string
  onSelect: (id: string) => void
  descending: boolean
  onArrived: () => void
}) {
  const dragRef = useRef({ dx: 0, dy: 0, active: false })
  const spinRef = useRef(true)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Stop the idle spin once the player has taken hold of the globe: an
  // auto-rotating map that keeps drifting under the cursor is infuriating.
  const onDown = (e: React.PointerEvent) => {
    last.current = { x: e.clientX, y: e.clientY }
    dragRef.current.active = true
    spinRef.current = false
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!last.current || !dragRef.current.active) return
    dragRef.current.dx += e.clientX - last.current.x
    dragRef.current.dy += e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: React.PointerEvent) => {
    last.current = null
    dragRef.current.active = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 42, near: 0.05, far: 200, position: [0, 0, 6.2] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      style={{ touchAction: 'none', cursor: descending ? 'default' : 'grab' }}
    >
      <color attach="background" args={['#05060a']} />

      {/* The sun, placed so the terminator falls across the visible disc —
          a fully lit globe looks like a texture swatch, not a world. */}
      <directionalLight position={[6, 2.4, 4.5]} intensity={3.1} color="#fff4e2" />
      {/* Faint fill so the night side is a silhouette rather than a void. */}
      <ambientLight intensity={0.12} color="#6c7bb0" />

      <Stars />
      <Planet
        selectedId={selectedId}
        onSelect={onSelect}
        descending={descending}
        onArrived={onArrived}
        dragRef={dragRef}
        spinRef={spinRef}
      />
    </Canvas>
  )
}
