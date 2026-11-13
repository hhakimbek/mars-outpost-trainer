import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, Noise, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { Terrain, Rocks, DistantRidges } from './Terrain'
import { Structures } from './Structures'
import { Astronaut } from './Astronaut'
import { useGame } from '../store/useGame'
import { terrainHeight } from './noise'
import { softGlow } from './textures'

// One direction vector, shared by the sky shader, the directional light and
// the sun disc, so the glow, the disc and the shadows can never disagree.
//
// Elevation is about 33 degrees — mid-morning. An earlier version put it at
// 17 degrees for dramatic raking shadows, but flat ground then receives only
// sin(17 deg) = 0.29 of the sunlight while every tilted rock face receives far
// more, so the regolith went near-black while the boulders glowed. 33 degrees
// keeps long directional shadows and still lights the ground the player
// spends the whole mission looking at.
const SUN_DIR = new THREE.Vector3(42, 32, -26).normalize()

// ===========================================================================
//  SKY
// ===========================================================================

/**
 * Martian sky.
 *
 * On Mars the butterscotch colour comes from suspended dust forward-scattering
 * sunlight (Mie), not from Rayleigh scattering off air molecules, so the
 * gradient is warm and bright at the horizon and only slightly cooler and
 * duller at the zenith — the opposite emphasis to an Earth sky. The sun itself
 * sits in a blue-grey halo, which is why Mars sunsets photograph blue.
 */
function Sky({ storm }: { storm: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color('#e0a86e') },
          uMid: { value: new THREE.Color('#c08457') },
          uZenith: { value: new THREE.Color('#6d5a61') },
          uSunHalo: { value: new THREE.Color('#9fb6d4') },
          uSunDir: { value: SUN_DIR.clone() },
          uStorm: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uHorizon;
          uniform vec3 uMid;
          uniform vec3 uZenith;
          uniform vec3 uSunHalo;
          uniform vec3 uSunDir;
          uniform float uStorm;
          uniform float uTime;
          varying vec3 vWorld;

          // cheap hash-based banding breakup, so the gradient has no visible steps
          float dither(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          void main() {
            vec3 dir = normalize(vWorld);
            float h = clamp(dir.y * 1.25 + 0.06, 0.0, 1.0);

            // three-stop vertical gradient
            vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.34, h));
            sky = mix(sky, uZenith, smoothstep(0.3, 1.0, pow(h, 0.78)));

            // Mie forward scattering: a broad bright lobe around the sun, with
            // a cool core. This is the detail that makes the sky read as Mars.
            float cosSun = max(dot(dir, normalize(uSunDir)), 0.0);
            float broad = pow(cosSun, 6.0);
            float tight = pow(cosSun, 90.0);
            sky += uHorizon * broad * 0.5;
            sky = mix(sky, uSunHalo, tight * 0.55);

            // anti-sun brightening, faint but it keeps the far sky from going flat
            float anti = pow(max(-dot(dir, normalize(uSunDir)), 0.0), 8.0);
            sky += uMid * anti * 0.08;

            // During a storm the whole dome collapses towards one murky value
            // and loses its gradient — visibility is the hazard, so it has to
            // be visible.
            vec3 stormColor = vec3(0.46, 0.26, 0.15);
            float churn = sin(dir.x * 7.0 + uTime * 0.25) * sin(dir.z * 6.0 - uTime * 0.19) * 0.035;
            sky = mix(sky, stormColor + churn, uStorm * 0.82);

            sky += (dither(dir.xz * 512.0) - 0.5) * 0.008;
            gl_FragColor = vec4(sky, 1.0);
          }
        `,
      }),
    [],
  )

  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt
    const u = material.uniforms.uStorm
    u.value += ((storm ? 1 : 0) - u.value) * Math.min(dt * 0.4, 1)
  })

  return (
    <mesh scale={420} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 20]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

/**
 * The sun disc and its glow.
 *
 * From Mars the Sun is about 0.35 degrees across — roughly two thirds the size
 * it looks from Earth — so the disc is deliberately small and the glow does
 * the work of selling the brightness.
 */
function SunDisc({ storm }: { storm: boolean }) {
  const group = useRef<THREE.Group>(null)
  const glow = useMemo(() => softGlow(), [])
  const dist = 360
  const pos = useMemo(() => SUN_DIR.clone().multiplyScalar(dist), [])

  // Keep the billboard facing the camera without a full lookAt per child.
  const { camera } = useThree()
  useFrame(() => {
    if (group.current) group.current.lookAt(camera.position)
  })

  return (
    <group position={pos} ref={group}>
      {/* outer haze */}
      <mesh>
        <planeGeometry args={[150, 150]} />
        <meshBasicMaterial
          map={glow} color="#ffd9a4" transparent
          opacity={storm ? 0.3 : 0.5}
          blending={THREE.AdditiveBlending} depthWrite={false} fog={false}
        />
      </mesh>
      {/* inner glow */}
      <mesh position={[0, 0, 1]}>
        <planeGeometry args={[52, 52]} />
        <meshBasicMaterial
          map={glow} color="#fff2d8" transparent
          opacity={storm ? 0.35 : 0.85}
          blending={THREE.AdditiveBlending} depthWrite={false} fog={false}
        />
      </mesh>
      {/* the disc */}
      <mesh position={[0, 0, 2]}>
        <circleGeometry args={[storm ? 7 : 5.4, 28]} />
        <meshBasicMaterial
          color={storm ? '#e0a46a' : '#fffaf0'}
          transparent opacity={storm ? 0.55 : 1}
          toneMapped={false} depthWrite={false} fog={false}
        />
      </mesh>
    </group>
  )
}

// ===========================================================================
//  ATMOSPHERE
// ===========================================================================

/**
 * Fog, driven from the store rather than set once at creation.
 *
 * Aerial perspective is the strongest depth cue available here, and the storm
 * has to be able to close visibility down over a few seconds — so the colour
 * and density are animated instead of being fixed in onCreated.
 */
function Atmosphere({ storm }: { storm: boolean }) {
  const { scene } = useThree()
  const clear = useMemo(() => new THREE.Color('#b8825a'), [])
  const murk = useMemo(() => new THREE.Color('#7a4426'), [])

  useEffect(() => {
    if (!(scene.fog instanceof THREE.FogExp2)) {
      scene.fog = new THREE.FogExp2(clear.getHex(), 0.0082)
    }
  }, [scene, clear])

  useFrame((_, dt) => {
    const fog = scene.fog as THREE.FogExp2 | null
    if (!fog) return
    const k = Math.min(dt * 0.5, 1)
    fog.color.lerp(storm ? murk : clear, k)
    const target = storm ? 0.03 : 0.0082
    fog.density += (target - fog.density) * k
  })

  return null
}

/** Drifting dust motes. Cheap, additive, and they sell the atmosphere. */
function Dust({ storm }: { storm: boolean }) {
  const points = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.PointsMaterial>(null)

  const geometry = useMemo(() => {
    const count = 1400
    const positions = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 170
      // Biased towards the ground: the suspended load is thickest in the first
      // few metres, which is also where the player can see it move.
      positions[i * 3 + 1] = Math.pow(rand(), 1.8) * 30
      positions[i * 3 + 2] = (rand() - 0.5) * 170
      scales[i] = 0.4 + rand() * 1.2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    return geo
  }, [])

  const sprite = useMemo(() => softGlow(), [])

  // Animated opacity/size, so the storm ramps in rather than popping.
  useFrame((state, dt) => {
    if (!points.current) return
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute
    const drift = storm ? 19 : 2.6
    const t = state.clock.elapsedTime
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i) + drift * dt
      if (x > 85) x = -85
      attr.setX(i, x)
      // gentle vertical sway; storms lift the load
      attr.setY(i, attr.getY(i) + Math.sin(t * 0.6 + i) * dt * (storm ? 0.5 : 0.12))
    }
    attr.needsUpdate = true

    const m = matRef.current
    if (m) {
      const k = Math.min(dt * 0.6, 1)
      m.opacity += ((storm ? 0.7 : 0.34) - m.opacity) * k
      m.size += ((storm ? 0.34 : 0.15) - m.size) * k
    }
  })

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={matRef}
        map={sprite}
        size={0.15}
        color="#dcab7c"
        transparent
        opacity={0.34}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ===========================================================================
//  GROUND DETAIL
// ===========================================================================

/**
 * Worn paths between structures, plus boot prints along them.
 *
 * Human traffic is the cheapest possible way to make a site look inhabited,
 * and it doubles as navigation: the player can follow a track home.
 */
function Paths() {
  const { patches, prints } = useMemo(() => {
    const patches: { p: [number, number, number]; r: number; rot: number }[] = []
    const prints: { p: [number, number, number]; rot: number }[] = []
    const targets: [number, number][] = [
      [-16, -9], [15, -10], [10, 12], [-10, 12], [-19, 4], [21, 6], [-28, 20],
    ]
    for (const [tx, tz] of targets) {
      const length = Math.hypot(tx, tz)
      const heading = Math.atan2(tx, tz)
      const steps = Math.max(8, Math.round(length * 1.1))
      for (let i = 2; i < steps; i++) {
        const t = i / steps
        const x = tx * t
        const z = tz * t
        patches.push({
          p: [x, terrainHeight(x, z) + 0.02, z],
          r: 0.5 + ((i * 37) % 7) * 0.05,
          rot: (i * 1.7) % Math.PI,
        })
        if (i % 2 === 0) {
          // alternate left/right of the centre line, like a real gait
          const side = i % 4 === 0 ? 0.22 : -0.22
          const px = x + Math.cos(heading) * side
          const pz = z - Math.sin(heading) * side
          prints.push({ p: [px, terrainHeight(px, pz) + 0.035, pz], rot: heading })
        }
      }
    }
    return { patches, prints }
  }, [])

  return (
    <group>
      {patches.map((m, i) => (
        <mesh key={`p${i}`} position={m.p} rotation={[-Math.PI / 2, 0, m.rot]}>
          <circleGeometry args={[m.r, 8]} />
          <meshStandardMaterial color="#d2ad86" roughness={1} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
      {prints.map((m, i) => (
        <mesh key={`b${i}`} position={m.p} rotation={[-Math.PI / 2, 0, -m.rot]}>
          <planeGeometry args={[0.16, 0.3]} />
          <meshStandardMaterial color="#6b3a20" roughness={1} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * A few pieces of mission hardware lying about: cargo pallets and a flag.
 * Nothing interactive — they exist so the eye has something to land on
 * between the big structures.
 */
function SiteProps() {
  const crates = useMemo(() => {
    const list: { p: [number, number, number]; rot: number; s: [number, number, number] }[] = []
    const spots: [number, number][] = [
      [6.5, -7.2], [7.6, -6.1], [-7.4, -4.8], [12.5, 3.4], [-13.6, -2.2],
    ]
    spots.forEach(([x, z], i) => {
      const h = 0.5 + (i % 3) * 0.12
      list.push({
        p: [x, terrainHeight(x, z) + h / 2, z],
        rot: i * 0.9,
        s: [1.1, h, 0.85],
      })
    })
    return list
  }, [])

  const flagPos = useMemo<[number, number, number]>(() => [3.2, terrainHeight(3.2, -6.4), -6.4], [])
  const cloth = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    // Mars air is thin (about 6 mbar), so a flag barely moves: a slow, shallow
    // flutter is the honest choice, not an Earth-style snap.
    if (cloth.current) {
      cloth.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.06
    }
  })

  return (
    <group>
      {crates.map((c, i) => (
        <group key={i} position={c.p} rotation={[0, c.rot, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={c.s} />
            <meshStandardMaterial color="#8a9099" roughness={0.6} metalness={0.3} />
          </mesh>
          {/* lid seam */}
          <mesh position={[0, c.s[1] / 2 + 0.01, 0]}>
            <boxGeometry args={[c.s[0] * 1.02, 0.03, c.s[2] * 1.02]} />
            <meshStandardMaterial color="#5c636d" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* strap */}
          <mesh position={[0, 0, c.s[2] / 2 + 0.005]}>
            <boxGeometry args={[0.1, c.s[1] * 0.98, 0.01]} />
            <meshStandardMaterial color="#d97706" roughness={0.8} />
          </mesh>
        </group>
      ))}

      <group position={flagPos}>
        <mesh castShadow position={[0, 1.3, 0]}>
          <cylinderGeometry args={[0.035, 0.045, 2.6, 8]} />
          <meshStandardMaterial color="#c3c9d1" metalness={0.7} roughness={0.33} />
        </mesh>
        <mesh ref={cloth} castShadow position={[0.46, 2.26, 0]}>
          <planeGeometry args={[0.9, 0.56, 6, 3]} />
          <meshStandardMaterial color="#c0392b" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        {/* base plate */}
        <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.4, 12]} />
          <meshStandardMaterial color="#8a9099" roughness={0.7} metalness={0.3} />
        </mesh>
      </group>
    </group>
  )
}

// ===========================================================================
//  LIGHTING
// ===========================================================================

function Lighting({ storm, spe }: { storm: boolean; spe: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const bounce = useRef<THREE.DirectionalLight>(null)

  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(60), [])
  const clearSun = useMemo(() => new THREE.Color('#ffd49a'), [])
  const stormSun = useMemo(() => new THREE.Color('#c97a4a'), [])
  const clearSky = useMemo(() => new THREE.Color('#c08a66'), [])
  const stormSky = useMemo(() => new THREE.Color('#8a5230'), [])

  // Everything is interpolated so a storm rolling in dims the site over a few
  // seconds instead of switching it like a light bulb.
  useFrame((_, dt) => {
    const k = Math.min(dt * 0.5, 1)
    if (sun.current) {
      sun.current.intensity += ((storm ? 0.65 : 3.3) - sun.current.intensity) * k
      sun.current.color.lerp(storm ? stormSun : clearSun, k)
    }
    if (hemi.current) {
      // A storm scatters light from everywhere, so the diffuse term goes *up*
      // even as the direct sun collapses. That is why storm light is flat.
      hemi.current.intensity += ((storm ? 1.3 : 0.85) - hemi.current.intensity) * k
      hemi.current.color.lerp(storm ? stormSky : clearSky, k)
    }
    if (fill.current) fill.current.intensity += ((storm ? 0.1 : 0.26) - fill.current.intensity) * k
    if (bounce.current) bounce.current.intensity += ((storm ? 0.2 : 0.5) - bounce.current.intensity) * k
  })

  return (
    <>
      {/* sky/ground hemisphere: warm dusty sky over rust-red bounce */}
      <hemisphereLight ref={hemi} args={['#c99475', '#7a4526', 0.85]} />

      {/* the sun — one dominant low-angle source, which is what gives the
          outpost its long raking shadows and readable silhouettes */}
      <directionalLight
        ref={sun}
        position={sunPos}
        intensity={3.3}
        color="#ffd49a"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />

      {/* cool sky fill from the opposite side, so shadows are tinted, not dead */}
      <directionalLight ref={fill} position={[-34, 14, 32]} intensity={0.26} color="#8aa6c8" />

      {/* warm bounce off the regolith, aimed upward — fake GI, cheap and it
          stops the undersides of the habitat from reading as black holes */}
      <directionalLight ref={bounce} position={[8, -16, 10]} intensity={0.5} color="#c4714a" />

      {/* a solar particle event washes the sky with a faint violet aurora */}
      {spe && <ambientLight intensity={0.2} color="#c084fc" />}
    </>
  )
}

// ===========================================================================
//  POST PROCESSING
// ===========================================================================

/**
 * The grade.
 *
 * Bloom on the emissive strips and the sun, a vignette to keep the eye centred,
 * and a little grain so flat regolith does not band. SMAA replaces the
 * hardware MSAA that the composer bypasses.
 */
function Post() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* The composer takes tone mapping away from the renderer — it sets
          gl.toneMapping to None so it can grade once, at the end of the chain.
          Without this pass the whole image stays ungraded and washed out, which
          is not obvious because nothing errors. Bloom runs before it so it
          blooms on linear values, not on already-compressed ones. */}
      <Bloom
        intensity={0.55}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.3}
        mipmapBlur
        radius={0.7}
      />
      <Vignette offset={0.32} darkness={0.4} eskil={false} blendFunction={BlendFunction.NORMAL} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply opacity={0.035} blendFunction={BlendFunction.OVERLAY} />
      <SMAA />
    </EffectComposer>
  )
}

// ===========================================================================
//  SCENE
// ===========================================================================

/**
 * Dev-only introspection hook. Exposes the r3f state on window so the scene
 * can be measured from outside (draw calls, light intensities, camera) when
 * something renders wrong. Stripped from production builds.
 */
function DevProbe() {
  const state = useThree()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __mot?: unknown }).__mot = state
  }, [state])
  return null
}

export function Scene() {
  const storm = useGame((s) => s.state.env.dustStorm)
  const spe = useGame((s) => s.state.env.spe)

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 68, near: 0.1, far: 700, position: [0, 5, 20] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        // Tone mapping is applied by the composer's ToneMapping pass, which
        // ignores gl.toneMappingExposure — overall brightness is set by the
        // light intensities above, not here.
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
    >
      <DevProbe />
      <Atmosphere storm={storm} />
      <Sky storm={storm} />
      <SunDisc storm={storm} />
      <Lighting storm={storm} spe={spe} />
      <DistantRidges />
      <Terrain />
      <Rocks />
      <Paths />
      <SiteProps />
      <Structures />
      <Astronaut />
      <Dust storm={storm} />
      <Post />
    </Canvas>
  )
}
