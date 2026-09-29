import { useSyncExternalStore } from 'react'
import type { Camera } from 'three'

// UI state of the 3D room (the per-frame camera state lives in CameraRig, never in React).

export type Overlay = null | 'pc' | 'camera'

export interface Room3DState {
  ready: boolean
  /** 'intro' = focused on the PC / pulling back; 'free' = exploring */
  phase: 'intro' | 'free'
  /** camera is at the PC (start): the resume on the monitor is usable */
  atPC: boolean
  /** interactive object under the cursor (id from interactives.ts) */
  hovered: string | null
  /** content opened from an object */
  open: Overlay
}

let state: Room3DState = { ready: false, phase: 'intro', atPC: true, hovered: null, open: null }
const subs = new Set<() => void>()

export const room3d = {
  get: () => state,
  set(patch: Partial<Room3DState>) {
    let changed = false
    for (const k of Object.keys(patch) as (keyof Room3DState)[]) if (state[k] !== patch[k]) changed = true
    if (!changed) return
    state = { ...state, ...patch }
    subs.forEach((s) => s())
  },
  subscribe(fn: () => void) {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  },
}

export function useRoom3D<T>(selector: (s: Room3DState) => T): T {
  return useSyncExternalStore(room3d.subscribe, () => selector(state))
}

/** Shared, non-React values the rig and the DOM layers both read. */
export const shared = {
  /** normalised pointer, x/y in -1..1 (y down), updated from window pointer events */
  mouse: { x: 0, y: 0, px: 0, py: 0 },
  /** intro progress 0 (at the PC) → 1 (room revealed) */
  intro: 0,
  /** how many things currently hold the camera still (open content, a project page…) */
  locks: 0,
  /** DOM element of the resume shown on the monitor (positioned by MonitorProjector) */
  monitorEl: null as HTMLDivElement | null,
  /** the 3D camera (for projecting objects to the screen) */
  camera: null as Camera | null,
  /** dev/debug: jump straight into free exploration at a pose */
  debugPose: null as null | ((pos: [number, number, number], look: [number, number, number], fov?: number) => void),
}

export const isFrozen = () => shared.locks > 0 || state.open !== null
