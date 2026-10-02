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

  // the monitor's wallpaper (misty mountains at dusk; the dark room shows it in black & white)
  {
    // misty mountain ridges at dusk (as on the monitor in the reference photo)
    const r = rng(97)
    const ridge = (y0, amp, color, peaks) => {
      const waves = Array.from({ length: 3 }, (_, k) => [(0.0025 + r() * 0.003) * (k + 1), r() * 6.28, 0.6 / (k + 1)])
      let d = `M 0 1024`
      for (let x = 0; x <= 2048; x += 8) {
        let h = 0
        for (const [f, p, a] of waves) h += a * (1 - Math.abs(Math.sin(x * f + p))) ** 1.6
        let y = y0 - amp * h
        if (peaks && (x / 8) % 2 === 1) y -= 6 + r() * 16 // a pine-topped near ridge
        d += ` L ${x} ${y.toFixed(1)}`
      }
      return `<path d="${d} L 2048 1024 Z" fill="${color}"/>`
    }
    const mist = (y, h, op) => `<rect x="0" y="${y}" width="2048" height="${h}" fill="url(#mist)" opacity="${op}"/>`
    T.wallpaper = await fromSVG(
      `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024"><defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d7a93"/><stop offset=".45" stop-color="#b59fae"/><stop offset=".7" stop-color="#e2bcae"/><stop offset="1" stop-color="#d9b2a8"/></linearGradient>
        <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d6d2" stop-opacity="0"/><stop offset=".6" stop-color="#e9d6d2" stop-opacity=".75"/><stop offset="1" stop-color="#e9d6d2" stop-opacity="0"/></linearGradient>
      </defs><rect width="2048" height="1024" fill="url(#sky)"/>
      ${ridge(560, 300, '#9a8ea4', false)}${mist(520, 160, 0.7)}
      ${ridge(640, 260, '#76698a', false)}${mist(620, 150, 0.6)}
      ${ridge(730, 230, '#54496a', false)}${mist(720, 140, 0.5)}
      ${ridge(820, 200, '#352f45', false)}${mist(830, 120, 0.35)}
      ${ridge(930, 150, '#1d1a26', true)}</svg>`,
      { mime: 'image/jpeg', quality: 88 },
    )
  }
  T.wallpaperMono = { data: new Uint8Array(await sharp(Buffer.from(T.wallpaper.data)).grayscale().linear(0.8, -4).jpeg({ quality: 88, mozjpeg: true }).toBuffer()), mime: 'image/jpeg' }

  // the modern dark room: neutral plaster, grey loop-pile carpet, the LED glow gradient (bright along the bottom edge)
  {
    const low = fbm(11, [3, 6, 12])
    const hi = fbm(12, [48, 96, 192])
    T.plasterGray = await fromPixels(512, 512, (u, v) => {
      const n = (low(u, v) - 0.5) * 12 + (hi(u, v) - 0.5) * 7
      return [230 + n, 230 + n, 232 + n]
    })
  }
  {
    const pile = fbm(110, [128, 256])
    const mott = fbm(111, [8, 16])
    T.carpet = await fromPixels(512, 512, (u, v) => {
      const n = (pile(u, v) - 0.5) * 34 + (mott(u, v) - 0.5) * 10
      return [98 + n, 98 + n, 101 + n]
    })
    T.carpetN = await normalMap(512, (x, y) => pile(x / 512, y / 512) * 1.2, 1.5)
  }
  T.ledGlow = await fromPixels(
    256,
    256,
    (u, v) => {
      const e = smooth(Math.min(1, u / 0.06)) * smooth(Math.min(1, (1 - u) / 0.06))
      const g = v ** 2.4 * e * 255
      return [g, g, g, g]
    },
    { alpha: true, mime: 'image/png' },
  )

  {
    const stipple = fbm(120, [96, 192, 384])
    T.paintN = await normalMap(512, (x, y) => stipple(x / 512, y / 512), 1.1)
  }
  T.scallop = await fromPixels(
    256,
    512,
    (u, v) => {
      const t = 1 - v // distance down from the ceiling (the texture's bottom row is the top of the wall)
      const x = u - 0.5
      const arc = 0.05 + 2.2 * x * x // the scallop's lit edge
      const inside = smooth(Math.min(1, Math.max(0, (t - arc) / 0.05)))
      const fall = Math.exp(-t * 2.2) * (0.35 + 0.65 * Math.exp(-((x / 0.22) ** 2)))
      const hot = 0.6 * Math.exp(-(((t - arc - 0.04) / 0.05) ** 2)) * Math.exp(-((x / 0.12) ** 2))
      const sides = 1 - smooth(Math.min(1, Math.max(0, (Math.abs(x) - 0.3) / 0.2)))
      const g = Math.min(1, inside * (fall + hot) * sides) * 255
      return [g, g, g, g]
    },
    { alpha: true, mime: 'image/png' },
  )

  {
    const r = rng(130)
    const tones = ['#4a3220', '#5c3e27', '#3b281a', '#6a4a2f']
    let strands = ''
    for (let i = 0; i < 150; i++) {
      const x0 = r() * 512
      const y0 = r() * 512
      const ang = r() * Math.PI * 2
      const len = 140 + r() * 260
      const x3 = x0 + Math.cos(ang) * len
      const y3 = y0 + Math.sin(ang) * len
      const c1 = [x0 + (r() - 0.5) * 220, y0 + (r() - 0.5) * 220].map((v) => v.toFixed(1))
      const c2 = [x3 + (r() - 0.5) * 220, y3 + (r() - 0.5) * 220].map((v) => v.toFixed(1))
      const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${c1} ${c2} ${x3.toFixed(1)} ${y3.toFixed(1)}`
      const w = (4 + r() * 4).toFixed(1)
      for (const dx of [-512, 0, 512]) strands += `<path d="${d}" transform="translate(${dx} 0)" stroke="${tones[i % 4]}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`
    }
    T.wicker = await fromSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${strands}</svg>`)
  }



  // the studio: walnut (grain along u; tile = 1.4 m), oak floor planks, fabric weave, woven rug, braided pouf, chair
  // mesh, fiddle-leaf and snake-plant leaves, a striped pillow
  {
    const warp = fbm(91, [2, 4, 8])
    const fine = fbm(92, [64, 128, 256])
    const streak = fbm(93, [3, 6])
    T.walnut = await fromPixels(1024, 1024, (u, v) => {
      const w = warp(u * 2, v * 3)
      const grain = Math.sin(2 * Math.PI * (v * 70 + w * 4)) * 0.5 + 0.5
      const figure = Math.sin(2 * Math.PI * (v * 17 + w * 2.2)) * 0.5 + 0.5
      const n = (fine(u, v) - 0.5) * 10 + (streak(u, v * 2) - 0.5) * 30 - grain ** 3 * 14 - figure ** 5 * 12
      return [104 + n, 70 + n * 0.75, 48 + n * 0.55]
    })
  }
  {
    // oak planks: 6 boards per 1.2 m tile (20 cm), staggered end joints, grain along the boards, a little tone per board
    const warp = fbm(150, [2, 4, 8])
    const fine = fbm(151, [64, 128, 256])
    const r = rng(152)
    const tone = Array.from({ length: 6 }, () => (r() - 0.5) * 22)
    const joint = Array.from({ length: 6 }, () => r() * 0.5)
    const plank = (u, v) => {
      const row = Math.min(5, Math.floor(v * 6))
      const lv = v * 6 - row
      const ju = ((u + joint[row]) * 2) % 1
      const seam = Math.min(lv, 1 - lv) < 0.006 || Math.min(ju, 1 - ju) < 0.004
      return { row, lv, seam }
    }
    T.floorOak = await fromPixels(1024, 1024, (u, v) => {
      const { row, seam } = plank(u, v)
      const w = warp(u * 0.5 + row * 0.31, v * 6)
      const grain = Math.sin(2 * Math.PI * (v * 160 + w * 5 + row * 0.37)) * 0.5 + 0.5
      const n = (fine(u, v) - 0.5) * 12 + tone[row] - grain ** 4 * 20
      if (seam) return [128, 104, 82]
      return [188 + n, 158 + n * 0.88, 126 + n * 0.75]
    })
    T.floorOakN = await normalMap(1024, (x, y) => {
      const { seam } = plank(x / 1024, y / 1024)
      return (seam ? 0 : 1) + (fine(x / 1024, y / 1024) - 0.5) * 0.15
    }, 1.2)
  }
  {
    // a fine plain weave with a soft mottle (tinted per fabric)
    const mott = fbm(160, [4, 8, 16])
    const weave = (x, y) => {
      const wx = Math.sin((x / 3) * Math.PI) * 0.5 + 0.5
      const wy = Math.sin((y / 3) * Math.PI) * 0.5 + 0.5
      return (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? wx : wy
    }
    T.fabricWeave = await fromPixels(512, 512, (u, v, x, y) => {
      const c = 205 + (weave(x, y) - 0.5) * 9 + (mott(u, v) - 0.5) * 22
      return [c, c, c]
    })
    T.fabricN = await normalMap(512, (x, y) => weave(x, y) * 0.35 + mott(x / 512, y / 512) * 0.5, 1.0)
  }
  {
    // chunky basket-weave rug (cream)
    const n = fbm(161, [32, 64])
    const cell = (x, y) => {
      const horiz = (Math.floor(x / 24) + Math.floor(y / 24)) % 2 === 0
      const across = (horiz ? y : x) % 8
      return Math.sin(((across + 0.5) / 8) * Math.PI)
    }
    T.weaveRug = await fromPixels(512, 512, (u, v, x, y) => {
      const c = 200 + cell(x, y) * 34 + (n(u, v) - 0.5) * 14
      return [c, c * 0.97, c * 0.92]
    })
    T.weaveRugN = await normalMap(512, (x, y) => cell(x, y) * 1.4 + n(x / 512, y / 512) * 0.2, 1.4)
  }
  {
    // braided jute rope: a herringbone of strands along the rope (u, one tile per 3 cm) round its girth (v)
    const n = fbm(162, [32, 64, 128])
    const braid = (x, y) => Math.sin(2 * Math.PI * ((x / 256) * 2 + Math.abs(y / 128 - 0.5) * 1.6)) * 0.5 + 0.5
    T.braid = await fromPixels(256, 128, (u, v, x, y) => {
      const c = 118 + braid(x, y) ** 0.7 * 78 + (n(u, v) - 0.5) * 26
      return [c * 1.12, c * 0.9, c * 0.62]
    })
    T.braidN = await normalMap(256, (x, y) => braid(x, (y * 128) / 256) * 1.4 + n(x / 256, y / 256) * 0.3, 1.6)
  }
  {
    // velvet: a fine pile brushed into soft lighter and darker patches (tinted per fabric)
    const crush = fbm(165, [3, 6, 12])
    const fine = fbm(166, [128, 256])
    T.velvet = await fromPixels(512, 512, (u, v) => {
      const c = 212 + (crush(u, v) - 0.5) * 40 + (fine(u, v) - 0.5) * 8
      return [c, c, c]
    })
    T.velvetN = await normalMap(512, (x, y) => crush(x / 512, y / 512) * 0.6 + fine(x / 512, y / 512) * 0.35, 1.2)
  }
  {
    // pale sandy stone (the pebble planters): a soft mottle, a fine grain, scattered pores
    const mott = fbm(190, [4, 8, 16])
    const grain = fbm(191, [128, 256])
    const r = rng(192)
    const pores = new Float32Array(512 * 512)
    for (let k = 0; k < 2600; k++) {
      const x = Math.floor(r() * 512)
      const y = Math.floor(r() * 512)
      const d = 0.4 + r() * 0.6
      pores[y * 512 + x] = d
      if (r() < 0.4) pores[y * 512 + ((x + 1) % 512)] = d * 0.6
    }
    T.stone = await fromPixels(512, 512, (u, v, x, y) => {
      const c = 1 + (mott(u, v) - 0.5) * 0.08 + (grain(u, v) - 0.5) * 0.08 - pores[y * 512 + x] * 0.22
      return [232 * c, 226 * c, 215 * c]
    })
    T.stoneN = await normalMap(512, (x, y) => grain(x / 512, y / 512) * 0.8 + mott(x / 512, y / 512) * 0.3 - pores[y * 512 + x] * 1.2, 1.2)
  }
  {
    // bird-of-paradise blade (across × base→tip, the tip at the top): glossy deep green, a pale midrib, fine
    // parallel veins sweeping out toward the tip
    const n = fbm(180, [4, 8, 32])
    const vein = (a, along) => Math.abs(Math.sin(Math.PI * (along * 70 - a * 22))) ** 14
    T.birdLeaf = await fromPixels(256, 512, (u, v) => {
      const a = Math.abs(u - 0.5) * 2
      const along = 1 - v
      const mid = Math.exp(-((a / 0.035) ** 2))
      const k = 0.92 + (n(u, v) - 0.5) * 0.25 + vein(a, along) * 0.1 - a * a * 0.1 + along * 0.06
      const leaf = [54 * k, 92 * k, 44 * k]
      return leaf.map((c, i) => c + mid * ([150, 168, 98][i] - c))
    })
    T.birdLeafN = await normalMap(256, (x, y) => {
      const a = Math.abs(x / 256 - 0.5) * 2
      return -vein(a, 1 - y / 256) * 0.6 + Math.exp(-((a / 0.035) ** 2)) * 1.5
    }, 1.4)
  }
  // olive leaf: grey-green, a paler midrib (the undersides are the same texture, tinted silvery)
  T.oliveLeaf = await fromPixels(64, 128, (u) => {
    const a = Math.abs(u - 0.5) * 2
    const mid = Math.exp(-((a / 0.12) ** 2))
    const k = 1 - a * 0.12
    return [104 * k + mid * 40, 118 * k + mid * 36, 86 * k + mid * 30]
  })
  {
    // spiky rosette leaf: dark green, lighter toward the margins, fine lengthwise lines
    const n = fbm(181, [4, 16])
    T.agaveLeaf = await fromPixels(64, 256, (u, v) => {
      const a = Math.abs(u - 0.5) * 2
      const k = 0.85 + Math.sin(u * 32 * Math.PI) * 0.04 + a ** 4 * 0.35 + (n(u, v) - 0.5) * 0.12
      return [40 * k, 70 * k, 42 * k]
    })
  }
  // light grey shag: long tufts (noise at several scales), a soft pile normal
  {
    const tuft = fbm(170, [96, 192, 384])
    const clump = fbm(171, [16, 32])
    T.shag = await fromPixels(512, 512, (u, v) => {
      const c = 188 + (tuft(u, v) - 0.5) * 60 + (clump(u, v) - 0.5) * 24
      return [c, c * 0.99, c * 0.97]
    })
    T.shagN = await normalMap(512, (x, y) => tuft(x / 512, y / 512) * 1.6 + clump(x / 512, y / 512) * 0.6, 2.4)
  }
  // office-chair mesh: a fine grid of black strands (alpha)
  T.meshWeave = await fromPixels(
    256,
    256,
    (u, v, x, y) => {
      const on = x % 6 < 2 || y % 5 < 2
      return [24, 24, 26, on ? 255 : 0]
    },
    { alpha: true, mime: 'image/png' },
  )
  // fiddle-leaf fig leaf (violin-shaped, glossy dark green, pale midrib and veins), tip up
  T.figLeaf = await fromSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f6a2c"/><stop offset="1" stop-color="#2b4d1f"/></linearGradient></defs>
    <path d="M128 248 C 96 236 54 214 44 168 C 36 130 58 112 70 92 C 82 70 74 40 100 20 C 116 8 140 8 156 20 C 182 40 174 70 186 92 C 198 112 220 130 212 168 C 202 214 160 236 128 248 Z" fill="url(#g)"/>
    <path d="M128 248 L128 18" stroke="#8aa86a" stroke-width="3"/>
    ${[60, 95, 130, 165, 200].map((y) => `<path d="M128 ${y} Q 104 ${y - 14} 78 ${y - 30} M128 ${y} Q 152 ${y - 14} 178 ${y - 30}" stroke="#6f8f52" stroke-width="2" fill="none"/>`).join('')}
  </svg>`)
  // snake-plant leaf: dark green with lighter cross-bands, yellow margins
  {
    const n = fbm(163, [8, 16])
    T.snakeLeaf = await fromPixels(128, 512, (u, v) => {
      const edge = Math.min(u, 1 - u)
      if (edge < 0.08) return [196, 184, 92]
      const band = Math.sin(2 * Math.PI * (v * 22 + n(u * 0.5, v) * 2.5)) * 0.5 + 0.5
      const c = 0.75 + band * 0.35
      return [42 * c, 78 * c, 46 * c]
    })
  }
  return T
}
