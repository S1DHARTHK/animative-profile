// The whole journey as data. 1 timeline unit = 1vh of scroll.
// Reorder / retime by editing STEPS — marks, totals and chapter lookups are all derived from it.

export type ChapterId = 'intro' | 'room' | 'desk' | 'pc' | 'camera' | 'wall' | 'outro'

const STEPS: [name: string, vh: number][] = [
  ['intro', 70], //          doorway opens, title leaves
  ['roomHold', 25],
  ['farMid', 60], //         dolly far → mid
  ['midDesk', 60], //        dolly mid → desk
  ['deskHold', 25],
  ['deskClose', 70], //      dolly desk → close
  ['closeHold', 25],
  ['pcApproach', 75], //     rack focus + dock on the monitor
  ['pcBoot', 30], //         CRT powers on, boot text
  ['page0', 65], //          About
  ['page1', 65], //          Skills
  ['page2', 65], //          CV
  ['page3', 65], //          Projects
  ['pcLeave', 60], //        screen off, undock
  ['camApproach', 70], //    pan/zoom to camera, viewfinder, AF lock
  ['gallery', 240], //       shutter → film strip
  ['camLeave', 60], //       gallery closes, focus releases
  ['outClose', 55], //       dolly close → desk
  ['wallIn', 40],
  ['wallA', 30], //          back wall hold
  ['wallPan', 40],
  ['wallB', 40], //          right wall hold
  ['wallOut', 40],
  ['outDeskMid', 45], //     dolly desk → mid
  ['outMidFar', 45], //      dolly mid → far
  ['outroHold', 45],
]

export interface Mark {
  start: number
  end: number
  dur: number
}

export const M = {} as Record<string, Mark>
let cursor = 0
for (const [name, dur] of STEPS) {
  M[name] = { start: cursor, end: cursor + dur, dur }
  cursor += dur
}

export const TOTAL_VH = cursor
export const PAGE_COUNT = 4
export const PAGE_MARKS = [M.page0, M.page1, M.page2, M.page3]

/** Which CV page is showing at timeline position t (vh). */
export function pageAt(t: number): number {
  if (t < M.page1.start) return 0
  if (t < M.page2.start) return 1
  if (t < M.page3.start) return 2
  return 3
}

export function chapterAt(t: number): ChapterId {
  if (t < M.roomHold.start + 2) return 'intro'
  if (t < M.deskHold.start) return 'room'
  if (t < M.pcApproach.start) return 'desk'
  if (t < M.camApproach.start) return 'pc'
  if (t < M.outClose.start) return 'camera'
  if (t < M.wallIn.start) return 'desk'
  if (t < M.outDeskMid.start) return 'wall'
  if (t < M.outroHold.start - 25) return 'room'
  return 'outro'
}

/** Shutter / gallery thresholds (time-based events fire when the scroll settles beyond these). */
export const SHUTTER_AT = M.gallery.start + 4
export const GALLERY_END_AT = M.gallery.end - 4
/** Screen is "live" (interactive) between these. */
export const SCREEN_LIVE = { from: M.pcBoot.end - 4, to: M.pcLeave.start + 6 }

export type NavTarget = 'room' | 'pc' | 'camera' | 'wall' | 'contact'
export const NAV: { id: NavTarget; label: string; at: number }[] = [
  { id: 'room', label: 'Room', at: M.roomHold.start + 8 },
  { id: 'pc', label: 'Computer', at: M.page0.start + 6 },
  { id: 'camera', label: 'Camera', at: M.gallery.start + 30 },
  { id: 'wall', label: 'Frames', at: M.wallA.start + 12 },
  { id: 'contact', label: 'Contact', at: M.outroHold.start + 12 },
]

export function navActive(t: number): NavTarget | null {
  if (t < M.roomHold.start) return null
  if (t < M.pcApproach.start) return 'room'
  if (t < M.camApproach.start) return 'pc'
  if (t < M.outClose.start) return 'camera'
  if (t < M.outDeskMid.start) return 'wall'
  if (t < M.outroHold.start - 20) return 'room'
  return 'contact'
}
