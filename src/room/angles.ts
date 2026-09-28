// The four camera angles of the SAME room, ordered along the physical dolly path (far → close).
// Measurements are normalised to the image (u = x/width, v = y/height). See docs/ARCHITECTURE.md.

import geometryJson from './geometry.json'
import morphsJson from './morphs.json'
import farLqip from './lqip/far.txt?raw'
import midLqip from './lqip/mid.txt?raw'
import deskLqip from './lqip/desk.txt?raw'
import closeLqip from './lqip/close.txt?raw'

export type AngleId = 'far' | 'mid' | 'desk' | 'close'
export const ANGLE_ORDER: AngleId[] = ['far', 'mid', 'desk', 'close']
export const IMAGE_W = 1602
export const IMAGE_H = 1068
export const IMAGE_ASPECT = IMAGE_W / IMAGE_H // all angles are 3:2

export interface AngleDef {
  id: AngleId
  src: string
  lqip: string
  /** The CRT glass: centre (u,v) and height `h` as a fraction of image height — used to match-cut between angles. */
  anchor: { u: number; v: number; h: number }
  /** Vertical framing bias: which image row sits at screen centre when the viewport is wider than 3:2. */
  vc: number
  /** Assumed horizontal field of view of the photo (degrees). Pans/tilts are real camera rotations with this lens. */
  hfov: number
}

export const ANGLES: Record<AngleId, AngleDef> = {
  far: { id: 'far', src: '/room/far.webp', lqip: farLqip, anchor: { u: 0.551, v: 0.514, h: 0.078 }, vc: 0.47, hfov: 74 },
  mid: { id: 'mid', src: '/room/mid.webp', lqip: midLqip, anchor: { u: 0.5556, v: 0.4835, h: 0.1104 }, vc: 0.47, hfov: 70 },
  desk: { id: 'desk', src: '/room/desk.webp', lqip: deskLqip, anchor: { u: 0.5397, v: 0.4628, h: 0.1477 }, vc: 0.455, hfov: 64 },
  close: { id: 'close', src: '/room/close.webp', lqip: closeLqip, anchor: { u: 0.5954, v: 0.4514, h: 0.2435 }, vc: 0.5, hfov: 54 },
}

export type Poly = [number, number][]
export const GEOMETRY = geometryJson as unknown as Record<AngleId, Record<string, Poly>>

/** The perspective quad of the CRT glass in the `close` angle (TL, TR, BR, BL). */
export const CLOSE_GLASS = GEOMETRY.close.glass

/** Camera on the desk, in the `close` angle: focus point for the rack-focus + AF brackets. */
export const CLOSE_CAMERA = { u: 0.925, v: 0.72, w: 0.15, h: 0.185 }

export type ObjectId = 'pc' | 'camera'

/** Precomputed view-morph data between consecutive angles (scripts/build-morphs.py). */
export interface MorphPair {
  from: AngleId
  to: AngleId
  /** homography: normalised `from` image coords → normalised `to` image coords (row-major 3×3) */
  H: number[]
  Hinv: number[]
  /** flow values are stored as fixed point in [-scale, scale] (normalised units) */
  scale: number
  /** flow grid size (one mesh vertex per sample) */
  size: [number, number]
  /** bounding box of the `from` image once mapped into the `to` frame: [x0, y0, x1, y1] */
  bboxA: [number, number, number, number]
}
export const MORPHS = (morphsJson as { pairs: MorphPair[] }).pairs
export const morphSrc = (p: MorphPair, dir: 'f01' | 'f10') => `/room/morph/${p.from}-${p.to}.${dir}.png`
