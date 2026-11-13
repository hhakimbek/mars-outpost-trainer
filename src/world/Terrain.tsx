import { useMemo } from 'react'
import * as THREE from 'three'
import { terrainHeight, fbm, ridged } from './noise'
import { STRUCTURES } from '../data/structures'
import { regolithDetail, regolithRough, regolithNormal, rockNormal } from './textures'

const SIZE = 210
const SEGMENTS = 220

/**
 * The crater floor.
 *
 * Colour is baked into vertex colours and driven by three things: height,
 * slope, and a mottling field. Slope matters most — steep faces expose darker
 * rock while flat ground collects bright dust, and that single relationship is
 * what stops procedural terrain reading as a painted blanket.
 */
export function Terrain() {
  const colorMap = useMemo(() => regolithDetail(), [])
  const roughMap = useMemo(() => regolithRough(), [])

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)

    // Mars regolith has a bolometric albedo around 0.25 and photographs as a
    // mid orange-brown, not the near-black maroon a naive "rust" palette
    // gives. These are deliberately lighter than they look in isolation: the
    // dust-scattered sky light and the fog both sit well above them, and a
    // ground darker than its own atmosphere reads as a hole.
    //
    // They are also far less saturated than "Mars red" suggests. True-colour
    // surface images are butterscotch-brown, not fire-engine red, and ACES
    // tone mapping darkens saturated reds hard — a vivid rust albedo comes out
    // of the grade as near-black maroon.
    const shadowRock = new THREE.Color('#6e4229')
    const darkRust = new THREE.Color('#9c6039')
    const midRust = new THREE.Color('#ba7d50')
    const brightDust = new THREE.Color('#d09a6d')
    const paleDust = new THREE.Color('#ddb48f')
    const tmp = new THREE.Color()
    const rock = new THREE.Color()

    // pass 1: displace
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)))
    }

    // pass 2: colour, using the displaced heights to measure slope
    const eps = SIZE / SEGMENTS
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = pos.getY(i)

      // slope from finite differences
      const dx = terrainHeight(x + eps, z) - terrainHeight(x - eps, z)
      const dz = terrainHeight(x, z + eps) - terrainHeight(x, z - eps)
      const slope = Math.min(Math.hypot(dx, dz) / (eps * 2.2), 1)

      const mottle = fbm(x * 0.33, z * 0.33, 31, 3) * 0.5 + 0.5
      const patch = fbm(x * 0.055, z * 0.055, 67, 2) * 0.5 + 0.5
      const vein = ridged(x * 0.09, z * 0.09, 103, 2)

      // Base: height ramp from the crater floor up to pale dust on the rim.
      // The floor is offset into the middle of the ramp rather than sitting at
      // its dark end — the outpost sits at h = 0, and that is the ground the
      // player sees for the whole mission, so it must not be the darkest
      // value in the palette.
      const t = Math.min(Math.max((h + 5.5) / 16, 0), 1)
      tmp.copy(darkRust).lerp(midRust, Math.min(t * 2.0, 1))
      if (t > 0.42) tmp.lerp(brightDust, (t - 0.42) / 0.58)
      if (t > 0.8) tmp.lerp(paleDust, (t - 0.8) / 0.2)

      // flat ground collects dust, steep faces expose rock
      rock.copy(shadowRock).lerp(midRust, 0.42 + vein * 0.3)
      // Slope darkening is kept gentle. At 0.82 even the shallow undulations
      // of the apron went to exposed-rock colour, which put a dark band right
      // where the player walks.
      tmp.lerp(rock, Math.pow(slope, 1.5) * 0.55)

      // large-scale patchiness and fine grain
      tmp.offsetHSL(0, (patch - 0.5) * 0.045, (patch - 0.5) * 0.07 + (mottle - 0.5) * 0.055)

      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  // The mesh is 210 m across with ~1 m quads, far too coarse to carry the
  // relief of the surface itself. The normal map supplies everything below
  // that scale; without it the ground shades like a sheet of vinyl.
  const normalMap = useMemo(() => regolithNormal(), [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        map={colorMap}
        roughnessMap={roughMap}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(1.15, 1.15)}
        roughness={0.97}
        metalness={0.02}
        envMapIntensity={0.25}
        dithering
      />
    </mesh>
  )
}

/**
 * Distant mesas beyond the crater rim.
 *
 * Desaturated and lightened to fake aerial perspective, so the eye reads them
 * as kilometres away rather than as more of the same terrain.
 */
export function DistantRidges() {
  const geometry = useMemo(() => {
    const ringRadius = 230
    const segments = 120
    const positions: number[] = []
    const colors: number[] = []

    const near = new THREE.Color('#8a4a2c')
    const far = new THREE.Color('#9a6a52')
    const tmp = new THREE.Color()

    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2
      const a1 = ((i + 1) / segments) * Math.PI * 2

      for (const [layer, radius, scale, lift] of [
        [0, ringRadius, 1.0, 0],
        [1, ringRadius + 90, 1.7, 8],
      ] as const) {
        const h0 = 16 + (fbm(Math.cos(a0) * 5 + layer * 11, Math.sin(a0) * 5, 21, 3) * 0.5 + 0.5) * 34 * scale
        const h1 = 16 + (fbm(Math.cos(a1) * 5 + layer * 11, Math.sin(a1) * 5, 21, 3) * 0.5 + 0.5) * 34 * scale

        const x0 = Math.cos(a0) * radius
        const z0 = Math.sin(a0) * radius
        const x1 = Math.cos(a1) * radius
        const z1 = Math.sin(a1) * radius

        positions.push(x0, lift, z0, x1, lift, z1, x1, h1 + lift, z1)
        positions.push(x0, lift, z0, x1, h1 + lift, z1, x0, h0 + lift, z0)

        tmp.copy(layer === 0 ? near : far)
        for (let v = 0; v < 6; v++) colors.push(tmp.r, tmp.g, tmp.b)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors fog side={THREE.DoubleSide} />
    </mesh>
  )
}

/**
 * An irregular rock.
 *
 * A bare icosahedron reads as a craft-shop solid, which is exactly the "simple
 * shapes" look to avoid. Pushing every vertex along its own normal by a couple
 * of octaves of noise turns it into something with lumps, facets and a
 * flattened base that beds into the regolith instead of balancing on a point.
 */
function rockGeometry(seed: number, detail: number, rough: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    const lumps = fbm(n.x * 2.2 + seed, n.z * 2.2 - seed, seed, 3)
    const facets = fbm(n.y * 4.6 - seed, n.x * 4.6 + seed, seed * 3 + 11, 2)
    v.setLength(Math.max(0.4, 1 + lumps * rough + facets * rough * 0.45))

    // flatten the underside so the rock sits, rather than floats
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.3
    pos.setXYZ(i, v.x, v.y, v.z)
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

interface Scatter {
  matrices: THREE.Matrix4[]
  colors: Float32Array
}

/**
 * Place rocks on the terrain.
 *
 * Every instance also gets its own tint. Uniformly coloured instances are the
 * other half of the toy look — real rock fields vary from dark basalt to
 * dust-coated tan, and that variation is what makes a field read as thousands
 * of individual stones rather than one stamped shape.
 */
function buildScatter(
  count: number,
  minR: number,
  maxR: number,
  scaleFn: (r: () => number) => number,
  seedStart: number,
  sink: number,
  base: THREE.Color,
  spread: number,
): Scatter {
  const matrices: THREE.Matrix4[] = []
  const colorList: number[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const sc = new THREE.Vector3()
  const col = new THREE.Color()

  let seed = seedStart
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2
    const dist = minR + rand() * (maxR - minR)
    const x = Math.cos(angle) * dist
    const z = Math.sin(angle) * dist
    if (Math.hypot(x, z) < minR) continue

    // Never drop a rock inside a building. The scatter ring starts outside
    // the habitat, but the outlying structures sit well within it, so without
    // this a boulder can end up growing through the greenhouse glazing.
    let blocked = false
    for (const st of STRUCTURES) {
      if (Math.hypot(x - st.pos[0], z - st.pos[2]) < st.radius * 1.45) { blocked = true; break }
    }
    if (blocked) continue

    const scale = scaleFn(rand)

    // Bedded well into the ground. A rock resting exactly on the surface looks
    // dropped; a rock sunk a third of its height looks like it has been there
    // since the impact that made the crater.
    v.set(x, terrainHeight(x, z) - scale * sink, z)
    e.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7)
    q.setFromEuler(e)
    sc.set(
      scale * (0.75 + rand() * 0.6),
      scale * (0.5 + rand() * 0.65),
      scale * (0.75 + rand() * 0.6),
    )
    matrices.push(m.clone().compose(v, q, sc))

    // dust-coated rocks are lighter and less saturated than fresh faces
    const dusty = rand()
    col.copy(base)
    col.offsetHSL((rand() - 0.5) * 0.035, (dusty - 0.75) * 0.28, (dusty - 0.42) * spread)
    colorList.push(col.r, col.g, col.b)
  }

  return { matrices, colors: new Float32Array(colorList) }
}

function InstancedRocks({
  scatter, geometry, castShadow = true,
}: {
  scatter: Scatter
  geometry: THREE.BufferGeometry
  castShadow?: boolean
}) {
  const normalMap = useMemo(() => rockNormal(), [])
  if (scatter.matrices.length === 0) return null

  return (
    <instancedMesh
      castShadow={castShadow}
      receiveShadow
      args={[geometry, undefined, scatter.matrices.length]}
      ref={(mesh) => {
        if (!mesh) return
        scatter.matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat))
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor = new THREE.InstancedBufferAttribute(scatter.colors, 3)
        mesh.instanceColor.needsUpdate = true
      }}
    >
      <meshStandardMaterial
        roughness={0.95}
        metalness={0.04}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.8, 0.8)}
        flatShading
      />
    </instancedMesh>
  )
}

/**
 * THE OUTER TERRAIN — the coarse half of the level of detail.
 *
 * The detailed crater floor is a 210 m square at 220 segments, which is about
 * a metre per vertex. That was the whole world while the player walked, but
 * the rover drives to 150 m from the centre — past the edge of the mesh,
 * where the ground simply stopped existing and the sky showed underneath.
 *
 * The fix is the obvious one: a second, far coarser ring out to 400 m, built
 * from the same `terrainHeight` function so the two agree exactly where they
 * meet. It carries roughly a thirtieth of the vertex density, which is all a
 * surface read at a hundred metres and up can show.
 */
const FAR_INNER = 96
const FAR_OUTER = 400

export function FarTerrain() {
  const geometry = useMemo(() => {
    const rings = 46
    const segs = 108
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const low = new THREE.Color('#7e4526')
    const high = new THREE.Color('#a9774f')
    const tmp = new THREE.Color()

    for (let r = 0; r <= rings; r++) {
      // Rings get further apart as they go out: detail belongs where the
      // player is, and the far edge is three pixels tall.
      const t = r / rings
      const dist = FAR_INNER + (FAR_OUTER - FAR_INNER) * t * t
      for (let a = 0; a <= segs; a++) {
        const ang = (a / segs) * Math.PI * 2
        const x = Math.cos(ang) * dist
        const z = Math.sin(ang) * dist
        const y = terrainHeight(x, z)
        positions.push(x, y, z)
        // Distance haze is baked in rather than left to the fog alone, so the
        // ring reads as ground receding instead of a flat band.
        tmp.copy(low).lerp(high, Math.min(Math.max((y + 2) / 9, 0), 1) * 0.6 + t * 0.4)
        colors.push(tmp.r, tmp.g, tmp.b)
      }
    }

    const row = segs + 1
    for (let r = 0; r < rings; r++) {
      for (let a = 0; a < segs; a++) {
        const i0 = r * row + a
        const i1 = i0 + 1
        const i2 = i0 + row
        const i3 = i2 + 1
        indices.push(i0, i2, i1, i1, i2, i3)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow={false}>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

/**
 * Rock scatter at three scales: hand-sized gravel, mid boulders, and a few
 * large outcrops. Three separate instanced draws rather than one, so each can
 * use its own silhouette, tint and shadow budget.
 */
export function Rocks() {
  // Four distinct rock shapes, reused across thousands of instances. Rotation
  // and non-uniform scale do the rest of the work of hiding the repetition.
  const geoGravel = useMemo(() => rockGeometry(3, 1, 0.3), [])
  const geoBoulderA = useMemo(() => rockGeometry(11, 1, 0.34), [])
  const geoBoulderB = useMemo(() => rockGeometry(29, 2, 0.26), [])
  const geoOutcrop = useMemo(() => rockGeometry(47, 2, 0.3), [])

  const gravel = useMemo(
    () => buildScatter(1100, 7, 96, (r) => 0.1 + r() * r() * 0.28, 991, 0.4,
      new THREE.Color('#8a4a2a'), 0.1), [])
  const bouldersA = useMemo(
    () => buildScatter(320, 10, 96, (r) => 0.35 + r() * r() * 1.1, 1337, 0.3,
      new THREE.Color('#7b3d21'), 0.13), [])
  const bouldersB = useMemo(
    () => buildScatter(260, 12, 96, (r) => 0.4 + r() * r() * 1.3, 2024, 0.3,
      new THREE.Color('#6d3418'), 0.12), [])
  const outcrops = useMemo(
    () => buildScatter(55, 24, 93, (r) => 1.4 + r() * r() * 2.6, 4242, 0.34,
      new THREE.Color('#5c2d16'), 0.14), [])
  // The ground the rover drives over. Sparser than the near field — a third
  // of the density over three times the area — because it is seen at speed
  // and at distance, and because every instance out here is a shadow caster
  // nobody is looking at.
  const farBoulders = useMemo(
    () => buildScatter(340, 94, 152, (r) => 0.5 + r() * r() * 1.8, 5150, 0.3,
      new THREE.Color('#6d3418'), 0.12), [])
  const farOutcrops = useMemo(
    () => buildScatter(40, 96, 150, (r) => 1.6 + r() * r() * 3.0, 6161, 0.34,
      new THREE.Color('#5c2d16'), 0.14), [])

  return (
    <group>
      {/* gravel casts no shadow: at this size the shadow is invisible and it
          would double the shadow-map cost of the busiest draw */}
      <InstancedRocks scatter={gravel} geometry={geoGravel} castShadow={false} />
      <InstancedRocks scatter={bouldersA} geometry={geoBoulderA} />
      <InstancedRocks scatter={bouldersB} geometry={geoBoulderB} />
      <InstancedRocks scatter={outcrops} geometry={geoOutcrop} />
      {/* The far band shares the same four geometries — it is extra instances
          in the same draw family, not extra models. It casts no shadows: at
          this distance the shadow map has nothing to resolve and the cost is
          the same as for a boulder at arm's length. */}
      <InstancedRocks scatter={farBoulders} geometry={geoBoulderB} castShadow={false} />
      <InstancedRocks scatter={farOutcrops} geometry={geoOutcrop} castShadow={false} />
    </group>
  )
}
