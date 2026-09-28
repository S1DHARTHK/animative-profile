// Maps a w×h rectangle onto an arbitrary quad with a CSS matrix3d (a projective homography).
// Used to make the HTML "screen" sit exactly on the perspective glass of the photographed CRT.

export type Pt = [number, number]

function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    const d = M[c][c] || 1e-12
    for (let k = c; k <= n; k++) M[c][k] /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c]
      if (f === 0) continue
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row) => row[n])
}

/** quad order: TL, TR, BR, BL (screen px). transform-origin must be 0 0. */
export function quadToMatrix3d(w: number, h: number, q: Pt[]): string {
  const src: Pt[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [X, Y] = q[i]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    b.push(Y)
  }
  const [a, c, e, bb, d, f, g, hh] = solve(A, b)
  const n = (v: number) => (Math.abs(v) < 1e-10 ? 0 : +v.toFixed(8))
  return `matrix3d(${n(a)},${n(bb)},0,${n(g)},${n(c)},${n(d)},0,${n(hh)},0,0,1,0,${n(e)},${n(f)},0,1)`
}
