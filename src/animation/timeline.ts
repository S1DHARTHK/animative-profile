// The master camera timeline. Time unit = vh of scroll (see chapters.ts).
// All tweens target plain "proxy" objects; engine.ts turns them into a WebGL frame + DOM writes each frame.
//
// `fx.shot` is the camera's position along the physical path far(0) → mid(1) → desk(2) → close(3). Between two
// integers the renderer synthesises in-between frames (view morph), so a dolly is literally one number moving.
// Authoring rule: tweens for one target are written in chronological order — `move` remembers the last value
// per property, so every tween gets an explicit, correct `from` (this makes scrubbing/jumping deterministic).

import gsap from 'gsap'
import { ANGLES, ANGLE_ORDER, CLOSE_CAMERA, type AngleId } from '../room/angles'
import { M, TOTAL_VH, type Mark } from './chapters'
import { cameraView, dockView, introView, restView, type Metrics, type View } from './metrics'

export interface LayerState extends View {
  /** depth-of-field blur in image px (scaled with the zoom on screen) */
  blur: number
  /** 1 = full brightness, 0 = black */
  dim: number
  /** rack focus: amount, centre (image u,v) and ellipse radii (percent of image width / height) */
  fa: number
  fu: number
  fv: number
  frx: number
  fry: number
}

export interface FxState {
  shot: number // 0 far · 1 mid · 2 desk · 3 close (fractions = in-between frames)
  portal: number // 0 doorway → 1 full-bleed
  title: number // 0 visible → 1 gone
  hint: number // hotspot hint dots
  vignette: number // extra vignette
  dock: number // camera docked on the monitor
  power: number // CRT power 0..1
  hud: number // viewfinder HUD
  strip: number // gallery travel 0..1
  atmos: number // dust motes
}

export type Layers = Record<AngleId, LayerState>

export function makeState(m: Metrics): { L: Layers; fx: FxState } {
  const L = {} as Layers
  for (const id of ANGLE_ORDER) {
    L[id] = { ...restView(id), blur: 0, dim: 1, fa: 0, fu: 0.5, fv: 0.5, frx: 30, fry: 30 }
  }
  Object.assign(L.far, introView(m), { blur: 9, dim: 0.62 })
  const fx: FxState = { shot: 0, portal: 0, title: 0, hint: 0, vignette: 0, dock: 0, power: 0, hud: 0, strip: 0, atmos: 1 }
  return { L, fx }
}

type Vals = Record<string, number>

export function buildTimeline(L: Layers, fx: FxState, m: Metrics) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
  const track = new Map<object, Vals>()
  const cur = (o: object): Vals => {
    let c = track.get(o)
    if (!c) {
      c = { ...(o as Vals) }
      track.set(o, c)
    }
    return c
  }
  const move = (o: object, at: number, dur: number, to: Vals, ease = 'none') => {
    const c = cur(o)
    const from: Vals = {}
    for (const k of Object.keys(to)) {
      from[k] = c[k]
      c[k] = to[k]
    }
    tl.fromTo(o, from, { ...to, duration: Math.max(dur, 0.001), ease, immediateRender: false }, at)
  }
  const put = (o: object, at: number, to: Vals) => move(o, at, 0.001, to)
  void m
  const rf = (id: AngleId): Vals => ({ ...restView(id) })

  const camAnchor = { fu: CLOSE_CAMERA.u, fv: CLOSE_CAMERA.v, frx: 17, fry: 24 }
  const monAnchor = { fu: ANGLES.close.anchor.u, fv: ANGLES.close.anchor.v, frx: 27, fry: 36 }

  /* ── Intro: the doorway opens, the title drifts away, focus pulls in ─────────────────────── */
  {
    const I = M.intro
    move(L.far, I.start, I.dur, rf('far'), 'power2.inOut')
    move(L.far, I.start, I.dur * 0.62, { blur: 0 }, 'power2.out')
    move(L.far, I.start, I.dur * 0.85, { dim: 1 }, 'power1.inOut')
    move(fx, I.start, I.dur * 0.9, { portal: 1 }, 'power3.inOut')
    move(fx, I.start, I.dur * 0.5, { title: 1 }, 'power2.in')
    move(fx, M.roomHold.start + 4, 16, { hint: 1 }, 'sine.inOut')
  }

  /* ── Dollies: the camera travels along the path; the renderer makes the in-between frames ── */
  const idx = (id: AngleId) => ANGLE_ORDER.indexOf(id)
  const dollyIn = (F: AngleId, N: AngleId, seg: Mark) => {
    void F
    move(fx, seg.start, seg.dur * 0.12, { hint: 0 }, 'sine.out')
    move(fx, seg.start, seg.dur, { shot: idx(N) }, 'power2.inOut')
  }
  const dollyOut = (N: AngleId, F: AngleId, seg: Mark) => {
    void N
    move(fx, seg.start, seg.dur, { shot: idx(F) }, 'power2.inOut')
  }
  const hintUp = (from: number) => move(fx, from, 14, { hint: 1 }, 'sine.inOut')

  dollyIn('far', 'mid', M.farMid)
  dollyIn('mid', 'desk', M.midDesk)
  hintUp(M.deskHold.start + 4)
  dollyIn('desk', 'close', M.deskClose)
  hintUp(M.closeHold.start + 4)

  /* ── PC: rack focus, dock, power on ──────────────────────────────────────────────────────── */
  {
    const A = M.pcApproach
    put(L.close, A.start, monAnchor)
    move(fx, A.start, A.dur * 0.15, { hint: 0 }, 'sine.out')
    move(L.close, A.start, A.dur, dockView(m) as unknown as Vals, 'power2.inOut')
    move(L.close, A.start, A.dur * 0.6, { fa: 1 }, 'sine.inOut')
    move(L.close, A.start + A.dur * 0.15, A.dur * 0.85, { blur: 4.5 }, 'sine.inOut')
    move(L.close, A.start, A.dur, { dim: 0.5 }, 'sine.inOut')
    move(fx, A.start, A.dur, { vignette: 0.5, atmos: 0.2 }, 'sine.inOut')
    move(fx, A.start + A.dur * 0.28, A.dur * 0.72, { dock: 1 }, 'power2.inOut')
    move(fx, A.start + A.dur * 0.55, A.dur * 0.45 + M.pcBoot.dur, { power: 1 }, 'none')
  }

  /* ── PC → camera: the screen shuts down and the view pans across the desk to the camera ── */
  {
    const V = M.pcLeave
    move(fx, V.start, V.dur * 0.5, { power: 0 }, 'none')
    move(fx, V.start + V.dur * 0.15, V.dur * 0.7, { dock: 0 }, 'power2.inOut')
    move(L.close, V.start + V.dur * 0.1, V.dur * 0.9, cameraView(m, 1.9) as unknown as Vals, 'power2.inOut')
    move(L.close, V.start + V.dur * 0.1, V.dur * 0.9, { ...camAnchor, dim: 0.7, blur: 5 }, 'power2.inOut')
    move(fx, V.start + V.dur * 0.1, V.dur * 0.9, { vignette: 0.55 }, 'sine.inOut')
  }

  /* ── Camera: closing in, viewfinder, AF ──────────────────────────────────────────────────── */
  {
    const C = M.camApproach
    move(L.close, C.start, C.dur, cameraView(m, 2.25) as unknown as Vals, 'sine.inOut')
    move(L.close, C.start, C.dur, { dim: 0.6, blur: 7 }, 'sine.inOut')
    move(fx, C.start, C.dur, { vignette: 0.7 }, 'sine.inOut')
    move(fx, C.start + C.dur * 0.3, C.dur * 0.6, { hud: 1 }, 'sine.inOut')
  }

  /* ── Gallery: shutter fires (time-based, engine.ts); here the room darkens and the strip travels ── */
  {
    const G = M.gallery
    move(L.close, G.start, 14, { dim: 0.14, blur: 12 }, 'power2.out')
    move(fx, G.start, 6, { hud: 0 }, 'sine.out')
    move(fx, G.start + 20, G.dur - 40, { strip: 1 }, 'none')
  }

  /* ── Camera leave: focus releases, back to the desk ──────────────────────────────────────── */
  {
    const C = M.camLeave
    move(L.close, C.start, C.dur * 0.7, { dim: 1, blur: 0, fa: 0 }, 'sine.inOut')
    move(L.close, C.start + C.dur * 0.1, C.dur * 0.9, rf('close'), 'power2.inOut')
    move(fx, C.start, C.dur * 0.8, { vignette: 0, atmos: 1 }, 'sine.inOut')
  }
  dollyOut('close', 'desk', M.outClose)

  /* ── Wall: pan across the frames ─────────────────────────────────────────────────────────── */
  {
    const wallA: Vals = { u: 0.5, v: 0.15, X: 0.5, Y: 0.36, s: 1.65 }
    const wallB: Vals = { u: 0.95, v: 0.2, X: 0.62, Y: 0.4, s: 1.45 }
    move(L.desk, M.wallIn.start, M.wallIn.dur, { ...wallA, dim: 0.94 }, 'power2.inOut')
    move(fx, M.wallIn.start, M.wallIn.dur, { vignette: 0.3 }, 'sine.inOut')
    move(L.desk, M.wallPan.start, M.wallPan.dur, wallB, 'sine.inOut')
    move(L.desk, M.wallOut.start, M.wallOut.dur, { ...rf('desk'), dim: 1 }, 'power2.inOut')
    move(fx, M.wallOut.start, M.wallOut.dur, { vignette: 0 }, 'sine.inOut')
    move(fx, M.wallIn.start, 10, { hint: 0 }, 'sine.out')
  }

  /* ── Outro: walk back out to the doorway ─────────────────────────────────────────────────── */
  dollyOut('desk', 'mid', M.outDeskMid)
  dollyOut('mid', 'far', M.outMidFar)
  hintUp(M.outroHold.start + 6)

  // pad so total duration === TOTAL_VH (1 unit = 1vh)
  tl.to({}, { duration: 0.001 }, TOTAL_VH - 0.001)
  return tl
}
