// ─────────────────────────────────────────────────────────────────────────────
// PHOTOGRAPHS & VIDEOS — used by the wall frames, the camera's film-strip gallery and the lightbox.
//
// HOW TO REPLACE THE PLACEHOLDERS
//   1. Drop your files into /public/photos (jpg/webp, ~1600–2400px on the long edge).
//   2. Change `src`, `w`, `h` (pixel size — only the ratio matters) and the caption text below.
//   3. Videos: set `src` (mp4/webm in /public/photos) or `embed` (YouTube/Vimeo embed URL). `poster` is the still.
// ─────────────────────────────────────────────────────────────────────────────

export interface Photo {
  kind: 'photo'
  id: string
  /** small caps line, e.g. "KOCHI — 2026" */
  title: string
  /** one short sentence */
  note: string
  src: string
  w: number
  h: number
}

export interface Video {
  kind: 'video'
  id: string
  title: string
  note: string
  poster: string
  src?: string
  embed?: string
  duration: string
  w: number
  h: number
}

export type Media = Photo | Video

const P = (id: string, title: string, note: string, w: number, h: number): Photo => ({
  kind: 'photo',
  id,
  title,
  note,
  src: `/photos/${id}.webp`,
  w,
  h,
})

/** Frames hanging in the room. Keys are fixed by the room geometry; change what they show. */
export const frames = {
  mountain: P('pines-mist', 'MUNNAR — 2025', 'First light through the fog.', 1200, 1500),
  road: P('road-long', 'ALAPPUZHA — 2025', 'The long road home.', 1000, 1500),
  path: P('path-figure', 'WAYANAD — 2024', 'A quiet morning walk.', 1000, 1250),
  coast: P('coast-headland', 'KOCHI — 2026', 'Shot during an evening walk.', 1600, 1200),
  street: P('street-car', 'FORT KOCHI — 2026', 'Old street, older car.', 1000, 1500),
  postcards: P('dunes', 'JAISALMER — 2024', 'Postcards from the dunes.', 1200, 1200),
} satisfies Record<string, Photo>

export type FrameId = keyof typeof frames
export const FRAME_IDS = Object.keys(frames) as FrameId[]

/** ROLL 01 — stills (frame photos are included automatically first) */
export const stills: Photo[] = [
  ...Object.values(frames),
  P('ridge-gold', 'COORG — 2025', 'Ridges, one after another.', 1500, 1000),
  P('city-dusk', 'MUMBAI — 2024', 'The hour the windows come on.', 1500, 1000),
  P('window-light', 'HOME — 2026', 'A borrowed patch of sun.', 1000, 1250),
  P('night-sky', 'SPITI — 2024', 'Camp, 4,000 metres.', 1500, 1000),
]

/** ROLL 02 — motion */
export const motion: Video[] = [
  {
    kind: 'video',
    id: 'reel-01',
    title: 'REEL — 2026',
    note: 'A minute of travel footage.',
    poster: '/photos/reel-01.webp',
    duration: '1:04',
    w: 1600,
    h: 900,
    // src: '/photos/reel-01.mp4',
    // embed: 'https://player.vimeo.com/video/000000000',
  },
  {
    kind: 'video',
    id: 'reel-02',
    title: 'CITY NIGHTS — 2025',
    note: 'Handheld, available light.',
    poster: '/photos/reel-02.webp',
    duration: '0:48',
    w: 1600,
    h: 900,
  },
]
