import { useLayoutEffect, useRef } from 'react'
import { NAV, type NavTarget } from '../animation/chapters'
import { controls, useJourney } from '../animation/store'
import { site } from '../content/site'

/* ── Intro title (lives in the dark hallway, left of the doorway) ─────────────────────────────── */
export function Intro() {
  const ready = useJourney((s) => s.ready)
  return (
    <>
      <div className={'intro' + (ready ? ' is-ready' : '')} data-intro>
        <h1 className="intro__name" aria-label={site.name}>
          {site.name.split('').map((c, i) => (
            <span key={i} style={{ ['--i' as string]: i }} aria-hidden>
              {c}
            </span>
          ))}
        </h1>
        <p className="intro__role">{site.role}</p>
        <p className="intro__loc">{site.location}</p>
      </div>
      <div className={'scrollhint' + (ready ? ' is-ready' : '')} data-scroll-hint>
        <div className="scrollhint__in">
          <span>{site.scrollHint}</span>
          <i />
        </div>
      </div>
    </>
  )
}

/* ── Loader ───────────────────────────────────────────────────────────────────────────────────── */
export function Loader() {
  const ready = useJourney((s) => s.ready)
  return (
    <div className={'loader' + (ready ? ' is-done' : '')} aria-hidden={ready}>
      <span>{site.name}</span>
      <i />
    </div>
  )
}

/* ── Caption, chapter rail, contact ───────────────────────────────────────────────────────────── */
export function Hud() {
  const chapter = useJourney((s) => s.chapter)
  const nav = useJourney((s) => s.nav)
  const ready = useJourney((s) => s.ready)
  const lightbox = useJourney((s) => s.lightbox)
  const galleryOn = useJourney((s) => s.galleryOn)
  const cap = chapter === 'intro' ? null : site.captions[chapter]
  const go = (id: NavTarget) => controls.goTo(id)

  return (
    <div className={'hud' + (ready && chapter !== 'intro' && !lightbox ? ' is-on' : '') + (galleryOn ? ' is-gallery' : '')}>
      {cap && (
        <div className="cap" key={chapter}>
          <small>
            {cap.index} — {cap.title.toUpperCase()}
          </small>
          <p>{cap.line}</p>
          {chapter === 'outro' && (
            <div className="cap__links">
              <a href={`mailto:${site.email}`}>{site.email}</a>
              {site.links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
              <button type="button" onClick={() => controls.scrollToVh(0, { duration: 4.5 })}>
                ↑ Replay
              </button>
            </div>
          )}
        </div>
      )}

      <nav className="rail" aria-label="Rooms">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={n.id === nav ? 'is-on' : ''}
            onClick={() => go(n.id)}
            aria-label={`Go to ${n.label}`}
            aria-current={n.id === nav ? 'true' : undefined}
          >
            <span>{n.label}</span>
            <i />
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ── Frame hover caption ──────────────────────────────────────────────────────────────────────── */
export function FrameTip() {
  const tip = useJourney((s) => s.tip)
  const moving = useJourney((s) => s.moving)
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(tip)
  if (tip) last.current = tip
  const t = tip ?? last.current
  const show = !!tip && !moving

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !t) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const { x, y, w: rw, h: rh } = t.rect
    let left = x + rw / 2 - w / 2
    let top = y + rh + 14
    if (top + h > window.innerHeight - 16) top = y - h - 14
    left = Math.max(16, Math.min(window.innerWidth - w - 16, left))
    top = Math.max(16, top)
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }, [t])

  return (
    <div className={'tip' + (show ? ' is-on' : '')} ref={ref} aria-hidden>
      {t && (
        <>
          <b>{t.title}</b>
          <span>{t.note}</span>
        </>
      )}
    </div>
  )
}

/* ── Viewfinder + shutter flash ───────────────────────────────────────────────────────────────── */
export function CameraOverlay() {
  return (
    <>
      <div className="vf" data-hud aria-hidden>
        <i className="vf__c vf__c--tl" />
        <i className="vf__c vf__c--tr" />
        <i className="vf__c vf__c--bl" />
        <i className="vf__c vf__c--br" />
        <div className="vf__info">
          <span>M</span>
          <span>1/125</span>
          <span>F2.8</span>
          <span>ISO 400</span>
          <span className="vf__meter">
            <b />
            <b />
            <b />
            <b className="off" />
            <b className="off" />
          </span>
          <span>[ 36 ]</span>
        </div>
        <p className="vf__hint">Keep scrolling to take the shot</p>
      </div>
      <div className="flash" data-flash aria-hidden />
      <div className="blackout" data-blackout aria-hidden />
    </>
  )
}
