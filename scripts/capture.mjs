// Dev helper: renders chosen moments of the journey in headless Edge/Chrome and saves screenshots,
// plus real frame-time measurements of scroll segments. Needs the dev server running (npm run dev).
//
//   node scripts/capture.mjs 0 110 125 140          -> source/_cap-<vh>.png
//   node scripts/capture.mjs --perf                  -> frame timing while scrolling the whole journey
//   BROWSER="C:/path/to/chrome.exe" URL=http://127.0.0.1:5173 node scripts/capture.mjs ...
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const executablePath = candidates.find((p) => fs.existsSync(p))
if (!executablePath) throw new Error('no Chromium browser found; set BROWSER=')

const url = process.env.URL || 'http://127.0.0.1:5173/'
const args = process.argv.slice(2)
const perf = args.includes('--perf')
const W = Number(process.env.W || 1440)
const H = Number(process.env.H || 900)

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  userDataDir: path.join(process.env.TEMP || '/tmp', `room-capture-${process.pid}`),
  args: [`--window-size=${W},${H}`, '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForSelector('.loader.is-done, .m-stage.is-ready', { timeout: 20000 })
if (process.env.OUTLINE) await page.addStyleTag({ content: '.plane .hs{outline:2px solid #3f6;outline-offset:-1px} .plane .hs__hit{background:rgba(60,255,100,.18)!important}' })
await new Promise((r) => setTimeout(r, 400))
const info = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2')
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a'
})
console.log('renderer:', info)

if (perf) {
  // scroll the page like a user would (smooth wheel), and record frame intervals + our own JS cost
  const segsArg = process.env.SEGS
    ? process.env.SEGS.split(',').map((x) => { const [a, b] = x.split('-').map(Number); return [`${a}-${b}`, a, b] })
    : null
  const result = await page.evaluate(async (custom) => {
    const e = window.__room.engine
    const cost = []
    const orig = e.render.bind(e)
    e.render = (t) => {
      const a = performance.now()
      orig(t)
      cost.push(performance.now() - a)
    }
    const segs = custom || [
      ['intro + dollies', 0, 330],
      ['pc', 330, 700],
      ['camera + gallery', 700, 1070],
      ['back out + wall + outro', 1070, 1510],
    ]
    const out = []
    for (const [label, a, b] of segs) {
      e.scrollToVh(a, { immediate: true })
      await new Promise((r) => setTimeout(r, 600))
      cost.length = 0
      const d = []
      let last = performance.now()
      let run = true
      const tick = (now) => {
        d.push(now - last)
        last = now
        if (run) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const dur = Math.max(2, (b - a) / 60)
      e.scrollToVh(b, { duration: dur })
      await new Promise((r) => setTimeout(r, dur * 1000 + 300))
      run = false
      d.shift()
      const s = [...d].sort((x, y) => x - y)
      const c = [...cost].sort((x, y) => x - y)
      out.push({
        label,
        frames: d.length,
        fps: +(1000 / (d.reduce((x, y) => x + y, 0) / d.length)).toFixed(1),
        p95ms: +s[Math.floor(s.length * 0.95)].toFixed(1),
        jank: d.filter((x) => x > 25).length,
        jsAvg: +(cost.reduce((x, y) => x + y, 0) / cost.length).toFixed(2),
        jsP95: +c[Math.floor(c.length * 0.95)].toFixed(2),
      })
    }
    e.render = orig
    return out
  }, segsArg)
  console.table(result)
} else {
  for (const a of args) {
    const vh = Number(a)
    await page.evaluate((v) => (window.__room ? window.__room.engine.scrollToVh(v, { immediate: true }) : window.scrollTo(0, (v / 100) * innerHeight)), vh)
    await new Promise((r) => setTimeout(r, Number(process.env.SETTLE || 900)))
    if (process.env.HOVER) {
      const [hx, hy] = process.env.HOVER.split(',').map(Number)
      await page.mouse.move(hx, hy)
      await new Promise((r) => setTimeout(r, 900))
    }
    const file = path.join(root, 'source', `_cap-${a}.png`)
    await page.screenshot({ path: file })
    console.log(file)
  }
}
if (errors.length) console.log('page errors:\n' + [...new Set(errors)].join('\n'))
await browser.close()

