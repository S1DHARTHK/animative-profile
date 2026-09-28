import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { closeLightbox, useJourney, type LightboxState } from '../animation/store'
import type { Media } from '../content/photos'

/** Cover-scale + clip a box so it exactly covers `o` (no stretching) — the "photo leaves the frame" FLIP. */
function flipParams(final: DOMRect, o: NonNullable<LightboxState['origin']>) {
  const s = Math.max(o.w / final.width, o.h / final.height)
  return {
    s,
    dx: o.x + o.w / 2 - (final.left + final.width / 2),
    dy: o.y + o.h / 2 - (final.top + final.height / 2),
    ix: Math.max(0, (final.width - o.w / s) / 2),
    iy: Math.max(0, (final.height - o.h / s) / 2),
  }
}

function MediaView({ item }: { item: Media }) {
  if (item.kind === 'photo') return <img src={item.src} alt={`${item.title} — ${item.note}`} draggable={false} />
  if (item.embed)
    return <iframe src={item.embed} title={item.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
  if (item.src) return <video src={item.src} poster={item.poster} controls autoPlay playsInline />
  return (
    <div className="lb__video-ph">
      <img src={item.poster} alt="" draggable={false} />
      <div>
        <svg viewBox="0 0 24 24" width="34" height="34">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
        <p>Video placeholder</p>
        <small>Add a file or embed URL in src/content/photos.ts</small>
      </div>
    </div>
  )
}

function LightboxView({ lb }: { lb: LightboxState }) {
  const [i, setI] = useState(lb.index)
  const item = lb.items[i]
  const mediaRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const reduced = useJourney((s) => s.reducedMotion)

  // open: the picture grows out of the frame it hangs in
  useLayoutEffect(() => {
    const m = mediaRef.current!
    const tl = gsap.timeline()
    tl.fromTo(backRef.current, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0)
    if (lb.origin && !reduced) {
      const p = flipParams(m.getBoundingClientRect(), lb.origin)
      tl.fromTo(
        m,
        { x: p.dx, y: p.dy, scale: p.s, clipPath: `inset(${p.iy}px ${p.ix}px round 3px)` },
        { x: 0, y: 0, scale: 1, clipPath: 'inset(0px 0px round 2px)', duration: 1, ease: 'expo.inOut' },
        0,
      )
    } else {
      tl.fromTo(m, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0)
    }
    tl.fromTo(chromeRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' }, 0.55)
    return () => {
      tl.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    const m = mediaRef.current!
    const tl = gsap.timeline({ onComplete: closeLightbox })
    tl.to(chromeRef.current, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 0)
    const stillThere = lb.origin && i === lb.index && !reduced
    if (stillThere && lb.origin) {
      const p = flipParams(m.getBoundingClientRect(), lb.origin)
      tl.to(m, { x: p.dx, y: p.dy, scale: p.s, clipPath: `inset(${p.iy}px ${p.ix}px round 3px)`, duration: 0.85, ease: 'expo.inOut' }, 0.05)
      tl.to(backRef.current, { opacity: 0, duration: 0.6, ease: 'power2.in' }, 0.25)
    } else {
      tl.to(m, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.in' }, 0)
      tl.to(backRef.current, { opacity: 0, duration: 0.4 }, 0.1)
    }
  }, [lb.origin, lb.index, i, reduced])

  const step = useCallback(
    (d: number) => {
      if (closing.current) return
      setI((v) => (v + d + lb.items.length) % lb.items.length)
    },
    [lb.items.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, step])

  // cross-fade when stepping through pictures
  const first = useRef(true)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    gsap.fromTo(mediaRef.current, { opacity: 0, x: 18, scale: 1, clipPath: 'none' }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' })
  }, [i])

  const ar = item.w / item.h
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="lb__backdrop" ref={backRef} onClick={close} />
      <figure className="lb__figure" style={{ ['--ar' as string]: ar }}>
        <div className="lb__media" ref={mediaRef}>
          <MediaView key={item.id} item={item} />
        </div>
        <div ref={chromeRef}>
          <figcaption className="lb__cap">
            <b>{item.title}</b>
            <span>{item.note}</span>
          </figcaption>
        </div>
      </figure>
      <div className="lb__chrome">
        <button type="button" className="lb__close" onClick={close} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        {lb.items.length > 1 && (
          <>
            <button type="button" className="lb__nav lb__nav--prev" onClick={() => step(-1)} aria-label="Previous">
              ←
            </button>
            <button type="button" className="lb__nav lb__nav--next" onClick={() => step(1)} aria-label="Next">
              →
            </button>
            <span className="lb__count">
              {String(i + 1).padStart(2, '0')} / {String(lb.items.length).padStart(2, '0')}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export function Lightbox() {
  const lb = useJourney((s) => s.lightbox)
  return lb ? <LightboxView lb={lb} /> : null
}
