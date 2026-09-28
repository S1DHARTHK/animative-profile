import { ANGLES, IMAGE_ASPECT, type AngleId } from '../room/angles'

/** Layers are drawn slightly larger than "cover" so mouse sway never reveals an edge. */
export const OVERSCAN = 1.04

export interface Metrics {
  vw: number
  vh: number
  /** size of a layer box in px (already includes overscan) */
  Wb: number
  Hb: number
}

export function measure(): Metrics {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const Wb = Math.max(vw, vh * IMAGE_ASPECT) * OVERSCAN
  return { vw, vh, Wb, Hb: Wb / IMAGE_ASPECT }
}

/**
 * A "view" places image point (u,v) at screen point (X·vw, Y·vh) with the layer scaled by s.
 * Everything the camera does is a tween of these five numbers per layer.
 */
export interface View {
  u: number
  v: number
  X: number
  Y: number
  s: number
}

const pick = (v: View): View => ({ u: v.u, v: v.v, X: v.X, Y: v.Y, s: v.s })

export const restView = (id: AngleId): View => ({ u: 0.5, v: ANGLES[id].vc, X: 0.5, Y: 0.5, s: 1 })

/** Screen rectangle the flat 4:3 CRT UI occupies when "docked". */
export function dockRect(m: Metrics) {
  const h = Math.min(m.vh * 0.8, m.vw * 0.88 * 0.75)
  return { cx: m.vw / 2, cy: m.vh * 0.5, w: (h * 4) / 3, h }
}

/** `close` layer zoomed so its (photographed) glass roughly fills the dock rect. */
export function dockView(m: Metrics): View {
  const g = ANGLES.close.anchor
  const d = dockRect(m)
  return { u: g.u, v: g.v, X: d.cx / m.vw, Y: d.cy / m.vh, s: d.h / (g.h * m.Hb) }
}

/** Camera on the desk (close angle). The layer clamp keeps it as centred as the image allows. */
export function cameraView(m: Metrics, zoom: number): View {
  void m
  return { u: 0.925, v: 0.735, X: 0.66, Y: 0.55, s: zoom }
}

export const PORTAL = { left: 0.47, right: 0.18, top: 0.13, bottom: 0.13 }

export function introView(m: Metrics): View {
  void m
  const a = ANGLES.far.anchor
  const cx = PORTAL.left + (1 - PORTAL.left - PORTAL.right) / 2
  return pick({ u: a.u, v: a.v, X: cx, Y: 0.52, s: 1.42 })
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
