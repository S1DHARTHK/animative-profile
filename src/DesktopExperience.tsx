import { useLayoutEffect, useRef } from 'react'
import { RoomEngine } from './animation/engine'
import { ANGLE_ORDER } from './room/angles'
import { HotspotPlane } from './room/HotspotPlane'
import { Atmosphere } from './room/Atmosphere'
import { ScreenOverlay } from './ui/ScreenOverlay'
import { CameraOverlay, FrameTip, Hud, Intro, Loader } from './ui/Overlays'
import { Gallery } from './portfolio/Gallery'
import { Lightbox } from './portfolio/Lightbox'

declare global {
  interface Window {
    __room?: { engine: RoomEngine; jump: (vh: number) => void; t: () => number }
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The full desktop experience: a fixed stage + a tall spacer that provides the scroll distance. */
export function DesktopExperience() {
  const stage = useRef<HTMLDivElement>(null)
  const spacer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const st = stage.current!
    const engine = new RoomEngine(st, spacer.current!)
    let cancelled = false

    // reveal once the photographs + morph data are on the GPU and the fonts are in
    Promise.all([engine.load(), document.fonts.ready, wait(650)]).then(() => {
      if (!cancelled) engine.ready()
    })

    if (import.meta.env.DEV || location.search.includes('debug')) {
      window.__room = { engine, jump: (vh) => engine.scrollToVh(vh, { immediate: true }), t: () => engine.time() }
    }
    return () => {
      cancelled = true
      engine.destroy()
    }
  }, [])

  return (
    <>
      <div className="stage" ref={stage}>
        <canvas className="gl" data-gl aria-hidden />
        <div className="planes">
          {ANGLE_ORDER.map((id) => (
            <HotspotPlane key={id} id={id} />
          ))}
        </div>
        <Atmosphere />
        <div className="shade-bottom" aria-hidden />
        <ScreenOverlay />
        <CameraOverlay />
        <Gallery />
        <Intro />
        <Hud />
        <FrameTip />
        <div className="progress" aria-hidden>
          <i data-progress />
        </div>
        <Lightbox />
        <Loader />
      </div>
      <div className="spacer" ref={spacer} aria-hidden />
    </>
  )
}
