// Builds a complete, walkable 3D model of the room (all four walls, floor, ceiling, every object) as a single
// web-ready GLB:  public/models/room.glb   (glTF 2.0 binary — loads directly with three.js GLTFLoader,
// <model-viewer>, Babylon.js, …). Units: metres, +Y up, origin at the centre of the floor.
//
//   npm run model            → public/models/room.glb        the enlarged room (7 m × 9 m, 3.4 m ceiling)
//   npm run model:small      → public/models/room-small.glb  the room as photographed (3.3 m × 4 m, 2.9 m)
//
// Both layouts use the same objects (desk + CRT + camera on the back wall, window on the left, door and posters on
// the right, black shelf by the entrance); a profile only decides sizes and where things stand.
import path from 'node:path'
import fs from 'node:fs'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { THREE, M, G, at, box, boxUV, cyl, lathe, tube, card, bake, roundRect, rectPath, exportGLB } from './lib.mjs'
import { buildTextures } from './textures.mjs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')

/* ── layouts (metres). x: left (window) wall → right (door) wall · z: back (desk) wall → front ───── */
const PROFILES = {
  // the enlarged room (the original model — keep these numbers: room.glb is reproduced byte-for-byte)
  large: {
    out: 'room.glb',
    W: 7.0,
    D: 9.0,
    H: 3.4,
    windows: [-2.55, 0.95], // window centres along the left wall (z)
    win: { w: 1.7, h: 1.65, sill: 0.92 },
    door: { z: 3.05, w: 1.0, h: 2.2 },
    layout: ({ X0, X1, Z0, Z1, DOOR }) => ({
      desk: { w: 1.6, d: 0.78, legX: 0.76, legZ: 0.35, x: 0.3, z: Z0 + 0.39 + 0.03, setScaleX: 1 },
      chair: [0.22, -3.25, -8],
      rug: { w: 3.0, d: 2.2, x: 0.3, z: -3.35 },
      shelf: { x: X0 + 0.19, z: -0.8 },
      bench: { x: X0 + 0.24, z: 0.95 },
      plants: [
        [601, 1, 9, -1.35, -4.02],
        [611, 0.9, 8, X0 + 0.55, 3.7],
        [621, 0.75, 6, X1 - 0.5, 1.9],
      ],
      back: [
        ['mountain', 0.56, 0.7, 'pines-mist', undefined, -0.55, 2.05],
        ['road', 0.24, 0.32, 'road-long', 0.09, -0.03, 2.27],
        ['path', 0.24, 0.28, 'path-figure', 0.09, -0.03, 1.88],
        ['coast', 0.92, 0.72, 'coast-headland', undefined, 1.0, 2.08],
      ],
      street: { w: 0.62, h: 0.88, y: 1.92, z: -3.35 },
      postcards: [
        ['dunes', 0.14, -2.62, 2.12, 3],
        ['ridge-gold', 0.18, -2.5, 1.9, -4],
        ['city-dusk', 0.17, -2.72, 1.72, 2],
        ['window-light', 0.12, -2.46, 1.58, -2],
      ],
      extraFrames: [
        { args: ['ridge', 1.2, 0.86, 'ridge-gold', 0.06], at: [X1 - 0.002, 1.75, -0.4, -90] },
        { args: ['night', 0.95, 0.72, 'night-sky', 0.06], at: [-1.6, 1.8, Z1 - 0.002, 180] },
      ],
      sketches: [
        [-0.12, 1.92, 3],
        [-0.95, 2.34, -4],
      ],
      switchZ: DOOR.z - 0.75,
      fan: [0.3, -1.7],
      sun: { pos: [X0 - 4, 5.2, -1.2], look: [0.9, 0.3, -2.4], intensity: 3.2 },
      fill: { pos: [0.4, 2.2, -0.2], intensity: 12 },
      views: [
        ['View_Doorway', [1.9, 1.6, 3.9], [0.1, 1.15, -4.4], 55],
        ['View_Shelf', [-1.45, 1.55, 1.5], [0.35, 1.05, -4.4], 52],
        ['View_Desk', [0.3, 1.35, -1.55], [0.3, 1.15, -4.5], 48],
        ['View_Close', [-0.25, 1.1, -3.05], [0.45, 0.98, -4.3], 45],
        ['View_Overview', [3.1, 3.05, 4.2], [-0.6, 0.6, -2.2], 60],
      ],
    }),
  },
  // the room exactly as photographed: small, one window near the back corner, desk standing off the back wall
  small: {
    out: 'room-small.glb',
    realism: true, // normal maps + warmer surfaces (the large profile stays byte-identical without it)
    W: 3.3,
    D: 4.0,
    H: 2.9,
    windows: [-1.15],
    win: { w: 1.15, h: 1.25, sill: 1.05 },
    door: { z: 1.3, w: 0.9, h: 2.1 },
    layout: ({ X0, X1, Z0, DOOR }) => ({
      desk: { w: 1.45, d: 0.74, legX: 0.685, legZ: 0.33, x: 0.12, z: Z0 + 0.55 + 0.37, setScaleX: 0.9 },
      chair: [0.08, -0.35, -6],
      rug: { w: 2.1, d: 1.6, x: 0.1, z: -0.75 },
      shelf: { x: X0 + 0.19, z: 0.9 },
      bench: null,
      plants: [],
      // white ladder shelf of sneakers in the back-left corner (clear of the window sill), as in the reference photo
      shoeStack: { x: X0 + 0.27, z: Z0 + 0.155 },
      // a single frame — the family photograph — in the centre of the back wall; no poster on the right wall
      back: [['family', 1.0, 0.66, 'family', undefined, 0, 1.86]],
      street: null,
      postcards: [
        ['dunes', 0.12, -1.72, 2.02, 3],
        ['ridge-gold', 0.15, -1.6, 1.82, -4],
        ['city-dusk', 0.14, -1.78, 1.66, 2],
        ['window-light', 0.1, -1.58, 1.52, -2],
      ],
      extraFrames: [],
      sketches: [
        [-0.3, 1.9, 3],
        [-0.33, 2.3, -4],
      ],
      switchZ: DOOR.z - 0.75,
      fan: [0.15, -0.6],
      sun: { pos: [-5.94, 2.78, -3.23], look: [X1, 0.82, 0.45], intensity: 2.8, color: 0xffa24e },
      fill: { pos: [0.2, 2.0, 0.3], intensity: 3 },
      views: [
        ['View_Doorway', [1.1, 1.6, 1.85], [-0.1, 1.05, -1.6], 62],
        ['View_Shelf', [-0.75, 1.55, 1.75], [0.55, 1.0, -1.7], 58],
        ['View_Desk', [0.2, 1.35, 0.85], [0.2, 1.25, -2.0], 55],
        ['View_Close', [-0.3, 1.15, -0.25], [0.35, 0.98, -1.25], 48],
        ['View_Overview', [1.4, 2.5, 1.85], [-0.5, 0.6, -1.2], 65],
      ],
    }),
  },
}
const PROFILE = process.argv.includes('--small') ? 'small' : 'large'
const P = PROFILES[PROFILE]
const OUT = path.join(ROOT, 'public', 'models', P.out)

/* ── dimensions ───────────────────────────────────────────────────────────────────────────── */
const W = P.W
const D = P.D
const H = P.H
const T = 0.22 // wall thickness
const X0 = -W / 2
const X1 = W / 2
const Z0 = -D / 2
const Z1 = D / 2
const WINDOWS = P.windows
const WIN = P.win
const DOOR = P.door
const L = P.layout({ X0, X1, Z0, Z1, DOOR })

/* ── materials (sRGB colours; textures from textures.mjs) ─────────────────────────────────── */
const MATERIALS = {
  wall: { tex: 'plaster', color: '#faf0e3', rough: 0.93 },
  ceiling: { tex: 'plaster', color: '#ffffff', rough: 0.95 },
  floorTile: { tex: 'tiles', rough: 0.5 },
  skirting: { color: '#8f8a83', rough: 0.55 },
  sill: { color: '#efe9df', rough: 0.6 },
  windowFrame: { color: '#161616', rough: 0.42, metal: 0.45 },
  glass: { color: '#d5e2dc', opacity: 0.1, alpha: 'BLEND', rough: 0.04, double: true },
  garden: { color: '#000000', emissive: '#ffffff', emissiveTex: 'garden', emissiveStrength: 1.6, rough: 1 },
  door: { color: '#f2eee6', rough: 0.55 },
  doorHandle: { color: '#1b1b1b', rough: 0.35, metal: 0.7 },
  deskWhite: { color: '#ede8df', rough: 0.5 },
  teak: { tex: 'teak', rough: 0.5 },
  cane: { tex: 'cane', alpha: 'MASK', cutoff: 0.4, double: true, rough: 0.7 },
  oak: { tex: 'oak', rough: 0.55 },
  jute: { tex: 'jute', rough: 0.95 },
  juteBorder: { tex: 'jute', color: '#9c8466', rough: 0.95 },
  beige: { color: '#d9d0bb', rough: 0.48 },
  beigeDark: { color: '#bdb299', rough: 0.52 },
  keycap: { color: '#e6dfcf', rough: 0.45 },
  keycapDark: { color: '#b3a88f', rough: 0.5 },
  crtGlass: { color: '#161a18', rough: 0.1 },
  crtInner: { color: '#0c0d0c', rough: 0.6 },
  darkSlot: { color: '#2a2724', rough: 0.7 },
  led: { color: '#4d8f4a', emissive: '#6cff6a', emissiveStrength: 2 },
  black: { color: '#171717', rough: 0.4, metal: 0.35 },
  blackMatte: { color: '#1c1c1c', rough: 0.78 },
  rubber: { color: '#232323', rough: 0.92 },
  lensGlass: { color: '#0a0f12', rough: 0.04, metal: 0.3 },
  lampInner: { color: '#f3e5c6', emissive: '#ffcf88', emissiveStrength: 1.2, rough: 0.6 },
  bulb: { color: '#fff6e0', emissive: '#fff0d2', emissiveStrength: 8 },
  ceramicCream: { color: '#efe6d3', rough: 0.4 },
  ceramicSage: { color: '#8c978a', rough: 0.45 },
  terracotta: { color: '#b3643d', rough: 0.85 },
  soil: { color: '#3a2a1e', rough: 1 },
  monstera: { tex: 'monstera', alpha: 'MASK', cutoff: 0.5, double: true, rough: 0.55 },
  pothos: { tex: 'pothos', alpha: 'MASK', cutoff: 0.5, double: true, rough: 0.55 },
  stem: { color: '#4f6d35', rough: 0.7 },
  pages: { color: '#f1ece0', rough: 0.9 },
  shelfMetal: { color: '#1d1d1d', rough: 0.5, metal: 0.55 },
  globe: { tex: 'globe', rough: 0.45 },
  brass: { color: '#b08d57', rough: 0.3, metal: 0.85 },
  frameBlack: { color: '#131313', rough: 0.45 },
  mat: { color: '#f5f1e8', rough: 0.9 },
  paper: { tex: 'paper', rough: 0.9, double: true },
  pin: { color: '#b3261e', rough: 0.4 },
  fanBody: { color: '#2d2520', rough: 0.45, metal: 0.5 },
  fanBlade: { color: '#3a2c22', rough: 0.55 },
  switchPlate: { color: '#f3efe7', rough: 0.55 },
  strap: { color: '#191919', rough: 0.85 },
  strapRed: { color: '#9a2323', rough: 0.7 },
  pen: { color: '#141414', rough: 0.35 },
  cable: { color: '#cfc6b1', rough: 0.6 },
  linen: { color: '#d9cdb8', rough: 0.95 },
  cableBlack: { color: '#111111', rough: 0.6 },
  // shoe stack (small room)
  lackWhite: { color: '#f1efea', rough: 0.34 },
  potBlack: { color: '#1f1f1f', rough: 0.62 },
  soleWhite: { color: '#efece5', rough: 0.62 },
  soleCream: { color: '#e6dccb', rough: 0.66 },
  soleGum: { color: '#a8703f', rough: 0.58 },
  'shoe-maroon': { tex: 'shoe-maroon', rough: 0.9 },
  'shoe-grey': { tex: 'shoe-grey', rough: 0.9 },
  'shoe-green': { tex: 'shoe-green', rough: 0.55 },
  'shoe-panda': { tex: 'shoe-panda', rough: 0.5 },
  capNavy: { color: '#16307a', rough: 0.88 },
}
const BOOK_COLORS = ['#2f3b33', '#d8cdb4', '#7a3b2e', '#34495e', '#b58c4f', '#5a4a42', '#8a8d7a', '#27313d', '#a4553a', '#c9bfa7']
BOOK_COLORS.forEach((c, i) => (MATERIALS[`book${i}`] = { color: c, rough: 0.7 }))
// realistic room: relief on the surfaces the low sun rakes across, and the warm tones of the photographs
if (P.realism) {
  Object.assign(MATERIALS.floorTile, { normal: 'tilesN', normalScale: 0.9, rough: 0.42 })
  Object.assign(MATERIALS.jute, { normal: 'juteN', normalScale: 1.2 })
  Object.assign(MATERIALS.juteBorder, { normal: 'juteN', normalScale: 1.2 })
  Object.assign(MATERIALS.wall, { normal: 'plasterN', normalScale: 0.12, color: '#f7e9d6' })
  Object.assign(MATERIALS.ceiling, { normal: 'plasterN', normalScale: 0.08, color: '#fbf1e4' })
  Object.assign(MATERIALS.teak, { normal: 'woodN', normalScale: 0.5 })
  Object.assign(MATERIALS.oak, { normal: 'woodN', normalScale: 0.4 })
  Object.assign(MATERIALS.skirting, { color: '#8a837a' })
}
const PHOTOS = ['pines-mist', 'road-long', 'path-figure', 'coast-headland', 'street-car', 'dunes', 'ridge-gold', 'city-dusk', 'window-light', 'night-sky', 'family']
PHOTOS.forEach((p) => (MATERIALS[`photo-${p}`] = { tex: `photo-${p}`, rough: 0.55 }))

/* ── small helpers ────────────────────────────────────────────────────────────────────────── */
const V = (x, y, z) => new THREE.Vector3(x, y, z)
function rod(a, b, r, seg = 12) {
  const A = V(...a)
  const B = V(...b)
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize()))
  g.translate(...A.clone().add(B).multiplyScalar(0.5).toArray())
  return g
}
function beam(a, b, w, d) {
  const A = V(...a)
  const B = V(...b)
  const g = new THREE.BoxGeometry(w, A.distanceTo(B), d)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize()))
  g.translate(...A.clone().add(B).multiplyScalar(0.5).toArray())
  return g
}
const rbox = (w, h, d, r, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r)
function flip(g) {
  const idx = g.index.array
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  const n = g.attributes.normal
  for (let i = 0; i < n.array.length; i++) n.array[i] *= -1
  return g
}
/** Rounded-rectangle loft (CRT housing): sections [{z, w, h, r, y}] */
function loft(sections, cs = 5) {
  const ring = ({ z, w, h, r, y = 0 }) => {
    const pts = []
    const corners = [
      [w / 2 - r, h / 2 - r, 0],
      [-w / 2 + r, h / 2 - r, Math.PI / 2],
      [-w / 2 + r, -h / 2 + r, Math.PI],
      [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
    ]
    for (const [cx, cy, a0] of corners)
      for (let k = 0; k <= cs; k++) {
        const a = a0 + (k / cs) * (Math.PI / 2)
        pts.push([cx + Math.cos(a) * r, y + cy + Math.sin(a) * r, z])
      }
    return pts
  }
  const rings = sections.map(ring)
  const n = rings[0].length
  const pos = []
  const idx = []
  rings.forEach((r) => r.forEach((p) => pos.push(...p)))
  for (let s = 0; s < rings.length - 1; s++)
    for (let i = 0; i < n; i++) {
      const a = s * n + i
      const b = s * n + ((i + 1) % n)
      const c = (s + 1) * n + i
      const d = (s + 1) * n + ((i + 1) % n)
      idx.push(a, c, b, b, c, d)
    }
  const side = new THREE.BufferGeometry()
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  side.setIndex(idx)
  side.computeVertexNormals()
  const cap = (r, back) => {
    const g = new THREE.BufferGeometry()
    const c = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length, s[2] + p[2] / r.length], [0, 0, 0])
    const p = [...c, ...r.flat()]
    const ix = []
    for (let i = 0; i < r.length; i++) back ? ix.push(0, 1 + ((i + 1) % r.length), 1 + i) : ix.push(0, 1 + i, 1 + ((i + 1) % r.length))
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.setIndex(ix)
    g.computeVertexNormals()
    return g
  }
  return [side, cap(rings[0], false), cap(rings[rings.length - 1], true)]
}
function rand(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── architecture ─────────────────────────────────────────────────────────────────────────── */
function wallWithHoles(length, holes) {
  const s = rectPath(length, H, 0, H / 2)
  for (const h of holes) s.holes.push(rectPath(h.w, h.h, h.c, h.y + h.h / 2, true))
  return new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 1 })
}

function architecture() {
  const g = G('Architecture')
  const floor = boxUV(new THREE.BoxGeometry(W, 0.1, D).translate(0, -0.05, 0), 1.2)
  g.add(M(floor, 'floorTile', 'Floor'))
  g.add(M(boxUV(new THREE.BoxGeometry(W, 0.1, D).translate(0, H + 0.05, 0), 1.5), 'ceiling', 'Ceiling'))
  g.add(M(boxUV(new THREE.BoxGeometry(W + 2 * T, H, T).translate(0, H / 2, Z0 - T / 2), 1), 'wall', 'Wall_Back'))
  g.add(M(boxUV(new THREE.BoxGeometry(W + 2 * T, H, T).translate(0, H / 2, Z1 + T / 2), 1), 'wall', 'Wall_Front'))
  // side walls: in the realistic room they stop exactly at the back/front walls' inner faces — overlapping wall
  // volumes make two faces intersect along each corner, which flickers (z-fighting) under strong light
  const sideLen = P.realism ? D : D + 2 * T
  // left wall: shape x = -z  (rotateY +90°), windows cut through
  const left = wallWithHoles(sideLen, WINDOWS.map((z) => ({ c: -z, y: WIN.sill, w: WIN.w, h: WIN.h })))
  left.rotateY(Math.PI / 2).translate(X0 - T, 0, 0)
  g.add(M(boxUV(left, 1), 'wall', 'Wall_Left'))
  // right wall: shape x = z  (rotateY -90°), door cut through
  const right = wallWithHoles(sideLen, [{ c: DOOR.z, y: 0, w: DOOR.w, h: DOOR.h }])
  right.rotateY(-Math.PI / 2).translate(X1 + T, 0, 0)
  g.add(M(boxUV(right, 1), 'wall', 'Wall_Right'))

  // skirting boards
  const sk = G('Skirting')
  const k = 0.1
  sk.add(M(box(W, k, 0.014).translate(0, k / 2, Z0 + 0.007), 'skirting'))
  sk.add(M(box(W, k, 0.014).translate(0, k / 2, Z1 - 0.007), 'skirting'))
  sk.add(M(box(0.014, k, D).translate(X0 + 0.007, k / 2, 0), 'skirting'))
  const d0 = DOOR.z - DOOR.w / 2 - 0.08
  const d1 = DOOR.z + DOOR.w / 2 + 0.08
  sk.add(M(box(0.014, k, d0 - Z0).translate(X1 - 0.007, k / 2, (Z0 + d0) / 2), 'skirting'))
  sk.add(M(box(0.014, k, Z1 - d1).translate(X1 - 0.007, k / 2, (d1 + Z1) / 2), 'skirting'))
  g.add(bake(sk))
  return g
}

/** Steel-framed window with a 6×6 grid, glass and a deep sill. Built on the left wall, facing +x. */
function windowUnit(zc, i) {
  const { w, h, sill } = WIN
  const f = G(`Window_${i + 1}`)
  const fd = 0.06 // frame depth
  const fw = 0.055 // frame width
  const yc = sill + h / 2
  // outer frame
  f.add(M(box(fd, fw, w).translate(0, sill + h - fw / 2, 0), 'windowFrame'))
  f.add(M(box(fd, fw, w).translate(0, sill + fw / 2, 0), 'windowFrame'))
  f.add(M(box(fd, h, fw).translate(0, yc, -w / 2 + fw / 2), 'windowFrame'))
  f.add(M(box(fd, h, fw).translate(0, yc, w / 2 - fw / 2), 'windowFrame'))
  f.add(M(box(fd, h, 0.05).translate(0, yc, 0), 'windowFrame')) // meeting stile
  // muntins: 3 columns × 6 rows per sash
  const innerH = h - 2 * fw
  const sashW = (w - 2 * fw - 0.05) / 2
  for (const side of [-1, 1]) {
    const c = side * (0.025 + sashW / 2)
    for (let k = 1; k < 3; k++) f.add(M(box(0.03, innerH, 0.018).translate(0.004, yc, c - sashW / 2 + (k * sashW) / 3), 'windowFrame'))
    for (let k = 1; k < 6; k++) f.add(M(box(0.03, 0.018, sashW).translate(0.004, sill + fw + (k * innerH) / 6, c), 'windowFrame'))
  }
  // interior sill + small apron
  f.add(M(box(0.34, 0.035, w + 0.14).translate(T / 2 + 0.03 - 0.17 + 0.06, sill - 0.0175, 0), 'sill'))
  f.add(M(box(0.02, 0.07, w + 0.1).translate(T / 2 + 0.01, sill - 0.07, 0), 'sill'))
  const frame = bake(f)
  const glass = M(new THREE.PlaneGeometry(w - 0.02, h - 0.02).rotateY(Math.PI / 2).translate(-0.004, yc, 0), 'glass', `Window_${i + 1}_Glass`)
  glass.userData.keep = true
  frame.add(glass)
  return at(frame, X0 - T / 2, 0, zc)
}

function outside() {
  // a sunlit garden seen through the windows (emissive: it reads as daylight whatever the scene lighting)
  const g = new THREE.PlaneGeometry(D + 8, 6).rotateY(Math.PI / 2)
  return at(M(g, 'garden', 'Outside_Garden'), X0 - T - 2.2, 1.9, 0)
}

function door() {
  const g = G('Door')
  const { w, h } = DOOR
  // jambs lining the opening (local x across the wall: -T/2..T/2, local z along the wall)
  g.add(M(box(T, h, 0.03).translate(0, h / 2, -w / 2 + 0.015), 'door'))
  g.add(M(box(T, h, 0.03).translate(0, h / 2, w / 2 - 0.015), 'door'))
  g.add(M(box(T, 0.03, w).translate(0, h - 0.015, 0), 'door'))
  // interior casing (architrave)
  const cx = -T / 2 - 0.008
  g.add(M(box(0.016, h + 0.07, 0.07).translate(cx, (h + 0.07) / 2, -w / 2 - 0.035), 'door'))
  g.add(M(box(0.016, h + 0.07, 0.07).translate(cx, (h + 0.07) / 2, w / 2 + 0.035), 'door'))
  g.add(M(box(0.016, 0.07, w + 0.14).translate(cx, h + 0.035, 0), 'door'))
  // leaf with two raised panels
  const lw = w - 0.064
  const lh = h - 0.035
  g.add(M(box(0.042, lh, lw).translate(-T / 2 + 0.06, lh / 2, 0), 'door'))
  for (const [py, ph] of [
    [0.3, 0.75],
    [1.2, 0.8],
  ])
    for (const s of [-1, 1]) {
      const px = -T / 2 + 0.06 + s * 0.025
      g.add(M(box(0.008, ph, 0.03).translate(px, py + ph / 2, -lw / 2 + 0.12), 'door'))
      g.add(M(box(0.008, ph, 0.03).translate(px, py + ph / 2, lw / 2 - 0.12), 'door'))
      g.add(M(box(0.008, 0.03, lw - 0.24).translate(px, py, 0), 'door'))
      g.add(M(box(0.008, 0.03, lw - 0.24).translate(px, py + ph, 0), 'door'))
    }
  // lever handles both sides + key plate
  for (const s of [-1, 1]) {
    const x = -T / 2 + 0.06 + s * 0.03
    g.add(M(cyl(0.028, 0.028, 0.012, 24).rotateZ(Math.PI / 2).translate(x, 1.02, lw / 2 - 0.07), 'doorHandle'))
    g.add(M(rod([x + s * 0.03, 1.02, lw / 2 - 0.07], [x + s * 0.05, 1.02, lw / 2 - 0.2], 0.009), 'doorHandle'))
    g.add(M(rod([x, 1.02, lw / 2 - 0.07], [x + s * 0.035, 1.02, lw / 2 - 0.07], 0.009), 'doorHandle'))
    g.add(M(box(0.006, 0.06, 0.03).translate(x, 0.93, lw / 2 - 0.07), 'doorHandle'))
  }
  return at(bake(g), X1 + T / 2, 0, DOOR.z)
}

/* ── furniture ────────────────────────────────────────────────────────────────────────────── */
function desk() {
  const g = G('Desk')
  const { w, d, legX, legZ } = L.desk
  g.add(M(box(w, 0.06, d).translate(0, 0.72, 0), 'deskWhite'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(M(box(0.08, 0.69, 0.08).translate(sx * legX, 0.345, sz * legZ), 'deskWhite'))
  return bake(g)
}

function chair() {
  const g = G('Chair')
  const sh = 0.46
  const hw = 0.21 // half width
  // legs: front straight, rear legs continue up into the back posts with a slight rake
  for (const s of [-1, 1]) {
    g.add(M(boxUV(beam([s * hw, 0, -0.2], [s * hw, sh, -0.2], 0.036, 0.036), 0.5), 'teak'))
    g.add(M(boxUV(beam([s * hw, 0, 0.21], [s * hw, sh, 0.2], 0.038, 0.038), 0.5), 'teak'))
    g.add(M(boxUV(beam([s * hw, sh, 0.2], [s * hw, 0.92, 0.27], 0.036, 0.03), 0.5), 'teak'))
    g.add(M(boxUV(beam([s * hw, 0.16, -0.2], [s * hw, 0.16, 0.21], 0.022, 0.022), 0.5), 'teak')) // side stretcher
    g.add(M(boxUV(box(0.028, 0.05, 0.42).translate(s * hw, sh - 0.025, 0), 0.5), 'teak')) // side rail
  }
  g.add(M(boxUV(box(2 * hw, 0.022, 0.022).translate(0, 0.2, -0.2), 0.5), 'teak'))
  g.add(M(boxUV(box(2 * hw, 0.05, 0.028).translate(0, sh - 0.025, -0.2), 0.5), 'teak'))
  g.add(M(boxUV(box(2 * hw, 0.05, 0.028).translate(0, sh - 0.025, 0.2), 0.5), 'teak'))
  // back rails following the rake
  const rake = (y) => 0.2 + ((y - sh) / (0.92 - sh)) * 0.07
  g.add(M(boxUV(box(2 * hw + 0.02, 0.07, 0.026).translate(0, 0.88, rake(0.88)), 0.5), 'teak'))
  g.add(M(boxUV(box(2 * hw, 0.035, 0.022).translate(0, 0.575, rake(0.575)), 0.5), 'teak'))
  // cane seat + back (alpha-masked webbing)
  const seat = card(2 * hw - 0.02, 0.38).rotateX(-Math.PI / 2).translate(0, sh + 0.004, 0)
  seat.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 5))
  g.add(M(seat, 'cane'))
  const back = card(2 * hw - 0.02, 0.27).rotateX(-Math.atan2(0.07, 0.92 - sh)).translate(0, 0.725, rake(0.725))
  back.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (i % 2 ? 3.5 : 5)))
  g.add(M(back, 'cane'))
  return bake(g)
}

function rug() {
  const g = G('Rug')
  const { w, d } = L.rug
  g.add(M(boxUV(box(w - 0.08, 0.012, d - 0.08).translate(0, 0.006, 0), 0.5), 'jute'))
  const b = 0.04
  g.add(M(boxUV(box(w, 0.013, b).translate(0, 0.0065, -d / 2 + b / 2), 0.5), 'juteBorder'))
  g.add(M(boxUV(box(w, 0.013, b).translate(0, 0.0065, d / 2 - b / 2), 0.5), 'juteBorder'))
  g.add(M(boxUV(box(b, 0.013, d - 2 * b).translate(-w / 2 + b / 2, 0.0065, 0), 0.5), 'juteBorder'))
  g.add(M(boxUV(box(b, 0.013, d - 2 * b).translate(w / 2 - b / 2, 0.0065, 0), 0.5), 'juteBorder'))
  return bake(g)
}

function book(w, h, d, colorIdx) {
  const c = `book${colorIdx % BOOK_COLORS.length}`
  const g = G('Book')
  const t = 0.004
  g.add(M(box(w, t, d).translate(0, h / 2 - t / 2, 0), c))
  g.add(M(box(w, t, d).translate(0, -h / 2 + t / 2, 0), c))
  g.add(M(box(t, h, d).translate(-w / 2 + t / 2, 0, 0), c)) // spine side (left)
  g.add(M(box(w - t - 0.003, h - 2 * t, d - 0.006).translate(t / 2 + 0.0005, 0, 0), 'pages'))
  return g
}

/** A book standing upright: covers on ±x, spine facing +z, page block inset at the back. */
function uprightBook(h, t, d, colorIdx) {
  const c = `book${colorIdx % BOOK_COLORS.length}`
  const g = G('Book')
  const k = 0.003
  g.add(M(box(k, h, d).translate(-t / 2 + k / 2, h / 2, 0), c))
  g.add(M(box(k, h, d).translate(t / 2 - k / 2, h / 2, 0), c))
  g.add(M(box(t, h, k).translate(0, h / 2, d / 2 - k / 2), c))
  g.add(M(box(t - 2 * k, h - 0.008, d - k - 0.004).translate(0, h / 2, -0.0035), 'pages'))
  return g
}

/** A row of upright books standing on y=0 from x0 to x1, spines to the front (+z); the last few lean. */
function bookRow(x0, x1, r, maxH = 0.28) {
  const g = G('Books')
  let x = x0
  let i = Math.floor(r() * 10)
  while (x < x1 - 0.03) {
    const t = 0.022 + r() * 0.03
    const h = maxH * (0.72 + r() * 0.28)
    const d = 0.16 + r() * 0.06
    g.add(at(uprightBook(h, t, d, i++), x + t / 2, 0, -0.15 + d / 2))
    x += t + 0.002
  }
  return g
}

function globe(r = 0.1) {
  const g = G('Globe')
  const tilt = G('GlobeTilt')
  tilt.add(M(new THREE.SphereGeometry(r, 48, 32), 'globe'))
  tilt.add(M(new THREE.TorusGeometry(r + 0.008, 0.0035, 8, 64).rotateY(Math.PI / 2), 'brass'))
  tilt.position.y = r + 0.08
  tilt.rotation.z = (23.4 * Math.PI) / 180
  g.add(tilt)
  g.add(M(lathe([[0, 0], [r * 0.7, 0], [r * 0.72, 0.015], [r * 0.4, 0.03], [0.012, 0.05], [0.01, 0.07], [0, 0.07]], 32), 'oak'))
  g.add(M(rod([0, 0.06, 0], [0, 0.08 - 0.008, 0], 0.006), 'brass'))
  return g
}

function shelf() {
  const r = rand(301)
  const g = G('Shelf')
  const w = 0.92
  const d = 0.34
  const h = 1.96
  const frame = G('ShelfFrame')
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.add(M(box(0.025, h, 0.025).translate(sx * (w / 2 - 0.0125), h / 2, sz * (d / 2 - 0.0125)), 'shelfMetal'))
  const levels = [0.08, 0.5, 0.92, 1.34, 1.76, h - 0.01]
  for (const y of levels) {
    frame.add(M(box(w - 0.02, 0.018, d - 0.02).translate(0, y, 0), 'shelfMetal'))
    for (const sx of [-1, 1]) frame.add(M(box(0.012, 0.03, d).translate(sx * (w / 2 - 0.0125), y - 0.02, 0), 'shelfMetal'))
  }
  // X-braces on the sides
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.0125)
    frame.add(M(beam([x, 0.1, -d / 2 + 0.02], [x, h - 0.05, d / 2 - 0.02], 0.006, 0.012), 'shelfMetal'))
    frame.add(M(beam([x, 0.1, d / 2 - 0.02], [x, h - 0.05, -d / 2 + 0.02], 0.006, 0.012), 'shelfMetal'))
  }
  g.add(bake(frame))

  const items = G('ShelfItems')
  const on = (obj, y, x = 0, z = 0, ry = 0) => items.add(at(obj, x, y + 0.009, z, ry))
  on(bookRow(-0.42, 0.1, r, 0.3), levels[0])
  on(bookRow(0.16, 0.42, r, 0.24), levels[0])
  on(bookRow(-0.42, -0.05, r, 0.26), levels[1])
  on(globe(0.085), levels[1], 0.2, 0)
  on(bookRow(-0.1, 0.42, r, 0.27), levels[2])
  on(potPlant(0.07, 0.08, 9, 312), levels[2], -0.28, 0)
  on(globe(0.1), levels[3], -0.22, 0)
  const stack = G('Stack')
  let y = 0
  for (let i = 0; i < 4; i++) {
    const bw = 0.2 + r() * 0.06
    const bh = 0.03 + r() * 0.015
    stack.add(at(book(bw, bh, 0.15 + r() * 0.04, i + 3), 0, y + bh / 2, 0, (r() - 0.5) * 12))
    y += bh
  }
  on(stack, levels[3], 0.2, 0)
  on(bookRow(-0.42, 0.18, r, 0.25), levels[4])
  on(vase(), levels[4], 0.3, 0)
  on(trailingPlant(315), levels[5], 0.05, -0.02)
  g.add(bake(items))
  return g
}

function vase() {
  const g = G('Vase')
  g.add(M(lathe([[0, 0], [0.045, 0], [0.06, 0.06], [0.05, 0.14], [0.028, 0.18], [0.03, 0.2], [0.024, 0.2], [0.022, 0.19], [0, 0.19]], 32), 'ceramicCream'))
  for (let i = 0; i < 3; i++) g.add(M(tube([[0, 0.18, 0], [0.02 * (i - 1), 0.3, 0.01], [0.05 * (i - 1), 0.42 + i * 0.03, 0.02]], 0.0025, 16, 5), 'oak'))
  return g
}

/** low oak bench under the front window, with a cushion, books and a small plant */
function bench() {
  const g = G('Bench')
  const L = 1.4
  const parts = G('BenchParts')
  parts.add(M(boxUV(box(L, 0.05, 0.38).translate(0, 0.425, 0), 0.6), 'oak'))
  for (const s of [-1, 1]) parts.add(M(boxUV(box(0.05, 0.4, 0.34).translate(s * (L / 2 - 0.12), 0.2, 0), 0.6), 'oak'))
  parts.add(M(rbox(0.5, 0.07, 0.34, 0.03).translate(-0.34, 0.485, 0), 'linen'))
  parts.add(at(book(0.24, 0.035, 0.17, 4), 0.2, 0.468, 0.02, 12))
  parts.add(at(book(0.22, 0.03, 0.16, 7), 0.21, 0.5, 0.01, -3))
  g.add(bake(parts))
  g.add(at(potPlant(0.06, 0.08, 12, 701), 0.5, 0.45, 0))
  return g
}

/* ── plants ───────────────────────────────────────────────────────────────────────────────── */
/** leaf card with base at the origin, tip along +Y, face +Z, then aimed: yaw (deg), elevation (deg), roll */
function leaf(mat, size, yaw, elev, roll, bend = 0.12, fold = 0.08) {
  const g = card(size, size, 4, 6, bend, fold).translate(0, size / 2, 0)
  const m = M(g, mat)
  m.rotation.set(-(Math.PI / 2 - (elev * Math.PI) / 180), (yaw * Math.PI) / 180, (roll * Math.PI) / 180, 'YXZ')
  return m
}

function monstera(seed, scale = 1, count = 9) {
  const r = rand(seed)
  const g = G('Monstera')
  const potTop = 0.34 * scale
  g.add(M(lathe([[0, 0], [0.14, 0], [0.19, 0.33], [0.2, 0.345], [0.185, 0.345], [0.176, 0.31], [0, 0.31]].map(([a, b]) => [a * scale, b * scale]), 40), 'terracotta'))
  g.add(M(cyl(0.172 * scale, 0.172 * scale, 0.01, 32).translate(0, 0.305 * scale, 0), 'soil'))
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 360 + r() * 30
    const rad = (0.12 + r() * 0.3) * scale
    const y = potTop + (0.22 + r() * 0.55) * scale
    const ar = (a * Math.PI) / 180
    const B = [Math.sin(ar) * rad, y, Math.cos(ar) * rad]
    g.add(M(tube([[0, potTop - 0.03, 0], [B[0] * 0.3, (potTop + y) * 0.55, B[2] * 0.3], B], 0.007 * scale, 24, 6), 'stem'))
    const lf = leaf('monstera', (0.55 + r() * 0.25) * scale, a + 180 + (r() - 0.5) * 20, 5 + r() * 35, (r() - 0.5) * 30, 0.12, 0.1)
    lf.position.set(...B)
    g.add(lf)
  }
  return bake(g)
}

function potPlant(potR, potH, leaves, seed, potMat = 'ceramicCream') {
  const r = rand(seed)
  const g = G('PotPlant')
  g.add(M(lathe([[0, 0], [potR * 0.8, 0], [potR, potH], [potR * 1.05, potH + 0.003], [potR * 0.96, potH + 0.003], [potR * 0.9, potH - 0.01], [0, potH - 0.01]], 32), potMat))
  g.add(M(cyl(potR * 0.9, potR * 0.9, 0.006, 24).translate(0, potH - 0.012, 0), 'soil'))
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * 360 + r() * 40
    const ar = (a * Math.PI) / 180
    const rad = potR * (0.3 + r() * 1.1)
    const y = potH + 0.01 + r() * 0.07
    const B = [Math.sin(ar) * rad, y, Math.cos(ar) * rad]
    g.add(M(tube([[0, potH - 0.01, 0], [B[0] * 0.4, y + 0.025, B[2] * 0.4], B], 0.0022, 10, 4), 'stem'))
    const lf = leaf('pothos', 0.05 + r() * 0.03, a + 180, -15 + r() * 40, (r() - 0.5) * 40, 0.08, 0.05)
    lf.position.set(...B)
    g.add(lf)
  }
  return g
}

/** pothos on the top shelf with vines trailing down the front and side */
function trailingPlant(seed) {
  const r = rand(seed)
  const g = potPlant(0.075, 0.1, 10, seed)
  g.name = 'TrailingPlant'
  const vines = [
    [
      [0.05, 0.09, 0.05],
      [0.14, 0.05, 0.17],
      [0.16, -0.25, 0.19],
      [0.13, -0.6, 0.2],
      [0.15, -0.9, 0.19],
    ],
    [
      [-0.04, 0.09, 0.05],
      [-0.1, 0.02, 0.18],
      [-0.12, -0.3, 0.19],
      [-0.18, -0.55, 0.18],
    ],
    [
      [0.06, 0.09, -0.02],
      [0.3, 0.05, 0.05],
      [0.45, -0.1, 0.12],
      [0.47, -0.45, 0.17],
      [0.46, -0.75, 0.16],
      [0.47, -1.05, 0.17],
    ],
  ]
  for (const pts of vines) {
    g.add(M(tube(pts, 0.0025, 40, 4), 'stem'))
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)))
    for (let k = 1; k < 12; k++) {
      const p = curve.getPoint(k / 12)
      const lf = leaf('pothos', 0.045 + r() * 0.025, r() * 360, -20 + r() * 50, (r() - 0.5) * 60, 0.06, 0.04)
      lf.position.copy(p)
      g.add(lf)
    }
  }
  return g
}

/* ── shoe stack (small room): white ladder shelf, sneakers, a cap and a trailing pothos ───────── */
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
/** a smooth curve through [t, y] control points (t ascending), evaluated at t */
function profile(pts) {
  const table = new THREE.SplineCurve(pts.map(([t, y]) => new THREE.Vector2(t, y))).getSpacedPoints(200)
  return (t) => {
    let i = 1
    while (i < table.length - 1 && table[i].x < t) i++
    const a = table[i - 1]
    const b = table[i]
    return a.y + ((b.y - a.y) * (t - a.x)) / (b.x - a.x || 1)
  }
}
const SHOE = {
  length: 0.285,
  // half-width of the sole outline, heel (t = 0) → toe (t = 1), rounded at both ends
  hw: (t) => {
    const w = 0.034 + 0.018 * smoothstep(0.08, 0.66, t) - 0.004 * smoothstep(0.75, 1, t)
    const heel = t < 0.14 ? Math.sqrt(Math.max(0, 1 - ((0.14 - t) / 0.14) ** 2)) : 1
    const toe = t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1
    return w * heel * toe
  },
  // the foot's slight inward curve (mirrored for left / right)
  cz: (t, side) => side * 0.006 * smoothstep(0.4, 0.9, t),
  // top line of the upper above the ground: heel counter, low collar, tongue, laces sloping down to the toe
  top: profile([[0, 0.098], [0.06, 0.104], [0.2, 0.086], [0.34, 0.101], [0.42, 0.096], [0.62, 0.073], [0.82, 0.058], [0.95, 0.048], [1, 0.038]]),
  // how deep the collar opening dips (same curve the textures paint the lining with)
  collar: (t) => (t > 0.035 && t < 0.36 ? Math.sin((Math.PI * (t - 0.035)) / 0.325) ** 0.6 : 0),
}
/** the sole: the foot outline extruded, a touch wider than the upper */
function sneakerSole(side, h) {
  const n = 48
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push(new THREE.Vector2(t * SHOE.length, SHOE.cz(t, side) + SHOE.hw(t) * 1.03 + 0.002))
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n
    pts.push(new THREE.Vector2(t * SHOE.length, SHOE.cz(t, side) - SHOE.hw(t) * 1.03 - 0.002))
  }
  const bevel = 0.004
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 })
  return g.rotateX(Math.PI / 2).translate(0, h - bevel, 0)
}
/** the upper: superellipse arches lofted heel → toe, the collar dipped into an opening; UVs as the shoe textures expect */
function sneakerUpper(side, soleH) {
  const NS = 44
  const NA = 26
  const y0 = soleH - 0.004
  const insole = soleH + 0.012
  const e = 2 / 3.4
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= NS; i++) {
    const t = 0.5 - 0.5 * Math.cos((Math.PI * i) / NS) // denser at heel and toe
    const w = SHOE.hw(t) * 0.95
    const zc = SHOE.cz(t, side)
    const top = SHOE.top(t)
    for (let j = 0; j <= NA; j++) {
      const f = (Math.PI * j) / NA
      const c = Math.cos(f)
      let z = zc + w * Math.sign(c) * Math.abs(c) ** e
      let y = y0 + (top - y0) * Math.abs(Math.sin(f)) ** e
      const v = 1 - Math.abs((2 * j) / NA - 1)
      const d = SHOE.collar(t) * smoothstep(0.66, 0.8, v)
      y += (insole - y) * d
      z = zc + (z - zc) * (1 - 0.18 * d)
      pos.push(t * SHOE.length, y, z)
      uv.push(t, v)
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j
      const b = a + NA + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
/** a pair of sneakers lying lengthwise on a shelf, toes to the left; origin = centre of the shelf top */
function sneakerPair(upper, sole, soleH, seed) {
  const r = rand(seed)
  const g = G('Sneakers')
  ;[
    [1, 0.068],
    [-1, -0.052],
  ].forEach(([side, z], k) => {
    const s = G('Sneaker')
    s.add(M(sneakerSole(side, soleH), sole))
    s.add(M(sneakerUpper(side, soleH), upper))
    // toe at -x: turn the shoe around and centre it; the back shoe sits a little further in and askew
    g.add(at(s, SHOE.length / 2 + (k ? 0.01 : 0) + (r() - 0.5) * 0.01, 0, z, 180 + (r() - 0.5) * (k ? 7 : 3)))
  })
  return g
}
/** a navy baseball cap, brim toward the front */
function cap() {
  const g = G('Cap')
  const R = 0.085
  g.add(M(new THREE.SphereGeometry(R, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.12), 'capNavy'))
  g.add(M(new THREE.SphereGeometry(0.007, 10, 6).scale(1, 0.5, 1).translate(0, R * 0.8, 0), 'capNavy'))
  g.add(M(box(0.022, 0.016, 0.004).rotateX(-0.55).translate(0, 0.036, R * 1.0), 'pin')) // the little red logo
  // brim: a crescent from the crown's front edge, curved down at the sides
  const n = 24
  const inner = []
  const outer = []
  for (let i = 0; i <= n; i++) {
    const x = -R + (2 * R * i) / n
    const zi = Math.sqrt(Math.max(0, R * R - x * x)) * 1.12 * 0.9
    inner.push(new THREE.Vector2(x, zi))
    outer.push(new THREE.Vector2(x, zi + 0.075 * Math.sqrt(Math.max(0, 1 - (x / R) ** 2))))
  }
  const brim = new THREE.ExtrudeGeometry(new THREE.Shape([...outer, ...inner.reverse()]), { depth: 0.004, bevelEnabled: false })
  brim.rotateX(Math.PI / 2).translate(0, 0.004, 0)
  const p = brim.attributes.position
  // the crown rim rests on the shelf: the brim arches up in the middle and droops a little at the front
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 2.6 * (R * R - p.getX(i) ** 2) - 0.1 * Math.max(0, p.getZ(i) - 0.09))
  brim.computeVertexNormals()
  g.add(M(brim, 'capNavy'))
  return g
}
/** pothos in a black nursery pot, trailing down the left side and over the front */
function hangingPothos(seed) {
  const r = rand(seed)
  const g = potPlant(0.068, 0.1, 20, seed, 'potBlack')
  g.name = 'Pothos'
  const vines = [
    [[-0.04, 0.09, 0.03], [-0.13, 0.05, 0.08], [-0.17, -0.15, 0.1], [-0.18, -0.4, 0.12], [-0.17, -0.62, 0.11]],
    [[-0.02, 0.09, 0.05], [-0.05, 0.03, 0.15], [-0.08, -0.18, 0.17], [-0.1, -0.36, 0.18]],
    [[0.04, 0.09, 0.04], [0.09, 0.03, 0.13], [0.11, -0.12, 0.16]],
  ]
  for (const pts of vines) {
    g.add(M(tube(pts, 0.0022, 36, 4), 'stem'))
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => V(...q)))
    const leaves = Math.round(curve.getLength() / 0.032)
    for (let k = 1; k <= leaves; k++) {
      const lf = leaf('pothos', 0.055 + r() * 0.03, r() * 360, -20 + r() * 50, (r() - 0.5) * 60, 0.06, 0.04)
      lf.position.copy(curve.getPoint(k / (leaves + 0.5)))
      g.add(lf)
    }
  }
  return g
}
/**
 * The shoe stack from the reference photo: a narrow white ladder shelf (30 × 25 cm, six shelves) standing against
 * the wall — sneakers lengthwise on the shelves, a cap in the middle, a pothos on top. Origin: floor, back of the rails.
 */
function shoeStack() {
  const g = G('Shoe_Stack')
  const Wd = 0.3
  const depth = 0.25
  const rail = { w: 0.026, d: 0.034 }
  const zs = rail.d + depth / 2 // shelf centre
  const tops = [0.13, 0.45, 0.77, 1.09, 1.41, 1.73]
  const th = 0.045
  const unit = G('Shoe_Shelf')
  const railH = tops[5] + 0.02
  for (const sx of [-1, 1]) unit.add(M(rbox(rail.w, railH, rail.d, 0.004).translate(sx * (Wd / 2 - rail.w / 2), railH / 2, rail.d / 2), 'lackWhite'))
  for (const y of tops) unit.add(M(rbox(Wd, th, depth, 0.006).translate(0, y - th / 2, zs), 'lackWhite'))
  g.add(bake(unit))
  const shelf = (k, obj) => g.add(at(obj, 0, tops[k], zs))
  shelf(0, bake(sneakerPair('shoe-panda', 'soleWhite', 0.03, 811)))
  shelf(1, bake(sneakerPair('shoe-green', 'soleGum', 0.026, 812)))
  shelf(2, bake(G('Cap', at(cap(), 0.01, 0, 0, -38))))
  shelf(3, bake(sneakerPair('shoe-grey', 'soleCream', 0.028, 813)))
  shelf(4, bake(sneakerPair('shoe-maroon', 'soleWhite', 0.028, 814)))
  shelf(5, bake(G('Pothos', at(hangingPothos(815), 0.01, 0, 0))))
  return g
}

/* ── the desk set ─────────────────────────────────────────────────────────────────────────── */
function crtMonitor() {
  const g = G('CRT_Monitor')
  const body = G('CRT_Body')
  // swivel stand
  body.add(M(lathe([[0, 0], [0.12, 0], [0.12, 0.012], [0.1, 0.022], [0.05, 0.03], [0, 0.03]], 40), 'beige'))
  body.add(M(rbox(0.16, 0.05, 0.14, 0.01).translate(0, 0.05, -0.1), 'beige'))
  // rear housing: a rounded, tapering loft
  const yc = 0.27
  for (const part of loft([
    { z: 0, w: 0.388, h: 0.36, r: 0.028, y: yc },
    { z: -0.06, w: 0.382, h: 0.352, r: 0.03, y: yc },
    { z: -0.26, w: 0.3, h: 0.27, r: 0.04, y: yc - 0.005 },
    { z: -0.38, w: 0.2, h: 0.18, r: 0.04, y: yc - 0.01 },
  ]))
    body.add(M(part, 'beige'))
  // vents on the housing sides
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) body.add(M(beam([s * 0.176, yc + 0.08 - k * 0.02, -0.12], [s * 0.153, yc + 0.075 - k * 0.019, -0.24], 0.003, 0.005), 'beigeDark'))
  // front bezel with the screen opening (screen sits a little above centre, chin below)
  const bez = roundRect(0.4, 0.37, 0.022, 0, 0)
  bez.holes.push(roundRect(0.318, 0.246, 0.014, 0, 0.03))
  body.add(M(new THREE.ExtrudeGeometry(bez, { depth: 0.04, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 6 }).translate(0, yc, 0.004), 'beige'))
  body.add(M(box(0.328, 0.256, 0.01).translate(0, yc + 0.03, 0.012), 'crtInner'))
  body.add(M(cyl(0.008, 0.008, 0.01, 16).rotateX(Math.PI / 2).translate(0.15, yc - 0.155, 0.047), 'beigeDark'))
  body.add(M(new THREE.SphereGeometry(0.003, 8, 6).translate(0.13, yc - 0.155, 0.047), 'led'))
  body.add(M(box(0.07, 0.009, 0.002).translate(0, yc - 0.152, 0.0465), 'beigeDark'))
  g.add(bake(body))
  // the glass: its own mesh with clean 0..1 UVs, so a page/canvas can be shown on it later
  const sw = 0.305
  const sh = 0.232
  const scr = new THREE.PlaneGeometry(sw, sh, 24, 18)
  const p = scr.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (sw / 2)
    const v = p.getY(i) / (sh / 2)
    p.setZ(i, 0.013 * (1 - (u * u + v * v) / 2))
  }
  scr.computeVertexNormals()
  const screen = M(scr.translate(0, yc + 0.03, 0.016), 'crtGlass', 'CRT_Screen')
  g.add(screen)
  return g
}

function pcTower() {
  const g = G('PC_Tower')
  const w = 0.19
  const h = 0.42
  const d = 0.44
  g.add(M(rbox(w, h, d, 0.012).translate(0, h / 2, 0), 'beige'))
  const fz = d / 2 + 0.002
  for (const [y, hh] of [
    [0.36, 0.042],
    [0.31, 0.042],
  ]) {
    g.add(M(box(0.155, hh, 0.006).translate(0, y, fz), 'beigeDark'))
    g.add(M(box(0.11, 0.004, 0.004).translate(0, y - 0.006, fz + 0.004), 'darkSlot'))
    g.add(M(box(0.012, 0.006, 0.004).translate(0.06, y - 0.012, fz + 0.004), 'beige'))
  }
  g.add(M(box(0.155, 0.03, 0.006).translate(0, 0.255, fz), 'beigeDark'))
  g.add(M(box(0.09, 0.003, 0.004).translate(-0.01, 0.255, fz + 0.004), 'darkSlot'))
  g.add(M(cyl(0.013, 0.013, 0.008, 20).rotateX(Math.PI / 2).translate(-0.045, 0.19, fz + 0.002), 'beigeDark'))
  g.add(M(cyl(0.006, 0.006, 0.008, 12).rotateX(Math.PI / 2).translate(0.05, 0.19, fz + 0.002), 'darkSlot'))
  g.add(M(new THREE.SphereGeometry(0.0028, 8, 6).translate(0.02, 0.19, fz + 0.004), 'led'))
  for (let k = 0; k < 8; k++) g.add(M(box(0.14, 0.004, 0.004).translate(0, 0.04 + k * 0.012, fz + 0.001), 'beigeDark'))
  return bake(g)
}

function keyboard() {
  const g = G('Keyboard')
  const base = G('KbBase')
  base.add(M(rbox(0.46, 0.026, 0.165, 0.006).translate(0, 0.013, 0), 'beige'))
  g.add(bake(base))
  const keys = G('Keys')
  const u = 0.0185
  const rows = [
    [1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
    [1.5, 1, 1.5, 7, 1.5, 1, 1.5],
  ]
  const x0 = -0.22
  rows.forEach((row, ri) => {
    let x = x0
    const z = -0.066 + ri * u * (ri === 0 ? 1 : 1) + (ri > 0 ? 0.006 : 0)
    row.forEach((wu, ki) => {
      if (wu < 0) {
        x += -wu * u
        return
      }
      const mod = wu > 1.2 || ri === 0 || ki === 0
      keys.add(M(box(wu * u - 0.003, 0.009, u - 0.003).translate(x + (wu * u) / 2, 0.03 + ri * 0.0012, z), mod ? 'keycapDark' : 'keycap'))
      x += wu * u
    })
  })
  // navigation cluster + arrows + numpad
  const nx = x0 + 15.3 * u
  for (let c = 0; c < 3; c++) for (let rr = 1; rr < 3; rr++) keys.add(M(box(u - 0.003, 0.009, u - 0.003).translate(nx + c * u + u / 2, 0.03, -0.066 + rr * u + 0.006), 'keycap'))
  for (const [c, rr] of [
    [1, 4],
    [0, 5],
    [1, 5],
    [2, 5],
  ])
    keys.add(M(box(u - 0.003, 0.009, u - 0.003).translate(nx + c * u + u / 2, 0.03, -0.066 + rr * u + 0.006), 'keycap'))
  const px = nx + 3.3 * u
  for (let c = 0; c < 4; c++) for (let rr = 1; rr < 6; rr++) keys.add(M(box(u - 0.003, 0.009, u - 0.003).translate(px + c * u + u / 2, 0.03, -0.066 + rr * u + 0.006), c === 3 ? 'keycapDark' : 'keycap'))
  g.add(bake(keys))
  g.rotation.x = (3 * Math.PI) / 180
  return g
}

function mouseAndPad() {
  const g = G('Mouse')
  g.add(M(rbox(0.25, 0.004, 0.21, 0.002, 1).translate(0, 0.002, 0), 'blackMatte'))
  const shell = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.031, 0.019, 0.055).translate(0.01, 0.004, 0.01)
  g.add(M(shell, 'keycap'))
  g.add(M(box(0.001, 0.004, 0.035).translate(0.01, 0.022, -0.02), 'keycapDark'))
  return bake(g)
}

function lamp() {
  const g = G('Desk_Lamp')
  const parts = G('LampParts')
  parts.add(M(lathe([[0, 0], [0.075, 0], [0.075, 0.012], [0.062, 0.024], [0, 0.024]], 40), 'black'))
  parts.add(M(cyl(0.012, 0.012, 0.05, 16).translate(0, 0.048, 0), 'black'))
  const P0 = [0, 0.07, 0]
  const P1 = [0.05, 0.43, 0.03]
  const P2 = [0.3, 0.47, 0.17]
  for (const o of [-0.012, 0.012]) {
    parts.add(M(rod([P0[0] + o, P0[1], P0[2]], [P1[0] + o, P1[1], P1[2]], 0.0055), 'black'))
    parts.add(M(rod([P1[0] + o, P1[1], P1[2]], [P2[0] + o, P2[1], P2[2]], 0.0055), 'black'))
  }
  parts.add(M(new THREE.SphereGeometry(0.016, 16, 12).translate(...P1), 'black'))
  parts.add(M(new THREE.SphereGeometry(0.014, 16, 12).translate(...P2), 'black'))
  parts.add(M(rod([P0[0], P0[1] + 0.03, P0[2] + 0.02], [P1[0], P1[1] - 0.06, P1[2] + 0.02], 0.003), 'black')) // spring
  g.add(bake(parts))
  // head: dome shade pointing down and forward
  const head = G('LampHead')
  const prof = [
    [0.012, 0],
    [0.03, 0.006],
    [0.058, 0.035],
    [0.074, 0.075],
    [0.079, 0.105],
  ]
  head.add(M(lathe(prof, 40), 'black'))
  head.add(M(flip(lathe(prof.map(([r, y]) => [r * 0.965, y + 0.002]), 40)), 'lampInner'))
  head.add(M(new THREE.SphereGeometry(0.026, 16, 12).translate(0, 0.055, 0), 'bulb', 'Lamp_Bulb'))
  const headGroup = bake(head)
  headGroup.position.set(P2[0] + 0.02, P2[1] + 0.03, P2[2] + 0.02)
  headGroup.rotation.set(Math.PI * 0.82, 0.55, 0.15)
  g.add(headGroup)
  g.userData.bulb = headGroup
  return g
}

function books() {
  const g = G('Desk_Books')
  g.add(at(book(0.25, 0.036, 0.18, 1), 0, 0.018, 0, 6))
  g.add(at(book(0.225, 0.03, 0.16, 0), 0.01, 0.036 + 0.015, 0.005, -4))
  return bake(g)
}

function penHolder() {
  const r = rand(401)
  const g = G('Pen_Holder')
  g.add(M(lathe([[0, 0], [0.034, 0], [0.034, 0.1], [0.031, 0.1], [0.031, 0.006], [0, 0.006]], 32), 'ceramicSage'))
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2
    const rr = r() * 0.018
    const b = [Math.cos(a) * rr, 0.01, Math.sin(a) * rr]
    const tip = [b[0] + Math.cos(a) * 0.03, 0.14 + r() * 0.03, b[2] + Math.sin(a) * 0.03]
    g.add(M(rod(b, tip, 0.0045, 8), 'pen'))
  }
  return bake(g)
}

function camera() {
  const g = G('Camera')
  const b = G('CameraBody')
  b.add(M(rbox(0.135, 0.085, 0.066, 0.01).translate(0, 0.0425, 0), 'blackMatte'))
  b.add(M(rbox(0.036, 0.08, 0.078, 0.013).translate(0.054, 0.041, 0.008), 'rubber'))
  b.add(M(cyl(0.028, 0.044, 0.032, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8).translate(0, 0.1, -0.004), 'blackMatte'))
  b.add(M(cyl(0.013, 0.013, 0.01, 20).translate(-0.046, 0.09, -0.004), 'black'))
  b.add(M(cyl(0.006, 0.006, 0.006, 12).translate(0.055, 0.084, 0.02), 'black'))
  // lens
  b.add(M(cyl(0.036, 0.036, 0.022, 32).rotateX(Math.PI / 2).translate(-0.006, 0.043, 0.044), 'black'))
  b.add(M(cyl(0.034, 0.035, 0.05, 32).rotateX(Math.PI / 2).translate(-0.006, 0.043, 0.08), 'rubber'))
  b.add(M(cyl(0.036, 0.034, 0.012, 32).rotateX(Math.PI / 2).translate(-0.006, 0.043, 0.111), 'black'))
  b.add(M(cyl(0.027, 0.027, 0.002, 32).rotateX(Math.PI / 2).translate(-0.006, 0.043, 0.117), 'lensGlass'))
  b.add(M(new THREE.TorusGeometry(0.0355, 0.0012, 6, 48).translate(-0.006, 0.043, 0.1045), 'strapRed'))
  // strap looping onto the desk
  const strap = [
    [-0.068, 0.07, 0],
    [-0.105, 0.03, -0.02],
    [-0.1, 0.004, -0.11],
    [0, 0.004, -0.16],
    [0.11, 0.004, -0.11],
    [0.115, 0.03, -0.03],
    [0.068, 0.07, 0],
  ]
  b.add(M(tube(strap, 0.0055, 64, 6).scale(1, 1, 1), 'strap'))
  b.add(M(tube([[-0.04, 0.004, -0.15], [0, 0.004, -0.162], [0.04, 0.004, -0.152]], 0.0058, 16, 6), 'strapRed'))
  g.add(bake(b))
  return g
}

function deskSet() {
  const g = G('Desk_Set')
  const top = 0.75
  const sx = L.desk.setScaleX // narrower desk: pull the objects in (1 = unchanged)
  const put = (obj, x, z, ry = 0, y = top) => g.add(at(obj, sx === 1 ? x : x * sx, y, z, ry))
  put(crtMonitor(), 0.08, -0.08)
  put(pcTower(), -0.42, -0.1)
  put(keyboard(), 0.08, 0.2)
  put(mouseAndPad(), 0.5, 0.22, -6)
  const l = lamp()
  put(l, -0.66, -0.24, 10)
  put(potPlant(0.058, 0.09, 14, 501), -0.62, 0.04)
  put(books(), -0.55, 0.24, 8)
  put(penHolder(), 0.52, -0.16)
  put(M(boxUV(box(0.056, 0.036, 0.036).translate(0, 0.018, 0), 0.3), 'oak', 'Wood_Block'), 0.61, -0.08, 14)
  put(M(box(0.075, 0.008, 0.075).translate(0, 0.004, 0), 'pages', 'Note_Pad'), 0.43, -0.02, -8)
  put(camera(), 0.68, 0.05, -35)
  put(M(lathe([[0, 0], [0.078, 0], [0.083, 0.012], [0.08, 0.014], [0.074, 0.006], [0, 0.006]], 40), 'oak', 'Wood_Tray'), 0.66, 0.29)
  // cables: mouse → back of desk, monitor → tower
  g.add(M(tube([[0.5, top + 0.02, 0.17], [0.46, top + 0.004, 0.06], [0.38, top + 0.004, -0.2], [0.3, top + 0.004, -0.36]], 0.0025, 40, 5), 'cable'))
  g.add(M(tube([[0.08, top + 0.1, -0.44], [-0.1, top + 0.02, -0.38], [-0.3, top + 0.02, -0.34]], 0.004, 30, 6), 'cableBlack'))
  return g
}

/* ── walls: frames, postcards, papers ─────────────────────────────────────────────────────── */
const PHOTO_ASPECT = { family: 1280 / 719, 'pines-mist': 0.8, 'road-long': 0.667, 'path-figure': 0.8, 'coast-headland': 1.333, 'street-car': 0.667, dunes: 1, 'ridge-gold': 1.5, 'city-dusk': 1.5, 'window-light': 0.8, 'night-sky': 1.5 }

/** black frame + white mat + photo (own mesh `Frame_<id>_Photo`, 0..1 UVs), facing +z, back on z=0 */
function frame(id, w, h, photoKey, margin = 0.07) {
  const g = G(`Frame_${id}`)
  const b = 0.024
  const dep = 0.03
  g.add(M(box(w, b, dep).translate(0, h / 2 - b / 2, dep / 2), 'frameBlack'))
  g.add(M(box(w, b, dep).translate(0, -h / 2 + b / 2, dep / 2), 'frameBlack'))
  g.add(M(box(b, h - 2 * b, dep).translate(-w / 2 + b / 2, 0, dep / 2), 'frameBlack'))
  g.add(M(box(b, h - 2 * b, dep).translate(w / 2 - b / 2, 0, dep / 2), 'frameBlack'))
  g.add(M(box(w - 2 * b, h - 2 * b, 0.006).translate(0, 0, 0.012), 'mat'))
  const aw = w - 2 * b - 2 * margin * Math.min(w, h)
  const ah = h - 2 * b - 2 * margin * Math.min(w, h)
  const a = PHOTO_ASPECT[photoKey]
  const [pw, ph] = aw / ah > a ? [ah * a, ah] : [aw, aw / a]
  const baked = bake(g)
  const photo = M(new THREE.PlaneGeometry(pw, ph).translate(0, 0, 0.0155), `photo-${photoKey}`, `Frame_${id}_Photo`)
  baked.add(photo)
  baked.userData.extras = { photo: photoKey }
  return baked
}

function postcard(photoKey, w) {
  const g = G(`Postcard_${photoKey}`)
  const a = PHOTO_ASPECT[photoKey]
  const h = w / a
  g.add(M(box(w + 0.012, h + 0.012, 0.002).translate(0, 0, 0.001), 'mat'))
  g.add(M(new THREE.PlaneGeometry(w, h).translate(0, 0, 0.0025), `photo-${photoKey}`))
  g.add(M(new THREE.SphereGeometry(0.004, 8, 6).translate(0, h / 2 - 0.004, 0.004), 'pin'))
  return bake(g)
}

function wallDecor() {
  const g = G('Wall_Decor')
  const back = Z0 + 0.002
  // back wall, above the desk (as in the photographs)
  for (const [id, w, h, photo, margin, x, y] of L.back) g.add(at(frame(id, w, h, photo, margin), x, y, back))
  // right wall: the street poster and a cluster of postcards near the back corner
  const right = X1 - 0.002
  if (L.street) g.add(at(frame('street', L.street.w, L.street.h, 'street-car', 0.05), right, L.street.y, L.street.z, -90))
  for (const [k, w, z, y, rz] of L.postcards) g.add(at(postcard(k, w), right, y, z, -90, 0, rz))
  // the bigger room gets two more pieces
  for (const f of L.extraFrames) g.add(at(frame(...f.args), ...f.at))
  // sketches pinned beside the shelf (left wall)
  for (const [z, y, rz] of L.sketches) {
    const p = G('Sketch')
    p.add(M(new THREE.PlaneGeometry(0.21, 0.297).translate(0, 0, 0.001), 'paper'))
    p.add(M(new THREE.SphereGeometry(0.004, 8, 6).translate(0, 0.14, 0.004), 'pin'))
    g.add(at(bake(p), X0 + 0.002, y, z, 90, 0, rz))
  }
  // light switch by the door
  g.add(at(M(box(0.012, 0.12, 0.08).translate(-0.006, 0, 0), 'switchPlate', 'Light_Switch'), X1, 1.2, L.switchZ))
  return g
}

function ceilingFan() {
  const g = G('Ceiling_Fan')
  const parts = G('FanParts')
  parts.add(M(lathe([[0, 0], [0.075, 0], [0.07, -0.04], [0.02, -0.06], [0, -0.06]], 32), 'fanBody'))
  parts.add(M(cyl(0.012, 0.012, 0.32, 12).translate(0, -0.2, 0), 'fanBody'))
  parts.add(M(lathe([[0, 0], [0.1, 0], [0.11, -0.04], [0.09, -0.1], [0.03, -0.12], [0, -0.12]].map(([r, y]) => [r, y - 0.34]), 40), 'fanBody'))
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3
    const blade = new THREE.Shape()
    blade.moveTo(0.1, -0.05)
    blade.lineTo(0.66, -0.07)
    blade.quadraticCurveTo(0.72, 0, 0.66, 0.07)
    blade.lineTo(0.1, 0.05)
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2 + 0.12).translate(0, -0.4, 0).rotateY(a)
    parts.add(M(bg, 'fanBlade'))
    parts.add(M(box(0.14, 0.012, 0.03).translate(0.1, -0.41, 0).rotateY(a), 'fanBody'))
  }
  g.add(bake(parts))
  return at(g, L.fan[0], H, L.fan[1])
}

/* ── lights & viewpoints ──────────────────────────────────────────────────────────────────── */
function lights(bulbWorld) {
  const g = G('Lights')
  const sun = new THREE.DirectionalLight(L.sun.color ?? 0xffd29c, L.sun.intensity)
  sun.name = 'Sun'
  sun.position.set(...L.sun.pos)
  sun.lookAt(...L.sun.look)
  g.add(sun)
  const spot = new THREE.SpotLight(0xffc98a, 6, 4, 0.8, 0.55, 2)
  spot.name = 'Lamp_Light'
  spot.position.copy(bulbWorld)
  spot.lookAt(bulbWorld.x + 0.15, 0.75, bulbWorld.z + 0.1)
  g.add(spot)
  const fill = new THREE.PointLight(0xffe8cc, L.fill.intensity, 16, 2)
  fill.name = 'Room_Fill'
  fill.position.set(...L.fill.pos)
  g.add(fill)
  return g
}

function viewpoints() {
  const g = G('Viewpoints')
  const cam = (name, pos, target, fov = 50) => {
    const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 60)
    c.name = name
    c.position.set(...pos)
    c.lookAt(...target)
    g.add(c)
  }
  // the four photographed angles plus an overview
  for (const [name, pos, target, fov] of L.views) cam(name, pos, target, fov)
  return g
}

/* ── assemble + export ────────────────────────────────────────────────────────────────────── */
async function main() {
  console.log('textures…')
  const textures = await buildTextures(ROOT)

  const root = G('Room')
  root.userData.extras = { units: 'meters', upAxis: 'Y', size: { width: W, depth: D, height: H }, generator: 'scripts/room-model/build-room-model.mjs' }
  root.add(architecture())
  root.add(G('Windows', ...WINDOWS.map(windowUnit)))
  root.add(outside())
  root.add(door())

  const furniture = G('Furniture')
  furniture.add(at(desk(), L.desk.x, 0, L.desk.z))
  const set = deskSet()
  furniture.add(at(set, L.desk.x, 0, L.desk.z))
  furniture.add(at(chair(), L.chair[0], 0, L.chair[1], L.chair[2]))
  furniture.add(at(rug(), L.rug.x, 0, L.rug.z))
  furniture.add(at(shelf(), L.shelf.x, 0, L.shelf.z, 90))
  if (L.bench) furniture.add(at(bench(), L.bench.x, 0, L.bench.z, 90))
  if (L.shoeStack) furniture.add(at(shoeStack(), L.shoeStack.x, 0, L.shoeStack.z))
  root.add(furniture)

  if (L.plants.length) root.add(G('Plants', ...L.plants.map(([seed, scale, count, x, z]) => at(monstera(seed, scale, count), x, 0, z))))
  root.add(wallDecor())
  root.add(ceilingFan())

  root.updateMatrixWorld(true)
  const bulb = new THREE.Vector3()
  set.children.find((c) => c.name === 'Desk_Lamp').userData.bulb.localToWorld(bulb.set(0, 0.055, 0))
  root.add(lights(bulb))
  root.add(viewpoints())

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const doc = await exportGLB(root, MATERIALS, textures, OUT, { withTangents: !!P.realism })
  const tris = doc
    .getRoot()
    .listMeshes()
    .reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0)
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
  console.log(`→ ${path.relative(ROOT, OUT)}  ${kb} KB · ${doc.getRoot().listMeshes().length} meshes · ${Math.round(tris).toLocaleString()} triangles · ${doc.getRoot().listMaterials().length} materials · ${doc.getRoot().listTextures().length} textures`)
}

await main()
