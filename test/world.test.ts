import { terrainHeight, terrainNormal } from '../src/world/noise'
import { STRUCTURES } from '../src/data/structures'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

// 1. every structure pad must be flat, or the buildings float / sink
for (const s of STRUCTURES) {
  const [x, , z] = s.pos
  const centre = terrainHeight(x, z)
  let maxDelta = 0
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2
    const px = x + Math.cos(ang) * s.radius * 0.8
    const pz = z + Math.sin(ang) * s.radius * 0.8
    maxDelta = Math.max(maxDelta, Math.abs(terrainHeight(px, pz) - centre))
  }
  check(`pad flat under ${s.id}`, maxDelta < 0.35, `max delta ${maxDelta.toFixed(3)} m`)
}

// 2. terrain must be finite and bounded everywhere inside the playfield
let bad = 0
let lo = Infinity
let hi = -Infinity
for (let i = 0; i < 20000; i++) {
  const x = (Math.random() - 0.5) * 210
  const z = (Math.random() - 0.5) * 210
  const h = terrainHeight(x, z)
  if (!Number.isFinite(h) || Math.abs(h) > 60) bad++
  lo = Math.min(lo, h); hi = Math.max(hi, h)
}
check('terrain finite and bounded', bad === 0, `${bad} bad, range ${lo.toFixed(1)}..${hi.toFixed(1)} m`)

// 3. terrain must be deterministic (same input = same height, every call)
let drift = 0
for (let i = 0; i < 500; i++) {
  const x = i * 0.37 - 40
  const z = i * -0.21 + 15
  drift = Math.max(drift, Math.abs(terrainHeight(x, z) - terrainHeight(x, z)))
}
check('terrain deterministic', drift === 0)

// 4. normals must be unit length and point up
let nbad = 0
for (let i = 0; i < 3000; i++) {
  const x = (Math.random() - 0.5) * 180
  const z = (Math.random() - 0.5) * 180
  const n = terrainNormal(x, z)
  const len = Math.hypot(n[0], n[1], n[2])
  if (Math.abs(len - 1) > 1e-6 || n[1] <= 0) nbad++
}
check('normals unit length, upward', nbad === 0, `${nbad} bad`)

// 5. no structure should be walled off: path home must not cross a cliff
let steep = 0
for (const s of STRUCTURES) {
  const steps = 60
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = s.pos[0] * t, z = s.pos[2] * t
    const px = s.pos[0] * ((i - 1) / steps), pz = s.pos[2] * ((i - 1) / steps)
    const run = Math.hypot(x - px, z - pz)
    const rise = Math.abs(terrainHeight(x, z) - terrainHeight(px, pz))
    if (run > 0 && rise / run > 1.2) steep++
  }
}
check('walkable route from habitat to every structure', steep === 0, `${steep} steep segments`)

console.log(fails === 0 ? '\nALL WORLD CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
