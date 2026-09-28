# Room Portfolio — interaction architecture & animation plan

> "You're entering my room and discovering my portfolio." The room is the navigation.

## 1. What the reference image tells us

The supplied image is a 2×2 contact sheet of **four cameras in the same room**. Sorted by distance
they form a physical dolly path toward the desk (measured, see `src/room/geometry.json`):

| Angle (file)   | Sheet panel   | What it shows                                         | Monitor glass height (fraction of image) |
| -------------- | ------------- | ----------------------------------------------------- | ---------------------------------------- |
| `far.webp`     | bottom-right  | whole room from the doorway: ceiling fan, shelf, door | 0.078                                    |
| `mid.webp`     | top-right     | from the shelf side, window + wall frames             | 0.110  (×1.42 vs far)                    |
| `desk.webp`    | top-left      | frontal desk view, all 4 wall frames + right wall     | 0.148  (×1.34 vs mid)                    |
| `close.webp`   | bottom-left   | desk close-up: CRT, keyboard, camera                  | 0.244  (×1.65 vs desk)                   |

Interactive objects (all present in every angle → each angle has its own polygon set):

* **PC / CRT** — `pc` outline, plus in `close` a precise perspective `glass` quad (screen).
* **Camera** on the desk (right of the mouse-mat).
* **Wall frames** — `mountain`, `road`, `path`, `coast` (back wall) · `street`, `postcards` (right wall).
* Decorative (future hooks): lamp, monstera, globe/shelf, door, ceiling fan, window.

Limits: panels are only ~762×508 px. We upscale 2× at build time, and hide the residual softness
with rack-focus blur, film grain and crisp HTML on the CRT. Drop originals in `source/angles/`
(`far|mid|desk|close.png`) and run `npm run assets` — nothing else changes.

## 2. Core idea: a virtual camera that synthesises its own frames (WebGL2)

The room is drawn by one WebGL2 canvas (`src/room/gl`), not by stacked `<img>` layers. Three ideas make the
four still photos behave like one continuous camera:

* **Every photo is a real pinhole camera** (`camera.ts`, FOV per angle in `angles.ts`). A timeline *view* —
  `{u,v,X,Y,s}` = "image point (u,v) at screen point (X,Y), zoom s" — becomes a camera **rotation** (yaw/pitch,
  55 % of the pan) plus lens shift (the rest) and focal length. Pans and tilts therefore show true perspective
  change instead of a picture sliding past, and the frame is clamped so the photo's edge never shows.
* **In-between frames are synthesised, not cross-faded** (view morphing). `scripts/build-morphs.py` precomputes,
  per consecutive pair (far→mid, mid→desk, desk→close): the homography of the back-wall plane (fitted to dense
  RAFT optical-flow correspondences) and the residual parallax as two dense flow fields. At runtime both photos
  become GPU grid meshes; the camera interpolates from A's framing to B's (geometric zoom about a fixed point) while
  A's vertices slide along t·F01 and B's along (1-t)·F10, nearer surfaces win the depth test, and triangles torn
  open across a depth edge hand over to the other photo (per-triangle stretch test). Every scroll position is a
  new frame; a dolly is literally one number (`fx.shot`) moving from 0 → 3.
* **Lens + film in one post pass**: depth-of-field blur (mip-mapped Poisson taps), rack focus (a sharp, lit
  ellipse), exposure, vignette, grain (integer hash, 24 fps) and the intro doorway. No CSS filters animate per frame.

The DOM only carries what must be DOM: hotspot planes (image-sized boxes mapped onto the screen with the *same*
homography via `matrix3d`, so hover/click sit exactly on the photographed objects), the CRT screen (a 1024×768
React app mapped onto the photographed glass, then "docked" flat), captions, gallery and lightbox.

Performance (headless Edge, AMD integrated GPU, 1440×900, cold first visit): 57–60 fps through every chapter,
p95 frame ≈ 17 ms, ~0.8 ms JS per frame. The renderer skips the scene pass when the camera is still, pre-warms
every pass behind the loader, and lowers its resolution automatically if frames run long.

## 3. Scroll → time

One pinned stage, one master GSAP timeline driven directly by Lenis's smoothed scroll (a single smoothing stage —
no scrub lag stacked on top). **1 timeline unit = 1 vh of scroll**
(total ≈ 1520 vh), so chapters are just numbers in `src/animation/chapters.ts`.

| vh          | Chapter        | What happens                                                                                   |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------- |
| 0–70        | **Intro**      | Dark hallway; the room is glimpsed through a doorway right of centre. The title drifts away and blurs; the doorway opens to full-bleed while `far` pushes in from 1.42× and focus pulls in. |
| 70–95       | Room           | Hold on `far`. Hint dots fade in on the PC + camera. Pointer sway, dust motes.                 |
| 95–215      | Dolly in       | far→mid→desk (synthesised camera moves, 60 vh each).                                           |
| 215–335     | Desk           | Hold, dolly desk→close, hold. PC and camera are hoverable / clickable.                         |
| 335–440     | **PC**         | Approach + rack focus + dock; the CRT powers on (line → full raster → boot text → OS).         |
| 440–700     | PC pages       | About → Skills → CV → Projects, one page per 65 vh (also clickable inside the screen).         |
| 700–760     | PC leave       | The CRT shuts down, the dock releases, the view pans across the desk to the camera.            |
| 760–830     | **Camera**     | Closing in, rack focus, viewfinder HUD + hunting autofocus brackets on the camera.             |
| ~834        | Shutter        | Time-based: click, blackout, flash, then the film strip "develops". Reverses on the way back.  |
| 830–1070    | Gallery        | Horizontal film strip scrubbed by scroll (Stills roll, then Motion roll). Click → lightbox.     |
| 1070–1185   | Camera leave   | The gallery closes, focus releases, dolly-out close→desk.                                       |
| 1185–1375   | **Wall**       | The desk layer rises to the back wall, holds, pans to the right wall, settles back. Frames hoverable. |
| 1375–1510   | Outro          | Dolly-out desk→mid→far; contact links; "Replay".                                                |

Time-based (not scrubbed) events: shutter/flash/gallery show-hide, frame hover, lightbox FLIP.
Everything else is scrubbed, so it reverses perfectly.

## 4. Navigation without a navbar

* PC hotspot → `goTo('pc')`; camera hotspot → `goTo('camera')`; frames → lightbox (FLIP from the frame).
* A hair-thin chapter rail (right edge, 5 ticks) + film-style captions bottom-left. That's the whole HUD.
* `Esc` closes the lightbox / leaves a project; `↑/↓/PgUp/PgDn/Space` work through Lenis; Tab reaches hotspots.

## 5. Code layout (edit content only in `src/content`)

```
src/
  content/        site.ts  profile.ts  projects.ts  photos.ts     ← YOUR text, CV, projects, photos
  room/           angles.ts  geometry.json  morphs.json  lqip/  HotspotPlane.tsx  Hotspots.tsx  Atmosphere.tsx
  room/gl/        renderer.ts (WebGL2 passes)  shaders.ts  camera.ts (virtual camera)  mat3.ts
  animation/      chapters.ts  metrics.ts  homography.ts  timeline.ts  engine.ts  dust.ts  store.ts
  portfolio/      ScreenApp/ScreenApp.tsx  Gallery.tsx  Lightbox.tsx
  ui/             Overlays.tsx (intro, loader, HUD, frame tip, viewfinder)  ScreenOverlay.tsx
  mobile/         MobileExperience.tsx
  styles/         base.css  ui.css  screen.css  mobile.css
scripts/          slice-room.mjs  make-placeholders.mjs  build-morphs.py  capture.mjs  grid.mjs
public/room/      far|mid|desk|close.webp   morph/<a>-<b>.f01|f10.png  (flow fields, 12-bit packed)
```

* **Room / environment** = `room/` (pure layout + hotspot geometry).
* **Animation logic** = `animation/` (no React state per frame; imperative, ref-driven).
* **Portfolio content** = `content/` + `portfolio/` (React, no knowledge of the camera).
* **Responsive** = `useLayoutMode()` picks `DesktopExperience` or `MobileExperience`.

## 6. Mobile / tablet

Not a scaled-down dolly. A short scroll-linked doorway reveal, then one still view of the room with
tappable pins (Computer / Camera / Frames). Each opens a full-screen sheet reusing the same `ScreenApp`,
gallery and lightbox components.

## 7. Replacing placeholders

* Text, CV, projects: `src/content/profile.ts`, `projects.ts`.
* Wall frame photos + gallery + videos: `src/content/photos.ts` (drop files into `public/photos/`).
* Better room renders: `source/angles/*.png` → `npm run assets` → `npm run morphs` (re-solves the in-between frames).
* Hotspot geometry: `src/room/geometry.json`; verify with `node scripts/grid.mjs <angle> 1 - src/room/geometry.json`.
