import { useSyncExternalStore } from 'react'
import type { ChapterId, NavTarget } from './chapters'
import type { Media } from '../content/photos'

// A deliberately tiny store: the animation engine writes discrete state here (chapter, page, gallery…),
// React components subscribe with selectors. Per-frame values NEVER go through React.

export interface LightboxState {
  items: Media[]
  index: number
  origin: { x: number; y: number; w: number; h: number } | null
}

export interface TipState {
  id: string
  title: string
  note: string
  rect: { x: number; y: number; w: number; h: number }
}

export interface JourneyState {
  ready: boolean
  chapter: ChapterId
  nav: NavTarget | null
  screenPage: number
  screenLive: boolean
  galleryOn: boolean
  moving: boolean
  reducedMotion: boolean
  lightbox: LightboxState | null
  tip: TipState | null
}

let state: JourneyState = {
  ready: false,
  chapter: 'intro',
  nav: null,
  screenPage: 0,
  screenLive: false,
  galleryOn: false,
  moving: false,
  reducedMotion: false,
  lightbox: null,
  tip: null,
}
const subs = new Set<() => void>()

export const journey = {
  get: () => state,
  set(patch: Partial<JourneyState>) {
    let changed = false
    for (const k of Object.keys(patch) as (keyof JourneyState)[]) {
      if (state[k] !== patch[k]) changed = true
    }
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

export function useJourney<T>(selector: (s: JourneyState) => T): T {
  return useSyncExternalStore(journey.subscribe, () => selector(state))
}

/** Imperative controls the engine registers once it exists (so UI can call them without importing the engine). */
export const controls = {
  goTo: (_target: NavTarget | number, _opts?: { duration?: number }) => {},
  scrollToVh: (_vh: number, _opts?: { duration?: number }) => {},
  setScrollLocked: (_locked: boolean) => {},
}

export function openLightbox(items: Media[], index: number, originEl?: Element | null) {
  const r = originEl?.getBoundingClientRect()
  journey.set({
    lightbox: { items, index, origin: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null },
    tip: null,
  })
  controls.setScrollLocked(true)
}

export function closeLightbox() {
  if (!journey.get().lightbox) return
  journey.set({ lightbox: null })
  controls.setScrollLocked(false)
}
