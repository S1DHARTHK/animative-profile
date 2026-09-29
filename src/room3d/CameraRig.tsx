import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { quadToMatrix3d, type Pt } from '../animation/homography'
import { interactiveOf } from './interactives'
import type { RoomHandle } from './RoomScene'
import { isFrozen, room3d, shared } from './store'

/* ── feel ───────────────────────────────────────────────────────────────────────────────── */
const INTRO_FOV = 36 // at the PC
const ROOM_FOV = 55 // exploring
const SCREEN_FILL = 0.8 // the monitor glass fills this much of the view height at the start
const YAW_RANGE = 0.45 // rad of look either side of centre from the mouse
const PITCH_RANGE = 0.2
const PITCH_LIMIT = 0.8
const EDGE = 0.8 // pointer beyond this (of the half-width) keeps turning
const TURN_SPEED = 0.8 // rad/s at the very edge
const LOOK_DAMP = 3.2 // pointer smoothing (1/s)
const MOVE_DAMP = 4.5 // position smoothing (1/s)
const WALL_MARGIN = 0.35 // stay this far from walls
const EYE_MIN = 0.55 // stay this high above the floor
const CEIL_MARGIN = 0.35
const EYE_MAX = 2.4 // explore at a human eye height, not up by the ceiling
const STOP = 0.45 // stop this far before what you're moving toward
const BACK_STOP = 0.3
const METERS_PER_PX = 0.004 // wheel → metres
const INTRO_PER_PX = 0.0011 // wheel → intro progress
const DEG = Math.PI / 180

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** yaw/pitch of a direction for a camera looking down -Z */
const anglesOf = (d: THREE.Vector3) => ({ yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(clamp(d.y / d.length(), -1, 1)) })
function wheelPixels(e: WheelEvent) {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
  return e.deltaY * k
}

export function CameraRig({ room }: { room: RoomHandle }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)

  /* poses measured from the model: in front of the CRT glass → straight back to the far side of the room */
  const path = useMemo(() => {
    const { center, normal, height } = room.geometry.screen
    const b = room.geometry.bounds
    // smaller rooms: stop the pull-back closer to the far wall, and move less per scroll step
    const span = Math.min(b.max.x - b.min.x, b.max.z - b.min.z)
    const endGap = clamp(span * 0.12, 0.45, 0.7)
    const stepScale = clamp(span / 6, 0.45, 1)
    const d0 = height / 2 / Math.tan((INTRO_FOV * DEG) / 2) / SCREEN_FILL
    const start = center.clone().addScaledVector(normal, d0)
    // how far back along the screen's facing direction before reaching the far wall (keeping endGap clear)
    let t = Infinity
    if (Math.abs(normal.x) > 1e-3) t = Math.min(t, ((normal.x > 0 ? b.max.x - endGap : b.min.x + endGap) - center.x) / normal.x)
    if (Math.abs(normal.z) > 1e-3) t = Math.min(t, ((normal.z > 0 ? b.max.z - endGap : b.min.z + endGap) - center.z) / normal.z)
    const end = center.clone().addScaledVector(normal, t)
    end.y = clamp(b.min.y + 1.65, b.min.y + EYE_MIN, b.max.y - CEIL_MARGIN)
    const inner = new THREE.Box3(
      new THREE.Vector3(b.min.x + WALL_MARGIN, b.min.y + EYE_MIN, b.min.z + WALL_MARGIN),
      new THREE.Vector3(b.max.x - WALL_MARGIN, Math.min(b.max.y - CEIL_MARGIN, b.min.y + EYE_MAX), b.max.z - WALL_MARGIN),
    )
    return { start, end, look: center.clone(), inner, stepScale }
  }, [room])

  const rig = useRef({
    phase: 'intro' as 'intro' | 'free',
    p: 0,
    pTarget: 0,
    pos: path.start.clone(),
    target: path.start.clone(),
    yawBase: 0,
    pitchBase: 0,
    yaw: 0,
    pitch: 0,
    ms: { x: 0, y: 0 }, // smoothed pointer
    frozen: false,
    settleFrom: null as null | { x: number; y: number }, // edge-turn waits until the pointer really moves
    wheelGate: false, // after the intro, ignore the rest of that scroll gesture
    lastWheel: 0,
    hoverTick: 0,
    lastMouse: { x: 9, y: 9 },
  }).current

  const ray = useMemo(() => {
    const r = new THREE.Raycaster()
    ;(r as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    return r
  }, [])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), d: new THREE.Vector3(), ndc: new THREE.Vector2() }), [])

  /** first surface along a ray (skips nothing: glass, walls, furniture all stop you) */
  const castFrom = (origin: THREE.Vector3, dir: THREE.Vector3, far = 30) => {
    ray.set(origin, dir)
    ray.far = far
    return ray.intersectObject(room.scene, true)[0]
  }

  /* ── pointer + wheel ── */
  useEffect(() => {
    shared.camera = camera
    shared.debugPose = (p, look, fov) => {
      rig.phase = 'free'
      rig.p = 1
      rig.pTarget = 1
      shared.intro = 1
      rig.pos.set(...p)
      rig.target.set(...p)
      const a = anglesOf(tmp.d.set(look[0] - p[0], look[1] - p[1], look[2] - p[2]))
      rig.ms.x = shared.mouse.x
      rig.ms.y = shared.mouse.y
      rig.yawBase = a.yaw + rig.ms.x * YAW_RANGE
      rig.pitchBase = a.pitch + rig.ms.y * PITCH_RANGE
      if (fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      room3d.set({ phase: 'free', atPC: false })
    }
    const onMove = (e: PointerEvent) => {
      shared.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      shared.mouse.y = (e.clientY / window.innerHeight) * 2 - 1
      shared.mouse.px = e.clientX
      shared.mouse.py = e.clientY
    }
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || isFrozen()) return
      // let genuinely scrollable content (a long project page on the monitor) scroll itself
      const scroller = (e.target as Element | null)?.closest?.('[data-lenis-prevent]')
      if (scroller && scroller.scrollHeight > scroller.clientHeight) return
      const now = performance.now()
      const idle = now - rig.lastWheel
      rig.lastWheel = now
      const px = wheelPixels(e)
      if (rig.phase === 'intro') {
        rig.pTarget = clamp(rig.pTarget + px * INTRO_PER_PX, 0, 1)
        return
      }
      if (rig.wheelGate) {
        if (idle < 250) return
        rig.wheelGate = false
      }
      // move along the ray under the cursor: toward what you point at, or back away from it
      tmp.ndc.set(shared.mouse.x, -shared.mouse.y)
      ray.setFromCamera(tmp.ndc, camera)
      const dir = tmp.d.copy(ray.ray.direction)
      const step = Math.min(Math.abs(px) * METERS_PER_PX * path.stepScale, 1.2)
      if (px > 0) {
        const hit = castFrom(rig.target, dir)
        const space = hit ? Math.max(0, hit.distance - STOP) : step
        rig.target.addScaledVector(dir, Math.min(step, space))
      } else {
        dir.negate()
        const hit = castFrom(rig.target, dir)
        const space = hit ? Math.max(0, hit.distance - BACK_STOP) : step
        rig.target.addScaledVector(dir, Math.min(step, space))
      }
      path.inner.clampPoint(rig.target, rig.target)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  /* ── per frame ── */
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const m = shared.mouse
    const frozen = isFrozen()

    // freeze while content is open; on return keep EXACTLY the same view (rebase the look on the pointer)
    if (frozen !== rig.frozen) {
      rig.frozen = frozen
      if (!frozen) {
        rig.ms.x = m.x
        rig.ms.y = m.y
        rig.yawBase = rig.yaw + m.x * YAW_RANGE
        rig.pitchBase = rig.pitch + m.y * PITCH_RANGE
        rig.settleFrom = { x: m.px, y: m.py }
      }
    }
    if (frozen) {
      if (room3d.get().hovered) room3d.set({ hovered: null })
      gl.domElement.style.cursor = ''
      return
    }

    // hover hold: while the cursor is on an interactive object the view stays put, so the object doesn't slide
    // out from under the cursor (moving off it resumes the look through the same damping — no jump)
    const holding = room3d.get().hovered !== null
    if (!holding) {
      const kLook = 1 - Math.exp(-dt * LOOK_DAMP)
      rig.ms.x += (m.x - rig.ms.x) * kLook
      rig.ms.y += (m.y - rig.ms.y) * kLook
    }

    if (rig.phase === 'intro') {
      rig.p += (rig.pTarget - rig.p) * (1 - Math.exp(-dt * 4))
      if (Math.abs(rig.pTarget - rig.p) < 1e-4) rig.p = rig.pTarget
      const e = ease(rig.p)
      rig.pos.lerpVectors(path.start, path.end, e)
      const base = anglesOf(tmp.d.subVectors(path.look, rig.pos))
      // the mouse barely moves the view at the PC and hands over to full look as the room opens up
      const amp = 0.03 + 0.97 * smoothstep(0.5, 1, rig.p)
      rig.yawBase = base.yaw
      rig.pitchBase = base.pitch
      rig.yaw = base.yaw - rig.ms.x * YAW_RANGE * amp
      rig.pitch = base.pitch - rig.ms.y * PITCH_RANGE * amp
      camera.fov = INTRO_FOV + (ROOM_FOV - INTRO_FOV) * e
      camera.updateProjectionMatrix()
      shared.intro = rig.p
      room3d.set({ atPC: rig.p < 0.06 })
      if (rig.pTarget >= 1 && rig.p > 0.999) {
        // room revealed → free exploration, continuing from exactly this pose
        rig.phase = 'free'
        rig.p = 1
        shared.intro = 1
        rig.target.copy(rig.pos)
        rig.wheelGate = true
        rig.settleFrom = { x: m.px, y: m.py }
        room3d.set({ phase: 'free', atPC: false })
      }
    } else {
      // edge turning, once the pointer has actually moved since the last hand-over
      if (rig.settleFrom && Math.hypot(m.px - rig.settleFrom.x, m.py - rig.settleFrom.y) > 30) rig.settleFrom = null
      if (!rig.settleFrom && !holding && Math.abs(rig.ms.x) > EDGE) {
        const k = (Math.abs(rig.ms.x) - EDGE) / (1 - EDGE)
        rig.yawBase -= Math.sign(rig.ms.x) * k * k * TURN_SPEED * dt
      }
      rig.yaw = rig.yawBase - rig.ms.x * YAW_RANGE
      rig.pitch = clamp(rig.pitchBase - rig.ms.y * PITCH_RANGE, -PITCH_LIMIT, PITCH_LIMIT)
      rig.pos.lerp(rig.target, 1 - Math.exp(-dt * MOVE_DAMP))
    }

    camera.position.copy(rig.pos)
    camera.rotation.set(rig.pitch, rig.yaw, 0, 'YXZ')
    camera.updateMatrixWorld()

    /* hover: what's under the cursor (occluders count — a lamp in front of the monitor blocks it) */
    const canHover = rig.phase === 'free' || rig.p > 0.35
    const moved = Math.abs(m.x - rig.lastMouse.x) + Math.abs(m.y - rig.lastMouse.y) > 1e-4
    if (canHover && (moved || ++rig.hoverTick % 8 === 0)) {
      rig.lastMouse.x = m.x
      rig.lastMouse.y = m.y
      tmp.ndc.set(m.x, -m.y)
      ray.setFromCamera(tmp.ndc, camera)
      ray.far = 30
      const hit = ray.intersectObject(room.scene, true)[0]
      const id = interactiveOf(hit?.object)
      room3d.set({ hovered: id })
      gl.domElement.style.cursor = id ? 'pointer' : ''
    } else if (!canHover && room3d.get().hovered) {
      room3d.set({ hovered: null })
      gl.domElement.style.cursor = ''
    }
  })

  return <MonitorProjector room={room} cast={castFrom} />
}

/**
 * Keeps the resume (a DOM element) glued onto the monitor's glass: the 4 corners of `CRT_Screen` are projected
 * every frame and mapped with a CSS matrix3d. Hidden when the glass faces away, is too small, or something in
 * the room is in front of it.
 */
function MonitorProjector({ room, cast }: { room: RoomHandle; cast: (o: THREE.Vector3, d: THREE.Vector3, far?: number) => THREE.Intersection | undefined }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const st = useRef({ tick: 0, occluded: false, shown: false, live: false }) // DOM starts hidden + inert
  const v = useMemo(() => new THREE.Vector3(), [])
  const d = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const el = shared.monitorEl
    if (!el) return
    const { corners, center, normal } = room.geometry.screen
    const facing = normal.dot(d.subVectors(camera.position, center).normalize())
    let behind = false
    const pts: Pt[] = corners.map((c) => {
      v.copy(c).applyMatrix4(camera.matrixWorldInverse)
      if (v.z > -camera.near) behind = true
      v.copy(c).project(camera)
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height]
    })
    const heightPx = Math.hypot(pts[0][0] - pts[3][0], pts[0][1] - pts[3][1])
    if (++st.current.tick % 6 === 0 && !behind) {
      const dist = camera.position.distanceTo(center)
      const hit = cast(camera.position, d.subVectors(center, camera.position).normalize(), dist + 0.1)
      st.current.occluded = !!hit && hit.distance < dist - 0.03 && interactiveOf(hit.object) !== 'pc'
    }
    const show = !behind && facing > 0.08 && heightPx > 48 && !st.current.occluded
    if (show) el.style.transform = quadToMatrix3d(1024, 768, pts)
    if (show !== st.current.shown) {
      st.current.shown = show
      el.classList.toggle('is-hidden', !show)
    }
    // the resume is usable while you're at the PC; afterwards it's just what the monitor shows
    const live = room3d.get().atPC && room3d.get().phase === 'intro'
    if (live !== st.current.live) {
      st.current.live = live
      el.classList.toggle('is-live', live)
    }
  })
  return null
}
