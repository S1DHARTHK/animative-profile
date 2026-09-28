import { CLOSE_CAMERA, IMAGE_H, IMAGE_W, type AngleId } from './angles'
import { Hotspots } from './Hotspots'
import { useJourney } from '../animation/store'

/** Autofocus brackets that live ON the camera (inside the close plane, so they track the camera move). */
function AutoFocus() {
  const locked = useJourney((s) => s.galleryOn)
  const c = CLOSE_CAMERA
  return (
    <div
      className={'af' + (locked ? ' is-locked' : '')}
      aria-hidden
      style={{
        left: `${(c.u - c.w / 2) * 100}%`,
        top: `${(c.v - c.h / 2) * 100}%`,
        width: `${c.w * 100}%`,
        height: `${c.h * 100}%`,
      }}
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}

/**
 * The interactive layer for one camera angle: an image-sized box that the engine maps onto the screen with the
 * same homography the WebGL renderer uses, so hotspots sit exactly on the photographed objects.
 */
export function HotspotPlane({ id }: { id: AngleId }) {
  return (
    <div className="plane" data-plane={id} style={{ width: IMAGE_W, height: IMAGE_H }}>
      <Hotspots angle={id} />
      {id === 'close' && <AutoFocus />}
    </div>
  )
}
