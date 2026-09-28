// A handful of dust motes drifting through the window light. Barely there — it just makes the air feel present.

interface Mote {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  ph: number
  tw: number
  a: number
}

export function createDust(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  let w = 0
  let h = 0
  let dpr = 1
  let motes: Mote[] = []

  function seed() {
    const n = Math.round(Math.min(70, (w * h) / 36000))
    motes = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.5,
      vx: 0.05 + Math.random() * 0.12,
      vy: -0.02 + Math.random() * 0.06,
      ph: Math.random() * 6.28,
      tw: 0.3 + Math.random() * 0.8,
      a: 0.25 + Math.random() * 0.55,
    }))
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    seed()
  }

  let last = 0
  function draw(time: number, intensity: number, mx: number, my: number) {
    const dt = Math.min(0.05, time - last || 0.016)
    last = time
    ctx.clearRect(0, 0, w, h)
    if (intensity < 0.01) return
    ctx.globalCompositeOperation = 'lighter'
    for (const p of motes) {
      p.x += (p.vx + Math.sin(time * 0.3 + p.ph) * 0.05) * dt * 60
      p.y += (p.vy + Math.cos(time * 0.25 + p.ph) * 0.04) * dt * 60
      if (p.x > w + 10) p.x = -10
      if (p.y < -10) p.y = h + 10
      if (p.y > h + 10) p.y = -10
      // light comes in from the upper-left window: motes are brighter there
      const light = Math.max(0.12, 1 - (p.x / w) * 0.85 - (p.y / h) * 0.35)
      const a = p.a * light * intensity * (0.55 + 0.45 * Math.sin(time * p.tw + p.ph)) * 0.55
      // slight parallax against the room (motes sit "in front")
      const x = p.x - mx * 22
      const y = p.y - my * 14
      ctx.fillStyle = `rgba(255,226,178,${a * 0.28})`
      ctx.beginPath()
      ctx.arc(x, y, p.r * 3, 0, 6.283)
      ctx.fill()
      ctx.fillStyle = `rgba(255,236,204,${a})`
      ctx.beginPath()
      ctx.arc(x, y, p.r, 0, 6.283)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  return { resize, draw }
}
