// Dev helper: renders the live 3D site from the model's stored viewpoints (the photographed angles) so the look
// can be compared with the reference photos. Needs the dev server. Launch from PowerShell on Windows.
//   node scripts/look-room3d.mjs            -> source/_look-<view>.png
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const exe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find((p) => fs.existsSync(p))
const W = 1536
const H = 1024
const browser = await puppeteer.launch({ executablePath: exe, headless: true, userDataDir: path.join(process.env.TEMP || '/tmp', `look-${process.pid}`), args: [`--window-size=${W},${H}`, '--use-angle=d3d11'], defaultViewport: { width: W, height: H } })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await page.goto(process.env.URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle0' })
await page.waitForSelector('.loader.is-done', { timeout: 30000 })
await page.mouse.move(W / 2, H / 2)
await sleep(1200)
await page.screenshot({ path: path.join(root, 'source', '_look-start.png') })
// views: stored camera names, or custom ones as "name=pos:x,y,z;look:x,y,z;fov:55" (separate several with spaces)
const views = process.argv.length > 3 || process.argv[2]?.includes('=') ? process.argv.slice(2) : (process.argv[2] || 'View_Desk,View_Shelf,View_Close,View_Doorway').split(',')
for (const spec of views) {
  const [v, pose] = spec.split('=')
  if (pose) {
    const o = Object.fromEntries(pose.split(';').map((kv) => kv.split(':')))
    await page.evaluate((p, t, f) => window.__room3d.look(p, t, f), o.pos.split(',').map(Number), o.look.split(',').map(Number), Number(o.fov || 55))
  } else await page.evaluate((n) => window.__room3d.view(n), v)
  await sleep(1500)
  await page.screenshot({ path: path.join(root, 'source', `_look-${v}.png`) })
  console.log('shot', v)
}
const fps = await page.evaluate(async () => {
  const d = []
  let last = performance.now()
  await new Promise((r) => { const t0 = last; const f = (now) => { d.push(now - last); last = now; now - t0 < 2500 ? requestAnimationFrame(f) : r() }; requestAnimationFrame(f) })
  d.shift()
  return +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1)
})
console.log('fps (idle view):', fps)
if (errors.length) console.log('console:\n' + [...new Set(errors)].slice(0, 12).join('\n'))
await browser.close()
