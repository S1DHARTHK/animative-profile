import { motion, stills, type Media } from '../content/photos'
import { controls, openLightbox, useJourney } from '../animation/store'
import { M } from '../animation/chapters'

const ALL: Media[] = [...stills, ...motion]

function code(i: number) {
  const n = Math.floor(i / 2) + 1
  return `${String(n).padStart(2, '0')}${i % 2 ? 'A' : ''}`
}

function Cell({ item, i }: { item: Media; i: number }) {
  const src = item.kind === 'photo' ? item.src : item.poster
  return (
    <button
      type="button"
      className={'cell' + (item.kind === 'video' ? ' cell--video' : '')}
      data-cell
      style={{ ['--ar' as string]: item.w / item.h }}
      onClick={(e) => openLightbox(ALL, i, e.currentTarget.querySelector('.cell__frame'))}
      aria-label={`${item.kind === 'video' ? 'Play' : 'Open'} ${item.title}`}
    >
      <span className="cell__edge" aria-hidden>
        <b>▸ {code(i)}</b>
        <i>KODAK 400TX</i>
      </span>
      <span className="cell__frame">
        <img src={src} alt="" decoding="async" draggable={false} />
        {item.kind === 'video' && (
          <span className="cell__play" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
            <em>{item.duration}</em>
          </span>
        )}
      </span>
      <span className="cell__meta">
        <b>{item.title}</b>
        <i>{item.note}</i>
      </span>
    </button>
  )
}

/**
 * The film strip that "develops" after the shutter fires. It travels horizontally with scroll
 * (engine.ts writes the transform); visibility is time-based (galleryOn).
 */
export function Gallery() {
  const on = useJourney((s) => s.galleryOn)
  const jump = (frac: number) => {
    const a = M.gallery.start + 20
    const b = M.gallery.end - 20
    controls.scrollToVh(a + (b - a) * frac, { duration: 1.6 })
  }
  const motionFrac = stills.length / ALL.length
  return (
    <section className={'gallery' + (on ? ' is-on' : '')} data-gallery aria-hidden={!on} aria-label="Photography and video">
      <header className="gallery__head">
        <div className="gallery__tabs">
          <button type="button" onClick={() => jump(0)} tabIndex={on ? 0 : -1}>
            Stills
          </button>
          <button type="button" onClick={() => jump(Math.min(1, motionFrac + 0.02))} tabIndex={on ? 0 : -1}>
            Motion
          </button>
        </div>
        <span className="gallery__count" data-strip-counter>
          01 / {String(ALL.length).padStart(2, '0')}
        </span>
      </header>

      <div className="strip" data-strip>
        <div className="leader">
          <small>ROLL 01</small>
          <b>Stills</b>
          <span>{stills.length} frames</span>
        </div>
        {stills.map((p, i) => (
          <Cell key={p.id} item={p} i={i} />
        ))}
        <div className="leader leader--mid">
          <small>ROLL 02</small>
          <b>Motion</b>
          <span>{motion.length} reels</span>
        </div>
        {motion.map((v, i) => (
          <Cell key={v.id} item={v} i={stills.length + i} />
        ))}
        <div className="leader leader--end">
          <small>END OF ROLL</small>
        </div>
      </div>

      <footer className="gallery__foot">
        <span>Scroll to advance</span>
        <span>Click a frame to open</span>
      </footer>
    </section>
  )
}
