import { Suspense, lazy, useEffect, useState } from 'react'
import { MobileExperience } from './mobile/MobileExperience'
import { RoomRenderer } from './room/gl/renderer'

// desktop: the 3D room is the portfolio (code-split so phones never download three.js)
const Room3DExperience = lazy(() => import('./room3d/Room3DExperience'))

/** Desktop gets the full scroll-driven camera. Phones/tablets get a simplified, touch-first version. */
function useIsCompact() {
  const query = '(max-width: 899px), (pointer: coarse) and (max-width: 1180px)'
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setCompact(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return compact
}

export default function App() {
  const compact = useIsCompact()
  const [gl] = useState(RoomRenderer.supported)
  // no WebGL2 → the simplified experience still shows everything
  if (compact || !gl) return <MobileExperience />
  return (
    <Suspense fallback={null}>
      <Room3DExperience />
    </Suspense>
  )
}
