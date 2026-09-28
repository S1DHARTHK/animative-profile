// Tiny 3×3 (row-major) helpers for homographies:  [x', y', w'] = M · [x, y, 1]

export type Mat3 = number[] // length 9, row-major
export type Vec2 = [number, number]

export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9) as Mat3
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return r
}

export function inv(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  const k = 1 / det
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k]
}

export function apply(m: Mat3, [x, y]: Vec2): Vec2 {
  const w = m[6] * x + m[7] * y + m[8]
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]
}

/** Homography taking the unit square (0,0),(1,0),(1,1),(0,1) to quad q (same order). */
function squareToQuad(q: Vec2[]): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / den
  const h = (dx1 * sy - sx * dy1) / den
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1]
}

/** Homography mapping quad `from` onto quad `to` (4 points each, same winding). */
export function quadToQuad(from: Vec2[], to: Vec2[]): Mat3 {
  return mul(squareToQuad(to), inv(squareToQuad(from)))
}

export function polyArea(q: Vec2[]) {
  let s = 0
  for (let i = 0; i < q.length; i++) {
    const [x0, y0] = q[i]
    const [x1, y1] = q[(i + 1) % q.length]
    s += x0 * y1 - x1 * y0
  }
  return Math.abs(s) / 2
}
