import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ScreenView } from '../portfolio/ScreenApp/ScreenApp'
import { motion, stills, type Media } from '../content/photos'
import { controls, journey } from '../animation/store'
import type { Interactive } from './interactives'
import { room3d, shared, useRoom3D } from './store'

/* ── the resume, shown ON the monitor (positioned every frame by MonitorProjector) ───────────── */
export function MonitorScreen() {
  const [page, setPage] = useState(0)
  const live = useRoom3D((s) => s.atPC && s.phase === 'intro')
  return (
    <div
      className="m3-monitor is-hidden"
      ref={(el) => {
        shared.monitorEl = el
      }}
    >
      <div className="crt m3-crt">
        <div className="crt__app m3-app">
          <ScreenView page={page} live={live} onPage={setPage} />
        </div>
        <div className="crt__fx" aria-hidden />
      </div>
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="m3-close" onClick={onClick} aria-label="Close">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/* ── PC → the same resume / projects, opened in front of you ──────────────────────────────────── */
export function PcOverlay({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0)
  const fit = () => Math.min((window.innerWidth * 0.9) / 1024, (window.innerHeight * 0.86) / 768)
  const [k, setK] = useState(fit)
  useEffect(() => {
    const onResize = () => setK(fit())
    const onKey = (e: KeyboardEvent) => {
      // Esc inside an open project goes back to the list first (handled by the resume itself)
      if (e.key === 'Escape' && !document.querySelector('.m3-pc .pg--detail')) onClose()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="m3-overlay m3-pc" role="dialog" aria-label="Resume and projects">
      <div className="m3-overlay__backdrop" onClick={onClose} />
      <div className="m3-pc__screen" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>
        <div className="crt m3-crt">
          <div className="crt__app m3-app">
            <ScreenView page={page} live onPage={setPage} />
          </div>
          <div className="crt__fx" aria-hidden />
        </div>
      </div>
      <CloseButton onClick={onClose} />
    </div>
  )
}

/* ── photographs & videos open in the site's existing lightbox ────────────────────────────────── */
type Rect = { x: number; y: number; w: number; h: number }
export function openPhoto(items: Media[], index: number, origin: Rect | null) {
  journey.set({ lightbox: { items, index, origin }, tip: null })
  controls.setScrollLocked(true)
}
const rectOf = (el: Element | null): Rect | null => {
  const r = el?.getBoundingClientRect()
  return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}

/* ── camera → photography & video (the film strip), scrolled sideways with the wheel ────────── */
const ROLL: Media[] = [...stills, ...motion]
const code = (i: number) => `${String(Math.floor(i / 2) + 1).padStart(2, '0')}${i % 2 ? 'A' : ''}`

export function CameraRoll({ onClose }: { onClose: () => void }) {
  const strip = useRef<HTMLDivElement>(null)
  const motionLeader = useRef<HTMLDivElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const pos = useRef({ cur: 0, target: 0, travel: 0 })
  const [on, setOn] = useState(false)

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setOn(true)) // let the frames "develop"
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const el = strip.current!
    const measure = () => (pos.current.travel = Math.max(0, el.scrollWidth - window.innerWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const onWheel = (e: WheelEvent) => {
      if (journey.get().lightbox) return
      const p = pos.current
      p.target = Math.min(p.travel, Math.max(0, p.target + e.deltaY + e.deltaX))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !journey.get().lightbox) onClose()
    }
    let raf = 0
    const cells = el.querySelectorAll('.cell').length
    const tick = () => {
      const p = pos.current
      p.cur += (p.target - p.cur) * 0.12
      el.style.transform = `translate3d(${(-p.cur).toFixed(1)}px,0,0)`
      if (counter.current && cells) {
        const txt = `${String(Math.min(cells, Math.round((p.travel ? p.cur / p.travel : 0) * (cells - 1)) + 1)).padStart(2, '0')} / ${String(cells).padStart(2, '0')}`
        if (counter.current.textContent !== txt) counter.current.textContent = txt
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const jumpTo = (x: number) => (pos.current.target = Math.min(pos.current.travel, Math.max(0, x)))

  return (
    <div className="m3-overlay m3-roll" role="dialog" aria-label="Photography and video">
      <div className="m3-overlay__backdrop" onClick={onClose} />
      <section className={'gallery' + (on ? ' is-on' : '')}>
        <header className="gallery__head">
          <div className="gallery__tabs">
            <button type="button" onClick={() => jumpTo(0)}>
              Stills
            </button>
            <button type="button" onClick={() => jumpTo((motionLeader.current?.offsetLeft ?? 0) - 80)}>
              Motion
            </button>
          </div>
          <span className="gallery__count" ref={counter}>
            01 / {String(ROLL.length).padStart(2, '0')}
          </span>
        </header>
        <div className="strip" ref={strip}>
          <div className="leader">
            <small>ROLL 01</small>
            <b>Stills</b>
            <span>{stills.length} frames</span>
          </div>
          {ROLL.map((item, i) => (
            <FilmCell key={item.id} item={item} i={i} leaderRef={i === stills.length ? motionLeader : undefined} />
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
      <CloseButton onClick={onClose} />
    </div>
  )
}

function FilmCell({ item, i, leaderRef }: { item: Media; i: number; leaderRef?: React.RefObject<HTMLDivElement> }) {
  return (
    <>
      {leaderRef && (
        <div className="leader leader--mid" ref={leaderRef}>
          <small>ROLL 02</small>
          <b>Motion</b>
          <span>{motion.length} reels</span>
        </div>
      )}
      <button
        type="button"
        className={'cell' + (item.kind === 'video' ? ' cell--video' : '')}
        style={{ ['--ar' as string]: item.w / item.h }}
        onClick={(e) => openPhoto(ROLL, i, rectOf(e.currentTarget.querySelector('.cell__frame')))}
        aria-label={`${item.kind === 'video' ? 'Play' : 'Open'} ${item.title}`}
      >
        <span className="cell__edge" aria-hidden>
          <b>▸ {code(i)}</b>
          <i>KODAK 400TX</i>
        </span>
        <span className="cell__frame">
          <img src={item.kind === 'photo' ? item.src : item.poster} alt="" decoding="async" draggable={false} />
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
    </>
  )
}

/* ── the small caption next to the cursor while hovering an object ────────────────────────────── */
export function HoverLabel({ interactives }: { interactives: Interactive[] }) {
  const hovered = useRoom3D((s) => s.hovered)
  const open = useRoom3D((s) => s.open)
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<Interactive | undefined>(undefined)
  const it = interactives.find((x) => x.id === hovered)
  if (it) last.current = it
  const shown = last.current

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        const w = el.offsetWidth
        const x = Math.min(shared.mouse.px + 18, window.innerWidth - w - 12)
        el.style.transform = `translate3d(${x}px, ${shared.mouse.py + 20}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={'tip m3-tip' + (it && !open ? ' is-on' : '')} ref={ref} aria-hidden>
      {shown && (
        <>
          <b>{shown.label}</b>
          <span>{shown.sub}</span>
        </>
      )}
    </div>
  )
}

/** close whatever was opened from an object (the camera view is left exactly as it was) */
export const closeContent = () => room3d.set({ open: null })
