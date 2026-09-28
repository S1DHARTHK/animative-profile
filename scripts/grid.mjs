// Dev helper: renders an angle with a labelled % grid (and optional rects) so hotspot geometry can be measured / verified.
//   node scripts/grid.mjs <angle> [scale] [zoomRect: x0,y0,x1,y1 in 0..1] [overlayJson]
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const [angle = 'desk', scaleArg = '1', zoomArg, overlayArg] = process.argv.slice(2)
const file = path.join(root, 'public', 'room', `${angle}.webp`)
const meta = await sharp(file).metadata()
const [x0, y0, x1, y1] = zoomArg && zoomArg !== '-' ? zoomArg.split(',').map(Number) : [0, 0, 1, 1]
const cw = Math.round((x1 - x0) * meta.width)
const ch = Math.round((y1 - y0) * meta.height)
const scale = Number(scaleArg)
const W = Math.round(cw * scale)
const H = Math.round(ch * scale)

const base = await sharp(file)
  .extract({ left: Math.round(x0 * meta.width), top: Math.round(y0 * meta.height), width: cw, height: ch })
  .resize(W, H, { kernel: 'lanczos3' })
  .toBuffer()

// grid step in normalized units: pick 0.05 for full, 0.01 when zoomed
const span = Math.max(x1 - x0, y1 - y0)
const step = span > 0.6 ? 0.05 : span > 0.25 ? 0.02 : 0.01
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
const fx = (u) => ((u - x0) / (x1 - x0)) * W
const fy = (v) => ((v - y0) / (y1 - y0)) * H
for (let u = Math.ceil(x0 / step) * step; u <= x1 + 1e-6; u += step) {
  const major = Math.abs(u * 100 % 10) < 1e-6 || Math.abs((u * 100) % 10 - 10) < 1e-6
  svg += `<line x1="${fx(u)}" y1="0" x2="${fx(u)}" y2="${H}" stroke="${major ? 'rgba(255,0,80,.75)' : 'rgba(0,140,255,.45)'}" stroke-width="1"/>`
  svg += `<text x="${fx(u) + 2}" y="11" font-size="10" fill="#f0f" font-family="monospace" stroke="#fff" stroke-width=".4">${(u).toFixed(2)}</text>`
}
for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-6; v += step) {
  const major = Math.abs(v * 100 % 10) < 1e-6 || Math.abs((v * 100) % 10 - 10) < 1e-6
  svg += `<line x1="0" y1="${fy(v)}" x2="${W}" y2="${fy(v)}" stroke="${major ? 'rgba(255,0,80,.75)' : 'rgba(0,140,255,.45)'}" stroke-width="1"/>`
  svg += `<text x="2" y="${fy(v) - 2}" font-size="10" fill="#f0f" font-family="monospace" stroke="#fff" stroke-width=".4">${(v).toFixed(2)}</text>`
}
if (overlayArg) {
  const shapes = JSON.parse(fs.readFileSync(overlayArg, 'utf8'))[angle] ?? {}
  for (const [id, pts] of Object.entries(shapes)) {
    const p = pts.map(([u, v]) => `${fx(u)},${fy(v)}`).join(' ')
    svg += `<polygon points="${p}" fill="rgba(0,255,120,.15)" stroke="#0f6" stroke-width="2"/>`
    svg += `<text x="${fx(pts[0][0])}" y="${fy(pts[0][1]) - 4}" font-size="12" fill="#0f6" stroke="#000" stroke-width=".5" font-family="monospace">${id}</text>`
  }
}
svg += '</svg>'
const outFile = path.join(root, 'source', `_grid-${angle}.png`)
await sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(outFile)
console.log(outFile, W, H)
