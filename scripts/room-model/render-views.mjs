// Dev helper: renders public/models/room.glb from its stored viewpoints (and any extra ones) in headless
// Edge/Chrome via scripts/room-model/viewer.html. Needs the dev server (npm run dev).
//   node scripts/room-model/render-views.mjs                         -> source/_model-<view>.png
//   node scripts/room-model/render-views.mjs "back=pos:0.3,1.6,-2.6;look:0.3,1.4,4.4;fov:60"
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const exe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find((p) => fs.existsSync(p))
const base = (process.env.URL || 'http://127.0.0.1:5173') + '/scripts/room-model/viewer.html'
const W = Number(process.env.W || 1600)
const H = Number(process.env.H || 900)

const extra = process.argv.slice(2).map((a) => {
  const [name, spec] = a.split('=')
  const o = Object.fromEntries(spec.split(';').map((kv) => kv.split(':')))
  const qs = new URLSearchParams({ pos: o.pos, look: o.look || '0,1,-2', fov: o.fov || '50', ...(o.hide ? { hide: o.hide } : {}) })
  return [name, qs.toString()]
})
const model = process.env.MODEL ? `model=${encodeURIComponent(process.env.MODEL)}&` : ''
const views = (extra.length ? extra : ['View_Doorway', 'View_Shelf', 'View_Desk', 'View_Close', 'View_Overview'].map((v) => [v, `view=${v}`])).map(([n, qs]) => [n, model + qs])

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: path.join(process.env.TEMP || '/tmp', `room-model-${process.pid}`),
  args: [`--window-size=${W},${H}`, '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
for (const [name, qs] of views) {
  await page.goto(`${base}?${qs}`, { waitUntil: 'load' })
  await page.waitForFunction('window.__ready === true', { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 400))
  const file = path.join(root, 'source', `_model-${name}.png`)
  await page.screenshot({ path: file })
  console.log(file, JSON.stringify(await page.evaluate(() => window.__info())))
}
if (errors.length) console.log('page errors:\n' + [...new Set(errors)].join('\n'))
await browser.close()
