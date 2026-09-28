import type { CSSProperties } from 'react'
import { FRAME_IDS, frames, type FrameId } from '../content/photos'
import { GEOMETRY, type AngleId, type ObjectId, type Poly, ANGLES } from './angles'
import { controls, journey, openLightbox } from '../animation/store'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const pct = (n: number) => `${+(n * 100).toFixed(3)}%`

/** Turns a polygon (image-normalised) into: a positioned bbox, a clip-path local to the bbox, and background
 *  sizing that shows exactly that region of the room image (used for the "lift" hover effect). */
function shape(poly: Poly) {
  const xs = poly.map((p) => clamp01(p[0]))
  const ys = poly.map((p) => clamp01(p[1]))
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0
  const h = Math.max(...ys) - y0
  const clip = `polygon(${poly
    .map(([x, y]) => `${(((clamp01(x) - x0) / w) * 100).toFixed(2)}% ${(((clamp01(y) - y0) / h) * 100).toFixed(2)}%`)
    .join(',')})`
  const box: CSSProperties = { left: pct(x0), top: pct(y0), width: pct(w), height: pct(h) }
  const img: CSSProperties = {
    clipPath: clip,
    backgroundSize: `${(100 / w).toFixed(3)}% ${(100 / h).toFixed(3)}%`,
    backgroundPosition: `${w >= 1 ? 0 : ((x0 / (1 - w)) * 100).toFixed(3)}% ${h >= 1 ? 0 : ((y0 / (1 - h)) * 100).toFixed(3)}%`,
  }
  return { box, clip, img }
}

const OBJECTS: Record<ObjectId, { label: string; sub: string; aria: string; nav: 'pc' | 'camera' }> = {
  pc: { label: 'Computer', sub: 'CV & Projects', aria: 'Sit at the computer — CV and projects', nav: 'pc' },
  camera: { label: 'Camera', sub: 'Photography & Video', aria: 'Pick up the camera — photography and video', nav: 'camera' },
}

const FRAME_LABEL: Record<FrameId, string> = {
  mountain: 'mountain photograph',
  road: 'road photograph',
  path: 'path photograph',
  coast: 'coastline photograph',
  street: 'street photograph',
  postcards: 'postcards',
}

function FrameHotspot({ angle, id, poly }: { angle: AngleId; id: FrameId; poly: Poly }) {
  const s = shape(poly)
  const photo = frames[id]
  const show = (el: HTMLElement) => {
    const r = (el.parentElement as HTMLElement).getBoundingClientRect()
    journey.set({ tip: { id, title: photo.title, note: photo.note, rect: { x: r.left, y: r.top, w: r.width, h: r.height } } })
  }
  const hide = () => journey.set({ tip: null })
  return (
    <div className="hs hs--frame" style={s.box} data-hs={id}>
      <button
        type="button"
        className="hs__hit"
        style={{ clipPath: s.clip }}
        aria-label={`Open ${FRAME_LABEL[id]}: ${photo.title}`}
        onPointerEnter={(e) => show(e.currentTarget)}
        onPointerLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onClick={(e) => {
          const el = e.currentTarget.parentElement
          openLightbox(FRAME_IDS.map((k) => frames[k]), FRAME_IDS.indexOf(id), el)
        }}
      />
      <div className="hs__lift" aria-hidden>
        <div className="hs__img" style={{ ...s.img, backgroundImage: `url(${ANGLES[angle].src})` }} />
      </div>
    </div>
  )
}

function ObjectHotspot({ angle, id, poly }: { angle: AngleId; id: ObjectId; poly: Poly }) {
  const s = shape(poly)
  const o = OBJECTS[id]
  return (
    <div className="hs hs--object" style={s.box} data-hs={id}>
      <button
        type="button"
        className="hs__hit"
        style={{ clipPath: s.clip }}
        aria-label={o.aria}
        onClick={() => controls.goTo(o.nav)}
      />
      <div className="hs__lift" aria-hidden>
        <div className="hs__img" style={{ ...s.img, backgroundImage: `url(${ANGLES[angle].src})` }} />
      </div>
      <span className="hs__dot" aria-hidden />
      <span className="hs__label" aria-hidden>
        <b>{o.label}</b>
        <i>{o.sub}</i>
      </span>
    </div>
  )
}

export function Hotspots({ angle }: { angle: AngleId }) {
  const g = GEOMETRY[angle]
  return (
    <>
      {FRAME_IDS.filter((id) => g[id]).map((id) => (
        <FrameHotspot key={id} angle={angle} id={id} poly={g[id]} />
      ))}
      {(['pc', 'camera'] as ObjectId[]).filter((id) => g[id]).map((id) => (
        <ObjectHotspot key={id} angle={angle} id={id} poly={g[id]} />
      ))}
    </>
  )
}
