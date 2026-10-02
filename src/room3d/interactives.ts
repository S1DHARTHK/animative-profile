// Which parts of public/models/room.glb are interactive, and what they open.
// Node names are the real ones from the model (see docs/ROOM-MODEL.md); nothing here invents geometry.

import * as THREE from 'three'
import { frames, motion, roomFrames, stills, type Media, type Photo } from '../content/photos'

export type InteractiveKind = 'pc' | 'camera' | 'frame'

export interface Interactive {
  id: string
  kind: InteractiveKind
  /** model nodes that make up the object */
  nodes: THREE.Object3D[]
  label: string
  sub: string
  /** frames: the photograph it shows, and the mesh carrying it (for the lightbox's origin) */
  photo?: Photo
  photoMesh?: THREE.Object3D
}

// the computer: the monitors (+ PC) in room-small.glb, the CRT + tower in room.glb
export const PC_NODES = ['Monitor', 'Monitor_Right', 'CRT_Monitor', 'PC_Tower']
export const CAMERA_NODES = ['Camera']
export const FRAME_PREFIX = 'Frame_'

const ALL_MEDIA: Media[] = [...Object.values(frames), ...stills, ...motion]

/** Photo for a wall frame: `Frame_<id>` ↔ `roomFrames[id]` / `frames[id]` in src/content/photos.ts, else by the model's photo key. */
function photoFor(frameId: string, photoKey: string | undefined): Photo | undefined {
  const byId = (roomFrames as Record<string, Photo>)[frameId] ?? (frames as Record<string, Photo>)[frameId]
  if (byId) return byId
  return ALL_MEDIA.find((m): m is Photo => m.kind === 'photo' && m.id === photoKey)
}

export function findInteractives(scene: THREE.Object3D): Interactive[] {
  const out: Interactive[] = []
  const get = (names: string[]) => names.map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)

  const pc = get(PC_NODES)
  if (pc.length) out.push({ id: 'pc', kind: 'pc', nodes: pc, label: 'Computer', sub: 'Resume & Projects' })
  const cam = get(CAMERA_NODES)
  if (cam.length) out.push({ id: 'camera', kind: 'camera', nodes: cam, label: 'Camera', sub: 'Photography & Video' })

  const decor = scene.getObjectByName('Wall_Decor') ?? scene
  decor.traverse((o) => {
    if (!o.name.startsWith(FRAME_PREFIX) || o.name.endsWith('_Photo')) return
    const frameId = o.name.slice(FRAME_PREFIX.length)
    const photo = photoFor(frameId, o.userData.photo as string | undefined)
    if (!photo) return
    out.push({
      id: o.name,
      kind: 'frame',
      nodes: [o],
      label: photo.title,
      sub: photo.note,
      photo,
      photoMesh: o.getObjectByName(`${o.name}_Photo`) ?? o,
    })
  })

  // tag every descendant so a raycast hit can be traced back to its object
  for (const it of out) for (const n of it.nodes) n.traverse((c) => (c.userData.interactive = it.id))
  return out
}

/** The interactive object a ray hit belongs to (null for anything else in the room). */
export const interactiveOf = (o: THREE.Object3D | undefined): string | null => (o?.userData.interactive as string | undefined) ?? null
