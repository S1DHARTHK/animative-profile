import gsap from 'gsap'
import Lenis from 'lenis'
import { ANGLE_ORDER, CLOSE_GLASS, IMAGE_H, IMAGE_W, MORPHS, type AngleId } from '../room/angles'
import { RoomRenderer, type PostParams, type SceneParams } from '../room/gl/renderer'
import { imageQuadOnScreen, localScale, transitionHomography, viewHomography } from '../room/gl/camera'
import { apply, inv, mul, type Mat3, type Vec2 } from '../room/gl/mat3'
import { NAV, SCREEN_LIVE, SHUTTER_AT, GALLERY_END_AT, TOTAL_VH, chapterAt, navActive, pageAt, type NavTarget } from './chapters'
import { quadToMatrix3d, type Pt } from './homography'
import { PORTAL, clamp, dockRect, lerp, measure, smooth, type Metrics } from './metrics'
import { journey, controls } from './store'
import { buildTimeline, makeState, type FxState, type LayerState, type Layers } from './timeline'
import { createDust } from './dust'

// ── tiny cached style writer: skips DOM writes when the value didn't change ────────────────────
const cache = new WeakMap<Element, Map<string, string>>()
function sty(el: HTMLElement | null | undefined, prop: string, val: string) {
  if (!el) return
  let m = cache.get(el)
  if (!m) cache.set(el, (m = new Map()))
  if (m.get(prop) === val) return
  m.set(prop, val)
  if (prop.startsWith('--')) el.style.setProperty(prop, val)
  else (el.style as unknown as Record<string, string>)[prop] = val
}
const px = (n: number) => `${n.toFixed(2)}px`
const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)

/** per move: peak motion blur (screen px) and how wide the photo hand-over is. The geometry always morphs
 *  continuously; a narrow hand-over keeps each in-between frame drawn mostly from ONE photo (no double exposure). */
const TRAVEL = [
  { blur: 1.8, handover: [0.3, 0.7] },
  { blur: 2.6, handover: [0.36, 0.64] },
  { blur: 3.4, handover: [0.42, 0.6] },
] as const

export class RoomEngine {
  private m: Metrics = measure()
  private L!: Layers
  private fx!: FxState
  private tl!: gsap.core.Timeline
  private lenis: Lenis
  private renderer: RoomRenderer
  private planes = {} as Record<AngleId, HTMLElement>
  private mouse = { x: 0, y: 0, tx: 0, ty: 0 }
  private lastScrollAt = 0
  private galleryTarget = false
  private galleryTimer = 0
  private tickFn: (time: number) => void
  private dust: ReturnType<typeof createDust> | null = null
  private resizeTimer = 0
  private destroyed = false
  private stripTravel = 0
  private stripCells = 0
  private stripRO: ResizeObserver | null = null
  private lockCount = 0
  private dom = {} as Record<'intro' | 'scrollHint' | 'screen' | 'crt' | 'crtFlash' | 'boot' | 'app' | 'hud' | 'strip' | 'counter' | 'progress' | 'flash' | 'blackout', HTMLElement | null>
  private bootLines: HTMLElement[] = []
  /** frames left to pre-render the docked CRT behind the loader (first-time text raster happens now, not mid-scroll) */
  private prewarm = 0

  constructor(private root: HTMLElement, private spacer: HTMLElement) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    journey.set({ reducedMotion: reduced })
    this.lenis = new Lenis({
      lerp: reduced ? 1 : 0.075,
      wheelMultiplier: 0.85,
      touchMultiplier: 1.3,
      smoothWheel: !reduced,
    })
    this.lenis.stop() // until the room has loaded
    this.lenis.on('scroll', () => {
      this.lastScrollAt = performance.now()
    })
    this.tickFn = (time) => {
      this.lenis.raf(time * 1000)
      this.render(time)
    }
    gsap.ticker.lagSmoothing(0)
    gsap.ticker.add(this.tickFn)

    this.renderer = new RoomRenderer(q<HTMLCanvasElement>(root, '[data-gl]')!)
    this.collect()
    this.layout()
    this.build()

    window.addEventListener('resize', this.onResize)
    window.addEventListener('pointermove', this.onPointer, { passive: true })

    controls.goTo = (target, opts) => this.goTo(target, opts)
    controls.scrollToVh = (vh, opts) => this.scrollToVh(vh, opts)
    controls.setScrollLocked = (locked) => this.setLocked(locked)
  }

  /* ───────────────────────── setup ───────────────────────── */

  private collect() {
    const r = this.root
    for (const id of ANGLE_ORDER) this.planes[id] = q(r, `[data-plane="${id}"]`)!
    const dustCanvas = q<HTMLCanvasElement>(r, '[data-dust]')
    if (dustCanvas) this.dust = createDust(dustCanvas)
    this.dom = {
      intro: q(r, '[data-intro]'),
      scrollHint: q(r, '[data-scroll-hint]'),
      screen: q(r, '[data-screen]'),
      crt: q(r, '[data-crt]'),
      crtFlash: q(r, '[data-crt-flash]'),
      boot: q(r, '[data-boot]'),
      app: q(r, '[data-screen-app]'),
      hud: q(r, '[data-hud]'),
      strip: q(r, '[data-strip]'),
      counter: q(r, '[data-strip-counter]'),
      progress: q(r, '[data-progress]'),
      flash: q(r, '[data-flash]'),
      blackout: q(r, '[data-blackout]'),
    }
    this.bootLines = [...r.querySelectorAll<HTMLElement>('[data-boot-line]')]
    // the strip's travel distance only changes with layout — measure it off the frame loop
    const strip = this.dom.strip
    if (strip) {
      const measureStrip = () => {
        this.stripTravel = Math.max(0, strip.scrollWidth - window.innerWidth)
        this.stripCells = strip.querySelectorAll('[data-cell]').length
      }
      this.stripRO = new ResizeObserver(measureStrip)
      this.stripRO.observe(strip)
      measureStrip()
    }
  }

  private get range() {
    return (TOTAL_VH / 100) * this.m.vh
  }

  private layout() {
    this.m = measure()
    this.renderer.resize(this.m.vw, this.m.vh)
    sty(this.spacer, 'height', px(this.range + this.m.vh))
    this.dust?.resize()
  }

  private build() {
    this.tl?.kill()
    const { L, fx } = makeState(this.m)
    this.L = L
    this.fx = fx
    this.tl = buildTimeline(L, fx, this.m)
  }

  /** Loads the room's photographs + view-morph data onto the GPU, then pre-rasterises the CRT behind the loader. */
  async load() {
    await this.renderer.load()
    this.prewarm = 4
    await new Promise((r) => setTimeout(r, 120))
  }

  /* ───────────────────────── input ───────────────────────── */

  private onResize = () => {
    clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(() => {
      const t = this.tl.time()
      if (this.dom.strip) this.stripTravel = Math.max(0, this.dom.strip.scrollWidth - window.innerWidth)
      this.layout()
      this.build()
      this.lenis.resize()
      this.lenis.scrollTo((t / TOTAL_VH) * this.range, { immediate: true, force: true })
    }, 160)
  }

  private onPointer = (e: PointerEvent) => {
    this.mouse.tx = (e.clientX / window.innerWidth) * 2 - 1
    this.mouse.ty = (e.clientY / window.innerHeight) * 2 - 1
  }

  /* ───────────────────────── public api ───────────────────────── */

  ready() {
    journey.set({ ready: true })
    if (this.lockCount === 0) this.lenis.start()
  }

  scrollToVh(vh: number, opts: { duration?: number; immediate?: boolean } = {}) {
    const y = (vh / 100) * this.m.vh
    const cur = this.lenis.scroll / (this.m.vh / 100)
    const dist = Math.abs(vh - cur)
    const duration = opts.duration ?? clamp(dist / 150, 2.4, 5.5)
    this.lenis.scrollTo(y, {
      duration,
      immediate: !!opts.immediate,
      force: true,
      easing: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    })
  }

  goTo(target: NavTarget | number, opts?: { duration?: number }) {
    const vh = typeof target === 'number' ? target : NAV.find((n) => n.id === target)!.at
    this.scrollToVh(vh, opts)
  }

  setLocked(locked: boolean) {
    this.lockCount = Math.max(0, this.lockCount + (locked ? 1 : -1))
    if (this.lockCount > 0) this.lenis.stop()
    else if (journey.get().ready) this.lenis.start()
  }

  /** Current timeline position in vh (for tests / debugging). */
  time() {
    return this.tl.time()
  }

  destroy() {
    this.destroyed = true
    gsap.ticker.remove(this.tickFn)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('pointermove', this.onPointer)
    clearTimeout(this.resizeTimer)
    clearTimeout(this.galleryTimer)
    this.stripRO?.disconnect()
    this.tl.kill()
    this.lenis.destroy()
    this.renderer.destroy()
  }

  /* ───────────────────────── time-based events ───────────────────────── */

  private updateGallery(t: number) {
    const want = t >= SHUTTER_AT && t < GALLERY_END_AT
    if (want === this.galleryTarget) return
    this.galleryTarget = want
    clearTimeout(this.galleryTimer)
    // wait for the scroll to settle so a fast fly-by doesn't fire the shutter
    this.galleryTimer = window.setTimeout(() => {
      if (this.destroyed || this.galleryTarget !== want) return
      this.fireShutter(want)
    }, 240)
  }

  private fireShutter(opening: boolean) {
    if (journey.get().galleryOn === opening) return
    const flash = this.dom.flash
    const black = this.dom.blackout
    const tl = gsap.timeline()
    if (opening) {
      tl.to(black, { opacity: 0.92, duration: 0.05, ease: 'none' })
        .to(black, { opacity: 0, duration: 0.07, ease: 'none' })
        .fromTo(flash, { opacity: 0 }, { opacity: 0.88, duration: 0.06, ease: 'power2.out' }, '<')
        .call(() => journey.set({ galleryOn: true }), [], '<0.04')
        .to(flash, { opacity: 0, duration: 0.7, ease: 'power2.out' })
    } else {
      tl.to(black, { opacity: 0.55, duration: 0.09, ease: 'none' })
        .call(() => journey.set({ galleryOn: false }), [], '<')
        .to(black, { opacity: 0, duration: 0.4, ease: 'power1.out' })
    }
  }

  /* ───────────────────────── per-frame render ───────────────────────── */

  private render(time: number) {
    if (this.destroyed) return
    const { m, L, fx } = this
    const { vw, vh } = m

    // scroll → timeline. Lenis is the only smoothing stage (no second scrub lag on top).
    const target = clamp(this.lenis.scroll / this.range, 0, 1) * TOTAL_VH
    if (Math.abs(target - this.tl.time()) > 1e-4) this.tl.time(target)
    const t = this.tl.time()

    // pointer sway (eased) — a whisper of camera rotation; disabled while docked / aiming
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.05
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.05
    const reduced = journey.get().reducedMotion
    const swayK = reduced ? 0 : 1 - clamp(fx.dock * 1.5 + fx.hud, 0, 1)
    const swayPx: Vec2 = [(this.mouse.x * 10 + Math.sin(time * 0.33) * 2.4) * swayK, (this.mouse.y * 6 + Math.cos(time * 0.27) * 1.8) * swayK]
    const sway = (s: LayerState): Vec2 => [swayPx[0] / (s.s * m.Wb), swayPx[1] / (s.s * m.Hb)]

    // discrete state for React
    const moving = performance.now() - this.lastScrollAt < 160 || Math.abs(this.lenis.velocity) > 0.35
    journey.set({
      moving,
      chapter: chapterAt(t),
      nav: navActive(t),
      screenPage: pageAt(t),
      screenLive: t >= SCREEN_LIVE.from && t < SCREEN_LIVE.to && fx.dock > 0.98 && fx.power > 0.98,
    })
    this.updateGallery(t)

    /* ── camera: one angle, or synthesised frames between two ── */
    const shot = clamp(fx.shot, 0, ANGLE_ORDER.length - 1)
    let k = Math.floor(shot)
    let p = shot - k
    if (k >= ANGLE_ORDER.length - 1) {
      k = ANGLE_ORDER.length - 1
      p = 0
    }
    if (p > 0.9995) {
      k += 1
      p = 0
    }
    const single = p < 0.0005
    const idA = ANGLE_ORDER[k]
    const SA = viewHomography(idA, L[idA], m, sway(L[idA]))
    let scene: SceneParams
    let look: LayerState = L[idA]
    let S: Mat3 = SA // screen → image, for the single angle
    let travelBlur = 0
    if (single) {
      scene = { mode: 'single', angle: idA, S: SA, sharp: true }
    } else {
      const idB = ANGLE_ORDER[k + 1]
      const SB = viewHomography(idB, L[idB], m, sway(L[idB]))
      const G = transitionHomography(SA, SB, MORPHS[k].H, p, m)
      const toClip: Mat3 = [2 / vw, 0, -1, 0, -2 / vh, 1, 0, 0, 1]
      let P = mul(toClip, inv(G))
      if (P[6] * 0.5 + P[7] * 0.5 + P[8] < 0) P = P.map((v) => -v)
      const tr = TRAVEL[k]
      scene = { mode: 'transition', pair: k, P, t: p, mix: smooth(tr.handover[0], tr.handover[1], p) }
      look = lerpState(L[idA], L[idB], p)
      S = SB
      travelBlur = Math.pow(Math.sin(Math.PI * p), 1.5) * TRAVEL[k].blur
    }

    /* ── lens + film ── */
    const focusC = apply(inv(S), [look.fu, look.fv])
    const e = fx.portal
    const post: PostParams = {
      blur: look.blur * look.s + travelBlur,
      dim: look.dim,
      focus: [focusC[0], focusC[1], (look.frx / 100) * m.Wb * look.s, (look.fry / 100) * m.Hb * look.s],
      focusAmt: single ? look.fa : 0,
      vignette: clamp(0.55 + fx.vignette * 0.75, 0, 1),
      grain: 0.045,
      time: reduced ? 0 : time,
      portal: [lerp(PORTAL.left * vw, 0, e), lerp(PORTAL.top * vh, 0, e), vw - lerp(PORTAL.right * vw, 0, e), vh - lerp(PORTAL.bottom * vh, 0, e)],
      portalOpen: e,
      glow: clamp(1 - e * 1.25, 0, 1),
    }
    this.renderer.render(scene, post)

    /* ── hotspot planes: the DOM layer that sits exactly on the photo (hover, click, labels) ── */
    const ui = journey.get()
    const interactive = single && !moving && fx.portal > 0.97 && fx.dock < 0.02 && fx.hud < 0.05 && !ui.galleryOn && !ui.lightbox
    for (const id of ANGLE_ORDER) {
      const el = this.planes[id]
      const on = single && id === idA
      sty(el, 'visibility', on ? 'visible' : 'hidden')
      el.classList.toggle('is-active', on && interactive)
      if (!on) continue
      sty(el, 'transform', quadToMatrix3d(IMAGE_W, IMAGE_H, imageQuadOnScreen(SA)))
      sty(el, '--inv', (1 / localScale(SA, m)).toFixed(4))
      sty(el, '--rest', (1 - smooth(0.015, 0.09, Math.abs(L[id].s - 1))).toFixed(3))
    }
    sty(this.root, '--hint', fx.hint.toFixed(3))
    sty(this.root, '--hud', fx.hud.toFixed(3))

    /* atmosphere */
    this.dust?.draw(time, fx.atmos * smooth(0.6, 1, fx.portal), this.mouse.x, this.mouse.y)

    /* intro title */
    const title = this.dom.intro
    if (title) {
      sty(title, 'opacity', clamp(1 - fx.title * 1.15, 0, 1).toFixed(3))
      sty(title, 'transform', `translate3d(${px(-fx.title * vw * 0.05)},${px(-fx.title * 30)},0) scale(${(1 + fx.title * 0.12).toFixed(3)})`)
      sty(title, 'visibility', fx.title >= 1 ? 'hidden' : 'visible')
    }
    sty(this.dom.scrollHint, 'opacity', clamp(1 - fx.title * 4, 0, 1).toFixed(3))

    /* CRT screen: perspective-mapped onto the photographed glass, morphing to a flat docked rect */
    this.renderScreen(single && idA === 'close' ? SA : viewHomography('close', L.close, m))

    /* viewfinder HUD */
    sty(this.dom.hud, 'opacity', fx.hud.toFixed(3))

    /* film strip */
    const strip = this.dom.strip
    if (strip) {
      sty(strip, 'transform', `translate3d(${px(-this.stripTravel * fx.strip)},0,0)`)
      const cells = this.stripCells
      const counter = this.dom.counter
      if (counter && cells) {
        const idx = String(Math.min(cells, Math.round(fx.strip * (cells - 1)) + 1)).padStart(2, '0')
        const txt = `${idx} / ${String(cells).padStart(2, '0')}`
        if (counter.textContent !== txt) counter.textContent = txt
      }
    }

    /* progress hairline */
    sty(this.dom.progress, 'transform', `scaleX(${(t / TOTAL_VH).toFixed(4)})`)
  }

  private renderScreen(Sclose: Mat3) {
    const { m } = this
    const screen = this.dom.screen
    if (!screen) return
    const fx = this.prewarm > 0 ? { ...this.fx, power: this.prewarm-- % 2 ? 1 : 0.6, dock: 1 } : this.fx
    const p = fx.power
    if (p < 0.008) {
      sty(screen, 'visibility', 'hidden')
      screen.classList.remove('is-live')
      return
    }
    sty(screen, 'visibility', 'visible')

    const Si = inv(Sclose)
    const glass: Pt[] = CLOSE_GLASS.map(([u, v]) => apply(Si, [u, v]))
    const dr = dockRect(m)
    const dock: Pt[] = [
      [dr.cx - dr.w / 2, dr.cy - dr.h / 2],
      [dr.cx + dr.w / 2, dr.cy - dr.h / 2],
      [dr.cx + dr.w / 2, dr.cy + dr.h / 2],
      [dr.cx - dr.w / 2, dr.cy + dr.h / 2],
    ]
    const e = fx.dock * fx.dock * (3 - 2 * fx.dock)
    const pts = glass.map((g, i) => [lerp(g[0], dock[i][0], e), lerp(g[1], dock[i][1], e)] as Pt)
    sty(screen, 'transform', quadToMatrix3d(1024, 768, pts))

    // power-on: line → open → glow bump → boot text → app
    const lineIn = smooth(0, 0.14, p)
    const open = smooth(0.14, 0.44, p)
    const bump = Math.sin(clamp((p - 0.14) / 0.34, 0, 1) * Math.PI)
    sty(this.dom.crt, 'transform', `scale(${lineIn.toFixed(4)},${lerp(0.006, 1, open).toFixed(4)})`)
    sty(this.dom.crt, '--open', open.toFixed(3))
    sty(this.dom.crtFlash, 'opacity', (bump * 0.55).toFixed(3))
    const bootO = smooth(0.4, 0.5, p) * (1 - smooth(0.86, 0.95, p))
    const appO = smooth(0.86, 0.97, p)
    sty(this.dom.boot, 'opacity', bootO.toFixed(3))
    // don't paint what can't be seen ('inherit', never 'visible': a visible child would escape a hidden screen)
    sty(this.dom.boot, 'visibility', bootO > 0.001 ? 'inherit' : 'hidden')
    sty(this.dom.app, 'opacity', appO.toFixed(3))
    sty(this.dom.app, 'visibility', appO > 0.001 ? 'inherit' : 'hidden')
    // boot lines type in with power
    const lines = this.bootLines
    const n = clamp((p - 0.44) / 0.4, 0, 1) * lines.length
    lines.forEach((l, i) => sty(l, 'opacity', i < Math.floor(n) ? '1' : i < n ? (n - i).toFixed(2) : '0'))
    // interactive only when fully docked & on
    screen.classList.toggle('is-live', fx.dock > 0.98 && p > 0.98)
  }
}

function lerpState(a: LayerState, b: LayerState, t: number): LayerState {
  const o = {} as LayerState
  for (const key of Object.keys(a) as (keyof LayerState)[]) o[key] = a[key] + (b[key] - a[key]) * t
  return o
}
