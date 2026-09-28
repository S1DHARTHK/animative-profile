// Slices source/room-sheet.webp (a 2x2 contact sheet of four camera angles of the SAME room)
// into individual, upscaled, web-optimised angle images + tiny blur placeholders.
//
// When you have the ORIGINAL renders, drop them in source/angles/{far,mid,desk,close}.(png|jpg|webp)
// and this script will use them instead of the contact sheet (any size, 3:2 recommended).
//
//   npm run assets
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'public', 'room')
const lqipOut = path.join(root, 'src', 'room', 'lqip')
fs.mkdirSync(lqipOut, { recursive: true })
fs.mkdirSync(out, { recursive: true })

// Names follow the physical dolly: far (doorway) -> mid -> desk -> close (at the desk)
// Rects are the panels inside the contact sheet (gutters excluded), all exactly 3:2.
const PANELS = {
  desk: { left: 0, top: 0, width: 762, height: 508 }, // top-left
  mid: { left: 772, top: 0, width: 762, height: 508 }, // top-right
  close: { left: 0, top: 516, width: 762, height: 508 }, // bottom-left
  far: { left: 772, top: 516, width: 762, height: 508 }, // bottom-right
}

const TARGET_W = 1602
const TARGET_H = 1068

const sheet = path.join(root, 'source', 'room-sheet.webp')
const angleDir = path.join(root, 'source', 'angles')

function findOriginal(name) {
  if (!fs.existsSync(angleDir)) return null
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = path.join(angleDir, `${name}.${ext}`)
    if (fs.existsSync(p)) return p
  }
  return null
}

for (const [name, rect] of Object.entries(PANELS)) {
  const original = findOriginal(name)
  const base = original ? sharp(original) : sharp(sheet).extract(rect)
  const meta = original ? await sharp(original).metadata() : rect
  const upscale = original ? Math.min(1, 2400 / meta.width) : 1

  let img = base.resize({
    width: original ? Math.round(meta.width * upscale) : TARGET_W,
    height: original ? undefined : TARGET_H,
    kernel: 'lanczos3',
    fit: 'fill',
  })
  // gentle sharpen to counter the upscale softness (only for the low-res contact-sheet source)
  if (!original) img = img.sharpen({ sigma: 0.9, m1: 0.6, m2: 1.2 })

  await img.webp({ quality: 88, effort: 5 }).toFile(path.join(out, `${name}.webp`))

  // 24px wide blurred placeholder, inlined as base64 for instant first paint
  const lqip = await sharp(await img.clone().toBuffer())
    .resize(24)
    .blur(1)
    .webp({ quality: 50 })
    .toBuffer()
  fs.writeFileSync(path.join(lqipOut, `${name}.txt`), `data:image/webp;base64,${lqip.toString('base64')}`)
  console.log(`${name}: ${original ? 'original' : 'contact-sheet'} ->`, `${name}.webp`)
}
