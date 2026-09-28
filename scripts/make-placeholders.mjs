// Generates warm, film-like PLACEHOLDER photographs / video posters / project covers into public/photos.
// Replace them by dropping your own files in public/photos and editing src/content/photos.ts.
//   node scripts/make-placeholders.mjs
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve(import.meta.dirname, '..', 'public', 'photos')
fs.mkdirSync(out, { recursive: true })

/* ---------- helpers ---------- */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const f = (n) => +n.toFixed(1)

/** smooth ridge line as an SVG path (closed to the bottom) */
function ridge(w, h, baseY, amp, seed, { peaks = 4, rough = 0.5 } = {}) {
  const r = rng(seed)
  const terms = Array.from({ length: 5 }, (_, k) => ({
    a: Math.pow(rough, k),
    f: (k + 1) * (0.6 + r() * peaks * 0.35),
    p: r() * Math.PI * 2,
  }))
  const norm = terms.reduce((s, t) => s + t.a, 0)
  const pts = []
  const N = 180
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w
    const y = terms.reduce((s, t) => s + t.a * Math.sin((i / N) * Math.PI * t.f + t.p), 0) / norm
    pts.push(`${f(x)},${f(baseY - y * amp)}`)
  }
  return `M0,${h} L${pts.join(' L')} L${w},${h} Z`
}

function svgWrap(w, h, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`
}
const lin = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</linearGradient>`
const rad = (id, stops) =>
  `<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`
const blur = (id, s) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${s}"/></filter>`
const vignette = (w, h, strength = 0.5) =>
  `<radialGradient id="vg" cx="50%" cy="48%" r="75%"><stop offset="55%" stop-color="#1a0d06" stop-opacity="0"/><stop offset="100%" stop-color="#1a0d06" stop-opacity="${strength}"/></radialGradient><rect width="${w}" height="${h}" fill="url(#vg)"/>`

async function finish(name, svg, w, h, { fade = 0.9, grain = 0.2 } = {}) {
  let img = sharp(Buffer.from(svg)).resize(w, h)
  const base = await img.png().toBuffer()
  const noise = await sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 42 } } })
    .greyscale()
    .ensureAlpha(grain)
    .png()
    .toBuffer()
  await sharp(base)
    .composite([{ input: noise, blend: 'overlay' }])
    .linear(fade, 255 * (1 - fade) * 0.35) // lift blacks a little: "film fade"
    .modulate({ saturation: 0.94 })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(out, `${name}.webp`))
  console.log('  ', name)
}

/* ---------- photographic scenes ---------- */

async function ridgeGold(name, seed, pal, w = 1500, h = 1000) {
  const r = rng(seed)
  const layers = [0.5, 0.58, 0.66, 0.76, 0.88]
  const body = layers
    .map((y, i) => {
      const t = i / (layers.length - 1)
      return `<path d="${ridge(w, h, h * y, 60 + i * 26, seed + i * 17, { peaks: 3 + i * 0.4 })}" fill="${pal.ridges[i]}" opacity="${0.55 + t * 0.45}"/>` +
        (i < layers.length - 1 ? `<rect y="${h * (y + 0.02)}" width="${w}" height="${h * 0.16}" fill="url(#mist)" opacity="${0.55 - t * 0.3}"/>` : '')
    })
    .join('')
  const sx = w * (0.55 + r() * 0.3)
  const svg = svgWrap(w, h,
    lin('sky', pal.sky) + rad('sun', [[0, '#fff3d0', 1], [0.25, pal.sun, 0.9], [1, pal.sun, 0]]) + lin('mist', [[0, pal.mist, 0], [0.5, pal.mist, 0.8], [1, pal.mist, 0]]) + blur('b1', 2),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <circle cx="${sx}" cy="${h * 0.5}" r="${h * 0.42}" fill="url(#sun)"/>
     <circle cx="${sx}" cy="${h * 0.5}" r="${h * 0.05}" fill="#fff6dc" filter="url(#b1)"/>
     ${body}${vignette(w, h, 0.55)}`)
  await finish(name, svg, w, h)
}

async function pinesMist(name, seed, w = 1200, h = 1500) {
  const r = rng(seed)
  const trees = (baseY, count, size, color, op) => {
    let s = ''
    for (let i = 0; i < count; i++) {
      const x = r() * w
      const sz = size * (0.6 + r() * 0.8)
      const y = baseY + (r() - 0.5) * size * 0.4
      let tiers = ''
      for (let k = 0; k < 5; k++) {
        const ty = y - sz * (0.2 * k), tw = sz * (0.5 - k * 0.07)
        tiers += `M${f(x - tw)},${f(ty)} L${f(x)},${f(ty - sz * 0.45)} L${f(x + tw)},${f(ty)} Z `
      }
      s += `<path d="${tiers}" fill="${color}" opacity="${op}"/>`
    }
    return s
  }
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#c9c2b0'], [0.55, '#dcd0b6'], [1, '#e8d7b6']]) + lin('mist', [[0, '#e6dcc4', 0], [0.5, '#e6dcc4', 0.85], [1, '#e6dcc4', 0]]) + blur('b', 5) + blur('b2', 1.5),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <path d="M-50,${h * 0.62} L${w * 0.42},${h * 0.2} L${w * 0.5},${h * 0.245} L${w * 0.6},${h * 0.21} L${w + 50},${h * 0.62} Z" fill="#8f9a94" opacity=".55" filter="url(#b)"/>
     <rect y="${h * 0.42}" width="${w}" height="${h * 0.22}" fill="url(#mist)"/>
     <g filter="url(#b2)">${trees(h * 0.72, 26, 190, '#5c6a5c', 0.55)}</g>
     <rect y="${h * 0.6}" width="${w}" height="${h * 0.2}" fill="url(#mist)" opacity=".8"/>
     ${trees(h * 0.86, 22, 300, '#2f3d34', 0.9)}
     ${trees(h * 1.02, 14, 520, '#1c2620', 1)}
     ${vignette(w, h, 0.5)}`)
  await finish(name, svg, w, h)
}

async function roadLong(name, seed, w = 1000, h = 1500) {
  const r = rng(seed)
  const vx = w * 0.5, vy = h * 0.5
  let trees = ''
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1
    const t = (i >> 1) / 8
    const x = vx + side * (60 + t * t * w * 0.7)
    const th = 120 + t * t * 900
    trees += `<rect x="${f(x - th * 0.05)}" y="${f(vy - th * 0.95 + t * 60)}" width="${f(th * 0.1)}" height="${f(th)}" fill="#20130d" opacity="${0.9 - (1 - t) * 0.45}"/>` +
      `<ellipse cx="${f(x)}" cy="${f(vy - th * 0.9 + t * 60)}" rx="${f(th * 0.32)}" ry="${f(th * 0.28)}" fill="#26160e" opacity="${0.85 - (1 - t) * 0.45}"/>`
  }
  const stripes = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 9, y = vy + Math.pow(t, 1.9) * (h - vy), wd = 4 + t * t * 34, ln = 12 + t * t * 120
    return `<rect x="${f(vx - wd / 2)}" y="${f(y)}" width="${f(wd)}" height="${f(ln)}" fill="#f2d9a8" opacity="${0.25 + t * 0.4}"/>`
  }).join('')
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#8a7f86'], [0.35, '#e6a878'], [0.5, '#f7d29a'], [0.5, '#5a3a2a'], [1, '#2a1a12']]) +
      rad('sun', [[0, '#fff2cc', 1], [0.3, '#ffd18a', 0.7], [1, '#ffb066', 0]]) + blur('b', 3),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <circle cx="${vx}" cy="${vy}" r="${w * 0.6}" fill="url(#sun)"/>
     <polygon points="${vx - 5},${vy} ${vx + 5},${vy} ${w * 1.05},${h} ${-w * 0.05},${h}" fill="#3a2418"/>
     <polygon points="${vx - 5},${vy} ${vx + 5},${vy} ${w * 0.68},${h} ${w * 0.32},${h}" fill="#5a3826" opacity=".55" filter="url(#b)"/>
     ${stripes}${trees}${vignette(w, h, 0.6)}`)
  await finish(name, svg, w, h)
}

async function pathFigure(name, seed, w = 1000, h = 1250) {
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#d9cdb4'], [0.5, '#efdcb8'], [1, '#c9b48e']]) + lin('mist', [[0, '#f0e2c4', 0], [0.5, '#f0e2c4', 0.9], [1, '#f0e2c4', 0]]) + blur('b', 6),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <path d="${ridge(w, h, h * 0.52, 70, seed, { peaks: 2 })}" fill="#8d8a75" opacity=".5" filter="url(#b)"/>
     <path d="${ridge(w, h, h * 0.58, 50, seed + 4, { peaks: 3 })}" fill="#5f5d4a" opacity=".7"/>
     <rect y="${h * 0.5}" width="${w}" height="${h * 0.14}" fill="url(#mist)"/>
     <polygon points="${w * 0.49},${h * 0.6} ${w * 0.51},${h * 0.6} ${w * 0.95},${h} ${w * 0.05},${h}" fill="#a58a63"/>
     <polygon points="${w * 0.49},${h * 0.6} ${w * 0.51},${h * 0.6} ${w * 0.62},${h} ${w * 0.38},${h}" fill="#c8ab7c" opacity=".6"/>
     <g fill="#2a1d15"><ellipse cx="${w * 0.5}" cy="${h * 0.643}" rx="7" ry="8"/><path d="M${w * 0.5 - 9},${h * 0.655} h18 l4,54 h-26 z"/><rect x="${w * 0.5 - 8}" y="${h * 0.655 + 50}" width="6" height="26"/><rect x="${w * 0.5 + 2}" y="${h * 0.655 + 50}" width="6" height="26"/></g>
     ${vignette(w, h, 0.5)}`)
  await finish(name, svg, w, h)
}

async function coastHeadland(name, seed, w = 1600, h = 1200) {
  const r = rng(seed)
  let surf = ''
  for (let i = 0; i < 7; i++) {
    const y = h * (0.62 + i * 0.045), amp = 8 + i * 3
    let d = `M0,${f(y)}`
    for (let x = 0; x <= w; x += 40) d += ` L${x},${f(y + Math.sin(x / (90 + r() * 30) + i) * amp)}`
    surf += `<path d="${d}" fill="none" stroke="#fbeed6" stroke-width="${2 + i * 0.7}" opacity="${0.15 + i * 0.07}"/>`
  }
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#b7a6b8'], [0.35, '#e9b6a2'], [0.55, '#f6d4a8']]) + lin('sea', [[0, '#d9a98a'], [0.3, '#8d7887'], [1, '#3e3441']]) +
      lin('sand', [[0, '#c8a487'], [1, '#6c5044']]) + rad('sun', [[0, '#fff1cf', 1], [0.35, '#ffcf99', 0.65], [1, '#ffbb80', 0]]) + blur('b', 2.5),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <circle cx="${w * 0.66}" cy="${h * 0.52}" r="${h * 0.5}" fill="url(#sun)"/>
     <rect y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="url(#sea)"/>
     <rect x="${w * 0.6}" y="${h * 0.55}" width="${w * 0.12}" height="${h * 0.3}" fill="#ffd9a3" opacity=".22" filter="url(#b)"/>
     ${surf}
     <path d="M0,${h} L0,${h * 0.28} Q${w * 0.05},${h * 0.24} ${w * 0.13},${h * 0.3} Q${w * 0.2},${h * 0.36} ${w * 0.26},${h * 0.5} Q${w * 0.3},${h * 0.58} ${w * 0.4},${h * 0.62} L${w * 0.5},${h * 0.7} Z" fill="#241a1c"/>
     <path d="M${w * 0.28},${h} Q${w * 0.35},${h * 0.8} ${w * 0.6},${h * 0.74} Q${w * 0.9},${h * 0.7} ${w},${h * 0.8} L${w},${h} Z" fill="url(#sand)" opacity=".9"/>
     ${vignette(w, h, 0.55)}`)
  await finish(name, svg, w, h)
}

async function streetCar(name, seed, w = 1000, h = 1500) {
  const r = rng(seed)
  const vx = w * 0.5, vy = h * 0.42
  const facade = (side) => {
    let s = ''
    const cols = side < 0 ? ['#d8b48a', '#c99a72', '#e0c39a', '#b98462'] : ['#e4c9a0', '#cf9f78', '#d7b088', '#c58e66']
    for (let i = 0; i < 4; i++) {
      const x0 = side < 0 ? i * 0 : w
      const t0 = i / 4, t1 = (i + 1) / 4
      const ex = (t) => vx + side * (vx * (1 - t * 0.98))
      const y = (t, top) => (top ? vy - (1 - t) * vy * 1.05 : vy + (1 - t) * (h - vy) * 0.72)
      const pts = `${f(ex(t0))},${f(y(t0, true))} ${f(ex(t1))},${f(y(t1, true))} ${f(ex(t1))},${f(y(t1, false))} ${f(ex(t0))},${f(y(t0, false))}`
      s += `<polygon points="${pts}" fill="${cols[i]}" opacity="${0.75 + i * 0.06}"/>`
      for (let k = 0; k < 3; k++) {
        const tw = t0 + (t1 - t0) * (0.25 + k * 0.25), yy = y(tw, true) + (y(tw, false) - y(tw, true)) * 0.32
        s += `<rect x="${f(ex(tw) - 10)}" y="${f(yy)}" width="20" height="${f(30 + (1 - tw) * 60)}" fill="#3a2418" opacity=".55"/>`
      }
      void x0
    }
    return s
  }
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#f2c893'], [1, '#f9e2b8']]) + lin('road', [[0, '#7a5f4d'], [1, '#33241c']]) + rad('glow', [[0, '#fff0c9', 0.9], [1, '#ffb877', 0]]) + blur('b', 3),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <circle cx="${vx}" cy="${vy}" r="${w * 0.5}" fill="url(#glow)"/>
     <polygon points="${vx - 30},${vy + 10} ${vx + 30},${vy + 10} ${w * 1.1},${h} ${-w * 0.1},${h}" fill="url(#road)"/>
     ${facade(-1)}${facade(1)}
     <g transform="translate(${w * 0.5 - 170}, ${h * 0.72})">
       <ellipse cx="170" cy="190" rx="190" ry="26" fill="#000" opacity=".38" filter="url(#b)"/>
       <path d="M10,150 Q10,110 60,100 L110,58 Q130,42 160,42 L235,42 Q262,44 280,66 L312,98 Q336,104 336,138 L336,166 L10,166 Z" fill="#b62e22"/>
       <path d="M122,64 L150,52 L236,52 Q252,54 262,68 L282,96 L108,96 Z" fill="#2a1a17" opacity=".82"/>
       <path d="M10,120 L336,120" stroke="#e8746a" stroke-width="3" opacity=".5"/>
       <circle cx="76" cy="168" r="32" fill="#1a1210"/><circle cx="76" cy="168" r="15" fill="#8d8071"/>
       <circle cx="266" cy="168" r="32" fill="#1a1210"/><circle cx="266" cy="168" r="15" fill="#8d8071"/>
       <rect x="8" y="128" width="20" height="18" rx="4" fill="#f7e2ac"/>
     </g>
     ${vignette(w, h, 0.5)}`)
  void r
  await finish(name, svg, w, h)
}

async function dunes(name, seed, w = 1200, h = 1200) {
  const layers = [0.42, 0.52, 0.62, 0.74, 0.88]
  const cols = [['#e9b784', '#a56b4a'], ['#e0a06f', '#8f5a3d'], ['#d18d5f', '#7a4b33'], ['#b9764b', '#5f3a28'], ['#8f5a3d', '#3f271b']]
  const body = layers.map((y, i) =>
    `<path d="${ridge(w, h, h * y, 55 + i * 18, seed + i * 9, { peaks: 1.6 + i * 0.3, rough: 0.35 })}" fill="url(#d${i})"/>`).join('')
  const defs = cols.map((c, i) => lin(`d${i}`, [[0, c[0]], [1, c[1]]], 0.35, 1)).join('')
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#f6d7a8'], [1, '#fbe9c8']]) + defs,
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>${body}${vignette(w, h, 0.5)}`)
  await finish(name, svg, w, h)
}

async function cityDusk(name, seed, pal, w = 1500, h = 1000) {
  const r = rng(seed)
  let b = ''
  const build = (baseY, minH, maxH, color, lit) => {
    let x = -20
    while (x < w + 20) {
      const bw = 50 + r() * 110, bh = minH + r() * (maxH - minH)
      b += `<rect x="${f(x)}" y="${f(baseY - bh)}" width="${f(bw)}" height="${f(bh + 400)}" fill="${color}"/>`
      if (lit) for (let k = 0; k < bw * bh / 900; k++) {
        if (r() < 0.32) b += `<rect x="${f(x + 6 + r() * (bw - 14))}" y="${f(baseY - bh + 8 + r() * (bh - 16))}" width="5" height="7" fill="#ffd489" opacity="${0.45 + r() * 0.5}"/>`
      }
      x += bw + r() * 6
    }
  }
  build(h * 0.72, 90, 300, pal.back, false)
  build(h * 0.86, 120, 420, pal.front, true)
  const svg = svgWrap(w, h,
    lin('sky', pal.sky) + rad('glow', [[0, pal.glow, 0.85], [1, pal.glow, 0]]),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <ellipse cx="${w * 0.35}" cy="${h * 0.7}" rx="${w * 0.6}" ry="${h * 0.3}" fill="url(#glow)"/>${b}${vignette(w, h, 0.55)}`)
  await finish(name, svg, w, h)
}

async function windowLight(name, w = 1000, h = 1250) {
  const panes = []
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) {
    const x = 140 + i * 210 + k * 60, y = 180 + k * 245
    panes.push(`<polygon points="${x},${y} ${x + 170},${y - 30} ${x + 170},${y + 190} ${x},${y + 220}" fill="#ffd9a0" opacity=".82"/>`)
  }
  const svg = svgWrap(w, h,
    lin('wall', [[0, '#d8c0a0'], [1, '#a98462']]) + blur('b', 9) + blur('b2', 3) + rad('warm', [[0, '#ffe6b8', 0.6], [1, '#ffcf8f', 0]]),
    `<rect width="${w}" height="${h}" fill="url(#wall)"/>
     <ellipse cx="${w * 0.5}" cy="${h * 0.45}" rx="${w * 0.7}" ry="${h * 0.5}" fill="url(#warm)"/>
     <g filter="url(#b2)">${panes.join('')}</g>
     <g fill="#3d2a1c" opacity=".38" filter="url(#b)">
       <ellipse cx="300" cy="900" rx="120" ry="34" transform="rotate(-24 300 900)"/><ellipse cx="410" cy="830" rx="110" ry="30" transform="rotate(18 410 830)"/>
       <ellipse cx="520" cy="960" rx="130" ry="36" transform="rotate(-8 520 960)"/><ellipse cx="640" cy="880" rx="100" ry="28" transform="rotate(28 640 880)"/>
     </g>
     ${vignette(w, h, 0.6)}`)
  await finish(name, svg, w, h)
}

async function nightSky(name, seed, w = 1500, h = 1000) {
  const r = rng(seed)
  let stars = ''
  for (let i = 0; i < 380; i++) {
    const x = r() * w, y = r() * h * 0.75, big = r() < 0.06
    stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${big ? 1.9 : 0.5 + r() * 0.9}" fill="#fdf1d8" opacity="${0.25 + r() * 0.7}"/>`
  }
  const svg = svgWrap(w, h,
    lin('sky', [[0, '#0d1424'], [0.6, '#2a2a4a'], [1, '#6b4a4e']]) + blur('b', 38) + rad('tent', [[0, '#ffc47a', 0.9], [1, '#ffc47a', 0]]),
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     <ellipse cx="${w * 0.5}" cy="${h * 0.35}" rx="${w * 0.62}" ry="${h * 0.07}" fill="#c9b7d8" opacity=".28" filter="url(#b)" transform="rotate(-24 ${w * 0.5} ${h * 0.35})"/>
     ${stars}
     <path d="${ridge(w, h, h * 0.86, 90, seed, { peaks: 3 })}" fill="#0a0b12"/>
     <circle cx="${w * 0.62}" cy="${h * 0.89}" r="70" fill="url(#tent)"/>
     <polygon points="${w * 0.6},${h * 0.9} ${w * 0.62},${h * 0.865} ${w * 0.64},${h * 0.9}" fill="#ffb562"/>
     ${vignette(w, h, 0.4)}`)
  await finish(name, svg, w, h, { grain: 0.26 })
}

/* ---------- project covers (abstract, 16:10) ---------- */
async function cover(name, seed, kind, pal, w = 1280, h = 800) {
  const r = rng(seed)
  let shapes = ''
  if (kind === 'rings') {
    for (let i = 0; i < 9; i++) shapes += `<circle cx="${w * 0.62}" cy="${h * 0.5}" r="${60 + i * 44}" fill="none" stroke="${pal.fg}" stroke-width="${i % 3 === 0 ? 2.5 : 1}" opacity="${0.75 - i * 0.07}"/>`
    shapes += `<circle cx="${w * 0.62}" cy="${h * 0.5}" r="34" fill="${pal.accent}"/>`
  } else if (kind === 'grid') {
    for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) {
      const tw = 150 + (r() < 0.3 ? 60 : 0)
      shapes += `<rect x="${140 + i * 170}" y="${120 + k * 160}" width="${tw}" height="128" rx="6" fill="${r() < 0.25 ? pal.accent : pal.fg}" opacity="${0.18 + r() * 0.5}"/>`
    }
  } else if (kind === 'bars') {
    for (let i = 0; i < 16; i++) {
      const bh = 120 + r() * 380
      shapes += `<rect x="${130 + i * 66}" y="${h - 130 - bh}" width="34" height="${bh}" rx="3" fill="${i === 11 ? pal.accent : pal.fg}" opacity="${i === 11 ? 1 : 0.35 + r() * 0.35}"/>`
    }
    shapes += `<path d="M130,${h * 0.55} C ${w * 0.3},${h * 0.2} ${w * 0.55},${h * 0.7} ${w - 130},${h * 0.3}" fill="none" stroke="${pal.accent}" stroke-width="3"/>`
  } else if (kind === 'swatches') {
    for (let i = 0; i < 5; i++) shapes += `<rect x="${150 + i * 200}" y="${h * 0.28}" width="170" height="${h * 0.44}" rx="${i * 8}" fill="${i === 2 ? pal.accent : pal.fg}" opacity="${0.9 - i * 0.15}"/>`
  } else {
    for (let i = 0; i < 60; i++) shapes += `<circle cx="${r() * w}" cy="${r() * h}" r="${2 + r() * 26}" fill="${r() < 0.2 ? pal.accent : pal.fg}" opacity="${0.1 + r() * 0.35}"/>`
    shapes += `<path d="M0,${h * 0.7} C ${w * 0.3},${h * 0.5} ${w * 0.6},${h * 0.95} ${w},${h * 0.6} L${w},${h} L0,${h} Z" fill="${pal.fg}" opacity=".25"/>`
  }
  const svg = svgWrap(w, h,
    lin('bg', [[0, pal.bg0], [1, pal.bg1]], 1, 1),
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>${shapes}${vignette(w, h, 0.35)}`)
  await finish(name, svg, w, h, { grain: 0.12, fade: 1 })
}

/* ---------- run ---------- */
console.log('placeholder photographs')
await ridgeGold('ridge-gold', 11, { sky: [[0, '#f5cf9b'], [0.5, '#f0a468'], [1, '#c26a48']], sun: '#ffbe73', mist: '#e9b58a', ridges: ['#c98d6d', '#a8694f', '#7d4a3b', '#4b2c27', '#24140f'] })
await pinesMist('pines-mist', 21)
await roadLong('road-long', 31)
await pathFigure('path-figure', 41)
await coastHeadland('coast-headland', 51)
await streetCar('street-car', 61)
await dunes('dunes', 71)
await cityDusk('city-dusk', 81, { sky: [[0, '#41586a'], [0.55, '#d59a6c'], [1, '#f5c88a']], glow: '#ffbd7a', back: '#3a3038', front: '#1d1519' })
await windowLight('window-light')
await nightSky('night-sky', 91)

console.log('video posters')
await ridgeGold('reel-01', 101, { sky: [[0, '#91b1b8'], [0.55, '#efd1a2'], [1, '#d99a6a']], sun: '#ffe1a6', mist: '#f0ddba', ridges: ['#9fb0aa', '#7c918b', '#566c66', '#33443f', '#15201d'] }, 1600, 900)
await cityDusk('reel-02', 111, { sky: [[0, '#1c2440'], [0.6, '#a25f63'], [1, '#f2a36a']], glow: '#ff9a63', back: '#2b2334', front: '#120e16' }, 1600, 900)

console.log('project covers')
await cover('proj-1', 3, 'rings', { bg0: '#2b1d14', bg1: '#5a3a24', fg: '#f0d9b5', accent: '#e0a35b' })
await cover('proj-2', 5, 'grid', { bg0: '#14201f', bg1: '#284340', fg: '#cfe3d8', accent: '#e8b877' })
await cover('proj-3', 7, 'bars', { bg0: '#241826', bg1: '#4a2f47', fg: '#ecd5e6', accent: '#f0b36b' })
await cover('proj-4', 9, 'swatches', { bg0: '#22251b', bg1: '#4a5033', fg: '#e5e0c2', accent: '#e0a35b' })
await cover('proj-5', 13, 'dots', { bg0: '#191d2a', bg1: '#31384f', fg: '#d8dcea', accent: '#e8a862' })
console.log('done ->', out)
