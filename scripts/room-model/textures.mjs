// Procedural textures for the room model (tileable where they repeat). Returns { key: { data, mime } }.
import sharp from 'sharp'
import path from 'node:path'

/* ── tileable value noise ─────────────────────────────────────────────────────────────── */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function lattice(period, seed) {
  const r = rng(seed)
  return Float32Array.from({ length: period * period }, r)
}
const smooth = (t) => t * t * (3 - 2 * t)
/** periodic value noise at (u,v) ∈ [0,1)², period = lattice cells across */
function vnoise(L, period, u, v) {
  const x = (((u % 1) + 1) % 1) * period
  const y = (((v % 1) + 1) % 1) * period
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const x1 = (x0 + 1) % period
  const y1 = (y0 + 1) % period
  const a = L[y0 * period + x0]
  const b = L[y0 * period + x1]
  const c = L[y1 * period + x0]
  const d = L[y1 * period + x1]
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function fbm(seed, periods = [4, 8, 16, 32]) {
  const Ls = periods.map((p, i) => [lattice(p, seed + i * 101), p])
  const norm = periods.reduce((s, _, i) => s + 0.5 ** i, 0)
  return (u, v) => Ls.reduce((s, [L, p], i) => s + vnoise(L, p, u, v) * 0.5 ** i, 0) / norm
}

async function fromPixels(w, h, fn, { alpha = false, mime = 'image/jpeg', quality = 86 } = {}) {
  const ch = alpha ? 4 : 3
  const buf = Buffer.alloc(w * h * ch)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x / w, y / h, x, y)
      const i = (y * w + x) * ch
      buf[i] = Math.max(0, Math.min(255, c[0]))
      buf[i + 1] = Math.max(0, Math.min(255, c[1]))
      buf[i + 2] = Math.max(0, Math.min(255, c[2]))
      if (alpha) buf[i + 3] = Math.max(0, Math.min(255, c[3] ?? 255))
    }
  const img = sharp(buf, { raw: { width: w, height: h, channels: ch } })
  const data = mime === 'image/png' ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality, mozjpeg: true }).toBuffer()
  return { data: new Uint8Array(data), mime }
}

async function fromSVG(svg, { mime = 'image/png', quality = 86, size } = {}) {
  let img = sharp(Buffer.from(svg))
  if (size) img = img.resize(size[0], size[1], { fit: 'fill' })
  const data = mime === 'image/png' ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.flatten({ background: '#000' }).jpeg({ quality, mozjpeg: true }).toBuffer()
  return { data: new Uint8Array(data), mime }
}

/**
 * Tangent-space normal map from a tileable height field h(x, y) (pixel coords, wraps). glTF convention:
 * +X right, +Y up (toward the top of the image), +Z out of the surface.
 */
async function normalMap(size, height, strength) {
  const H = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = height(x, y)
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)]
  return fromPixels(
    size,
    size,
    (u, v, x, y) => {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const l = Math.hypot(dx, dy, 1)
      return [(-dx / l) * 127.5 + 127.5, (dy / l) * 127.5 + 127.5, (1 / l) * 127.5 + 127.5]
    },
    { quality: 92 },
  )
}

/* ── the textures ─────────────────────────────────────────────────────────────────────── */

export async function buildTextures(root) {
  const T = {}

  // warm lime plaster (tile: 1 m)
  {
    const low = fbm(11, [3, 6, 12])
    const hi = fbm(12, [48, 96, 192])
    T.plaster = await fromPixels(512, 512, (u, v) => {
      const n = (low(u, v) - 0.5) * 12 + (hi(u, v) - 0.5) * 7
      return [238 + n, 230 + n, 217 + n * 0.9]
    })
  }

  // porcelain floor tiles, 60 cm (texture = 2×2 tiles = 1.2 m)
  {
    const mott = fbm(21, [8, 16, 32, 64])
    const fine = fbm(22, [128, 256])
    const r = rng(23)
    const tone = Array.from({ length: 4 }, () => (r() - 0.5) * 14)
    T.tiles = await fromPixels(1024, 1024, (u, v, x, y) => {
      const tx = x % 512
      const ty = y % 512
      const t = tone[(x >= 512 ? 1 : 0) + (y >= 512 ? 2 : 0)]
      const edge = Math.min(tx, ty, 511 - tx, 511 - ty)
      if (edge < 3) return [104, 99, 93]
      const bevel = edge < 7 ? (7 - edge) * -2.5 : 0
      const n = (mott(u, v) - 0.5) * 18 + (fine(u, v) - 0.5) * 8 + t + bevel
      return [134 + n, 128 + n, 120 + n]
    })
  }

  // surface relief for the realistic (small) room: recessed grout, woven jute, lime plaster, wood grain
  {
    const n = fbm(24, [64, 128])
    T.tilesN = await normalMap(512, (x, y) => {
      const tx = x % 256
      const ty = y % 256
      const edge = Math.min(tx, ty, 255 - tx, 255 - ty)
      return (edge < 1.5 ? 0 : edge < 3.5 ? (edge - 1.5) / 2 : 1) + (n(x / 512, y / 512) - 0.5) * 0.04
    }, 1.6)
  }
  {
    const fibre = fbm(53, [64, 128, 256])
    T.juteN = await normalMap(512, (x, y) => {
      const row = Math.floor(y / 16)
      const ly = (y % 16) / 16
      const dir = row % 2 ? 1 : -1
      const s = 0.5 + 0.5 * Math.sin(((x + dir * ly * 16) / 16) * Math.PI * 2)
      return (0.55 + 0.45 * s) * Math.sin(ly * Math.PI) + (fibre(x / 512, y / 512) - 0.5) * 0.35
    }, 2.2)
  }
  {
    const low = fbm(13, [6, 12, 24])
    const hi = fbm(14, [96, 192])
    T.plasterN = await normalMap(512, (x, y) => low(x / 512, y / 512) * 2.2 + hi(x / 512, y / 512) * 0.9, 1.4)
  }
  {
    const warp = fbm(33, [2, 4, 8])
    T.woodN = await normalMap(512, (x, y) => {
      const u = x / 512
      const w = u * 22 + warp(u * 0.5, y / 512) * 5
      return Math.pow(0.5 + 0.5 * Math.sin(w * Math.PI * 2), 3) * 0.6
    }, 1.2)
  }

  // wood grain (teak for the chair, lighter oak for small objects)
  const wood = async (seed, base, dark) => {
    const warp = fbm(seed, [2, 4, 8])
    const fibre = fbm(seed + 5, [64, 128, 256])
    const knots = fbm(seed + 9, [4, 8])
    return fromPixels(512, 512, (u, v) => {
      const w = u * 22 + warp(u * 0.5, v) * 5 + knots(u, v) * 1.5
      const ring = Math.pow(0.5 + 0.5 * Math.sin(w * Math.PI * 2), 3)
      const f = (fibre(u * 3, v * 0.25) - 0.5) * 0.25
      const k = Math.min(1, ring * 0.55 + f + 0.2)
      return [base[0] + (dark[0] - base[0]) * k, base[1] + (dark[1] - base[1]) * k, base[2] + (dark[2] - base[2]) * k]
    })
  }
  T.teak = await wood(31, [150, 92, 52], [92, 52, 26])
  T.oak = await wood(41, [196, 150, 102], [150, 104, 64])

  // cane webbing: horizontal, vertical and two diagonal strands leave octagonal holes (alpha)
  {
    const C = 64 // cell px (texture = 8 cells)
    const strand = (d, w) => (d < w ? Math.cos((d / w) * Math.PI * 0.5) : -1)
    T.cane = await fromPixels(
      512,
      512,
      (u, v, x, y) => {
        const cx = ((x % C) + C) % C
        const cy = ((y % C) + C) % C
        const dh = Math.abs(cy - C / 2)
        const dv = Math.abs(cx - C / 2)
        const d1 = Math.abs(((x + y) % C) - C / 2) / Math.SQRT2
        const d2 = Math.abs((((x - y) % C) + C) % C - C / 2) / Math.SQRT2
        const s = Math.max(strand(Math.min(dh, C - dh), 5.5), strand(Math.min(dv, C - dv), 5.5), strand(Math.min(d1, C / Math.SQRT2 - d1), 4.2), strand(Math.min(d2, C / Math.SQRT2 - d2), 4.2))
        if (s < 0) return [0, 0, 0, 0]
        const shade = 0.72 + 0.28 * s
        return [222 * shade, 176 * shade, 112 * shade, 255]
      },
      { alpha: true, mime: 'image/png' },
    )
  }

  // jute rug weave (tile: 0.5 m)
  {
    const fibre = fbm(51, [64, 128, 256])
    const blotch = fbm(52, [4, 8])
    T.jute = await fromPixels(512, 512, (u, v, x, y) => {
      const row = Math.floor(y / 16)
      const ly = (y % 16) / 16
      const dir = row % 2 ? 1 : -1
      const s = 0.5 + 0.5 * Math.sin(((x + dir * ly * 16) / 16) * Math.PI * 2)
      const rowShade = 0.8 + 0.2 * Math.sin(ly * Math.PI)
      const n = (fibre(u * 2, v) - 0.5) * 0.35 + (blotch(u, v) - 0.5) * 0.15
      const k = (0.62 + 0.38 * s) * rowShade + n
      return [205 * k, 160 * k, 100 * k]
    })
  }

  // sunlit garden seen through the windows (unlit/emissive)
  {
    const r = rng(61)
    let blobs = ''
    const cols = ['#5d7d33', '#89a53d', '#b9c85a', '#3e5a25', '#d8d27a', '#6f9140', '#2f4720']
    for (let i = 0; i < 260; i++) {
      const x = r() * 2048
      const y = r() * 1200 + 250
      const rad = 20 + r() * 90
      blobs += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(0)}" fill="${cols[Math.floor(r() * cols.length)]}" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`
    }
    let sparks = ''
    for (let i = 0; i < 90; i++) sparks += `<circle cx="${(r() * 2048).toFixed(0)}" cy="${(r() * 1200 + 200).toFixed(0)}" r="${(6 + r() * 26).toFixed(0)}" fill="#fff6c8" opacity="${(0.4 + r() * 0.5).toFixed(2)}"/>`
    T.garden = await fromSVG(
      `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1536"><defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".35" stop-color="#f1e7a8"/><stop offset=".7" stop-color="#8aa047"/><stop offset="1" stop-color="#3d5424"/></linearGradient>
        <filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="b2"><feGaussianBlur stdDeviation="6"/></filter></defs>
        <rect width="2048" height="1536" fill="url(#sky)"/>
        <g filter="url(#b)">${blobs}</g><g filter="url(#b2)">${sparks}</g></svg>`,
      { mime: 'image/jpeg', size: [2048, 1024] },
    )
  }

  // monstera leaf (alpha): heart-shaped blade, slits cut in from the edge along the veins, holes near the midrib
  {
    const cut = []
    const veins = []
    for (const side of [-1, 1])
      for (let k = 0; k < 6; k++) {
        const yi = 432 - k * 64 // where the slit stops, near the midrib (base → tip)
        const xi = 256 + side * (34 + k * 3)
        const xo = 256 + side * 300
        const yo = yi - 120 + k * 8 // veins sweep up toward the tip
        cut.push(`<path d="M ${xi} ${yi - 2} L ${xo} ${yo - 11} L ${xo} ${yo + 11} L ${xi} ${yi + 2} Z" fill="#000"/>`)
        if (k < 5) {
          const yh = yi - 36
          const xh = 256 + side * (66 + k * 4)
          cut.push(`<ellipse cx="${xh}" cy="${yh}" rx="${10 + (k % 2) * 3}" ry="5" transform="rotate(${side * -22} ${xh} ${yh})" fill="#000"/>`)
          const ym = yi - 32
          veins.push(`<path d="M 256 ${ym + 8} L ${256 + side * 300} ${ym - 112}" stroke="#86ad62" stroke-width="3" opacity=".6"/>`)
        }
      }
    const leaf = 'M 256 470 C 70 470 18 330 38 215 C 58 105 165 35 256 22 C 347 35 454 105 474 215 C 494 330 442 470 256 470 Z'
    T.monstera = await fromSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs>
      <radialGradient id="g" cx=".5" cy=".62" r=".62"><stop offset="0" stop-color="#4f8b3c"/><stop offset="1" stop-color="#2a5724"/></radialGradient>
      <mask id="m"><rect width="512" height="512" fill="#000"/><path d="${leaf}" fill="#fff"/><path d="M 236 474 L 256 438 L 276 474 Z" fill="#000"/>${cut.join('')}</mask></defs>
      <g mask="url(#m)"><rect width="512" height="512" fill="url(#g)"/>${veins.join('')}<path d="M 256 470 Q 252 250 256 26" stroke="#a3c474" stroke-width="7" fill="none"/></g></svg>`)
  }

  // pothos leaf (alpha): small heart with golden variegation
  {
    const r = rng(71)
    let streaks = ''
    for (let i = 0; i < 12; i++) {
      const x = 70 + r() * 116
      const y = 60 + r() * 150
      streaks += `<path d="M ${x} ${y} q ${(r() - 0.5) * 40} ${-20 - r() * 30} ${(r() - 0.5) * 30} ${-40 - r() * 20}" stroke="#d9d27a" stroke-width="${2 + r() * 4}" fill="none" opacity=".7"/>`
    }
    const leaf = 'M 128 238 C 40 200 18 120 44 78 C 68 40 108 52 128 80 C 148 52 188 40 212 78 C 238 120 216 200 128 238 Z'
    T.pothos = await fromSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs>
      <mask id="m"><rect width="256" height="256" fill="#000"/><path d="${leaf}" fill="#fff" transform="rotate(180 128 128)"/></mask></defs>
      <g mask="url(#m)"><rect width="256" height="256" fill="#3f7d2f"/><g transform="rotate(180 128 128)">${streaks}<path d="M 128 236 L 128 84" stroke="#8fbf62" stroke-width="4"/></g></g></svg>`)
  }

  // old globe map (sepia, wraps horizontally)
  {
    const land = fbm(81, [4, 8, 16, 32])
    T.globe = await fromPixels(1024, 512, (u, v, x, y) => {
      const lat = Math.abs(v - 0.5) * 2
      const n = land(u, v * 0.5) - lat * 0.12
      const grid = x % 64 < 1 || y % 64 < 1 ? -18 : 0
      if (n > 0.53) {
        const k = n > 0.56 ? 0 : 20
        return [150 + k + grid, 118 + k + grid, 74 + grid]
      }
      return [206 + grid, 186 + grid, 142 + grid]
    })
  }

  // sketch paper pinned to the wall
  {
    const r = rng(91)
    let lines = ''
    for (let i = 0; i < 26; i++) {
      const x = 60 + r() * 380
      const y = 80 + r() * 340
      lines += `<path d="M ${x} ${y} q ${(r() - 0.5) * 160} ${(r() - 0.5) * 120} ${(r() - 0.5) * 220} ${(r() - 0.5) * 60}" stroke="#6c665c" stroke-width="${1 + r() * 1.5}" fill="none" opacity="${0.25 + r() * 0.35}"/>`
    }
    T.paper = await fromSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#eee8da"/><rect x="40" y="40" width="432" height="432" fill="none" stroke="#b8b0a0" stroke-width="2" opacity=".6"/>${lines}</svg>`, { mime: 'image/jpeg' })
  }

  // photographs for the frames & postcards (the site's placeholder photos — swap for real ones).
  // Stored as 512×512 (power-of-two for any WebGL); the photo planes' own proportions undo the squash.
  const photo = async (name, w = 512, h = 512) => {
    const data = await sharp(path.join(root, 'public', 'photos', `${name}.webp`)).resize(w, h, { fit: 'fill' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
    return { data: new Uint8Array(data), mime: 'image/jpeg' }
  }
  for (const n of ['pines-mist', 'road-long', 'path-figure', 'coast-headland', 'street-car', 'dunes', 'ridge-gold', 'city-dusk', 'window-light', 'night-sky']) T[`photo-${n}`] = await photo(n)
  // the family photograph (small room's only frame): landscape and viewed up close, so twice the width
  T['photo-family'] = await photo('family', 1024, 512)

  // sneaker uppers for the shoe stack. Mapped the way sneakerUpper() in the builder lays out its UVs:
  // u = heel → toe, v = sole line (0) → top centre line (1), so the three stripes, overlays, collar lining and
  // laces are painted where they sit on the shoe.
  {
    const grain = fbm(71, [64, 128, 256])
    const nap = fbm(72, [16, 32, 64])
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const mixc = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k)
    const ss = (e0, e1, x) => smooth(Math.min(1, Math.max(0, (x - e0) / (e1 - e0))))
    const collar = (u) => (u > 0.035 && u < 0.36 ? Math.sin((Math.PI * (u - 0.035)) / 0.325) ** 0.6 : 0)
    const SHOES = {
      // adidas Campus-style suede with white leather stripes
      'shoe-maroon': { base: '#5e1a44', stripe: '#eee8dc', heel: '#4c1438', suede: 1 },
      'shoe-grey': { base: '#8f8e8b', stripe: '#f0ece3', heel: '#7c7b78', suede: 1 },
      // Samba-style white leather, green stripes and heel, light suede T-toe
      'shoe-green': { base: '#efece4', stripe: '#1d5638', heel: '#1d5638', toe: '#d6d0c4', suede: 0 },
      // Dunk-style "panda": white leather with black overlays and swoosh
      'shoe-panda': { base: '#f2f0eb', overlay: '#1b1b1d', suede: 0 },
    }
    for (const [key, s] of Object.entries(SHOES)) {
      const base = rgb(s.base)
      T[key] = await fromPixels(512, 256, (u, y) => {
        const v = 1 - y
        let c = base
        if (s.heel && u < 0.075 && v > 0.28) c = rgb(s.heel)
        if (s.toe && (u > 0.8 || (u > 0.7 && v > 0.8))) c = rgb(s.toe)
        if (s.stripe && v > 0.09 && v < 0.72)
          for (let k = 0; k < 3; k++) {
            const d = Math.abs(u - (0.45 + k * 0.07 + (v - 0.1) * 0.16))
            if (d < 0.018) c = d > 0.015 ? mixc(rgb(s.stripe), [0, 0, 0], 0.25) : rgb(s.stripe)
          }
        if (s.overlay) {
          const o = rgb(s.overlay)
          if (u > 0.8 - 0.05 * v || u < 0.19 + 0.06 * v || (v > 0.74 && u > 0.36 && u < 0.8)) c = o
          const t = 0.075 * ss(0.2, 0.5, u) * (1 - ss(0.64, 0.7, u))
          if (u > 0.2 && Math.abs(v - (0.26 + 3.2 * (u - 0.52) ** 2)) < t) c = o
        }
        // laces across the vamp, eyelets along its edges, tongue between the rows
        if (u > 0.4 && u < 0.69) {
          const k = Math.round((u - 0.415) / 0.05)
          const du = Math.abs(u - (0.415 + k * 0.05))
          if (v > 0.86) c = du < 0.01 ? [238, 235, 227] : mixc(c, [0, 0, 0], s.overlay ? 0.1 : 0.2)
          else if (v > 0.81 && du < 0.008 && k >= 0 && k <= 5) c = [40, 36, 33]
        }
        // stitching above the sole
        if (v > 0.075 && v < 0.088) c = mixc(c, [0, 0, 0], 0.18)
        // the collar opening (the builder dips these vertices into the shoe): light lining, darker insole
        const open = collar(u) * ss(0.66, 0.8, v)
        if (open > 0.45) c = mixc([226, 218, 204], [120, 112, 102], ss(0.86, 1, v))
        const n = (grain(u * 2, y) - 0.5) * 8 + (s.suede ? (nap(u * 2, y) - 0.5) * 30 : 0)
        return [c[0] + n, c[1] + n, c[2] + n * 0.95]
      })
    }
  }

  return T
}
