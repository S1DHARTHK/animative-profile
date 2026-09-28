import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ANGLES, GEOMETRY, type Poly } from '../room/angles'
import { FRAME_IDS, frames, motion, stills, type FrameId, type Media } from '../content/photos'
import { site } from '../content/site'
import { ScreenView } from '../portfolio/ScreenApp/ScreenApp'
import { Lightbox } from '../portfolio/Lightbox'
import { openLightbox, useJourney } from '../animation/store'

/**
 * Phones & tablets: no camera dolly. A short scroll-linked "doorway" reveal, then one still of the desk that you can
 * drag sideways. Glowing pins sit on the same objects as on desktop and open full-screen sheets that reuse the
 * same CRT OS, gallery and lightbox.
 */

const ALL: Media[] = [...stills, ...motion]
const ANGLE = ANGLES.desk

const centroid = (poly: Poly) => ({
  u: poly.reduce((s, p) => s + p[0], 0) / poly.length,
  v: poly.reduce((s, p) => s + p[1], 0) / poly.length,
})

type Sheet = null | 'pc' | 'camera'

export function MobileExperience() {
  const stageRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [page, setPage] = useState(0)
  const lightbox = useJourney((s) => s.lightbox)

  // scroll-linked reveal: the doorway opens, focus pulls in, title drifts away
  useEffect(() => {
    const stage = stageRef.current!
    let raf = 0
    const update = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)))
      stage.style.setProperty('--p', p.toFixed(4))
      setRevealed(p > 0.9)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // start the drag-scroller centred on the computer
  useLayoutEffect(() => {
    const el = roomRef.current
    if (!el) return
    const c = centroid(GEOMETRY.desk.pc)
    el.scrollLeft = c.u * el.scrollWidth - el.clientWidth / 2
  }, [ready])

  // lock page scroll behind sheets / lightbox
  useEffect(() => {
    const lock = !!sheet || !!lightbox
    document.documentElement.style.overflow = lock ? 'hidden' : ''
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [sheet, lightbox])

  const pc = centroid(GEOMETRY.desk.pc)
  const cam = centroid(GEOMETRY.desk.camera)

  return (
    <>
      <div className={'m-stage' + (ready ? ' is-ready' : '') + (revealed ? ' is-revealed' : '')} ref={stageRef}>
        <div className="m-roomwrap">
          <div className="m-room" ref={roomRef}>
            <div className="m-room__inner" style={{ backgroundImage: `url(${ANGLE.lqip})` }}>
              <img src={ANGLE.src} alt="A warm, sunlit desk with an old computer, a camera and framed photographs." draggable={false} onLoad={() => setReady(true)} />

              <button className="m-pin" style={{ left: `${pc.u * 100}%`, top: `${pc.v * 100}%` }} onClick={() => setSheet('pc')} aria-label="Open the computer: CV and projects">
                <i />
                <span>Computer</span>
              </button>
              <button className="m-pin" style={{ left: `${cam.u * 100}%`, top: `${cam.v * 100}%` }} onClick={() => setSheet('camera')} aria-label="Open the camera: photography and video">
                <i />
                <span>Camera</span>
              </button>
              {FRAME_IDS.map((id: FrameId) => {
                const c = centroid(GEOMETRY.desk[id])
                return (
                  <button
                    key={id}
                    className="m-pin m-pin--frame"
                    style={{ left: `${c.u * 100}%`, top: `${c.v * 100}%` }}
                    onClick={(e) => openLightbox(FRAME_IDS.map((k) => frames[k]), FRAME_IDS.indexOf(id), e.currentTarget)}
                    aria-label={`Open photograph: ${frames[id].title}`}
                  >
                    <i />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="m-veil" aria-hidden />

        <header className="m-intro">
          <h1 aria-label={site.name}>{site.name}</h1>
          <p>{site.role}</p>
          <small>{site.location}</small>
        </header>
        <p className="m-scroll" aria-hidden>
          <span>{site.scrollHint}</span>
          <i />
        </p>
        <p className="m-hint" aria-hidden>
          Drag to look around · Tap the glowing objects
        </p>

        {/* computer */}
        <section className={'m-sheet' + (sheet === 'pc' ? ' is-open' : '')} role="dialog" aria-label="Computer" aria-hidden={sheet !== 'pc'}>
          <button className="m-close" onClick={() => setSheet(null)} aria-label="Close computer">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>
          <div className="m-crt">
            {sheet === 'pc' && <ScreenView page={page} live onPage={setPage} />}
            <div className="crt__fx" aria-hidden />
          </div>
        </section>

        {/* camera */}
        <section className={'m-sheet m-sheet--gallery' + (sheet === 'camera' ? ' is-open' : '')} role="dialog" aria-label="Photography and video" aria-hidden={sheet !== 'camera'}>
          <button className="m-close m-gallery-close" onClick={() => setSheet(null)} aria-label="Close gallery">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>
          <div className="m-gallery">
            <p className="m-gallery__eyebrow">04 — THE CAMERA</p>
            <h2>Photography &amp; motion</h2>
            <div className="m-grid">
              {ALL.map((item, i) => (
                <button key={item.id} className="m-tile" onClick={(e) => openLightbox(ALL, i, e.currentTarget)}>
                  <span className="m-tile__img" style={{ aspectRatio: `${item.w} / ${item.h}` }}>
                    <img src={item.kind === 'photo' ? item.src : item.poster} alt="" loading="lazy" draggable={false} />
                    {item.kind === 'video' && (
                      <span className="m-tile__play" aria-hidden>
                        ▶ {item.duration}
                      </span>
                    )}
                  </span>
                  <span className="m-tile__cap">
                    <b>{item.title}</b>
                    <i>{item.note}</i>
                  </span>
                </button>
              ))}
            </div>
            <footer className="m-gallery__foot">
              <a href={`mailto:${site.email}`}>{site.email}</a>
              {site.links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
            </footer>
          </div>
        </section>

        <Lightbox />
      </div>
      <div className="m-spacer" aria-hidden />
    </>
  )
}
