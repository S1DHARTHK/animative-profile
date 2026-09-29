// Modelling helpers (three.js geometry) + exporter to a web-ready GLB (glTF 2.0 binary via glTF-Transform).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRLightsPunctual, KHRMaterialsEmissiveStrength, Light as GLight } from '@gltf-transform/extensions'
import { dedup, prune, tangents, unweld, weld } from '@gltf-transform/functions'
import { generateTangents } from 'mikktspace'

export { THREE }

/* ───────────────────────── scene building ───────────────────────── */

/** A mesh tagged with a material key from the material registry. */
export function M(geometry, mat, name) {
  const mesh = new THREE.Mesh(geometry)
  mesh.userData.mat = mat
  if (name) mesh.name = name
  return mesh
}

export function G(name, ...children) {
  const g = new THREE.Group()
  g.name = name
  for (const c of children) if (c) g.add(c)
  return g
}

/** position / rotate (degrees, YXZ) / scale helper that returns the object */
export function at(obj, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  obj.position.set(x, y, z)
  obj.rotation.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180, 'YXZ')
  return obj
}

/**
 * Box-projected UVs in METRES / `size`: each face gets the two axes it faces, so tiling textures (plaster,
 * tiles, wood, jute) keep real-world scale on any box, slab or extruded wall.
 */
export function boxUV(geometry, size = 1, offset = [0, 0]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.computeVertexNormals()
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    let u, v
    if (ax >= ay && ax >= az) {
      u = p.getZ(i) * Math.sign(n.getX(i) || 1)
      v = p.getY(i)
    } else if (ay >= az) {
      u = p.getX(i)
      v = p.getZ(i) * Math.sign(n.getY(i) || 1)
    } else {
      u = -p.getX(i) * Math.sign(n.getZ(i) || 1)
      v = p.getY(i)
    }
    uv[i * 2] = u / size + offset[0]
    uv[i * 2 + 1] = v / size + offset[1]
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Box with world-scaled UVs */
export const box = (w, h, d, uv = 0) => (uv ? boxUV(new THREE.BoxGeometry(w, h, d), uv) : new THREE.BoxGeometry(w, h, d))

/** Cylinder along Y */
export const cyl = (rTop, rBot, h, seg = 24, open = false) => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)

/** Lathe from [radius, y] pairs (a pot, a tray, a lamp shade…) */
export const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)

/** Tube along a smooth curve through points */
export function tube(points, radius, tubular = 48, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  return new THREE.TubeGeometry(curve, tubular, radius, radial, false)
}

/** Rounded-rectangle shape (for extruded panels with holes) */
export function roundRect(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

export function rectPath(w, h, cx = 0, cy = 0, hole = false) {
  const p = hole ? new THREE.Path() : new THREE.Shape()
  p.moveTo(cx - w / 2, cy - h / 2)
  p.lineTo(cx + w / 2, cy - h / 2)
  p.lineTo(cx + w / 2, cy + h / 2)
  p.lineTo(cx - w / 2, cy + h / 2)
  p.lineTo(cx - w / 2, cy - h / 2)
  return p
}

/** A flat card (plane) with 0..1 UVs, optionally bent along its length (leaves) */
export function card(w, h, segW = 1, segH = 1, bend = 0, fold = 0) {
  const g = new THREE.PlaneGeometry(w, h, segW, segH)
  if (bend || fold) {
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (w / 2) // -1..1 across
      const y = p.getY(i) / h + 0.5 // 0..1 along
      p.setZ(i, p.getZ(i) - bend * y * y * h + fold * Math.abs(x) * w * 0.5)
    }
    g.computeVertexNormals()
  }
  return g
}

/**
 * Bake a group into one mesh per material (fewer draw calls: 100 keycaps → 1 mesh). Keeps the group's own
 * transform; children transforms are baked into the vertices.
 */
export function bake(group) {
  group.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
  const byMat = new Map()
  const keep = []
  group.traverse((o) => {
    if (o === group) return
    if (o.isMesh && !o.userData.keep) {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      if (!g.attributes.normal) g.computeVertexNormals()
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
      const list = byMat.get(o.userData.mat) || []
      list.push(g)
      byMat.set(o.userData.mat, list)
    } else if (o.parent === group && (o.userData.keep || o.isLight || o.isCamera)) keep.push(o)
  })
  const out = new THREE.Group()
  out.name = group.name
  out.position.copy(group.position)
  out.quaternion.copy(group.quaternion)
  out.scale.copy(group.scale)
  for (const [mat, geos] of byMat) out.add(M(mergeGeometries(geos, false), mat, `${group.name}_${mat}`))
  for (const k of keep) out.add(k)
  return out
}

/* ───────────────────────── export ───────────────────────── */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
function hex(h, a = 1) {
  const n = parseInt(h.replace('#', ''), 16)
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255), a]
}

/**
 * @param root      THREE.Object3D (meshes carry userData.mat; lights/cameras are real three objects)
 * @param materials { key: { color, rough, metal, tex, normal, normalScale, emissive, emissiveTex, emissiveStrength, alpha, cutoff, opacity, double } }
 * @param textures  { key: { data: Uint8Array, mime } }
 */
export async function exportGLB(root, materials, textures, file, { withTangents = false } = {}) {
  const doc = new Document()
  doc.getRoot().getAsset().generator = 'room-portfolio/scripts/room-model'
  const buffer = doc.createBuffer('data')
  const scene = doc.createScene('Room')
  const lights = doc.createExtension(KHRLightsPunctual)
  const strength = doc.createExtension(KHRMaterialsEmissiveStrength)

  const texCache = new Map()
  const tex = (key) => {
    if (!texCache.has(key)) {
      const t = textures[key]
      if (!t) throw new Error(`missing texture ${key}`)
      texCache.set(key, doc.createTexture(key).setImage(t.data).setMimeType(t.mime))
    }
    return texCache.get(key)
  }
  const matCache = new Map()
  const mat = (key) => {
    if (matCache.has(key)) return matCache.get(key)
    const d = materials[key]
    if (!d) throw new Error(`missing material ${key}`)
    const m = doc.createMaterial(key)
    m.setBaseColorFactor(hex(d.color || '#ffffff', d.opacity ?? 1))
    m.setRoughnessFactor(d.rough ?? 0.7)
    m.setMetallicFactor(d.metal ?? 0)
    if (d.tex) m.setBaseColorTexture(tex(d.tex))
    if (d.normal) m.setNormalTexture(tex(d.normal)).setNormalScale(d.normalScale ?? 1)
    if (d.emissive) m.setEmissiveFactor(hex(d.emissive).slice(0, 3))
    if (d.emissiveTex) m.setEmissiveTexture(tex(d.emissiveTex))
    if (d.emissiveStrength && d.emissiveStrength !== 1) m.setExtension('KHR_materials_emissive_strength', strength.createEmissiveStrength().setEmissiveStrength(d.emissiveStrength))
    if (d.alpha === 'MASK') m.setAlphaMode('MASK').setAlphaCutoff(d.cutoff ?? 0.5)
    if (d.alpha === 'BLEND') m.setAlphaMode('BLEND')
    if (d.double) m.setDoubleSided(true)
    matCache.set(key, m)
    return m
  }
  const acc = (array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(buffer)

  const toMesh = (obj) => {
    const g = obj.geometry
    const prim = doc.createPrimitive()
    prim.setAttribute('POSITION', acc(new Float32Array(g.attributes.position.array), 'VEC3'))
    if (!g.attributes.normal) g.computeVertexNormals()
    // glTF requires unit normals (lathe profiles touching the axis produce degenerate ones)
    const nrm = new Float32Array(g.attributes.normal.array)
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2])
      if (l > 1e-6) {
        nrm[i] /= l
        nrm[i + 1] /= l
        nrm[i + 2] /= l
      } else {
        nrm[i] = 0
        nrm[i + 1] = 1
        nrm[i + 2] = 0
      }
    }
    prim.setAttribute('NORMAL', acc(nrm, 'VEC3'))
    if (g.attributes.uv) {
      // three.js UVs have v pointing up; glTF's v points down (image row 0 = top) — flip, like GLTFExporter does
      const uv = new Float32Array(g.attributes.uv.array)
      for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]
      prim.setAttribute('TEXCOORD_0', acc(uv, 'VEC2'))
    }
    if (g.index) prim.setIndices(acc(new Uint32Array(g.index.array), 'SCALAR'))
    prim.setMaterial(mat(obj.userData.mat))
    return doc.createMesh(obj.name || obj.userData.mat).addPrimitive(prim)
  }

  const toNode = (obj) => {
    const n = doc.createNode(obj.name || obj.type)
    n.setTranslation(obj.position.toArray())
    n.setRotation(obj.quaternion.toArray())
    n.setScale(obj.scale.toArray())
    if (obj.isMesh) n.setMesh(toMesh(obj))
    if (obj.isLight) {
      const L = lights.createLight(obj.name)
      L.setColor(obj.color.toArray()).setIntensity(obj.intensity)
      if (obj.isDirectionalLight) L.setType(GLight.Type.DIRECTIONAL)
      else if (obj.isSpotLight) {
        L.setType(GLight.Type.SPOT).setRange(obj.distance || null)
        L.setOuterConeAngle(obj.angle).setInnerConeAngle(obj.angle * (1 - obj.penumbra))
      } else L.setType(GLight.Type.POINT).setRange(obj.distance || null)
      n.setExtension('KHR_lights_punctual', L)
    }
    if (obj.isPerspectiveCamera) {
      n.setCamera(doc.createCamera(obj.name).setType('perspective').setYFov((obj.fov * Math.PI) / 180).setZNear(obj.near).setZFar(obj.far).setAspectRatio(obj.aspect))
    }
    if (obj.userData.extras) n.setExtras(obj.userData.extras)
    for (const c of obj.children) n.addChild(toNode(c))
    return n
  }
  scene.addChild(toNode(root))

  // normal-mapped surfaces get baked MikkTSpace tangents (portable across viewers)
  if (withTangents) await doc.transform(unweld(), tangents({ generateTangents }), weld(), dedup(), prune())
  else await doc.transform(weld(), dedup(), prune())
  const io = new NodeIO().registerExtensions([KHRLightsPunctual, KHRMaterialsEmissiveStrength])
  await io.write(file, doc)
  return doc
}
