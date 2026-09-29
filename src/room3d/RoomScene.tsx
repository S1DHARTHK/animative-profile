import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Bvh, useGLTF } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { findInteractives, type Interactive } from './interactives'
import { measureRoom, type RoomGeometry } from './roomGeometry'
import { room3d } from './store'

// the room as photographed (public/models/room-small.glb); the enlarged room.glb works too
export const MODEL_URL = '/models/room-small.glb'

export interface RoomHandle {
  scene: THREE.Object3D
  geometry: RoomGeometry
  interactives: Interactive[]
}

const WARM = new THREE.Color('#ffcf9a')

interface Glow {
  it: Interactive
  mats: { m: THREE.MeshStandardMaterial; emissive: THREE.Color }[]
  lift: { o: THREE.Object3D; base: THREE.Vector3; dir: THREE.Vector3 }[]
  h: number
}

/** Loads room.glb as-is, lights it, and makes the PC, camera and frames respond to hover. */
export function RoomScene({ onReady }: { onReady: (room: RoomHandle) => void }) {
  const { scene } = useGLTF(MODEL_URL)
  const gl = useThree((s) => s.gl)
  const threeScene = useThree((s) => s.scene)
  const glows = useRef<Glow[]>([])

  const room = useMemo(() => {
    const geometry = measureRoom(scene)
    const interactives = findInteractives(scene)
    const { bounds } = geometry

    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        const mat = m.material as THREE.MeshStandardMaterial
        m.castShadow = !mat.transparent && mat.name !== 'garden'
        m.receiveShadow = true
      }
      if ((o as THREE.DirectionalLight).isDirectionalLight) {
        const sun = o as THREE.DirectionalLight
        sun.castShadow = true
        sun.shadow.mapSize.set(4096, 4096) // crisp window-grid shadows (rendered once — the room is static)
        const r = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.8
        // a tight box around the room (and actually apply it — otherwise the default 500 m depth range is used,
        // which smears depth precision and leaks light along wall junctions)
        const cam = sun.shadow.camera
        const toRoom = bounds.getCenter(new THREE.Vector3()).distanceTo(sun.getWorldPosition(new THREE.Vector3()))
        Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: Math.max(0.1, toRoom - r * 1.6), far: toRoom + r * 1.6 })
        cam.updateProjectionMatrix()
        sun.shadow.bias = -0.00015
        sun.shadow.normalBias = 0.015
      }
    })

    // interactive objects get their own material copies, so highlighting the PC doesn't light up the keyboard
    glows.current = interactives.map((it) => {
      const mats: Glow['mats'] = []
      for (const n of it.nodes)
        n.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          const m = (mesh.material as THREE.MeshStandardMaterial).clone()
          mesh.material = m
          mats.push({ m, emissive: m.emissive.clone() })
        })
      // frames lift a touch off the wall toward the room
      const lift =
        it.kind === 'frame'
          ? it.nodes.map((o) => ({ o, base: o.position.clone(), dir: new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion) }))
          : []
      return { it, mats, lift, h: 0 }
    })
    return { scene, geometry, interactives }
  }, [scene])

  // soft ambient reflections; shadows are static (the room doesn't move), so render the shadow map once
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    threeScene.environment = env
    threeScene.environmentIntensity = 0.3
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    onReady(room)
    room3d.set({ ready: true })
    return () => {
      threeScene.environment = null
      env.dispose()
      pmrem.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  useFrame((_, dt) => {
    const hovered = room3d.get().hovered
    const k = 1 - Math.exp(-dt * 10)
    for (const g of glows.current) {
      const target = hovered === g.it.id ? 1 : 0
      if (Math.abs(g.h - target) < 0.001) continue
      g.h += (target - g.h) * k
      for (const { m, emissive } of g.mats) m.emissive.copy(emissive).lerp(WARM, g.h * 0.16)
      for (const { o, base, dir } of g.lift) o.position.copy(base).addScaledVector(dir, g.h * 0.014)
    }
  })

  return (
    <Bvh firstHitOnly>
      <primitive object={scene} />
    </Bvh>
  )
}

useGLTF.preload(MODEL_URL)
