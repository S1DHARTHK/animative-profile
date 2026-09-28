// Virtual camera over a photograph.
//
// Each photo is treated as the image of a pinhole camera (horizontal FOV = ANGLES[id].hfov). A "view" — image
// point (u,v) at screen point (X,Y) with zoom s, the same numbers the timeline tweens — becomes a real camera
// ROTATION (yaw/pitch) plus focal length, so pans and tilts show true perspective change instead of an image
// sliding past. At rest (no pan) the mapping is exactly the flat "cover" framing.
//
// Everything here produces homographies  S: screen CSS px  →  normalised image coords (u,v ∈ 0..1).

import { ANGLES, IMAGE_H, IMAGE_W, type AngleId } from '../angles'
import type { Metrics, View } from '../../animation/metrics'
import { apply, inv, mul, polyArea, quadToQuad, type Mat3, type Vec2 } from './mat3'

const DEG = Math.PI / 180
/** Share of a pan done by ROTATING the camera (true perspective swing); the rest is lens shift (flat). A photo only
 *  covers its own field of view, so a pure rotation can't reach framings near its edges; this mix keeps the feel
 *  of a turning camera while every framing stays inside the picture. */
const ROTATE_SHARE = 0.55

function rotation(yaw: number, pitch: number): Mat3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const Ry: Mat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy]
  const Rx: Mat3 = [1, 0, 0, 0, cp, sp, 0, -sp, cp]
  return mul(Ry, Rx)
}

export function screenCorners(m: Metrics): Vec2[] {
  return [
    [0, 0],
    [m.vw, 0],
    [m.vw, m.vh],
    [0, m.vh],
  ]
}

/** Screen → image homography for an angle framed by `view`. `sway` nudges the aim (image units). */
export function viewHomography(id: AngleId, view: View, m: Metrics, sway: Vec2 = [0, 0]): Mat3 {
  const A = ANGLES[id]
  const fI = IMAGE_W / 2 / Math.tan((A.hfov * DEG) / 2) // photo focal length, image px
  const k = (m.Wb / IMAGE_W) * view.s // screen px per image px
  const fS = fI * k
  const cx = m.vw / 2
  const cy = m.vh / 2 + (0.5 - A.vc) * IMAGE_H * k // principal point shift keeps rest framing flat (no keystone)
  const KI: Mat3 = [fI / IMAGE_W, 0, 0.5, 0, fI / IMAGE_H, 0.5, 0, 0, 1]

  // image point the camera is aimed at (flat approximation of the view): rotate part of the way, shift the rest
  let up = view.u + (cx - view.X * m.vw) / (view.s * m.Wb) + sway[0]
  let vp = view.v + (cy - view.Y * m.vh) / (view.s * m.Hb) + sway[1]
  const corners = screenCorners(m)
  let S: Mat3 = KI
  for (let iter = 0; iter < 6; iter++) {
    const ou = up - 0.5
    const ov = vp - 0.5
    const x = (ROTATE_SHARE * ou * IMAGE_W) / fI
    const y = (ROTATE_SHARE * ov * IMAGE_H) / fI
    const px = cx - (1 - ROTATE_SHARE) * ou * view.s * m.Wb
    const py = cy - (1 - ROTATE_SHARE) * ov * view.s * m.Hb
    const KSinv: Mat3 = [1 / fS, 0, -px / fS, 0, 1 / fS, -py / fS, 0, 0, 1]
    S = mul(KI, mul(rotation(Math.atan(x), Math.atan2(y, Math.sqrt(1 + x * x))), KSinv))
    // keep the frame inside the photograph (never show an edge)
    const c = corners.map((p) => apply(S, p))
    const u0 = Math.min(...c.map((p) => p[0]))
    const u1 = Math.max(...c.map((p) => p[0]))
    const v0 = Math.min(...c.map((p) => p[1]))
    const v1 = Math.max(...c.map((p) => p[1]))
    const du = u1 - u0 > 1 ? 0.5 - (u0 + u1) / 2 : u0 < 0 ? -u0 : u1 > 1 ? 1 - u1 : 0
    const dv = v1 - v0 > 1 ? 0.5 - (v0 + v1) / 2 : v0 < 0 ? -v0 : v1 > 1 ? 1 - v1 : 0
    if (Math.abs(du) < 1e-5 && Math.abs(dv) < 1e-5) break
    up += du * 1.02
    vp += dv * 1.02
  }
  return S
}

/**
 * Camera for the in-between frames of a move from angle A to angle B, expressed in B's image frame:
 * screen → normalised B coords. At g=0 it shows exactly A's framing (through the A→B plane homography H),
 * at g=1 exactly B's. In between, the frame corners travel with geometric (constant-rate) zoom about a
 * fixed point, which is what a real dolly/zoom looks like.
 */
export function transitionHomography(SA: Mat3, SB: Mat3, H: Mat3, g: number, m: Metrics): Mat3 {
  const scr = screenCorners(m)
  const HA = mul(H, SA)
  const q0 = scr.map((p) => apply(HA, p))
  const q1 = scr.map((p) => apply(SB, p))
  const cen = (q: Vec2[]): Vec2 => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4]
  const c0 = cen(q0)
  const c1 = cen(q1)
  const s0 = Math.sqrt(polyArea(q0))
  const s1 = Math.sqrt(polyArea(q1))
  const s = s0 * Math.pow(s1 / s0, g)
  const w = Math.abs(s1 - s0) > 1e-6 ? (s - s0) / (s1 - s0) : g
  const c: Vec2 = [c0[0] + (c1[0] - c0[0]) * w, c0[1] + (c1[1] - c0[1]) * w]
  const q = q0.map((p, i): Vec2 => {
    const n0x = (p[0] - c0[0]) / s0
    const n0y = (p[1] - c0[1]) / s0
    const n1x = (q1[i][0] - c1[0]) / s1
    const n1y = (q1[i][1] - c1[1]) / s1
    return [c[0] + s * (n0x + (n1x - n0x) * g), c[1] + s * (n0y + (n1y - n0y) * g)]
  })
  return quadToQuad(scr, q)
}

/** image (normalised) → screen: where the 4 image corners land, for CSS matrix3d on DOM overlays. */
export function imageQuadOnScreen(S: Mat3): Vec2[] {
  const Si = inv(S)
  return (
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as Vec2[]
  ).map((p) => apply(Si, p))
}

/** screen px per image px near the centre of the screen (for scaling blur radii, dot sizes…). */
export function localScale(S: Mat3, m: Metrics) {
  const Si = inv(S)
  const c: Vec2 = apply(S, [m.vw / 2, m.vh / 2])
  const a = apply(Si, c)
  const b = apply(Si, [c[0] + 0.01, c[1]])
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.01 * IMAGE_W)
}
