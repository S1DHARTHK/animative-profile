// WebGL2 renderer for the room.
//
//  single angle   : PHOTO   → scene      (per-pixel re-projection through the virtual camera, bicubic)
//  between angles : MESH A  → fbA        (A's photo as a grid mesh, sliding along t·F01)
//                   MESH B  → fbB        (B's photo, sliding along (1-t)·F10)
//                   COMBINE → scene      (the in-between frame)
//  always         : POST    → canvas     (depth of field, focus pull, exposure, vignette, grain, doorway)
//
// The scene pass only re-runs when the camera actually changed; the post pass re-runs at most at the grain rate
// while idle. Resolution adapts to the device if frames run long.

import { ANGLE_ORDER, ANGLES, MORPHS, morphSrc, type AngleId } from '../angles'
import type { Mat3 } from './mat3'
import { COMBINE_FS, FULLSCREEN_VS, MESH_FS, MESH_VS, PHOTO_FS, POST_FS } from './shaders'

export interface PostParams {
  blur: number
  dim: number
  focus: [number, number, number, number]
  focusAmt: number
  vignette: number
  grain: number
  time: number
  portal: [number, number, number, number]
  portalOpen: number
  glow: number
}

export type SceneParams =
  | { mode: 'single'; angle: AngleId; S: Mat3; sharp: boolean }
  | { mode: 'transition'; pair: number; P: Mat3; t: number; mix: number }

interface Mesh {
  vao: WebGLVertexArrayObject
  count: number
}

interface PairGpu {
  f01: WebGLTexture
  f10: WebGLTexture
  meshA: Mesh
  meshB: Mesh
}

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

const MAX_DPR = 1.5

export class RoomRenderer {
  private gl: WebGL2RenderingContext
  private photos = {} as Record<AngleId, WebGLTexture>
  private pairs: PairGpu[] = []
  private progs!: Record<'photo' | 'mesh' | 'combine' | 'post', Prog>
  private fb = { a: null as WebGLFramebuffer | null, b: null as WebGLFramebuffer | null, scene: null as WebGLFramebuffer | null }
  private tex = { a: null as WebGLTexture | null, b: null as WebGLTexture | null, scene: null as WebGLTexture | null }
  private depth: WebGLRenderbuffer | null = null
  private emptyVao: WebGLVertexArrayObject | null = null
  private size = { w: 0, h: 0, px: 1, vw: 0, vh: 0 }
  private quality = 1
  private sceneKey = ''
  private postKey = ''
  private mipsFresh = false
  private frameTimes: number[] = []
  private lastFrame = 0
  private lastQualityChange = 0
  private bitmaps = new Map<string, ImageBitmap>()
  private lost = false
  ready = false

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl
    canvas.addEventListener('webglcontextlost', this.onLost, false)
    canvas.addEventListener('webglcontextrestored', this.onRestored, false)
    this.init()
  }

  static supported() {
    try {
      return !!document.createElement('canvas').getContext('webgl2')
    } catch {
      return false
    }
  }

  /* ───────────────────────── setup ───────────────────────── */

  private init() {
    const gl = this.gl
    this.progs = {
      photo: this.program(FULLSCREEN_VS, PHOTO_FS, ['uPhoto', 'uS', 'uTexSize', 'uPx', 'uCanvasH', 'uSharp']),
      mesh: this.program(MESH_VS, MESH_FS, ['uFlow', 'uGrid', 'uScale', 'uT', 'uP', 'uToPhoto', 'uPhoto', 'uRes']),
      combine: this.program(FULLSCREEN_VS, COMBINE_FS, ['uA', 'uB', 'uRes', 'uMix']),
      post: this.program(FULLSCREEN_VS, POST_FS, ['uScene', 'uRes', 'uPx', 'uView', 'uBlur', 'uDim', 'uFocus', 'uFocusAmt', 'uVignette', 'uGrain', 'uTime', 'uPortal', 'uPortalOpen', 'uGlow']),
    }
    this.emptyVao = gl.createVertexArray()
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    this.pairs = MORPHS.map((m) => ({
      f01: gl.createTexture()!,
      f10: gl.createTexture()!,
      meshA: this.grid(m.size, m.bboxA),
      meshB: this.grid(m.size, [0, 0, 1, 1]),
    }))
    for (const id of ANGLE_ORDER) this.photos[id] = gl.createTexture()!
    this.size.w = 0 // force targets to be (re)allocated
  }

  private program(vs: string, fs: string, uniforms: string[]): Prog {
    const gl = this.gl
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || 'shader')
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) || 'link')
    const u: Prog['u'] = {}
    for (const n of uniforms) u[n] = gl.getUniformLocation(p, n)
    return { p, u }
  }

  /** a vertex grid on the flow lattice covering `box` (in B's normalised frame), extended at most ±0.5 */
  private grid([gw, gh]: [number, number], box: [number, number, number, number]): Mesh {
    const gl = this.gl
    const sx = gw - 1
    const sy = gh - 1
    const i0 = Math.floor(Math.max(box[0], -0.5) * sx)
    const i1 = Math.ceil(Math.min(box[2], 1.5) * sx)
    const j0 = Math.floor(Math.max(box[1], -0.5) * sy)
    const j1 = Math.ceil(Math.min(box[3], 1.5) * sy)
    const nx = i1 - i0 + 1
    const ny = j1 - j0 + 1
    const pos = new Float32Array(nx * ny * 2)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        pos[(j * nx + i) * 2] = (i0 + i) / sx
        pos[(j * nx + i) * 2 + 1] = (j0 + j) / sy
      }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6)
    let k = 0
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i
        idx[k++] = a
        idx[k++] = a + 1
        idx[k++] = a + nx
        idx[k++] = a + 1
        idx[k++] = a + nx + 1
        idx[k++] = a + nx
      }
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const vb = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const ib = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    return { vao, count: idx.length }
  }

  /* ───────────────────────── assets ───────────────────────── */

  private async bitmap(url: string, raw: boolean) {
    const cached = this.bitmaps.get(url)
    if (cached) return cached
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob, raw ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : { premultiplyAlpha: 'none' })
    this.bitmaps.set(url, bmp)
    return bmp
  }

  private upload(tex: WebGLTexture, bmp: ImageBitmap, kind: 'photo' | 'data') {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (kind === 'photo') {
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4)
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    }
  }

  /** Loads every photo and flow field. Resolves once all are on the GPU. */
  async load() {
    const jobs: Promise<void>[] = []
    for (const id of ANGLE_ORDER) jobs.push(this.bitmap(ANGLES[id].src, false).then((b) => this.upload(this.photos[id], b, 'photo')))
    MORPHS.forEach((m, i) => {
      jobs.push(this.bitmap(morphSrc(m, 'f01'), true).then((b) => this.upload(this.pairs[i].f01, b, 'data')))
      jobs.push(this.bitmap(morphSrc(m, 'f10'), true).then((b) => this.upload(this.pairs[i].f10, b, 'data')))
    })
    await Promise.all(jobs)
    this.ready = true
    this.warmUp()
    this.sceneKey = ''
    this.postKey = ''
  }

  /** Compile + first-use every pass now (behind the loader), not on the visitor's first scroll. */
  private warmUp() {
    const gl = this.gl
    const I: Mat3 = [1 / Math.max(1, this.size.vw), 0, 0, 0, 1 / Math.max(1, this.size.vh), 0, 0, 0, 1]
    const post: PostParams = { blur: 4, dim: 1, focus: [0, 0, 1, 1], focusAmt: 0.5, vignette: 1, grain: 0.04, time: 0, portal: [0, 0, 10, 10], portalOpen: 0.5, glow: 1 }
    for (const id of ANGLE_ORDER) this.render({ mode: 'single', angle: id, S: I, sharp: true }, post)
    MORPHS.forEach((_, i) => this.render({ mode: 'transition', pair: i, P: [2, 0, -1, 0, -2, 1, 0, 0, 1], t: 0.5, mix: 0.5 }, { ...post, time: i + 1 }))
    const px = new Uint8Array(4)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) // wait for the GPU to actually finish
  }

  /* ───────────────────────── targets ───────────────────────── */

  resize(vw: number, vh: number) {
    this.size.vw = vw
    this.size.vh = vh
    this.allocate()
  }

  private allocate() {
    const gl = this.gl
    const px = Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.quality
    const w = Math.max(1, Math.round(this.size.vw * px))
    const h = Math.max(1, Math.round(this.size.vh * px))
    if (w === this.size.w && h === this.size.h) return
    this.size.w = w
    this.size.h = h
    this.size.px = w / this.size.vw
    this.canvas.width = w
    this.canvas.height = h

    for (const t of [this.tex.a, this.tex.b, this.tex.scene]) if (t) gl.deleteTexture(t)
    for (const f of [this.fb.a, this.fb.b, this.fb.scene]) if (f) gl.deleteFramebuffer(f)
    if (this.depth) gl.deleteRenderbuffer(this.depth)

    const target = (levels: number) => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    this.depth = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h)
    const fbo = (t: WebGLTexture, depth: boolean) => {
      const f = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth)
      return f
    }
    this.tex.a = target(1)
    this.tex.b = target(1)
    this.tex.scene = target(Math.floor(Math.log2(Math.max(w, h))) + 1)
    this.fb.a = fbo(this.tex.a, true)
    this.fb.b = fbo(this.tex.b, true)
    this.fb.scene = fbo(this.tex.scene, false)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.sceneKey = ''
    this.postKey = ''
  }

  /** Lower the resolution if the device is struggling; raise it back when there's headroom. */
  private adapt(now: number) {
    if (this.lastFrame) this.frameTimes.push(now - this.lastFrame)
    this.lastFrame = now
    if (this.frameTimes.length < 90) return
    const sorted = [...this.frameTimes].sort((a, b) => a - b)
    this.frameTimes.length = 0
    const median = sorted[45]
    if (now - this.lastQualityChange < 2500 || median > 100) return // ignore background-tab throttling
    let q = this.quality
    if (median > 21 && q > 0.6) q = Math.max(0.6, q * 0.82)
    else if (median < 12 && q < 1) q = Math.min(1, q * 1.12)
    if (q !== this.quality) {
      this.quality = q
      this.lastQualityChange = now
      this.allocate()
    }
  }

  /* ───────────────────────── frame ───────────────────────── */

  render(scene: SceneParams, post: PostParams) {
    if (!this.ready || this.lost) return
    const gl = this.gl
    const now = performance.now()
    this.adapt(now)
    const { w, h, px, vw, vh } = this.size

    const key = scene.mode === 'single' ? `s${scene.angle}${scene.S.map((v) => v.toFixed(7)).join()}${scene.sharp}` : `t${scene.pair}${scene.P.map((v) => v.toFixed(7)).join()}${scene.t.toFixed(5)}${scene.mix.toFixed(4)}`
    const sceneChanged = key !== this.sceneKey
    if (sceneChanged) {
      this.sceneKey = key
      this.mipsFresh = false
      gl.viewport(0, 0, w, h)
      if (scene.mode === 'single') this.drawPhoto(scene.angle, scene.S, scene.sharp)
      else this.drawTransition(scene)
    }
    const needsMips = post.blur > 0.3
    if (needsMips && !this.mipsFresh) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex.scene)
      gl.generateMipmap(gl.TEXTURE_2D)
      this.mipsFresh = true
    }

    const pkey = [post.blur, post.dim, ...post.focus, post.focusAmt, post.vignette, post.grain, Math.floor(post.time * 24), ...post.portal, post.portalOpen, post.glow].map((v) => v.toFixed(3)).join()
    if (!sceneChanged && pkey === this.postKey) return
    this.postKey = pkey

    const P = this.progs.post
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.useProgram(P.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex.scene)
    gl.uniform1i(P.u.uScene, 0)
    gl.uniform2f(P.u.uRes, w, h)
    gl.uniform1f(P.u.uPx, px)
    gl.uniform2f(P.u.uView, vw, vh)
    gl.uniform1f(P.u.uBlur, post.blur)
    gl.uniform1f(P.u.uDim, post.dim)
    gl.uniform4f(P.u.uFocus, ...post.focus)
    gl.uniform1f(P.u.uFocusAmt, post.focusAmt)
    gl.uniform1f(P.u.uVignette, post.vignette)
    gl.uniform1f(P.u.uGrain, post.grain)
    gl.uniform1f(P.u.uTime, post.time)
    gl.uniform4f(P.u.uPortal, ...post.portal)
    gl.uniform1f(P.u.uPortalOpen, post.portalOpen)
    gl.uniform1f(P.u.uGlow, post.glow)
    gl.bindVertexArray(this.emptyVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private drawPhoto(angle: AngleId, S: Mat3, sharp: boolean) {
    const gl = this.gl
    const P = this.progs.photo
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.scene)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(P.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.photos[angle])
    gl.uniform1i(P.u.uPhoto, 0)
    gl.uniformMatrix3fv(P.u.uS, true, S)
    gl.uniform2f(P.u.uTexSize, 1602, 1068)
    gl.uniform1f(P.u.uPx, this.size.px)
    gl.uniform1f(P.u.uCanvasH, this.size.h)
    gl.uniform1f(P.u.uSharp, sharp ? 1 : 0)
    gl.bindVertexArray(this.emptyVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private drawTransition(s: Extract<SceneParams, { mode: 'transition' }>) {
    const gl = this.gl
    const m = MORPHS[s.pair]
    const gpu = this.pairs[s.pair]
    const M = this.progs.mesh
    gl.useProgram(M.p)
    gl.uniform2i(M.u.uGrid, m.size[0], m.size[1])
    gl.uniform1f(M.u.uScale, m.scale)
    gl.uniformMatrix3fv(M.u.uP, true, s.P)
    gl.uniform1i(M.u.uFlow, 0)
    gl.uniform1i(M.u.uPhoto, 1)
    gl.uniform2f(M.u.uRes, this.size.w, this.size.h)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    const pass = (fb: WebGLFramebuffer | null, flow: WebGLTexture, photo: WebGLTexture, t: number, toPhoto: number[], mesh: Mesh) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.clearColor(0, 0, 0, 0)
      gl.clearDepth(1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, flow)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, photo)
      gl.uniform1f(M.u.uT, t)
      gl.uniformMatrix3fv(M.u.uToPhoto, true, toPhoto)
      gl.bindVertexArray(mesh.vao)
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0)
    }
    pass(this.fb.a, gpu.f01, this.photos[m.from], s.t, m.Hinv, gpu.meshA)
    pass(this.fb.b, gpu.f10, this.photos[m.to], 1 - s.t, [1, 0, 0, 0, 1, 0, 0, 0, 1], gpu.meshB)
    gl.disable(gl.DEPTH_TEST)

    const C = this.progs.combine
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.scene)
    gl.useProgram(C.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex.a)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.tex.b)
    gl.uniform1i(C.u.uA, 0)
    gl.uniform1i(C.u.uB, 1)
    gl.uniform2f(C.u.uRes, this.size.w, this.size.h)
    gl.uniform1f(C.u.uMix, s.mix)
    gl.bindVertexArray(this.emptyVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.activeTexture(gl.TEXTURE0)
  }

  /* ───────────────────────── lifecycle ───────────────────────── */

  private onLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
  }

  private onRestored = () => {
    this.lost = false
    this.ready = false
    this.init()
    this.allocate()
    void this.load()
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    this.bitmaps.forEach((b) => b.close())
    this.ready = false
  }
}
