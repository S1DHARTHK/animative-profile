import { ScreenApp } from '../portfolio/ScreenApp/ScreenApp'
import { site } from '../content/site'

const BOOT = [
  `${site.name}-OS v2.6   (c) 1998–2026`,
  'BIOS check ................ OK',
  'Memory  640K ............. OK',
  'Mounting /portfolio ....... OK',
  'Loading profile.sys ....... OK',
  'Starting desktop',
]

/**
 * The CRT picture. Its 1024×768 box is warped by the engine onto the photographed glass (matrix3d) and then
 * flattened ("docked") for reading. `data-crt` is what powers on/off; everything inside is normal HTML.
 */
export function ScreenOverlay() {
  return (
    <div className="screen" data-screen>
      <div className="crt" data-crt>
        <div className="crt__boot" data-boot aria-hidden>
          {BOOT.map((l) => (
            <div key={l} data-boot-line>
              {l}
            </div>
          ))}
        </div>
        <div className="crt__app" data-screen-app>
          <ScreenApp />
        </div>
        <div className="crt__fx" aria-hidden />
        <div className="crt__flash" data-crt-flash aria-hidden />
      </div>
    </div>
  )
}
