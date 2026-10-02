// Everything the camera needs, measured from the loaded model's own geometry (no hard-coded coordinates).
import * as THREE from 'three'

export interface RoomGeometry {
  /** inside of the room: floor top, ceiling underside, inner faces of the four walls */
  bounds: THREE.Box3
  screen: {
    mesh: THREE.Mesh
    /** world corners of the glass: TL, TR, BR, BL (as seen from the front) */
    corners: THREE.Vector3[]
    center: THREE.Vector3
    normal: THREE.Vector3
    width: number
    height: number
  }
}

const worldBox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o)

/** the model's look, from its extras (`theme`: 'night' for the modern room at night; none = the photographed room) */
export function modelTheme(scene: THREE.Object3D): string | undefined {
  let theme: string | undefined
  scene.traverse((o) => (theme ??= o.userData.theme as string | undefined))
  return theme
}

export function measureRoom(scene: THREE.Object3D): RoomGeometry {
  scene.updateMatrixWorld(true)
  const need = (name: string) => {
    const o = scene.getObjectByName(name)
    if (!o) throw new Error(`room.glb: node "${name}" not found`)
    return o
  }

  const floor = worldBox(need('Floor'))
  const ceiling = worldBox(need('Ceiling'))
  const bounds = new THREE.Box3(
    new THREE.Vector3(worldBox(need('Wall_Left')).max.x, floor.max.y, worldBox(need('Wall_Back')).max.z),
    new THREE.Vector3(worldBox(need('Wall_Right')).min.x, ceiling.min.y, worldBox(need('Wall_Front')).min.z),
  )

  // the screen the resume is shown on, facing its local +Z: the ultrawide's resume window (`Monitor_Screen`, flat)
  // or the CRT glass (`CRT_Screen` in room.glb, gently bulged)
  const mesh = (scene.getObjectByName('Monitor_Screen') ?? need('CRT_Screen')) as THREE.Mesh
  mesh.geometry.computeBoundingBox()
  const b = mesh.geometry.boundingBox!
  const edgeZ = b.min.z // the bulge's rim (corners)
  const local = [
    new THREE.Vector3(b.min.x, b.max.y, edgeZ),
    new THREE.Vector3(b.max.x, b.max.y, edgeZ),
    new THREE.Vector3(b.max.x, b.min.y, edgeZ),
    new THREE.Vector3(b.min.x, b.min.y, edgeZ),
  ]
  const corners = local.map((v) => v.clone().applyMatrix4(mesh.matrixWorld))
  const center = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z).applyMatrix4(mesh.matrixWorld)
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld).normalize()

  return {
    bounds,
    screen: { mesh, corners, center, normal, width: corners[0].distanceTo(corners[1]), height: corners[0].distanceTo(corners[3]) },
  }
}
