// Dev check for the 3D room: drives it like a visitor (wheel, mouse, clicks) in headless Edge/Chrome and saves
// screenshots to source/_r3d-*.png. Needs the dev server (npm run dev). Launch from PowerShell on Windows.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const exe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find((p) => fs.existsSync(p))
const W = 1440
const H = 900
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: path.join(process.env.TEMP || '/tmp', `r3d-${process.pid}`),
  args: [`--window-size=${W},${H}`, '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const f = path.join(root, 'source', `_r3d-${name}.png`)
  await page.screenshot({ path: f })
  console.log('shot', name)
}
const r3d = (expr, ...args) => page.evaluate(expr, ...args)
/** point at an object like a person would: move there, let the view settle, re-aim until it's hovered */
const aim = async (id) => {
  for (let k = 0; k < 8; k++) {
    const t = await r3d((i) => window.__room3d.at(i), id)
    if (!t) return null
    const offs = k < 3 ? [0, 0] : [((k % 3) - 1) * t.w * 0.25, (k % 2 ? -1 : 1) * t.h * 0.2]
    await page.mouse.move(t.x + offs[0], t.y + offs[1], { steps: 8 })
    await sleep(900)
    if ((await r3d(() => window.__room3d.state().hovered)) === id) return { x: t.x + offs[0], y: t.y + offs[1] }
  }
  return null
}
const wheel = async (dy, n, gap = 60) => {
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel({ deltaY: dy })
    await sleep(gap)
  }
}

await page.goto(process.env.URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle0' })
await page.waitForSelector('.loader.is-done', { timeout: 30000 })
await page.mouse.move(W / 2, H / 2)
await sleep(1500)
console.log('ids', JSON.stringify(await r3d(() => window.__room3d.ids())))
console.log('start pose', JSON.stringify(await r3d(() => window.__room3d.pose())))
await shot('01-start')

// the resume on the monitor is usable at the start: open the SKILLS page
const tab = await page.$('.m3-monitor .os__nav button:nth-child(2)')
await tab.click()
await sleep(700)
console.log('monitor page after clicking tab 2:', await page.$eval('.m3-monitor .os__path', (e) => e.textContent))
await shot('01b-start-skills')

// frame pacing during the pull-back
const fps = () =>
  page.evaluate(async (ms) => {
    const d = []
    let last = performance.now()
    await new Promise((r) => {
      const t0 = last
      const f = (now) => {
        d.push(now - last)
        last = now
        if (now - t0 < ms) requestAnimationFrame(f)
        else r()
      }
      requestAnimationFrame(f)
    })
    d.shift()
    const s = [...d].sort((a, b) => a - b)
    return { fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p95ms: +s[Math.floor(s.length * 0.95)].toFixed(1), jank: d.filter((x) => x > 25).length }
  }, 2500)
const pf = fps()

// scroll: the camera pulls back from the PC into the room
await wheel(100, 3)
await sleep(900)
await shot('02-pullback')
await wheel(100, 10)
console.log('frame pacing during pull-back:', JSON.stringify(await pf))
await sleep(600)
console.log('state', JSON.stringify(await r3d(() => window.__room3d.state())), 'pose', JSON.stringify(await r3d(() => window.__room3d.pose())))
await shot('03-room')

// look: move the mouse right, then back
await page.mouse.move(W * 0.72, H * 0.45, { steps: 12 })
await sleep(1500)
await shot('04-look-right')
await page.mouse.move(W / 2, H / 2, { steps: 12 })
await sleep(1500)

// hover the camera on the desk
console.log('aim camera ->', JSON.stringify(await aim('camera')))
await shot('05-hover-camera')

// scroll toward a wall frame (the point under the cursor) and open its photograph — or, in a room without frames,
// just move toward the computer
await sleep(400) // wheel gate after the intro
const FRAME = (await r3d(() => window.__room3d.ids())).find((i) => i.startsWith('Frame_'))
const target = FRAME ?? 'pc'
let fr = await aim(target)
console.log(`aim ${target} (far) ->`, JSON.stringify(fr))
const before = await r3d(() => window.__room3d.pose())
await wheel(100, 12, 70)
await sleep(1800)
const after = await r3d(() => window.__room3d.pose())
console.log(`moved toward ${target}:`, JSON.stringify(before.p), '->', JSON.stringify(after.p))
if (FRAME) {
  fr = await aim(FRAME)
  console.log('aim frame (near) ->', JSON.stringify(fr))
  await shot('06-near-frame-hover')

  // click the frame → photograph opens; Esc → back to the same view
  const pose0 = await r3d(() => window.__room3d.pose())
  await page.mouse.click(fr.x, fr.y)
  await sleep(1400)
  await shot('07-photo-open')
  await page.mouse.move(W - 40, 40, { steps: 8 }) // wander while it's open
  await page.keyboard.press('Escape')
  await sleep(1600)
  const pose1 = await r3d(() => window.__room3d.pose())
  console.log('pose before photo', JSON.stringify(pose0), 'after close', JSON.stringify(pose1))
  await shot('08-photo-closed')
} else console.log('no wall frames in this room — photo check skipped')

// back up, click the camera → shutter → photography/video
await page.mouse.move(W / 2, H / 2, { steps: 6 })
await sleep(800)
await wheel(-100, 8, 70)
await sleep(1600)
const c2 = await aim('camera')
console.log('aim camera ->', JSON.stringify(c2))
const poseC = await r3d(() => window.__room3d.pose())
await page.mouse.click(c2.x, c2.y)
await sleep(120)
await shot('09-shutter')
await sleep(1500)
await shot('10-camera-roll')
await wheel(120, 6, 60)
await sleep(1200)
await shot('11-camera-roll-scrolled')
await page.keyboard.press('Escape')
await sleep(900)
console.log('pose before camera', JSON.stringify(poseC), 'after', JSON.stringify(await r3d(() => window.__room3d.pose())))

// click the PC → resume/projects
const pc = await aim('pc')
console.log('aim pc ->', JSON.stringify(pc))
const poseP = await r3d(() => window.__room3d.pose())
await shot('12-hover-pc')
await page.mouse.click(pc.x, pc.y)
await sleep(1000)
await shot('13-pc-open')
await page.mouse.move(40, H - 40, { steps: 8 }) // wander while it's open
await page.keyboard.press('Escape')
await sleep(900)
console.log('pose before pc', JSON.stringify(poseP), 'after', JSON.stringify(await r3d(() => window.__room3d.pose())))
await shot('14-pc-closed')

// walls hold: point at the window wall and scroll hard toward it, then back hard into the room
await page.mouse.move(60, H / 2, { steps: 10 })
await sleep(2500) // edge-turn toward the window side
await wheel(120, 40, 30)
await sleep(2000)
const pw = await r3d(() => window.__room3d.pose())
await wheel(-120, 60, 30)
await sleep(2000)
const pb = await r3d(() => window.__room3d.pose())
const inside = (p) => p[0] > -3.5 && p[0] < 3.5 && p[2] > -4.5 && p[2] < 4.5 && p[1] > 0 && p[1] < 3.4
console.log('after 40 notches toward the wall:', JSON.stringify(pw.p), 'inside:', inside(pw.p), '| after 60 back:', JSON.stringify(pb.p), 'inside:', inside(pb.p))
const pm = fps()
await page.mouse.move(W * 0.3, H * 0.4, { steps: 30 })
await wheel(100, 10, 80)
console.log('frame pacing while looking + moving:', JSON.stringify(await pm))

if (errors.length) console.log('console:\n' + [...new Set(errors)].slice(0, 20).join('\n'))
await browser.close()
