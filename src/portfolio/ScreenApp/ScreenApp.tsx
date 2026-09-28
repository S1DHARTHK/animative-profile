import { useEffect, useState, type ReactNode } from 'react'
import { about, cv, skills } from '../../content/profile'
import { projects, type Project } from '../../content/projects'
import { site } from '../../content/site'
import { PAGE_MARKS } from '../../animation/chapters'
import { controls, useJourney } from '../../animation/store'

/**
 * The operating system running on the old computer. Authored for a 1024×768 (4:3) surface;
 * the ScreenOverlay maps that surface onto the CRT glass. The scroll position is the single source of truth
 * for the current page (`screenPage`); clicking the nav simply scrolls the room to that page.
 */

const PAGES = [
  { id: 'about', label: 'About', path: 'about.txt' },
  { id: 'skills', label: 'Skills', path: 'skills.dat' },
  { id: 'cv', label: 'CV', path: 'cv.doc' },
  { id: 'projects', label: 'Projects', path: 'projects/' },
] as const

function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const [t, setT] = useState(fmt)
  useEffect(() => {
    const id = window.setInterval(() => setT(fmt()), 20000)
    return () => window.clearInterval(id)
  }, [])
  return t
}

function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="os-eyebrow">
      <span>{n}</span> — {children}
    </p>
  )
}

function About() {
  return (
    <section className="pg pg--about">
      <Eyebrow n="01">ABOUT</Eyebrow>
      <h2 className="os-lede">{about.headline}</h2>
      <div className="os-cols">
        <div className="os-prose">
          {about.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <dl className="os-facts">
          {about.facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Skills() {
  return (
    <section className="pg pg--skills">
      <Eyebrow n="02">SKILLS</Eyebrow>
      <h2 className="os-title">Tools of the trade</h2>
      <div className="os-skills">
        {skills.map((g, gi) => (
          <div key={g.title} className="os-skill">
            <h3>
              <span>{String(gi + 1).padStart(2, '0')}</span>
              {g.title}
            </h3>
            <ul>
              {g.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function CV() {
  return (
    <section className="pg pg--cv">
      <Eyebrow n="03">CURRICULUM VITAE</Eyebrow>
      <div className="os-cv">
        <div className="os-cv__exp">
          <h3 className="os-h3">Experience</h3>
          {cv.experience.map((j) => (
            <article key={j.role + j.org} className="os-job">
              <header>
                <b>{j.role}</b>
                <span>{j.period}</span>
              </header>
              <p className="os-job__org">{j.org}</p>
              <ul>
                {j.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="os-cv__side">
          <h3 className="os-h3">Education</h3>
          {cv.education.map((e) => (
            <article key={e.title} className="os-job">
              <header>
                <b>{e.title}</b>
                <span>{e.period}</span>
              </header>
              <p className="os-job__org">{e.org}</p>
            </article>
          ))}
          <dl className="os-facts os-facts--tight">
            {cv.extras.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {cv.pdf && (
            <a className="os-btn" href={cv.pdf} target="_blank" rel="noreferrer" download>
              ↓ Download CV (PDF)
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function Projects({ onOpen }: { onOpen: (p: Project) => void }) {
  const [hover, setHover] = useState(0)
  const cur = projects[hover]
  return (
    <section className="pg pg--projects">
      <Eyebrow n="04">PROJECTS</Eyebrow>
      <div className="os-proj">
        <ul className="os-proj__list">
          {projects.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className={i === hover ? 'is-hover' : ''}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => onOpen(p)}
              >
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <span className="t">{p.title}</span>
                <span className="y">{p.year}</span>
              </button>
            </li>
          ))}
        </ul>
        <aside className="os-proj__preview" key={cur.id}>
          <div className="os-proj__cover" style={{ backgroundImage: `url(${cur.cover})` }} />
          <p className="os-proj__kind">{cur.kind}</p>
          <p className="os-proj__sum">{cur.summary}</p>
          <p className="os-proj__open">Click to open ↗</p>
        </aside>
      </div>
    </section>
  )
}

function Detail({ p, onClose }: { p: Project; onClose: () => void }) {
  return (
    <section className="pg pg--detail" data-lenis-prevent>
      <button type="button" className="os-back" onClick={onClose}>
        ← BACK TO PROJECTS
      </button>
      <div className="os-detail">
        <div className="os-detail__cover" style={{ backgroundImage: `url(${p.cover})` }} />
        <div className="os-detail__body">
          <p className="os-eyebrow">
            <span>{p.year}</span> — {p.kind.toUpperCase()}
          </p>
          <h2 className="os-title">{p.title}</h2>
          {p.description.map((d) => (
            <p key={d} className="os-detail__p">
              {d}
            </p>
          ))}
          <dl className="os-facts os-facts--tight">
            <div>
              <dt>Role</dt>
              <dd>{p.role}</dd>
            </div>
            <div>
              <dt>Stack</dt>
              <dd>{p.stack.join(' · ')}</dd>
            </div>
          </dl>
          <div className="os-links">
            {p.links.map((l) => (
              <a key={l.label} className="os-btn" href={l.href} target="_blank" rel="noreferrer">
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Desktop: the page is driven by the room's scroll position; clicking the nav scrolls the room to that page. */
export function ScreenApp() {
  const page = useJourney((s) => s.screenPage)
  const live = useJourney((s) => s.screenLive)
  return (
    <ScreenView
      page={page}
      live={live}
      onPage={(i) => controls.scrollToVh(PAGE_MARKS[i].start + 10, { duration: 1.4 })}
    />
  )
}

/** The OS itself — pure view, no knowledge of the camera. Mobile mounts it with local state. */
export function ScreenView({ page, live, onPage }: { page: number; live: boolean; onPage: (i: number) => void }) {
  const [open, setOpen] = useState<Project | null>(null)
  const clock = useClock()

  // page scrolling is paused while a project is open (Esc / Back returns)
  useEffect(() => {
    if (!open) return
    controls.setScrollLocked(true)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => {
      controls.setScrollLocked(false)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!live) setOpen(null)
  }, [live])

  const go = (i: number) => {
    setOpen(null)
    onPage(i)
  }

  const cur = PAGES[page]

  return (
    <div className="os">
      <header className="os__bar">
        <span className="os__brand">{site.name}.SYS</span>
        <span className="os__path">
          ~/portfolio/{open ? `projects/${open.id}` : cur.path}
        </span>
        <span className="os__clock">{clock}</span>
      </header>

      <nav className="os__nav" aria-label="Computer sections">
        {PAGES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={i === page ? 'is-on' : ''}
            aria-current={i === page ? 'page' : undefined}
            onClick={() => go(i)}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            {p.label}
          </button>
        ))}
        <p className="os__hint">
          scroll <b>↓</b>
          <br />
          to continue
        </p>
      </nav>

      <main className="os__main">
        <div className="os__page" key={open ? open.id : cur.id}>
          {open ? (
            <Detail p={open} onClose={() => setOpen(null)} />
          ) : page === 0 ? (
            <About />
          ) : page === 1 ? (
            <Skills />
          ) : page === 2 ? (
            <CV />
          ) : (
            <Projects onOpen={setOpen} />
          )}
        </div>
      </main>

      <footer className="os__status">
        <span>
          READY<i className="os__cursor" />
        </span>
        <span>{open ? 'ESC — back' : 'SCROLL — next page · CLICK — open'}</span>
        <span>
          {page + 1}/{PAGES.length}
        </span>
      </footer>
    </div>
  )
}
