# Room — 3D models

Two complete 3D models of the room (all four walls, floor, ceiling and every object — viewable from any direction):

| File | Room | Used by the website |
| --- | --- | --- |
| `public/models/room-small.glb` | the photographed room's shell (3.3 m × 4.0 m, 2.9 m ceiling), with balcony doors instead of the window, fitted out as a **modern room at night** | **yes** (desktop 3D portfolio) |
| `public/models/room.glb` | enlarged: 7 m × 9 m, 3.4 m ceiling, two windows, bench and two extra frames | no (kept) |

Both come from the same generator. The rest of this page describes `room.glb`; `room-small.glb` shares its shell
(`Architecture`, `Door`, `Outside_Garden`) but is the **modern room at night** (`theme: 'night'` in the
`Room` node's extras — the site switches to its night look from it):

* warm off-white paint (fine roller stipple), a light ceiling, an oak plank floor; `Fitout` adds a tray ceiling
  (`Ceiling_Soffit`) with a warm cove LED, twin recessed `Downlights` on the side walls, and LED lines at the floor.
  LED strips and downlight lenses are bright emissive bars; the light they throw is drawn by soft `ledWash` /
  `scallopWash` planes (the site renders them additively)
* the workspace: a light grey `Slat_Panel` (with a black abstract relief) standing off the back wall, LEDs behind its edges
  washing the wall in a warm halo; `Desk` — a walnut standing desk on a black frame; `Desk_Set` holds `Monitor` on a
  walnut `Monitor_Riser` (its centred 4:3 `Monitor_Screen` is where the site shows the resume; the `Light_Bar` on top
  carries `Lamp_Light`), two `Speaker`s, a glass-sided `PC_Tower` on the desk, `Keyboard`, `Mouse` on a `Desk_Mat`, a `Mug` and `Camera`;
  a black mesh office `Chair` on a grey shag `Rug`; plants: a `Wall_Shelf` of trailing pothos, a `Fiddle_Fig`,
  `Snake_Plant`s and, in the corner left of the desk, `Stone_Planters`. These are pebble-shaped cream stone planters
  (sandy, pitted texture) topped with white pebbles. A tall egg holds a bird of paradise (broad arching blades on long
  petioles), a low pebble holds a slim olive tree, and a small one holds a spiky rosette
* the `Lounge` in the front-left corner (behind you as you face the desk): a curved `Sofa` in deep green velvet,
  bowed round an arc. It has a channel-tufted back whose rolls fan out with the curve and whose ends scroll down. In
  front of the back are wedge seat modules, each a domed cushion on an upholstered base. Both ends round off into
  chaise lobes; the left one runs on along the wall, under the globe shelf, without a back. It all sits on a dark
  recessed plinth, with two cream pillows. The walnut `Side_Table` (vase, candles) stands inside the curve and a
  coiled braided-jute `Pouf` stands across from it, on a cream woven rug. The upholstery is meshed from distance
  fields in a "sofa space" and then bent round the arc (`softBlock` / `bendPiece`). Fabrics carry a soft sheen
  (`KHR_materials_sheen`)
* `Globe_Shelf` — a spherical bookshelf on the left wall (curved shelves and meridian fins in honey oak, filled with
  books and two small framed photos)
* `Balcony_Door` — French doors with sidelights in the left wall where the window was (its glass is `Window_1_Glass`),
  sheer voile `Sheer_Curtains` tied back either side, and outside a `Balcony` terrace (stone floor, white balustrade,
  potted cypress and shrubs)
* a `Cluster_Pendant` beside the globe shelf — five rattan balls on jute ropes
  with Edison bulbs and trailing pothos; the room's light (`Room_Fill`) glows inside it (no ceiling fan or centre
  pendant); a faint cool moon as `Sun`, the night garden outside
* no wall frames (the family photograph and its caption, `roomFrames.family` in `src/content/photos.ts`, are kept
  for when one is hung again); no bench, plants, bookshelf, postcards or sketches

| | |
| --- | --- |
| Format | glTF 2.0 binary (`.glb`), single self-contained file (geometry + textures) |
| Size | ~1.8 MB · 183 meshes · ~51k triangles · 74 PBR materials · 21 textures (JPEG/PNG, power-of-two) |
| Validation | Khronos glTF-Validator: 0 errors, 0 warnings, 0 infos |
| Units / axes | metres, +Y up, origin = centre of the floor |
| Room size | 7 m wide (x) × 9 m deep (z) × 3.4 m high — much larger than the photographed room; furniture is true-to-life size |
| Extensions | `KHR_lights_punctual` (lights), `KHR_materials_emissive_strength` (window daylight, lamp bulb) — both built into three.js |

## Using it on a website (three.js)

```js
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const gltf = await new GLTFLoader().loadAsync('/models/room.glb')
scene.add(gltf.scene)

// one of the stored viewpoints (the four photographed angles + an overview)
const view = gltf.cameras.find((c) => c.name === 'View_Doorway')

// real-time shadows are a renderer setting, not part of glTF:
renderer.shadowMap.enabled = true
gltf.scene.traverse((o) => {
  if (o.isMesh) (o.castShadow = !o.material.transparent), (o.receiveShadow = true)
  if (o.isDirectionalLight) o.castShadow = true // the sun through the windows
})
```

Recommended renderer setup (what the renders were checked with): `ACESFilmicToneMapping`, a soft environment
(`RoomEnvironment` via `PMREMGenerator`, `scene.environmentIntensity ≈ 0.3`). Works equally in `<model-viewer>`,
Babylon.js, Blender, etc.

## What's inside (node names)

```
Room                      extras: { units, upAxis, size }
├─ Architecture           Floor, Ceiling, Wall_Back|Front|Left|Right, Skirting
├─ Windows                Window_1, Window_2 (steel 6×6 grid, sill, Window_n_Glass)
├─ Outside_Garden         sunlit garden seen through the windows (emissive)
├─ Door                   panel door, casing, lever handles
├─ Furniture              Desk, Desk_Set, Chair, Rug, Shelf, Bench
│   └─ Desk_Set           CRT_Monitor (with CRT_Screen), PC_Tower, Keyboard, Mouse, Desk_Lamp,
│                         PotPlant, Desk_Books, Pen_Holder, Wood_Block, Note_Pad, Camera, Wood_Tray
├─ Plants                 3 × Monstera
├─ Wall_Decor             Frame_mountain|road|path|coast|street|ridge|night (+ Frame_<id>_Photo),
│                         Postcard_*, Sketch ×2, Light_Switch
├─ Ceiling_Fan
├─ Lights                 Sun (directional), Lamp_Light (spot), Room_Fill (point)
└─ Viewpoints             View_Doorway, View_Shelf, View_Desk, View_Close, View_Overview (cameras)
```

Handy hooks for later:

* **`CRT_Screen`** has clean 0..1 UVs: put a canvas/video texture on it to show the CV on the monitor in 3D.
* **`Frame_<id>_Photo`** meshes each have their own material (`photo-<name>`): swap `material.map` to show
  your photographs. `Frame_mountain/road/path/coast/street` match the frame ids in `src/content/photos.ts`.
* Light intensities are physical units (lux / candela); tune them to taste after loading.

## Rebuilding / editing

Everything is generated by code, so it's easy to change:

```bash
npm run model        # → public/models/room.glb         (~10 s)
npm run model:small  # → public/models/room-small.glb   (the photographed room)
```

The two layouts are the `PROFILES` at the top of `build-room-model.mjs` (sizes, positions, lights, viewpoints).

* `scripts/room-model/build-room-model.mjs` — the room: dimensions (`W`, `D`, `H`), window/door positions,
  every object, materials, lights and viewpoints.
* `scripts/room-model/textures.mjs` — procedural textures (plaster, tiles, teak, cane, jute, leaves, garden,
  globe) + the wall photos (taken from `public/photos`, so real photos there flow into the model too).
* `scripts/room-model/lib.mjs` — modelling helpers and the glTF exporter.

To look around it (dev server running): `http://127.0.0.1:5173/scripts/room-model/viewer.html`
(orbit with the mouse; `?view=View_Desk`, `?hide=Ceiling` for a cut-away). `node scripts/room-model/render-views.mjs`
renders the stored viewpoints to `source/_model-*.png` (headless Edge/Chrome; launch from PowerShell on Windows).
