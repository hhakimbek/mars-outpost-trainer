import * as THREE from 'three'
import { fbm, ridged } from './noise'

/**
 * Procedural textures, generated once into canvases.
 *
 * Shipping no image files keeps the download small and keeps the whole world
 * reproducible from code. These are deliberately small (256–512 px) and tiled:
 * what they provide is micro-detail that breaks up flat surfaces, not
 * photographic realism.
 */

const cache = new Map<string, THREE.Texture>()

function makeTexture(
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeat = 1,
): THREE.Texture {
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()

  draw(ctx, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

/** Fine regolith grain: tiles across the ground to kill the flat-plane look. */
export const regolithDetail = (): THREE.Texture =>
  makeTexture('regolith', 256, (ctx, s) => {
    const img = ctx.createImageData(s, s)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm(x * 0.09, y * 0.09, 3, 4) * 0.5 + 0.5
        const grain = fbm(x * 0.7, y * 0.7, 17, 2) * 0.5 + 0.5

        // A detail map multiplies the vertex colour, so it has to sit near
        // white and only modulate. Centred on mid grey it would halve the
        // albedo of the whole planet, which reads as a ground in permanent
        // shadow no matter how the scene is lit.
        const v = Math.min(255, Math.max(0, (0.78 + (n * 0.62 + grain * 0.38) * 0.3) * 255))
        const i = (y * s + x) * 4
        img.data[i] = v
        img.data[i + 1] = v * 0.975
        img.data[i + 2] = v * 0.95
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, 42)

/** Roughness variation for the ground, so specular is not uniform. */
export const regolithRough = (): THREE.Texture =>
  makeTexture('regolith-rough', 256, (ctx, s) => {
    const img = ctx.createImageData(s, s)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = ridged(x * 0.05, y * 0.05, 23, 3)
        const v = Math.min(255, Math.max(0, (0.86 + n * 0.14) * 255))
        const i = (y * s + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, 30)

/**
 * Normal map for the regolith.
 *
 * This is the single biggest thing separating "ground" from "a plastic plane":
 * the terrain mesh is far too coarse to carry metre-scale relief, so the
 * pebbles, ripples and scour marks have to live in the normals instead. Two
 * scales are summed — coarse clasts and fine grain — and the height field is
 * differentiated into a tangent-space normal.
 */
export const regolithNormal = (): THREE.Texture =>
  makeTexture('regolith-normal', 512, (ctx, s) => {
    const h = new Float32Array(s * s)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const coarse = fbm(x * 0.055, y * 0.055, 31, 4)
        const clasts = ridged(x * 0.16, y * 0.16, 67, 3) * 0.45
        const grain = fbm(x * 0.62, y * 0.62, 13, 2) * 0.18
        h[y * s + x] = coarse * 0.6 + clasts + grain
      }
    }

    const img = ctx.createImageData(s, s)
    // Strength is tuned for ground seen at a grazing angle; too high and the
    // surface shimmers, too low and it goes back to looking like vinyl.
    const strength = 2.6
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const l = h[y * s + ((x - 1 + s) % s)]
        const r = h[y * s + ((x + 1) % s)]
        const d = h[((y - 1 + s) % s) * s + x]
        const u = h[((y + 1) % s) * s + x]
        let nx = (l - r) * strength
        let ny = (d - u) * strength
        const nz = 1
        const len = Math.hypot(nx, ny, nz)
        nx /= len
        ny /= len
        const i = (y * s + x) * 4
        img.data[i] = (nx * 0.5 + 0.5) * 255
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255
        img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, 42)

/**
 * Normal map for rock faces, so boulders catch light with some bite instead of
 * reading as smooth shaded blobs.
 */
export const rockNormal = (): THREE.Texture =>
  makeTexture('rock-normal', 256, (ctx, s) => {
    const h = new Float32Array(s * s)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        h[y * s + x] = ridged(x * 0.09, y * 0.09, 5, 4) * 0.8 + fbm(x * 0.4, y * 0.4, 29, 2) * 0.25
      }
    }
    const img = ctx.createImageData(s, s)
    const strength = 2.2
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const l = h[y * s + ((x - 1 + s) % s)]
        const r = h[y * s + ((x + 1) % s)]
        const d = h[((y - 1 + s) % s) * s + x]
        const u = h[((y + 1) % s) * s + x]
        let nx = (l - r) * strength
        let ny = (d - u) * strength
        const len = Math.hypot(nx, ny, 1)
        nx /= len
        ny /= len
        const i = (y * s + x) * 4
        img.data[i] = (nx * 0.5 + 0.5) * 255
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255
        img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, 1)

/** Photovoltaic cell grid with busbars — read clearly at gameplay distance. */
export const solarCells = (): THREE.Texture =>
  makeTexture('solar', 512, (ctx, s) => {
    ctx.fillStyle = '#0d1524'
    ctx.fillRect(0, 0, s, s)

    const cols = 6
    const rows = 4
    const pad = s * 0.018
    const cw = (s - pad * (cols + 1)) / cols
    const ch = (s - pad * (rows + 1)) / rows

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = pad + c * (cw + pad)
        const y = pad + r * (ch + pad)

        const g = ctx.createLinearGradient(x, y, x + cw, y + ch)
        g.addColorStop(0, '#1b2f52')
        g.addColorStop(0.45, '#13223c')
        g.addColorStop(1, '#223a60')
        ctx.fillStyle = g
        ctx.fillRect(x, y, cw, ch)

        // busbars
        ctx.strokeStyle = 'rgba(190, 205, 225, 0.5)'
        ctx.lineWidth = Math.max(1, s * 0.0035)
        for (let b = 1; b <= 3; b++) {
          const bx = x + (cw * b) / 4
          ctx.beginPath()
          ctx.moveTo(bx, y)
          ctx.lineTo(bx, y + ch)
          ctx.stroke()
        }
        ctx.strokeStyle = 'rgba(160, 180, 205, 0.32)'
        ctx.beginPath()
        ctx.moveTo(x, y + ch / 2)
        ctx.lineTo(x + cw, y + ch / 2)
        ctx.stroke()

        // corner chamfers, as real cells have
        ctx.fillStyle = '#0d1524'
        const k = cw * 0.07
        ;[[x, y], [x + cw, y], [x, y + ch], [x + cw, y + ch]].forEach(([px, py], i) => {
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + (i % 2 === 0 ? k : -k), py)
          ctx.lineTo(px, py + (i < 2 ? k : -k))
          ctx.closePath()
          ctx.fill()
        })
      }
    }
  })

/** Hull plating: seams, rivet rows and panel joints. */
export const hullPanels = (): THREE.Texture =>
  makeTexture('hull', 512, (ctx, s) => {
    ctx.fillStyle = '#e9e3d9'
    ctx.fillRect(0, 0, s, s)

    // weathering blotches
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      const a = Math.random() * 0.05
      ctx.fillStyle = `rgba(150, 120, 96, ${a})`
      ctx.fillRect(x, y, Math.random() * 7 + 1, Math.random() * 7 + 1)
    }

    // panel seams
    ctx.strokeStyle = 'rgba(110, 118, 128, 0.55)'
    ctx.lineWidth = 2
    for (let i = 1; i < 5; i++) {
      const p = (s / 5) * i
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke()
    }

    // rivets along the seams
    ctx.fillStyle = 'rgba(120, 128, 138, 0.75)'
    for (let i = 1; i < 5; i++) {
      const p = (s / 5) * i
      for (let j = 6; j < s; j += 18) {
        ctx.beginPath(); ctx.arc(j, p, 1.8, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(p, j, 1.8, 0, Math.PI * 2); ctx.fill()
      }
    }
  }, 3)

/** Diagonal hazard stripes for airlock surrounds and equipment edges. */
export const hazardStripe = (): THREE.Texture =>
  makeTexture('hazard', 128, (ctx, s) => {
    ctx.fillStyle = '#1b1b1f'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#e8b53a'
    ctx.save()
    ctx.translate(s / 2, s / 2)
    ctx.rotate(Math.PI / 4)
    ctx.translate(-s, -s)
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(0, i * s * 0.25, s * 2, s * 0.125)
    }
    ctx.restore()
  }, 1)

/** Dust streaking, used as a multiply overlay low on structures. */
export const dustStreak = (): THREE.Texture =>
  makeTexture('dust-streak', 256, (ctx, s) => {
    const img = ctx.createImageData(s, s)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // vertical streaks: stretched noise, stronger toward the bottom
        const streak = fbm(x * 0.22, y * 0.02, 61, 3) * 0.5 + 0.5
        const gravity = Math.pow(y / s, 1.6)
        const a = Math.min(1, streak * gravity * 1.5)
        const i = (y * s + x) * 4
        img.data[i] = 150
        img.data[i + 1] = 92
        img.data[i + 2] = 52
        img.data[i + 3] = a * 215
      }
    }
    ctx.putImageData(img, 0, 0)
  }, 2)

/** Soft radial blob used for dust puffs and the sun's glow sprite. */
export const softGlow = (): THREE.Texture =>
  makeTexture('glow', 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
