import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { Canvas } from '@react-three/fiber'
import { RoomScene, type RoomHandle } from './RoomScene'
import { CameraRig } from './CameraRig'
import { PostFX, WarmLights } from './Look'
import { CameraRoll, HoverLabel, MonitorScreen, PcOverlay, closeContent, openPhoto } from './Content'
import { isFrozen, room3d, shared, useRoom3D } from './store'
import { controls, journey } from '../animation/store'
import { Lightbox } from '../portfolio/Lightbox'
import { Loader } from '../ui/Overlays'

/**
 * The portfolio IS the room (public/models/room.glb): it opens on the PC showing the resume, scrolling pulls the
 * camera back into the room, then the visitor explores freely — mouse to look, scroll to move toward what they
 * point at, click the PC / camera / a frame to open it. Closing content returns to exactly the same view.
 */
// render resolution: native up to 1.5×, stepped down (to 0.75×) only if this device can't hold a fluid frame rate
const MAX_DPR = Math.min(window.devicePixelRatio || 1, 1.5)
const MIN_DPR = 0.75

export default function Room3DExperience() {
  const [room, setRoom] = useState<RoomHandle | null>(null)
  const [dpr, setDpr] = useState(MAX_DPR)
  const lowerDpr = useCallback(() => setDpr((d) => Math.max(MIN_DPR, Math.round(d * 0.85 * 100) / 100)), [])
  const open = useRoom3D((s) => s.open)
  const ready = useRoom3D((s) => s.ready)
  const flash = useRef<HTMLDivElement>(null)
  const black = useRef<HTMLDivElement>(null)

  // this experience owns the page: no document scroll; content that "locks" (lightbox, a project page) freezes the camera
  useEffect(() => {
    document.documentElement.classList.add('is-3d')
    journey.set({ reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
    const prev = { ...controls }
    controls.setScrollLocked = (locked) => {
      shared.locks = Math.max(0, shared.locks + (locked ? 1 : -1))
    }
    controls.goTo = () => {}
    controls.scrollToVh = () => {}
    return () => {
      document.documentElement.classList.remove('is-3d')
      Object.assign(controls, prev)
    }
  }, [])
  useEffect(() => {
    if (ready) journey.set({ ready: true })
  }, [ready])

  // dev/debug hook for automated checks: camera pose + where each object is on screen
  useEffect(() => {
    if (!room || !(import.meta.env.DEV || location.search.includes('debug'))) return
    ;(window as unknown as { __room3d: unknown }).__room3d = {
      state: () => room3d.get(),
      pose: () => shared.camera && { p: shared.camera.position.toArray().map((n) => +n.toFixed(4)), r: [shared.camera.rotation.x, shared.camera.rotation.y].map((n) => +n.toFixed(4)) },
      at: (id: string) => {
        const it = room.interactives.find((x) => x.id === id)
        if (!it || !shared.camera) return null
        const r = screenRect(it.photoMesh ?? it.nodes[0], shared.camera)
        return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h }
      },
      ids: () => room.interactives.map((x) => x.id),
      hitAt: (px: number, py: number) => {
        if (!shared.camera) return null
        const rc = new THREE.Raycaster()
        rc.setFromCamera(new THREE.Vector2((px / window.innerWidth) * 2 - 1, -((py / window.innerHeight) * 2 - 1)), shared.camera)
        return rc.intersectObject(room.scene, true).slice(0, 3).map((h) => `${h.object.name}@${h.distance.toFixed(2)}[${h.object.userData.interactive ?? '-'}]`)
      },
      mouse: () => ({ ...shared.mouse }),
      view: (name: string) => {
        const cam = room.scene.getObjectByName(name) as THREE.PerspectiveCamera | undefined
        if (!cam || !shared.debugPose) return false
        const p = cam.getWorldPosition(new THREE.Vector3())
        const d = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld)
        shared.debugPose(p.toArray() as [number, number, number], p.clone().add(d).toArray() as [number, number, number], cam.fov)
        return true
      },
      look: (p: [number, number, number], target: [number, number, number], fov = 55) => shared.debugPose?.(p, target, fov),
    }
  }, [room])

  const shutter = useCallback(() => {
    shared.locks++ // hold the view from the click itself, through the shutter, into the content
    gsap
      .timeline()
      .set([flash.current, black.current], { opacity: 0 })
      .to(black.current, { opacity: 0.9, duration: 0.045, ease: 'none' })
      .to(black.current, { opacity: 0, duration: 0.06, ease: 'none' })
      .to(flash.current, { opacity: 0.85, duration: 0.05, ease: 'power2.out' }, '<')
      .call(() => {
        room3d.set({ open: 'camera' })
        shared.locks--
      })
      .to(flash.current, { opacity: 0, duration: 0.55, ease: 'power2.out' })
  }, [])

  const onClick = useCallback(() => {
    const id = room3d.get().hovered
    if (!room || !id || isFrozen()) return
    const it = room.interactives.find((x) => x.id === id)
    if (!it) return
    if (it.kind === 'pc') room3d.set({ open: 'pc', hovered: null })
    else if (it.kind === 'camera') shutter()
    else if (it.photo) openPhoto([it.photo], 0, shared.camera ? screenRect(it.photoMesh ?? it.nodes[0], shared.camera) : null)
  }, [room, shutter])

  return (
    <div className="room3d">
      <Canvas
        className="room3d__canvas"
        shadows
        flat
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 36, near: 0.03, far: 60 }}
        onClick={onClick}
      >
        <Suspense fallback={null}>
          <RoomScene onReady={setRoom} />
          {room && (
            <>
              <CameraRig room={room} />
              <WarmLights room={room} />
              <PostFX room={room} onSlow={lowerDpr} />
            </>
          )}
        </Suspense>
      </Canvas>
      <MonitorScreen />
      <HoverLabel interactives={room?.interactives ?? []} />
      {open === 'pc' && <PcOverlay onClose={closeContent} />}
      {open === 'camera' && <CameraRoll onClose={closeContent} />}
      <div className="m3-flash" ref={flash} aria-hidden />
      <div className="m3-black" ref={black} aria-hidden />
      <Lightbox />
      <Loader />
    </div>
  )
}

/** on-screen rectangle of an object (so a photograph grows out of its frame) */
function screenRect(o: THREE.Object3D, camera: THREE.Camera) {
  const box = new THREE.Box3().setFromObject(o)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const v = new THREE.Vector3()
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera)
    const x = ((v.x + 1) / 2) * window.innerWidth
    const y = ((1 - v.y) / 2) * window.innerHeight
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
