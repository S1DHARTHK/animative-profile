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
    theme: 'night', // the modern room at night: warm greige paint, carpet, LED lines, downlights, dark garden outside
    W: 3.3,
    D: 4.0,
    H: 2.9,
    windows: [],
    // French balcony doors in the left wall where the window was (centre z, width, height)
    balcony: { z: -0.98, w: 1.7, h: 2.36 },
    win: { w: 1.15, h: 1.25, sill: 1.05 },
    door: { z: 1.3, w: 0.9, h: 2.1 },
    layout: ({ X0, X1, Z0, DOOR }) => ({
      // gaming corner (reference photo): an L-shaped wooden desk along the back wall and returning along the right wall,
      // two monitors, speakers, an RGB gaming PC; a wooden slat wall behind with three light-sabre bars and wooden
      // floating shelves of collectibles; dark olive walls
      desk: { table: 'corner', set: 'gaming', x: 0, z: 0, x0: -0.88, d: 0.65, ret: 1.45, retD: 0.6, top: 0.75 },
      // the gaming chair in front of the right monitor (its tall back stays off the camera's path from the left screen)
      chair: [0.66, Z0 + 1.05, 10],
      chairStyle: 'gaming',
      slatWall: { x0: -0.92, x1: X1, y0: 0.77 },
      sabers: [
        [0.05, 'saberRed', 'saberRedWash'],
        [0.33, 'saberOrange', 'saberOrangeWash'],
        [0.61, 'saberWarm', 'saberWarmWash'],
      ],
      woodShelves: { x: 1.27, w: 0.62, depth: 0.22, ys: [1.42, 1.75, 2.08] },
      darkRug: { x: 0.35, z: -0.95, w: 1.7, d: 1.25 },
      rug: null,
      shelf: null,
      bench: null,
      plants: [],
      back: [], // no wall frames
      street: null,
      postcards: [],
      extraFrames: [],
      sketches: [],
      switchZ: DOOR.z - 0.75,
      fan: null,
      // a cluster of rattan ball pendants beside the globe shelf (its left, toward the front corner); the room's light
      cluster: { x: X0 + 0.42, z: Z1 - 0.28 },
      // a bean-bag corduroy loveseat against the front wall (behind you as you face the desk), facing the room
      sofa: { x: -0.15, z: Z1 - 0.6 },
      // a spherical bookshelf on the left wall, between the window's curtain and the front corner
      globeShelf: { z: 0.85, y: 1.45, r: 0.8, depth: 0.3, shelves: 6, fins: [-0.52, -0.18, 0.18, 0.52] },
      // sheer voile either side of the balcony doors: gathered toward `outer`, the free edge at `inner` (z on the left wall)
      sheers: [
        { outer: -1.98, inner: -1.45 },
        { outer: 0.02, inner: -0.5 },
      ],
      // night: a faint cool moon through the window; the pendant lights the room, the shelf LED the desk
      sun: { pos: [-5.94, 3.6, -3.23], look: [X1, 0.4, 0.45], intensity: 0.6, color: 0x9fb4ff },
      fill: { pos: [X0 + 0.42, 1.92, Z1 - 0.28], intensity: 2, color: 0xffb870 },
      lamp: { color: 0xffe6cc },
      // twin recessed downlights in the soffit (wall, position along it), each washing the wall below with a scallop
      downlights: [
        ['right', -1.3],
        ['right', -0.2],
        ['left', 0.55],
        ['left', 1.45],
      ],
      views: [
        ['View_Doorway', [1.1, 1.6, 1.85], [-0.1, 1.05, -1.6], 62],
        ['View_Shelf', [-0.75, 1.55, 1.75], [0.55, 1.0, -1.7], 58],
        ['View_Desk', [0.2, 1.35, 0.85], [0.2, 1.25, -2.0], 55],
        ['View_Close', [-0.35, 1.2, -0.75], [0.25, 1.0, -1.75], 48],
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
  // modern dark room (small room)
  blackSteel: { color: '#1b1b1b', rough: 0.42, metal: 0.6 },
  binderBlack: { color: '#1c1c1e', rough: 0.55 },
  bookGray: { color: '#55565a', rough: 0.7 },
  ledStrip: { color: '#ffffff', emissive: '#ffe4c2', emissiveStrength: 8 },
  ledWash: { color: '#000000', tex: 'ledGlow', alpha: 'BLEND', emissive: '#ffd9ae', emissiveTex: 'ledGlow', emissiveStrength: 1.2, double: true, rough: 1 },
  scallopWash: { color: '#000000', tex: 'scallop', alpha: 'BLEND', emissive: '#ffe0ba', emissiveTex: 'scallop', emissiveStrength: 1, double: true, rough: 1 },
  trimWhite: { color: '#e9e6e0', rough: 0.4 },
  shelfOak: { tex: 'oak', color: '#fff2e2', rough: 0.5, normal: 'woodN', normalScale: 0.4 },
  bookWhite: { color: '#ebe6dc', rough: 0.7 },
  downlightLens: { color: '#ffffff', emissive: '#ffe7c4', emissiveStrength: 6 },
  deskWood: { tex: 'oak', color: '#cfae8c', rough: 0.5, normal: 'woodN', normalScale: 0.4 },
  deskWoodDark: { tex: 'oak', color: '#bf9c7a', rough: 0.5, normal: 'woodN', normalScale: 0.4 },
  slatWood: { tex: 'oak', color: '#c09a76', rough: 0.55, normal: 'woodN', normalScale: 0.3 },
  feltBlack: { color: '#1b1b1a', rough: 1 },
  deskMatDark: { color: '#232324', rough: 0.95 },
  pcGlass: { color: '#0e0e12', opacity: 0.35, alpha: 'BLEND', rough: 0.05, double: true },
  rgbPink: { color: '#ffffff', emissive: '#ff4f8b', emissiveStrength: 5 },
  rgbRed: { color: '#ffffff', emissive: '#ff3b2f', emissiveStrength: 5 },
  kbGlow: { color: '#000000', emissive: '#ff5a8a', emissiveStrength: 1.4 },
  saberRed: { color: '#ffffff', emissive: '#ff3b1f', emissiveStrength: 7 },
  saberOrange: { color: '#ffffff', emissive: '#ff8a26', emissiveStrength: 7 },
  saberWarm: { color: '#ffffff', emissive: '#ffd58a', emissiveStrength: 7 },
  saberRedWash: { color: '#000000', tex: 'saberGlow', alpha: 'BLEND', emissive: '#ff4a2a', emissiveTex: 'saberGlow', emissiveStrength: 1.1, double: true, rough: 1 },
  saberOrangeWash: { color: '#000000', tex: 'saberGlow', alpha: 'BLEND', emissive: '#ff8f3a', emissiveTex: 'saberGlow', emissiveStrength: 1.1, double: true, rough: 1 },
  saberWarmWash: { color: '#000000', tex: 'saberGlow', alpha: 'BLEND', emissive: '#ffd08f', emissiveTex: 'saberGlow', emissiveStrength: 1.1, double: true, rough: 1 },
  figureDark: { color: '#3a3936', rough: 0.45, metal: 0.4 },
  rugDark: { tex: 'carpet', color: '#6b6b6e', normal: 'carpetN', normalScale: 1.2, rough: 1 },
  monitorBlack: { color: '#141416', rough: 0.35, metal: 0.4 },
  wallpaperMono: { color: '#000000', emissive: '#ffffff', emissiveTex: 'wallpaperMono', emissiveStrength: 0.8, rough: 0.22 },
  screenWindow: { color: '#100b08', rough: 0.25 },
  kbBlack: { color: '#1d1d1f', rough: 0.55 },
  keyBlack: { color: '#2a2a2d', rough: 0.55 },
  plasticDark: { color: '#262628', rough: 0.45 },
  caseBlack: { color: '#161618', rough: 0.6 },
  chairBlack: { color: '#1b1b1d', rough: 0.45 },
  chairWhite: { color: '#2e2e31', rough: 0.5 }, // the gaming corner's chair is all black
  chairHole: { color: '#0b0b0c', rough: 0.8 },
  shelfBlack: { color: '#1b1b1d', rough: 0.5 },
  sphereDark: { color: '#2a2a2e', rough: 0.2, metal: 0.8 },
  potDark: { color: '#2b2b2e', rough: 0.6 },
  frameWhite: { color: '#efece5', rough: 0.45 },
  corduroy: { tex: 'corduroy', normal: 'corduroyN', normalScale: 1, rough: 0.92 },
  sheer: { color: '#f7f4ee', opacity: 0.5, alpha: 'BLEND', double: true, rough: 0.95 },
  stone: { tex: 'tiles', color: '#ddd7cc', rough: 0.7 },
  stoneWhite: { color: '#e9e5dc', rough: 0.75 },
  cypress: { color: '#2f3d27', rough: 0.95 },
  shrub: { color: '#3c4a2c', rough: 0.95 },
  wicker: { tex: 'wicker', alpha: 'MASK', cutoff: 0.45, double: true, rough: 0.8 },
  rope: { color: '#b8956a', rough: 0.95 },
  edisonBulb: { color: '#ffd9a0', emissive: '#ffb35c', emissiveStrength: 7 },
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
// the modern dark room: charcoal plaster, carpet, dark trims, a night garden outside
if (P.theme === 'night') {
  // dark olive-grey paint with a fine roller stipple, a dark ceiling and skirting (reference photo); light door and sill
  Object.assign(MATERIALS.wall, { tex: 'plasterGray', color: '#4d5249', rough: 0.9, normal: 'paintN', normalScale: 0.35 })
  Object.assign(MATERIALS.ceiling, { tex: 'plasterGray', color: '#44463f', rough: 0.92, normal: 'paintN', normalScale: 0.25 })
  Object.assign(MATERIALS.floorTile, { tex: 'carpet', normal: 'carpetN', normalScale: 0.7, rough: 1 })
  Object.assign(MATERIALS.skirting, { color: '#30332e', rough: 0.5 })
  Object.assign(MATERIALS.sill, { color: '#e3ded5' })
  Object.assign(MATERIALS.door, { color: '#e1dcd3', rough: 0.5 })
  Object.assign(MATERIALS.switchPlate, { color: '#ece8e1' })
  Object.assign(MATERIALS.garden, { emissive: '#3b4c72', emissiveStrength: 0.5 })
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

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
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
  const holes = WINDOWS.map((z) => ({ c: -z, y: WIN.sill, w: WIN.w, h: WIN.h }))
  if (P.balcony) holes.push({ c: -P.balcony.z, y: 0.001, w: P.balcony.w, h: P.balcony.h - 0.001 })
  const left = wallWithHoles(sideLen, holes)
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
  if (P.balcony) {
    // left skirting stops at the balcony doors' casing
    const a = P.balcony.z - P.balcony.w / 2 - 0.09
    const b = P.balcony.z + P.balcony.w / 2 + 0.09
    sk.add(M(box(0.014, k, a - Z0).translate(X0 + 0.007, k / 2, (Z0 + a) / 2), 'skirting'))
    sk.add(M(box(0.014, k, Z1 - b).translate(X0 + 0.007, k / 2, (b + Z1) / 2), 'skirting'))
  } else sk.add(M(box(0.014, k, D).translate(X0 + 0.007, k / 2, 0), 'skirting'))
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

/* ── modern dark room (small room): LED fit-out, minimal desk, gaming chair, floating shelves ───── */
/**
 * A soft wash of LED light on a surface: a plane `w` × `h` whose glow is strongest along one long edge (where the strip
 * is) and fades away from it. `edge` = centre of that edge, `along` = direction of the strip, `away` = direction the
 * light fades, `facing` = the surface normal (into the room). The site draws these additively.
 */
function ledWash(w, h, edge, along, away, facing, mat = 'ledWash') {
  const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0)
  const m = new THREE.Matrix4().makeBasis(V(...along), V(...away), V(...facing))
  g.applyMatrix4(m).translate(...V(...edge).addScaledVector(V(...facing), 0.003).toArray())
  return M(g, mat)
}
/** a thin LED strip (bright emissive bar) */
const ledStrip = (w, h, d, x, y, z) => M(box(w, h, d).translate(x, y, z), 'ledStrip')

/** tray ceiling with a cove LED, a dark panel along the back wall with an LED on its top edge, LED lines at the floor */
function fitout() {
  const g = G('Fitout')
  const drop = 0.15
  const band = 0.4
  const soffit = G('Ceiling_Soffit')
  soffit.add(M(box(W, drop, band, 1.5).translate(0, H - drop / 2, Z0 + band / 2), 'ceiling'))
  soffit.add(M(box(W, drop, band, 1.5).translate(0, H - drop / 2, Z1 - band / 2), 'ceiling'))
  soffit.add(M(box(band, drop, D - 2 * band, 1.5).translate(X0 + band / 2, H - drop / 2, 0), 'ceiling'))
  soffit.add(M(box(band, drop, D - 2 * band, 1.5).translate(X1 - band / 2, H - drop / 2, 0), 'ceiling'))
  g.add(bake(soffit))
  const leds = G('LED_Strips')
  const washes = G('LED_Washes')
  // cove: a strip along the top of each inner soffit face, washing the recessed ceiling
  const iw = W - 2 * band
  const id = D - 2 * band
  const top = H - 0.003
  leds.add(ledStrip(iw, 0.01, 0.008, 0, H - 0.012, Z0 + band + 0.004))
  leds.add(ledStrip(iw, 0.01, 0.008, 0, H - 0.012, Z1 - band - 0.004))
  leds.add(ledStrip(0.008, 0.01, id, X0 + band + 0.004, H - 0.012, 0))
  leds.add(ledStrip(0.008, 0.01, id, X1 - band - 0.004, H - 0.012, 0))
  washes.add(ledWash(iw, 0.75, [0, top, Z0 + band], [1, 0, 0], [0, 0, 1], [0, -1, 0]))
  washes.add(ledWash(iw, 0.75, [0, top, Z1 - band], [1, 0, 0], [0, 0, -1], [0, -1, 0]))
  washes.add(ledWash(id, 0.75, [X0 + band, top, 0], [0, 0, 1], [1, 0, 0], [0, -1, 0]))
  washes.add(ledWash(id, 0.75, [X1 - band, top, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0]))
  // the inner soffit faces catch the strip too
  washes.add(ledWash(iw, drop, [0, H - 0.005, Z0 + band], [1, 0, 0], [0, -1, 0], [0, 0, 1]))
  washes.add(ledWash(iw, drop, [0, H - 0.005, Z1 - band], [1, 0, 0], [0, -1, 0], [0, 0, -1]))
  washes.add(ledWash(id, drop, [X0 + band, H - 0.005, 0], [0, 0, 1], [0, -1, 0], [1, 0, 0]))
  washes.add(ledWash(id, drop, [X1 - band, H - 0.005, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0]))
  // floor LEDs along the side walls (around the door on the right)
  const k = 0.1
  const d0 = DOOR.z - DOOR.w / 2 - 0.08
  const d1 = DOOR.z + DOOR.w / 2 + 0.08
  const leftRuns = P.balcony
    ? [
        [Z0 + 0.02, P.balcony.z - P.balcony.w / 2 - 0.11],
        [P.balcony.z + P.balcony.w / 2 + 0.11, Z1 - 0.02],
      ]
    : [[Z0 + 0.02, Z1 - 0.02]]
  for (const [a, b] of leftRuns) {
    leds.add(ledStrip(0.01, 0.006, b - a, X0 + 0.008, k + 0.003, (a + b) / 2))
    washes.add(ledWash(b - a, 0.42, [X0, k, (a + b) / 2], [0, 0, 1], [0, 1, 0], [1, 0, 0]))
  }
  for (const [a, b] of [
    [Z0 + 0.02, d0],
    [d1, Z1 - 0.02],
  ]) {
    leds.add(ledStrip(0.01, 0.006, b - a, X1 - 0.008, k + 0.003, (a + b) / 2))
    washes.add(ledWash(b - a, 0.42, [X1, k, (a + b) / 2], [0, 0, 1], [0, 1, 0], [-1, 0, 0]))
  }
  // twin recessed downlights in the soffit; each throws a soft scallop of light down the wall below it
  const fixtures = G('Downlights')
  for (const [wall, pos] of L.downlights ?? []) {
    const side = wall === 'back' ? null : wall === 'left' ? 1 : -1
    const facing = side ? [side, 0, 0] : [0, 0, 1]
    const along = side ? [0, 0, 1] : [1, 0, 0]
    const at0 = side ? V(side > 0 ? X0 : X1, 0, pos) : V(pos, 0, Z0)
    const c = at0.clone().addScaledVector(V(...facing), 0.24)
    const fx = G('Downlight')
    fx.add(M(rbox(0.2, 0.006, 0.1, 0.002).translate(0, -0.003, 0), 'trimWhite'))
    for (const s of [-1, 1]) fx.add(M(box(0.07, 0.002, 0.07).translate(s * 0.048, -0.0065, 0), 'downlightLens'))
    fixtures.add(at(fx, c.x, H - drop, c.z, side ? 90 : 0))
    washes.add(ledWash(wall === 'back' ? 0.8 : 1.0, 1.7, [at0.x, H - drop, at0.z], along, [0, -1, 0], facing, 'scallopWash'))
  }
  g.add(bake(fixtures))
  g.add(bake(leds))
  g.add(bake(washes))
  return g
}

/** bend a geometry around a vertical axis R in front of it (a curved monitor: the edges come toward the viewer) */
function curve(g, R) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / R
    const z = p.getZ(i) // depth behind the glass (negative) measured from the curve's centre, R in front
    p.setX(i, (R - z) * Math.sin(a))
    p.setZ(i, R - (R - z) * Math.cos(a))
  }
  g.computeVertexNormals()
  return g
}
/**
 * A monitor on a slim stand (flat, or curved with `R`). The panel shows a wallpaper; the resume window in its centre
 * is `Monitor_Screen` (a flat 4:3 quad the site maps the resume onto). Origin: desk surface, panel front z = 0.
 */
function monitor({ w = 0.62, h = 0.35, R = 0, yc = 0.32, wallpaper = 'wallpaperMono', name = 'Monitor', screen = true } = {}) {
  const g = G(name)
  const bez = 0.007
  const bend = (geo) => (R ? curve(geo, R) : geo)
  const body = G('Monitor_Body')
  body.add(M(bend(new THREE.BoxGeometry(w + 2 * bez, h + 2 * bez, 0.012, R ? 64 : 1, 1, 1).translate(0, 0, -0.006)).translate(0, yc, 0), 'monitorBlack'))
  body.add(M(bend(rbox(w * 0.45, h * 0.6, 0.03, 0.01).translate(0, 0, -0.027)).translate(0, yc - 0.01, 0), 'monitorBlack'))
  body.add(M(rbox(0.25, 0.012, 0.18, 0.005).translate(0, 0.006, -0.1), 'monitorBlack'))
  body.add(M(rbox(0.045, yc - 0.02, 0.022, 0.006).translate(0, 0.012 + (yc - 0.02) / 2, -0.11), 'monitorBlack'))
  body.add(M(rbox(0.08, 0.07, 0.07, 0.008).translate(0, yc - 0.02, -0.075), 'monitorBlack'))
  g.add(bake(body))
  g.add(M(bend(new THREE.PlaneGeometry(w, h, R ? 64 : 1, 1).translate(0, 0, 0.0008)).translate(0, yc, 0), wallpaper, 'Monitor_Wallpaper'))
  const sh = h * 0.8
  const sw = (sh * 4) / 3
  const zEdge = (R ? R * (1 - Math.cos(sw / 2 / R)) : 0) + 0.0015
  if (screen) g.add(M(new THREE.PlaneGeometry(sw, sh).translate(0, yc, zEdge), 'screenWindow', 'Monitor_Screen'))
  return g
}

/** 75% low-profile keyboard */
function modernKeyboard(caseMat = 'kbBlack', keyMat = 'keyBlack', accentMat = 'keyBlack', glow = false) {
  const g = G('Keyboard')
  const parts = G('KbParts')
  const u = 0.019
  parts.add(M(rbox(16 * u + 0.014, 0.02, 6 * u + 0.014, 0.005).translate(0, 0.01, 0), caseMat))
  const rows = [
    [[1, 't'], ...Array(12).fill([1, 'd']), [1, 't'], [1, 'd'], [1, 'd']],
    [...Array(13).fill([1, 'd']), [2, 't'], [1, 'd']],
    [[1.5, 't'], ...Array(12).fill([1, 'd']), [1.5, 'd'], [1, 'd']],
    [[1.75, 't'], ...Array(11).fill([1, 'd']), [2.25, 't'], [1, 'd']],
    [[2.25, 't'], ...Array(10).fill([1, 'd']), [1.75, 't'], [1, 'd'], [1, 'd']],
    [[1.25, 't'], [1.25, 't'], [1.25, 't'], [6.25, 'd'], [1, 't'], [1, 't'], [1, 't'], [1, 'd'], [1, 'd'], [1, 'd']],
  ]
  rows.forEach((row, r) => {
    let x = -8 * u
    const z = (r - 2.5) * u
    for (const [wu, c] of row) {
      parts.add(M(rbox(wu * u - 0.0025, 0.007, u - 0.0025, 0.002, 2).translate(x + (wu * u) / 2, 0.023 - r * 0.0004, z), c === 't' ? accentMat : keyMat))
      x += wu * u
    }
  })
  if (glow) parts.add(M(new THREE.PlaneGeometry(16 * u, 6 * u).rotateX(-Math.PI / 2).translate(0, 0.0205, 0), 'kbGlow')) // RGB backlight between the keys
  g.add(bake(parts))
  g.rotation.x = 0.03
  return g
}
function modernMouse() {
  const g = G('Mouse')
  g.add(M(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.032, 0.021, 0.058), 'plasticDark'))
  g.add(M(cyl(0.004, 0.004, 0.006, 12).rotateZ(Math.PI / 2).translate(0, 0.02, -0.022), 'kbBlack'))
  return bake(g)
}
/**
 * L-shaped corner desk (after the reference photo): a wooden top along the back wall from `x0` to the right wall,
 * returning along the right wall for `ret`; a wooden end panel on the left, a drawer cabinet under the return's end,
 * a recessed modesty panel. Built in room coordinates.
 */
function cornerDesk() {
  const g = G('Desk')
  const { x0, d, ret, retD, top } = L.desk
  const th = 0.04
  const yb = top - th
  g.add(M(box(X1 - x0, th, d, 1.2).translate((x0 + X1) / 2, top - th / 2, Z0 + d / 2), 'deskWood'))
  g.add(M(box(retD, th, ret - d, 1.2).translate(X1 - retD / 2, top - th / 2, Z0 + d + (ret - d) / 2), 'deskWood'))
  g.add(M(box(0.03, yb, d - 0.02, 1.2).translate(x0 + 0.03, yb / 2, Z0 + d / 2), 'deskWood'))
  g.add(M(box(X1 - x0 - 0.1, 0.4, 0.018, 1.2).translate((x0 + X1) / 2 + 0.05, yb - 0.2, Z0 + 0.045), 'deskWood'))
  const cz = Z0 + ret - 0.25
  g.add(M(box(retD - 0.02, yb, 0.46, 1.2).translate(X1 - retD / 2, yb / 2, cz), 'deskWood'))
  for (const [y0, h] of [
    [0.04, 0.26],
    [0.31, 0.19],
    [0.51, 0.19],
  ]) {
    g.add(M(box(0.014, h - 0.012, 0.43, 0.6).translate(X1 - retD - 0.007, y0 + h / 2, cz), 'deskWoodDark'))
    g.add(M(box(0.014, 0.012, 0.14).translate(X1 - retD - 0.02, y0 + h - 0.045, cz), 'blackSteel'))
  }
  return bake(g)
}

/** small black bookshelf speaker: woofer + tweeter on the front (+z) */
function speaker() {
  const g = G('Speaker')
  g.add(M(rbox(0.13, 0.21, 0.16, 0.008).translate(0, 0.105, 0), 'caseBlack'))
  g.add(M(cyl(0.045, 0.045, 0.006, 24).rotateX(Math.PI / 2).translate(0, 0.075, 0.081), 'kbBlack'))
  g.add(M(cyl(0.022, 0.022, 0.006, 16).rotateX(Math.PI / 2).translate(0, 0.075, 0.084), 'sphereDark'))
  g.add(M(cyl(0.016, 0.016, 0.006, 16).rotateX(Math.PI / 2).translate(0, 0.165, 0.081), 'sphereDark'))
  return bake(g)
}

/** gaming PC: black case, tinted glass side (+x) over RGB fans, a lit GPU and RAM; front faces +z */
function gamingPC() {
  const g = G('PC_Tower')
  const w = 0.22
  const h = 0.47
  const d = 0.44
  const parts = G('PC_Parts')
  // shell: everything but the glass side
  parts.add(M(box(0.006, h, d).translate(-w / 2 + 0.003, h / 2 + 0.015, 0), 'caseBlack'))
  parts.add(M(box(w, 0.006, d).translate(0, h + 0.012, 0), 'caseBlack'))
  parts.add(M(box(w, 0.006, d).translate(0, 0.018, 0), 'caseBlack'))
  parts.add(M(box(w, h, 0.012).translate(0, h / 2 + 0.015, d / 2 - 0.006), 'caseBlack'))
  parts.add(M(box(w, h, 0.006).translate(0, h / 2 + 0.015, -d / 2 + 0.003), 'caseBlack'))
  for (const sz of [-1, 1]) parts.add(M(box(0.03, 0.015, 0.04).translate(0, 0.0075, sz * 0.17), 'rubber'))
  // inside: motherboard, GPU with a light bar, RAM, three front fans with RGB rings
  parts.add(M(box(0.004, h - 0.08, d - 0.12).translate(-w / 2 + 0.012, h / 2 + 0.02, -0.02), 'kbBlack'))
  parts.add(M(box(0.05, 0.12, 0.3).translate(-0.03, 0.2, -0.02), 'monitorBlack'))
  parts.add(M(box(0.002, 0.012, 0.26).translate(-0.004, 0.25, -0.02), 'rgbPink'))
  for (let i = 0; i < 4; i++) parts.add(M(box(0.006, 0.08, 0.008).translate(-w / 2 + 0.03, 0.38, -0.06 + i * 0.016), 'rgbRed'))
  for (let i = 0; i < 3; i++) {
    const y = 0.11 + i * 0.13
    parts.add(M(new THREE.TorusGeometry(0.052, 0.006, 8, 32).translate(0, y, d / 2 - 0.03), i === 1 ? 'rgbRed' : 'rgbPink'))
    parts.add(M(cyl(0.045, 0.045, 0.01, 24).rotateX(Math.PI / 2).translate(0, y, d / 2 - 0.035), 'kbBlack'))
  }
  parts.add(M(box(0.004, 0.008, d - 0.06).translate(0, h - 0.01, 0), 'rgbPink'))
  // front panel details: power button and a thin light line
  parts.add(M(cyl(0.008, 0.008, 0.004, 16).rotateX(Math.PI / 2).translate(0.06, h - 0.02, d / 2 + 0.001), 'blackSteel'))
  g.add(bake(parts))
  // tinted glass side
  const glass = M(new THREE.PlaneGeometry(d - 0.02, h - 0.02).rotateY(Math.PI / 2).translate(w / 2, h / 2 + 0.015, 0), 'pcGlass', 'PC_Glass')
  glass.userData.keep = true
  g.children[0].add(glass)
  return g
}

/**
 * The gaming desk set on the corner desk (room coordinates): two monitors — the left one carries the resume window —
 * speakers either side, the RGB gaming PC on the left end, keyboard + mouse on a dark mat, the camera on the return.
 */
function gamingSet() {
  const g = G('Desk_Set')
  const top = L.desk.top
  const put = (obj, x, z, ry = 0, y = top) => g.add(at(obj, x, y, z, ry))
  put(monitor(), 0, Z0 + 0.2)
  put(monitor({ name: 'Monitor_Right', screen: false }), 0.665, Z0 + 0.215, -9)
  put(speaker(), -0.46, Z0 + 0.16, 8)
  put(speaker(), 1.13, Z0 + 0.17, -12)
  put(gamingPC(), -0.67, Z0 + 0.3, 6)
  put(M(rbox(0.92, 0.004, 0.38, 0.002, 1).translate(0, 0.002, 0), 'deskMatDark', 'Desk_Mat'), 0.33, Z0 + 0.46)
  put(modernKeyboard('kbBlack', 'keyBlack', 'keyBlack', true), 0.15, Z0 + 0.47, 0, top + 0.004)
  put(modernMouse(), 0.56, Z0 + 0.48, -6, top + 0.004)
  put(camera(), X1 - 0.3, Z0 + 0.98, -60)
  g.add(M(tube([[0, top + 0.05, Z0 + 0.09], [0.3, top + 0.004, Z0 + 0.05], [-0.4, top + 0.004, Z0 + 0.05], [-0.6, top + 0.12, Z0 + 0.08]], 0.0035, 32, 6), 'cableBlack'))
  return g
}

/** wooden slat panelling (on dark felt) over the back wall, from just above the desk to the ceiling band */
function slatWall() {
  const g = G('Slat_Wall')
  const { x0, x1, y0 } = L.slatWall
  const y1 = H - 0.15 - 0.004
  const parts = G('Slat_Parts')
  parts.add(M(box(x1 - x0, y1 - y0, 0.012).translate((x0 + x1) / 2, (y0 + y1) / 2, Z0 + 0.006), 'feltBlack'))
  const pitch = 0.046
  const sw = 0.028
  const sd = 0.022
  for (let x = x0 + sw / 2 + 0.006; x < x1 - sw / 2; x += pitch) parts.add(M(box(sw, y1 - y0, sd, 1.4).translate(x, (y0 + y1) / 2, Z0 + 0.012 + sd / 2), 'slatWood'))
  g.add(bake(parts))
  // a warm LED line along the back of the desk, washing up the slats behind the monitors
  const led = G('Slat_LED')
  led.add(ledStrip(x1 - x0 - 0.02, 0.008, 0.01, (x0 + x1) / 2, y0 + 0.006, Z0 + 0.04))
  led.add(ledWash(x1 - x0 - 0.02, 0.6, [(x0 + x1) / 2, y0 + 0.01, Z0 + 0.034], [1, 0, 0], [0, 1, 0], [0, 0, 1]))
  g.add(bake(led))
  return g
}

/** three glowing light-sabre bars on the slat wall above the monitors, each with a soft glow on the slats */
function sabers() {
  const g = G('Sabers')
  const parts = G('Saber_Parts')
  const z = Z0 + 0.034 + 0.03
  for (const [x, blade, wash] of L.sabers) {
    const y0 = 1.3
    parts.add(M(cyl(0.013, 0.013, 0.13, 16).translate(x, y0 + 0.065, z), 'blackSteel'))
    parts.add(M(box(0.07, 0.012, 0.018).translate(x, y0 + 0.13, z), 'blackSteel'))
    parts.add(M(cyl(0.01, 0.007, 0.56, 12).translate(x, y0 + 0.14 + 0.28, z), blade))
    parts.add(M(box(0.01, 0.02, 0.02).translate(x, y0 + 0.13, Z0 + 0.04), 'blackSteel'))
    const glow = new THREE.PlaneGeometry(0.42, 1.0).translate(x, y0 + 0.4, Z0 + 0.0365)
    parts.add(M(glow, wash))
  }
  g.add(bake(parts))
  return g
}

/** a small bust / figurine for the shelves */
function figurine(seed, h = 0.14) {
  const r = rand(seed)
  const g = G('Figurine')
  g.add(M(cyl(0.032, 0.036, 0.018, 20).translate(0, 0.009, 0), 'figureDark'))
  g.add(M(new THREE.SphereGeometry(1, 16, 12).scale(0.034, h * 0.32, 0.026).translate(0, 0.018 + h * 0.3, 0), 'figureDark'))
  g.add(M(new THREE.SphereGeometry(0.03 + r() * 0.008, 16, 12).translate(0, 0.018 + h * 0.72, 0), 'figureDark'))
  if (r() < 0.5) g.add(M(new THREE.SphereGeometry(1, 12, 8).scale(0.012, 0.03, 0.012).translate(0.03, 0.018 + h * 0.45, 0.004), 'figureDark'))
  return g
}

/**
 * Wooden floating shelves on the slat wall's right (after the reference), LED under each, holding figurines, books
 * and a small plant. The light under the lowest shelf is the desk light (`Lamp_Light`). Origin: the slat face.
 */
function woodShelves() {
  const g = G('Wood_Shelves')
  const { w, depth, ys } = L.woodShelves
  const th = 0.032
  const boards = G('Wood_Shelf_Boards')
  for (const y of ys) boards.add(M(box(w, th, depth, 1.2).translate(0, y - th / 2, depth / 2), 'deskWood'))
  g.add(bake(boards))
  const leds = G('Wood_Shelf_LEDs')
  for (const y of ys) {
    leds.add(ledStrip(w - 0.05, 0.005, 0.01, 0, y - th - 0.003, depth - 0.03))
    leds.add(ledWash(w - 0.03, 0.34, [0, y - th, 0.002], [1, 0, 0], [0, -1, 0], [0, 0, 1]))
  }
  g.add(bake(leds))
  const on = (k, obj, x, z = depth / 2, ry = 0) => g.add(at(obj, x, ys[k], z, ry))
  on(2, bake(figurine(991, 0.16)), -0.18, depth / 2, 20)
  on(2, bake(figurine(992, 0.13)), 0.0, depth / 2, -10)
  on(2, bake(potPlant(0.045, 0.07, 10, 993, 'potDark')), 0.2)
  on(1, bake(figurine(994, 0.15)), -0.2, depth / 2, 30)
  on(1, bake(uprightBooks(5, 995)), 0.02, depth / 2 - 0.01)
  on(1, bake(figurine(996, 0.12)), 0.22, depth / 2, -25)
  on(0, bake(uprightBooks(6, 997)), -0.27, depth / 2 - 0.01)
  on(0, bake(wireShape(0.06)), 0.1)
  on(0, bake(figurine(998, 0.12)), 0.23, depth / 2, -15)
  const bulb = new THREE.Object3D()
  bulb.name = 'Shelf_Light'
  bulb.position.set(-0.1, ys[0] - th - 0.01, depth * 0.6)
  g.add(bulb)
  g.userData.bulb = bulb
  g.userData.bulbAt = [0, 0, 0]
  g.userData.aim = [-0.7, L.desk.top - bulb.position.y, 0.35]
  return g
}

/** a dark, short-pile rug under the chair */
function darkRug() {
  const { w, d } = L.darkRug
  const geo = boxUV(rbox(w, 0.022, d, 0.008, 2).translate(0, 0.011, 0), 0.8)
  return M(geo, 'rugDark', 'Rug')
}

/** racing-style gaming chair: black seat and back, white bolsters and wings, harness slots in the headrest (front = -z) */
function gamingChair() {
  const g = G('Chair')
  const base = G('ChairBase')
  base.add(M(cyl(0.024, 0.028, 0.3, 20).translate(0, 0.27, 0), 'chairBlack'))
  base.add(M(cyl(0.045, 0.052, 0.06, 20).translate(0, 0.1, 0), 'chairBlack'))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.31
    const tip = [Math.cos(a) * 0.34, 0.075, Math.sin(a) * 0.34]
    base.add(M(beam([0, 0.1, 0], tip, 0.042, 0.028), 'chairBlack'))
    base.add(M(cyl(0.008, 0.008, 0.035, 8).translate(tip[0], 0.055, tip[2]), 'chairBlack'))
    base.add(M(new THREE.SphereGeometry(0.028, 14, 10).scale(0.75, 1, 1).rotateY(-a).translate(tip[0], 0.028, tip[2]), 'rubber'))
  }
  base.add(M(rbox(0.28, 0.05, 0.3, 0.015).translate(0, 0.43, 0.02), 'chairBlack'))
  for (const s of [-1, 1]) {
    base.add(M(tube([[s * 0.12, 0.44, 0.05], [s * 0.25, 0.45, 0.05], [s * 0.285, 0.5, 0.05]], 0.016, 12, 8), 'chairBlack'))
    base.add(M(rbox(0.04, 0.2, 0.06, 0.012).translate(s * 0.285, 0.6, 0.05), 'chairBlack'))
    base.add(M(rbox(0.09, 0.03, 0.26, 0.012).translate(s * 0.29, 0.715, 0.02), 'chairBlack'))
  }
  g.add(bake(base))
  const seat = G('ChairSeat')
  seat.add(M(rbox(0.38, 0.08, 0.5, 0.03, 4).translate(0, 0.49, 0), 'chairBlack'))
  for (const s of [-1, 1]) seat.add(at(M(rbox(0.07, 0.1, 0.5, 0.03, 4), 'chairWhite'), s * 0.215, 0.505, 0, 0, 0, s * -8))
  g.add(bake(seat))
  // the back, leaning back ~10°: black centre, white wings wrapping forward, a rounded headrest with two slots
  const back = G('ChairBack')
  back.add(M(rbox(0.36, 0.86, 0.09, 0.04, 4).translate(0, 0.43, 0), 'chairBlack'))
  for (const s of [-1, 1]) {
    back.add(at(M(rbox(0.065, 0.58, 0.11, 0.028, 4), 'chairWhite'), s * 0.205, 0.38, -0.02, s * 18, 0, s * 3))
    back.add(at(M(rbox(0.07, 0.1, 0.03, 0.012, 2), 'chairWhite'), s * 0.075, 0.72, -0.038))
    back.add(at(M(rbox(0.045, 0.072, 0.03, 0.01, 2), 'chairHole'), s * 0.075, 0.72, -0.045))
  }
  back.add(M(rbox(0.3, 0.16, 0.06, 0.03, 4).translate(0, 0.14, -0.045), 'chairBlack'))
  back.rotation.x = 0.17
  back.position.set(0, 0.53, 0.24)
  g.add(bake(back))
  return g
}

/** a wire polyhedron (geometric terrarium) */
function wireShape(r) {
  const g = G('Terrarium')
  const geo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r, 0))
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i += 2) g.add(M(rod([p.getX(i), p.getY(i) + r, p.getZ(i)], [p.getX(i + 1), p.getY(i + 1) + r, p.getZ(i + 1)], 0.0018, 4), 'shelfBlack'))
  return g
}
/** a closed book lying flat: dark cover, page block on three sides */
function blackBook(w, h, d, mat = 'binderBlack') {
  const g = G('Book')
  g.add(M(box(w, h, d).translate(0, h / 2, 0), mat))
  g.add(M(box(w - 0.012, h - 0.008, d - 0.006).translate(0.007, h / 2, 0.004), 'pages'))
  return g
}
/** a row of upright books */
function uprightBooks(n, seed) {
  const r = rand(seed)
  const g = G('Books')
  let x = 0
  for (let i = 0; i < n; i++) {
    const t = 0.024 + r() * 0.016
    const h = 0.19 + r() * 0.06
    g.add(M(box(t, h, 0.15 + r() * 0.02).translate(x + t / 2, h / 2, 0), i % 3 === 1 ? 'bookGray' : 'binderBlack'))
    x += t + 0.002
  }
  return g
}

/**
 * A spherical "globe" bookshelf on the wall (after the reference photo): seen from the front it is a circle; shelves are
 * slices of a shallow half-ellipsoid (deepest in the middle, pointed at the ends) and curved fins bow outward like
 * meridians. Filled with books, a few lying stacks and two small framed photos. Origin: the circle's centre on the wall
 * face; x along the wall, y up, z out of the wall.
 */
function globeShelf() {
  const g = G('Globe_Shelf')
  const { r: R, depth, shelves: n, fins: finX } = L.globeShelf
  const k = depth / R // the half-ellipsoid's depth per unit radius
  const th = 0.02
  const front = (x, y) => k * Math.sqrt(Math.max(0, R * R - x * x - y * y))
  const ys = Array.from({ length: n }, (_, i) => -R + ((i + 1) * 2 * R) / (n + 1))
  const wood = G('Globe_Shelf_Wood')
  // shelves: the plan shape between the wall and the ellipsoid's front arc, ends tapering to points
  for (const y of ys) {
    const c = Math.sqrt(R * R - y * y)
    const pts = [new THREE.Vector2(-c, 0), new THREE.Vector2(c, 0)]
    for (let i = 1; i < 48; i++) {
      const x = c - (2 * c * i) / 48
      pts.push(new THREE.Vector2(x, front(x, y)))
    }
    const shelf = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: th, bevelEnabled: false, curveSegments: 1 })
    wood.add(M(shelf.rotateX(Math.PI / 2).translate(0, y, 0), 'shelfOak'))
  }
  // fins: vertical boards square to the wall, bowing outward like meridians, reaching the ellipsoid's front
  const xFin = (x0, y) => x0 * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - (y / R) ** 2)))
  for (const x0 of finX) {
    const prof = []
    const ok = (y) => R * R - xFin(x0, y) ** 2 - y * y > 0.0004
    const samples = Array.from({ length: 81 }, (_, i) => -R + (2 * R * i) / 80).filter(ok)
    for (const y of samples) prof.push(new THREE.Vector2(front(xFin(x0, y), y), y))
    for (const y of [...samples].reverse()) prof.push(new THREE.Vector2(0, y))
    const fin = new THREE.ExtrudeGeometry(new THREE.Shape(prof), { depth: 0.018, bevelEnabled: false, curveSegments: 1 }).rotateY(-Math.PI / 2)
    const p = fin.attributes.position
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.009 + xFin(x0, p.getY(i)))
    fin.computeVertexNormals()
    wood.add(M(fin, 'shelfOak'))
  }
  g.add(bake(wood))

  // books: upright rows between the fins, a few stacks lying flat, two framed photos
  const rnd = rand(971)
  const books = G('Globe_Shelf_Books')
  const mats = [...BOOK_COLORS.map((_, i) => `book${i}`), 'bookWhite', 'bookWhite', 'binderBlack']
  const photos = { 1: ['photo-window-light', 0], 3: ['photo-pines-mist', -0.3] } // shelf → photo, x
  ys.forEach((y, si) => {
    const top = y // the shelf's top face
    const room = (si < n - 1 ? ys[si + 1] - th : y + 0.2) - top - 0.02
    const xmax = Math.sqrt(Math.max(0, R * R - y * y - (0.13 / k) ** 2)) // where the shelf is deep enough for books
    const fins = finX.map((x0) => xFin(x0, y))
    const photo = photos[si]
    let x = -xmax
    // the first fin a span [a, b] would run into (with a little clearance), if any
    const finIn = (a, b) => fins.find((f) => f > a - 0.014 && f < b + 0.014)
    while (x < xmax - 0.02) {
      if (photo && Math.abs(x - photo[1]) < 0.075) {
        // a small framed photo leaning on the back
        const f = G('Shelf_Photo')
        f.add(M(box(0.12, 0.15, 0.012).translate(0, 0.075, 0), 'frameBlack'))
        f.add(M(box(0.1, 0.13, 0.002).translate(0, 0.076, 0.007), 'mat'))
        f.add(M(new THREE.PlaneGeometry(0.075, 0.1).translate(0, 0.078, 0.0085), photo[0]))
        f.rotation.x = -0.12
        books.add(at(G('Photo', f), photo[1], top, 0.06))
        x = photo[1] + 0.08
        continue
      }
      const roll = rnd()
      const dmax = Math.min(0.2, front(x, y) - 0.015)
      if (roll < 0.08) {
        x += 0.03 + rnd() * 0.05 // a gap
        continue
      }
      if (roll < 0.15 && dmax > 0.14) {
        // a short stack lying flat
        let sy = top
        const w = 0.14 + rnd() * 0.04
        const f = finIn(x, x + w)
        if (f !== undefined || x + w > xmax) {
          x = f !== undefined ? f + 0.024 : xmax
          continue
        }
        for (let j = 0; j < 2 + Math.floor(rnd() * 3); j++) {
          const h = 0.022 + rnd() * 0.014
          books.add(M(box(w, h, Math.min(dmax, 0.13 + rnd() * 0.03)).translate(x + w / 2, sy + h / 2, 0.075), mats[Math.floor(rnd() * mats.length)]))
          sy += h
        }
        x += w + 0.01
        continue
      }
      const t = 0.018 + rnd() * 0.03
      const f = finIn(x, x + t)
      if (f !== undefined) {
        x = f + 0.024
        continue
      }
      const h = Math.min(room, 0.12 + rnd() * 0.07)
      const d = Math.max(0.1, Math.min(dmax, 0.12 + rnd() * 0.06))
      const mat = mats[Math.floor(rnd() * mats.length)]
      books.add(M(box(t, h, d).translate(x + t / 2, top + h / 2, d / 2 + 0.006), mat))
      if (rnd() < 0.35) books.add(M(box(t * 0.82, 0.012, 0.002).translate(x + t / 2, top + h * (0.62 + rnd() * 0.2), d + 0.007), rnd() < 0.5 ? 'pages' : 'brass'))
      x += t + 0.0015
    }
  })
  g.add(bake(books))
  return g
}

/** smooth, low-frequency lumps (for soft furnishings) */
const lumps = (x, y, z) => 0.5 * Math.sin(3.1 * x + 1.3) * Math.sin(2.7 * y + 0.4) * Math.sin(3.3 * z + 2.1) + 0.3 * Math.sin(5.3 * x + 0.7) * Math.sin(4.9 * z + 1.9) + 0.2 * Math.sin(7.1 * y + 2.3) * Math.sin(6.3 * x + 0.2)
/**
 * Push vertices outward from the shape's centre by lumps × amp (a slouchy, hand-filled look). The push depends on the
 * position only, so vertices duplicated along seams move together (no cracks).
 */
function slouch(geo, amp, normals = true) {
  geo.computeBoundingBox()
  const c = geo.boundingBox.getCenter(new THREE.Vector3())
  const p = geo.attributes.position
  const d = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    d.set(x - c.x, (y - c.y) * 0.5, z - c.z).normalize()
    const k = amp * lumps(x, y, z)
    p.setXYZ(i, x + d.x * k, y + d.y * k, z + d.z * k)
  }
  if (normals) geo.computeVertexNormals()
  return geo
}

/**
 * Bean-bag loveseat in charcoal wide-wale corduroy (after the reference photo): a deep, sagging seat, a fat rolled back
 * that wraps round into the arms (the wales run over the roll), and a throw pillow leaning on the back. Front = -z.
 */
function beanSofa() {
  const g = G('Sofa')
  const parts = G('Sofa_Parts')
  // seat: a soft rounded block, dished in the middle; UVs in metres so the wales keep their width
  const seat = rbox(1.42, 0.4, 0.92, 0.17, 6).translate(0, 0.2, -0.02)
  const sp = seat.attributes.position
  for (let i = 0; i < sp.count; i++) {
    if (sp.getY(i) < 0.3) continue
    const u = sp.getX(i) / 0.71
    const w = (sp.getZ(i) + 0.02) / 0.46
    sp.setY(i, sp.getY(i) - 0.07 * Math.max(0, 1 - u * u) * Math.max(0, 1 - w * w))
  }
  seat.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (i % 2 ? 0.92 : 1.42)))
  parts.add(M(slouch(seat, 0.018, false), 'corduroy'))
  // the roll: back + arms swept round a squarish half-loop, fatter and taller at the back, rounded off at the arm ends
  const NS = 90
  const NR = 24
  const pos = []
  const uv = []
  const idx = []
  const path = (t) => {
    const f = t * 4.54 - 2.27 // −130° … 130° (0 = the middle of the back)
    const s = Math.sin(f)
    const c = Math.cos(f)
    return V(0.62 * Math.sign(s) * Math.abs(s) ** 0.5, 0.44 + 0.1 * c * c, 0.33 * Math.sign(c) * Math.abs(c) ** 0.6)
  }
  let len = 0
  let prev = path(0)
  for (let i = 0; i <= NS; i++) {
    const t = i / NS
    const c = path(t)
    len += c.distanceTo(prev)
    prev = c
    const tan = path(Math.min(1, t + 0.002)).sub(path(Math.max(0, t - 0.002))).normalize()
    const side = new THREE.Vector3(0, 1, 0).cross(tan).normalize() // horizontal, across the roll
    const back = Math.cos((t * 4.54 - 2.27) / 1.3) ** 2
    const end = Math.min(1, Math.min(t, 1 - t) / 0.07)
    const r = (0.17 + 0.07 * back) * Math.sqrt(Math.max(0, 1 - (1 - end) ** 2)) // closes to a point at the arm ends
    const tall = 1 + 0.3 * back
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * Math.PI * 2
      const q = c
        .clone()
        .addScaledVector(side, Math.cos(a) * r)
        .add(V(0, Math.sin(a) * r * tall, 0))
      pos.push(q.x, q.y, q.z)
      uv.push(len, j / NR)
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j
      const b = a + NR + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const roll = new THREE.BufferGeometry()
  roll.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  roll.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  roll.setIndex(idx)
  parts.add(M(slouch(roll, 0.02), 'corduroy'))
  // throw pillow: a puffy square, corners pinched, leaning back against the roll
  const pillow = new THREE.BoxGeometry(0.5, 0.46, 0.16, 12, 12, 4)
  const pp = pillow.attributes.position
  for (let i = 0; i < pp.count; i++) {
    const u = pp.getX(i) / 0.25
    const v = pp.getY(i) / 0.23
    const puff = Math.max(0, 1 - 0.55 * (u ** 4 + v ** 4))
    pp.setZ(i, pp.getZ(i) * puff)
    pp.setX(i, pp.getX(i) * (1 - 0.05 * v * v))
  }
  pillow.computeVertexNormals()
  parts.add(at(M(slouch(pillow, 0.008), 'corduroy'), 0.18, 0.6, 0.0, -12, 20, 4))
  g.add(bake(parts))
  return g
}

/**
 * French balcony doors (after the reference photo) in the left wall: two glazed doors with a 2 × 5 grid between fixed
 * sidelights (raised panels below, 4 lights above), white painted frames and casing, brass levers and hinges. The one
 * glass plane is `Window_1_Glass` (the site's window light and the moon come through it). Origin: the wall's inner
 * face at the opening's centre; u runs along the wall (world z), d into the room (world x).
 */
function balconyDoor() {
  const { w, h } = P.balcony
  const g = G('Balcony_Door')
  const fr = G('Balcony_Frames')
  const piece = (u0, u1, y0, y1, d0, d1, mat = 'frameWhite') => fr.add(M(box(d1 - d0, y1 - y0, u1 - u0).translate((d0 + d1) / 2, (y0 + y1) / 2, (u0 + u1) / 2), mat))
  const hw = w / 2
  // reveal lining, casing (architrave) with a small cap, stone threshold
  piece(-hw, -hw + 0.02, 0, h, -T, 0)
  piece(hw - 0.02, hw, 0, h, -T, 0)
  piece(-hw, hw, h - 0.02, h, -T, 0)
  piece(-hw - 0.09, -hw, 0, h + 0.09, 0, 0.02)
  piece(hw, hw + 0.09, 0, h + 0.09, 0, 0.02)
  piece(-hw - 0.09, hw + 0.09, h, h + 0.09, 0, 0.02)
  piece(-hw - 0.11, hw + 0.11, h + 0.09, h + 0.115, -0.005, 0.035)
  piece(-hw, hw, 0, 0.02, -T, 0.02, 'sill')
  // the unit: outer frame, mullions between the leaves
  const d0 = -0.1
  const d1 = -0.03
  const f = 0.05
  piece(-hw + 0.02, hw - 0.02, h - 0.02 - f, h - 0.02, d0, d1)
  piece(-hw + 0.02, hw - 0.02, 0.02, 0.02 + 0.03, d0, d1)
  const cuts = [-hw + 0.02, -hw + 0.32, -0.003, 0.003, hw - 0.32, hw - 0.02]
  const leaves = [
    [cuts[0], cuts[1], 'side'],
    [cuts[1], cuts[2], 'door'],
    [cuts[3], cuts[4], 'door'],
    [cuts[4], cuts[5], 'side'],
  ]
  const yTop = h - 0.02 - f
  const yBot = 0.05
  for (const [a, b, kind] of leaves) {
    const s = 0.055 // stiles
    piece(a, a + s, yBot, yTop, d0 + 0.01, d1)
    piece(b - s, b, yBot, yTop, d0 + 0.01, d1)
    piece(a, b, yTop - 0.06, yTop, d0 + 0.01, d1)
    const glassBot = kind === 'door' ? yBot + 0.17 : 0.66
    piece(a, b, glassBot - (kind === 'door' ? 0.17 : 0.07), glassBot, d0 + 0.01, d1)
    if (kind === 'side') {
      // raised panel below the glass
      piece(a + s, b - s, yBot, glassBot - 0.07, d0 + 0.03, d1 - 0.012)
      piece(a + s + 0.035, b - s - 0.035, yBot + 0.06, glassBot - 0.13, d1 - 0.012, d1 - 0.004)
    }
    // glazing bars
    const ga = a + s
    const gb = b - s
    const gy0 = glassBot
    const gy1 = yTop - 0.06
    const rows = kind === 'door' ? 5 : 4
    for (let r = 1; r < rows; r++) {
      const y = gy0 + ((gy1 - gy0) * r) / rows
      piece(ga, gb, y - 0.011, y + 0.011, d0 + 0.025, d1 - 0.005)
    }
    if (kind === 'door') piece((ga + gb) / 2 - 0.011, (ga + gb) / 2 + 0.011, gy0, gy1, d0 + 0.025, d1 - 0.005)
  }
  // brass: levers on the meeting stiles, hinges on the doors' outer stiles
  for (const s of [-1, 1]) {
    const u = s * 0.035
    fr.add(M(cyl(0.022, 0.022, 0.008, 20).rotateZ(Math.PI / 2).translate(d1 + 0.004, 1.05, u), 'brass'))
    fr.add(M(box(0.02, 0.018, 0.12).translate(d1 + 0.03, 1.05, u + s * 0.055), 'brass'))
    fr.add(M(cyl(0.008, 0.008, 0.03, 12).rotateZ(Math.PI / 2).translate(d1 + 0.016, 1.05, u), 'brass'))
    for (const y of [0.3, 1.2, 2.05]) fr.add(M(cyl(0.008, 0.008, 0.09, 12).translate(d1 + 0.004, y, s * (hw - 0.32) - s * 0.002), 'brass'))
  }
  const baked = bake(fr)
  const glass = M(new THREE.PlaneGeometry(w - 0.06, h - 0.08).rotateY(Math.PI / 2).translate(-0.065, h / 2, 0), 'glass', 'Window_1_Glass')
  glass.userData.keep = true
  baked.add(glass)
  g.add(baked)
  return g
}

/** the balcony outside: stone floor, a white balustrade with vase balusters and pedestals, potted cypress and shrubs */
function balconyTerrace() {
  const g = G('Balcony')
  const parts = G('Balcony_Parts')
  const xo = X0 - T // the wall's outer face
  const depth = 1.7
  const xf = xo - depth + 0.09 // the balustrade line
  const z0 = P.balcony.z - 1.45
  const z1 = P.balcony.z + 1.45
  parts.add(M(box(depth, 0.14, z1 - z0 + 0.2, 1.2).translate(xo - depth / 2, -0.08, (z0 + z1) / 2), 'stone'))
  const baluster = lathe([[0, 0], [0.045, 0], [0.045, 0.06], [0.03, 0.09], [0.026, 0.2], [0.045, 0.38], [0.04, 0.5], [0.022, 0.62], [0.03, 0.68], [0.04, 0.7], [0, 0.7]], 16)
  const run = (a, b, along) => {
    // a straight run of balustrade from a to b (points on the floor), rails + balusters
    const A = V(...a)
    const B = V(...b)
    const len = A.distanceTo(B)
    const mid = A.clone().add(B).multiplyScalar(0.5)
    const rail = (y, hgt, wid) => {
      const geo = along === 'z' ? box(wid, hgt, len) : box(len, hgt, wid)
      parts.add(M(geo.translate(mid.x, y, mid.z), 'stoneWhite'))
    }
    rail(0.05, 0.1, 0.16)
    rail(0.86, 0.08, 0.17)
    rail(0.91, 0.04, 0.2)
    const n = Math.floor(len / 0.15)
    for (let i = 0; i < n; i++) {
      const p = A.clone().lerp(B, (i + 0.5) / n)
      parts.add(M(baluster.clone().translate(p.x, 0.1, p.z), 'stoneWhite'))
    }
  }
  run([xf, 0, z0], [xf, 0, z1], 'z')
  run([xo, 0, z0], [xf, 0, z0], 'x')
  run([xo, 0, z1], [xf, 0, z1], 'x')
  for (const [x, z] of [
    [xf, z0],
    [xf, z1],
    [xf, (z0 + z1) / 2],
  ])
    parts.add(M(box(0.2, 0.98, 0.2).translate(x, 0.49, z), 'stoneWhite'))
  // potted cypress at the outer corners, shrubs either side of the doors
  const pot = (x, z, r, h) => parts.add(M(lathe([[0, 0], [r * 0.8, 0], [r, h], [r * 1.08, h + 0.02], [r * 0.95, h + 0.02], [0, h - 0.02]], 28).translate(x, 0, z), 'terracotta'))
  for (const z of [z0 + 0.35, z1 - 0.35]) {
    pot(xf + 0.35, z, 0.19, 0.42)
    parts.add(M(new THREE.SphereGeometry(1, 24, 18).scale(0.26, 0.95, 0.26).translate(xf + 0.35, 1.32, z), 'cypress'))
    parts.add(M(new THREE.SphereGeometry(1, 20, 14).scale(0.16, 0.5, 0.16).translate(xf + 0.35, 2.15, z), 'cypress'))
  }
  for (const z of [P.balcony.z - P.balcony.w / 2 - 0.35, P.balcony.z + P.balcony.w / 2 + 0.35]) {
    pot(xo - 0.32, z, 0.17, 0.36)
    parts.add(M(new THREE.SphereGeometry(0.27, 20, 14).scale(1, 0.85, 1).translate(xo - 0.32, 0.6, z), 'shrub'))
  }
  g.add(bake(parts))
  return g
}

/** sheer white voile either side of the balcony doors, gathered with a cord tieback, pooling a little on the floor */
function sheerCurtains() {
  const g = G('Sheer_Curtains')
  const parts = G('Sheer_Parts')
  const top = H - 0.15 - 0.012
  const x = X0 + 0.13
  const tieY = 1.05
  for (const { outer, inner } of L.sheers) {
    const W = Math.abs(inner - outer)
    const s = Math.sign(inner - outer)
    const folds = Math.round(W / 0.085)
    const geo = new THREE.PlaneGeometry(1, 1, folds * 8, 60)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5 // 0 at the gathered (outer) edge → 1 at the free edge
      const v = p.getY(i) + 0.5
      const y = v * top
      const t = y > tieY ? ((y - tieY) / (top - tieY)) ** 0.75 : ((tieY - y) / tieY) ** 1.3
      const width = y > tieY ? 0.14 + (W - 0.14) * t : 0.14 + (W * 0.8 - 0.14) * t
      const gather = W / width
      const depth = (0.012 + 0.006 * Math.min(4, gather)) * Math.sin(u * folds * Math.PI * 2)
      const pool = y < 0.04 ? (0.04 - y) * 1.2 : 0
      p.setXYZ(i, x + depth + pool, Math.max(0.004, y), outer + s * u * width)
    }
    geo.computeVertexNormals()
    parts.add(M(geo, 'sheer'))
    // tieback cord round the gathered fabric, and a brass holdback on the wall behind it
    parts.add(M(new THREE.TorusGeometry(0.07, 0.006, 6, 28).rotateX(Math.PI / 2).scale(0.75, 1, 1.15).translate(x, tieY, outer + s * 0.07), 'rope'))
    parts.add(M(cyl(0.022, 0.022, 0.012, 20).rotateZ(Math.PI / 2).translate(X0 + 0.006, tieY + 0.02, outer + s * 0.03), 'brass'))
  }
  const z0 = Math.min(...L.sheers.flatMap((c) => [c.outer, c.inner])) - 0.02
  const z1 = Math.max(...L.sheers.flatMap((c) => [c.outer, c.inner])) + 0.02
  parts.add(M(box(0.025, 0.015, z1 - z0).translate(x, top + 0.006, (z0 + z1) / 2), 'trimWhite'))
  g.add(bake(parts))
  return g
}


/**
 * Cluster pendant (after the reference photo): five woven rattan balls on jute ropes at staggered heights from one
 * black canopy, a warm Edison bulb in each, trailing pothos winding round three of them and down a rope. The room's
 * main light (`Room_Fill`) glows inside the cluster. Origin: the canopy, on the soffit's underside.
 */
function clusterPendant() {
  const g = G('Cluster_Pendant')
  const r = rand(981)
  const top = 0
  // ball centres relative to the canopy: x, height above the floor, z, radius
  const balls = [
    [0.08, 2.3, -0.08, 0.115],
    [-0.1, 2.02, 0.07, 0.12],
    [0.12, 1.8, 0.1, 0.11],
    [-0.08, 1.6, -0.1, 0.12],
    [0.05, 1.37, 0.03, 0.115],
  ].map(([x, y, z, rad]) => [x, y - (H - 0.15), z, rad])
  const hw = G('Cluster_Hardware')
  hw.add(M(cyl(0.11, 0.11, 0.022, 32).translate(0, top - 0.011, 0), 'blackSteel'))
  const wicker = G('Cluster_Balls')
  const bulbs = G('Cluster_Bulbs')
  for (const [x, y, z, rad] of balls) {
    // rope from the canopy to the top of the ball, with a gentle sag outward
    hw.add(M(tube([[x * 0.3, top - 0.02, z * 0.3], [x * 0.85, (top + y + rad) / 2, z * 0.85], [x, y + rad, z]], 0.007, 24, 6), 'rope'))
    const ball = new THREE.SphereGeometry(rad, 36, 24).translate(x, y, z)
    ball.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 ? v : v * 2))
    wicker.add(M(ball, 'wicker'))
    hw.add(M(cyl(0.014, 0.014, 0.04, 12).translate(x, y + rad - 0.03, z), 'blackSteel'))
    bulbs.add(M(new THREE.SphereGeometry(0.028, 16, 12).scale(1, 1.25, 1).translate(x, y - 0.005, z), 'edisonBulb'))
  }
  g.add(bake(hw))
  g.add(bake(wicker))
  g.add(bake(bulbs))
  // trailing pothos: round three of the balls and draping below, and one climbing down a rope
  const vines = G('Cluster_Vines')
  const vine = (pts, spacing = 0.026) => {
    vines.add(M(tube(pts, 0.0022, 40, 4), 'stem'))
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => V(...q)))
    const n = Math.round(curve.getLength() / spacing)
    for (let k = 1; k <= n; k++) {
      const lf = leaf('pothos', 0.06 + r() * 0.04, r() * 360, -25 + r() * 60, (r() - 0.5) * 60, 0.06, 0.04)
      lf.position.copy(curve.getPoint(k / (n + 0.5)))
      vines.add(lf)
    }
  }
  for (const i of [0, 2, 3]) {
    const [x, y, z, rad] = balls[i]
    const a0 = r() * Math.PI * 2
    const pts = []
    for (let k = 0; k <= 6; k++) {
      const a = a0 + k * 0.7
      const h = y + rad * (0.9 - k * 0.3)
      const rr = rad * 1.08 * Math.sqrt(Math.max(0.1, 1 - ((h - y) / (rad * 1.1)) ** 2))
      pts.push([x + Math.cos(a) * rr, h, z + Math.sin(a) * rr])
    }
    const last = pts[pts.length - 1]
    pts.push([last[0] * 1.05, last[1] - 0.18, last[2] * 1.05], [last[0] * 1.08, last[1] - 0.38 - r() * 0.15, last[2] * 1.08])
    vine(pts)
  }
  const [x1, y1, z1, r1] = balls[1]
  vine([[x1 * 0.4, top - 0.05, z1 * 0.4 + 0.012], [x1 * 0.75, (top + y1) / 2, z1 * 0.75 + 0.012], [x1 + 0.01, y1 + r1 + 0.02, z1 + 0.012]])
  g.add(bake(vines))
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
function lights(bulbWorld, aim) {
  const g = G('Lights')
  const sun = new THREE.DirectionalLight(L.sun.color ?? 0xffd29c, L.sun.intensity)
  sun.name = 'Sun'
  sun.position.set(...L.sun.pos)
  sun.lookAt(...L.sun.look)
  g.add(sun)
  const spot = new THREE.SpotLight(L.lamp?.color ?? 0xffc98a, 6, 4, 0.8, 0.55, 2)
  spot.name = 'Lamp_Light'
  spot.position.copy(bulbWorld)
  spot.lookAt(aim)
  g.add(spot)
  const fill = new THREE.PointLight(L.fill.color ?? 0xffe8cc, L.fill.intensity, 16, 2)
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
  root.userData.extras = { units: 'meters', upAxis: 'Y', size: { width: W, depth: D, height: H }, generator: 'scripts/room-model/build-room-model.mjs', ...(P.theme ? { theme: P.theme } : {}) }
  root.add(architecture())
  if (P.theme === 'night') root.add(fitout())
  root.add(G('Windows', ...WINDOWS.map(windowUnit)))
  root.add(outside())
  if (P.balcony) root.add(at(balconyDoor(), X0, 0, P.balcony.z), balconyTerrace())
  root.add(door())

  const furniture = G('Furniture')
  furniture.add(at(L.desk.table === 'corner' ? cornerDesk() : desk(), L.desk.x, 0, L.desk.z))
  const set = L.desk.set === 'gaming' ? gamingSet() : deskSet()
  furniture.add(at(set, L.desk.x, 0, L.desk.z))
  furniture.add(at(L.chairStyle === 'gaming' ? gamingChair() : chair(), L.chair[0], 0, L.chair[1], L.chair[2]))
  if (L.rug) furniture.add(at(rug(), L.rug.x, 0, L.rug.z))
  if (L.shelf) furniture.add(at(shelf(), L.shelf.x, 0, L.shelf.z, 90))
  if (L.bench) furniture.add(at(bench(), L.bench.x, 0, L.bench.z, 90))
  if (L.woodShelves) furniture.add(at(woodShelves(), L.woodShelves.x, 0, Z0 + 0.034))
  if (L.darkRug) furniture.add(at(darkRug(), L.darkRug.x, 0, L.darkRug.z))
  if (L.sofa) furniture.add(at(beanSofa(), L.sofa.x, 0, L.sofa.z, L.sofa.ry ?? 0))
  if (L.globeShelf) furniture.add(at(globeShelf(), X0 + 0.001, L.globeShelf.y, L.globeShelf.z, 90))
  root.add(furniture)

  if (L.plants.length) root.add(G('Plants', ...L.plants.map(([seed, scale, count, x, z]) => at(monstera(seed, scale, count), x, 0, z))))
  root.add(wallDecor())
  if (L.fan) root.add(ceilingFan())
  if (L.slatWall) root.add(slatWall())
  if (L.sabers) root.add(sabers())
  if (L.sheers) root.add(sheerCurtains())
  if (L.cluster) root.add(at(clusterPendant(), L.cluster.x, H - 0.15, L.cluster.z))

  root.updateMatrixWorld(true)
  const bulb = new THREE.Vector3()
  // the desk light: whichever object carries a light marker (the desk lamp, or the shelf LED in the dark room)
  let lampObj = null
  root.traverse((o) => (lampObj ??= o.userData.bulb ? o : null))
  lampObj.userData.bulb.localToWorld(bulb.set(...(lampObj.userData.bulbAt ?? [0, 0.055, 0])))
  const aim = lampObj.userData.aim ? lampObj.userData.bulb.localToWorld(V(...lampObj.userData.aim)) : V(bulb.x + 0.15, 0.75, bulb.z + 0.1)
  root.add(lights(bulb, aim))
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
