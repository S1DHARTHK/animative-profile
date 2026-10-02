// The photographic look of the room — golden hour (sun through the window grid, a volumetric sunbeam, warm bounce and
// grade) or night (moonlight, the pendant, LED lines, a cool grade) — with soft contact shadows (ambient occlusion)
// and bloom. Everything is derived from the model's own
// lights and window (no invented positions) and nothing here changes the model file.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { useFrame, useThree } from '@react-three/fiber'
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, Pass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import type { RoomHandle } from './RoomScene'
import { isFrozen } from './store'
import { modelTheme } from './roomGeometry'

/* ── tuning ─────────────────────────────────────────────────────────────────────────────── */
// dev switches for isolating an effect: ?off=ao,rays,area,bloom,smaa,grade,hemi,led,sun,fill,lamp,shadow-Room_Fill,shadow-Lamp_Light
const OFF = new Set((import.meta.env.DEV ? new URLSearchParams(location.search).get('off') ?? '' : '').split(','))
// dev: ?gpu measures the GPU time of each rendered frame → window.__gpuMs() (median of the last 120 frames)
const gpuTimer = import.meta.env.DEV && new URLSearchParams(location.search).has('gpu') ? makeGpuTimer() : null
function makeGpuTimer() {
  let gl: WebGL2RenderingContext | null = null
  let ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null
  const pending: WebGLQuery[] = []
  const times: number[] = []
  ;(window as unknown as { __gpuMs: () => number }).__gpuMs = () => [...times].sort((a, b) => a - b)[times.length >> 1]
  return {
    begin(ctx: WebGL2RenderingContext) {
      gl ??= ctx
      ext ??= gl.getExtension('EXT_disjoint_timer_query_webgl2')
      if (!ext) return
      const q = gl.createQuery()!
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
      pending.push(q)
    },
    end() {
      if (!gl || !ext) return
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      for (let i = pending.length - 2; i >= 0; i--) {
        const q = pending[i]
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
        if (times.length > 120) times.shift()
        gl.deleteQuery(q)
        pending.splice(i, 1)
      }
    },
  }
}
/**
 * Two looks, picked by the model itself (`theme` in the Room node's extras): golden hour — the photographed room, a low
 * sun through the window grid — and night — the modern room after dark: warm LED lines, downlights and a cluster of
 * rattan pendants on light greige walls, a faint moon outside.
 */
interface LookTheme {
  sun: { boost: number; color: string } // the model's Sun, scaled and tinted
  windowGlow: { color: string; intensity: number } // soft light through each window opening
  bounce: { sky: string; ground: string; intensity: number }
  fill: number // the model's Room_Fill (the pendant, at night), scaled
  lamp: number // the model's Lamp_Light (desk lamp / shelf LED), scaled
  garden: { glow: number; tint: string } // what's seen through the window
  env: number // reflections of the neutral environment
  rays: boolean // volumetric sunbeam
  led: number // LED light washes (drawn additively)
  ao: { radius: number; falloff: number; intensity: number; color: string }
  bloom: { intensity: number; threshold: number; smoothing: number; radius: number }
  grade: { warmth: number; contrast: number; vignette: number } // warmth < 0 cools the image
}
const GOLDEN: LookTheme = {
  sun: { boost: 2.4, color: '#ff9f45' }, // strong, saturated golden-hour patches
  windowGlow: { color: '#ffd9a0', intensity: 5.2 },
  bounce: { sky: '#ffd7aa', ground: '#6a4b38', intensity: 0.62 }, // shadows stay warm and high-key, like the photos
  fill: 0.45,
  lamp: 0.3, // a warm pool, not a blow-out
  garden: { glow: 2.8, tint: '#ffe39c' }, // sunlit, yellow-green foliage
  env: 0.07,
  rays: true,
  led: 1,
  ao: { radius: 0.55, falloff: 0.9, intensity: 2.4, color: '#2a190d' },
  bloom: { intensity: 0.42, threshold: 0.72, smoothing: 0.25, radius: 0.72 },
  grade: { warmth: 1, contrast: 0.24, vignette: 0.38 },
}
const NIGHT: LookTheme = {
  sun: { boost: 0.35, color: '#9fb4ff' }, // a faint, cool moon through the window
  windowGlow: { color: '#7d93c4', intensity: 0.4 },
  bounce: { sky: '#f0e2cf', ground: '#a59886', intensity: 0.26 }, // warm light bouncing off the greige walls (up too)
  fill: 1, // the rattan cluster's amber glow (and the wicker's shadows on the walls)
  lamp: 0.7, // the LED under the shelf lights the desk
  garden: { glow: 0.6, tint: '#2b3a5c' }, // dark night foliage
  env: 0.1,
  rays: false,
  led: 0.85, // LED lines and downlight scallops — a little dim
  ao: { radius: 0.55, falloff: 0.9, intensity: 2.3, color: '#2b231a' },
  bloom: { intensity: 0.8, threshold: 0.66, smoothing: 0.3, radius: 0.8 },
  grade: { warmth: 0.25, contrast: 0.22, vignette: 0.42 },
}
export const themeOf = (room: RoomHandle) => (modelTheme(room.scene) === 'night' ? 'night' : 'golden')
const lookOf = (room: RoomHandle) => (themeOf(room) === 'night' ? NIGHT : GOLDEN)
// sunlight scattered by the air in the room (see SunRaysPass): colour × strength, forward-scattering, dust texture
const RAYS = { color: '#ffc584', strength: 0.085, anisotropy: 0.3, dust: 0.8, steps: 20, scale: 0.5 }
const AO_QUALITY = 'Performance' as const // soft contact shading at half-res — the cheapest preset is plenty

/* ── lights: tune the model's own lights for the theme + add bounce light ─────────────────── */
export function WarmLights({ room }: { room: RoomHandle }) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const look = lookOf(room)
    const undo: (() => void)[] = []
    const scale = (name: string, k: number, color?: string) => {
      const l = room.scene.getObjectByName(name) as THREE.Light | undefined
      if (!l) return
      const i = l.intensity
      const c = l.color.clone()
      l.intensity = i * k
      if (color) l.color.set(color)
      undo.push(() => {
        l.intensity = i
        l.color.copy(c)
      })
    }
    scale('Sun', OFF.has('sun') ? 0 : look.sun.boost, look.sun.color)
    scale('Room_Fill', OFF.has('fill') ? 0 : look.fill)
    scale('Lamp_Light', OFF.has('lamp') ? 0 : look.lamp)
    // at night the pendant and the shelf LED are the real lights: let them cast shadows (static, drawn once like the
    // sun's) — the chair and desk sit on the floor instead of floating, the desk shades what's under it
    for (const [name, size] of [
      ['Room_Fill', 1024],
      ['Lamp_Light', 1024],
    ] as const) {
      const l = room.scene.getObjectByName(name) as THREE.PointLight | THREE.SpotLight | undefined
      if (!l || look !== NIGHT || OFF.has(`shadow-${name}`)) continue
      l.castShadow = true
      l.shadow.mapSize.set(size, size)
      l.shadow.bias = -0.0005
      l.shadow.normalBias = 0.02
      l.shadow.camera.near = 0.05 // the cluster's balls hang right beside its light
      if (name === 'Room_Fill') l.shadow.intensity = 0.8 // light still spills round the nearest balls
      undo.push(() => (l.castShadow = false))
    }

    room.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!m) return
      // glass must not write depth: it would read as a solid surface to the ambient occlusion
      if (m.transparent) m.depthWrite = false
      // thick walls/floor/ceiling cast shadows from their OUTER (light-facing) faces: the occluder then sits a wall's
      // thickness away from the inside corners, so there are no shadow-acne light slivers where two walls meet
      if (/^(Wall_|Floor|Ceiling)/.test(o.name)) m.shadowSide = THREE.FrontSide
      if (m.name === 'garden') {
        m.emissiveIntensity *= look.garden.glow
        m.emissive.set(look.garden.tint)
      }
      // light washes (LED glow, downlight scallops): pure added light — no surface of their own, never hit by
      // hover / clicks / movement
      if (/Wash$/.test(m.name)) {
        m.blending = THREE.AdditiveBlending
        m.emissiveIntensity *= OFF.has('led') ? 0 : look.led
        ;(o as THREE.Mesh).raycast = () => {}
      }
    })

    // daylight through each window: a soft area light filling the opening, facing into the room
    RectAreaLightUniformsLib.init()
    room.scene.traverse((o) => {
      if (OFF.has('area') || !/^Window_\d+_Glass$/.test(o.name)) return
      const b = new THREE.Box3().setFromObject(o)
      const size = b.getSize(new THREE.Vector3())
      const c = b.getCenter(new THREE.Vector3())
      const thinX = size.x < size.z
      const inward = new THREE.Vector3()
      // face the room: from the glass toward the middle of the floor
      inward.set(thinX ? -Math.sign(c.x) || 1 : 0, 0, thinX ? 0 : -Math.sign(c.z) || 1)
      const area = new THREE.RectAreaLight(look.windowGlow.color, look.windowGlow.intensity, thinX ? size.z : size.x, size.y)
      // sit on the room side of the wall opening (so it lights the room, not the window reveal)
      const b0 = room.geometry.bounds
      const face = thinX ? (inward.x > 0 ? b0.min.x : b0.max.x) : inward.z > 0 ? b0.min.z : b0.max.z
      const off = Math.abs(face - (thinX ? c.x : c.z)) + 0.01
      area.position.copy(c).addScaledVector(inward, off)
      area.lookAt(c.clone().add(inward))
      scene.add(area)
      undo.push(() => {
        scene.remove(area)
        area.dispose()
      })
    })

    const hemi = new THREE.HemisphereLight(look.bounce.sky, look.bounce.ground, OFF.has('hemi') ? 0 : look.bounce.intensity)
    scene.add(hemi)
    scene.environmentIntensity = look.env
    // the static shadow map was drawn before these changes (shadow sides): draw it again once
    gl.shadowMap.needsUpdate = true
    return () => {
      undo.forEach((u) => u())
      scene.remove(hemi)
      hemi.dispose()
    }
  }, [room, scene, gl])
  return null
}

/* ── sunbeams: real sunlight in the air ───────────────────────────────────────────────────────
 * For each pixel (at half resolution) the view ray is marched across the room, and every step asks the sun's shadow
 * map whether that point of air is in sunlight. So the beam only exists where the sun really comes through the
 * window — it carries the window grid, thins out into walls and floor where it lands, glows more when you look
 * toward the sun, and drifting dust gives it texture. No geometry: nothing to see edge-on. */
const RAYS_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`
const RAYS_FS = /* glsl */ `
  uniform sampler2D uDepth;
  uniform sampler2DShadow uShadow;
  uniform sampler3D uDust;
  uniform mat4 uShadowMatrix;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform vec3 uBeamOrigin[BEAMS];
  uniform mat3 uBeamInv[BEAMS];
  uniform vec3 uSunDir;
  uniform float uAniso;
  uniform float uDustAmount;
  uniform float uTime;
  varying vec2 vUv;
  float hg(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5);
  }
  void main() {
    float depth = texture2D(uDepth, vUv).r;
    vec4 view = uProjInv * vec4(vec3(vUv, depth) * 2.0 - 1.0, 1.0);
    vec3 ro = uCamWorld[3].xyz;
    vec3 rd = (uCamWorld * vec4(view.xyz / view.w, 1.0)).xyz - ro;
    float tSurf = length(rd);
    rd /= tSurf;
    // only the air inside the room (not the garden seen through the glass)
    vec3 inv = 1.0 / (rd + 1e-6 * step(abs(rd), vec3(1e-6)));
    vec3 t0 = (uBoxMin - ro) * inv;
    vec3 t1 = (uBoxMax - ro) * inv;
    vec3 lo = min(t0, t1);
    vec3 hi = max(t0, t1);
    float a = max(max(lo.x, max(lo.y, lo.z)), 0.0);
    float b = min(min(hi.x, min(hi.y, hi.z)), tSurf);
    // ...and only where it crosses a window's sun prism (in prism space the prism is a unit box, 12 m long)
    float pa = 1e9;
    float pb = -1e9;
    for (int k = 0; k < BEAMS; k++) {
      vec3 qo = uBeamInv[k] * (ro - uBeamOrigin[k]);
      vec3 qd = uBeamInv[k] * rd;
      vec3 iq = 1.0 / (qd + 1e-6 * step(abs(qd), vec3(1e-6)));
      vec3 s0 = -qo * iq;
      vec3 s1 = (vec3(1.0, 1.0, 12.0) - qo) * iq;
      vec3 l = min(s0, s1);
      vec3 h = max(s0, s1);
      float ka = max(l.x, max(l.y, l.z));
      float kb = min(h.x, min(h.y, h.z));
      if (kb > ka) {
        pa = min(pa, ka);
        pb = max(pb, kb);
      }
    }
    a = max(a, pa);
    b = min(b, pb);
    float light = 0.0;
    if (b > a) {
      float dt = (b - a) / float(STEPS);
      // interleaved-gradient jitter: the blur in the composite turns the banding into smooth light
      float t = a + dt * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec3 drift = vec3(0.011, 0.004, 0.007) * uTime;
      for (int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * t;
        vec4 sc = uShadowMatrix * vec4(p, 1.0);
        float lit = texture(uShadow, vec3(sc.xy, sc.z - 0.0004));
        if (lit > 0.0) light += lit * mix(1.0, texture(uDust, p * 0.55 + drift).r * 2.0, uDustAmount);
        t += dt;
      }
      light *= dt;
    }
    gl_FragColor = vec4(light * hg(dot(uSunDir, -rd), uAniso) / hg(0.0, uAniso), 0.0, 0.0, 1.0);
  }
`

/** soft, tileable 3D noise for dust drifting in the beam */
function dustVolume(n = 32) {
  let a = Float32Array.from({ length: n ** 3 }, Math.random)
  const at = (x: number, y: number, z: number) => ((z + n) % n) * n * n + ((y + n) % n) * n + ((x + n) % n)
  for (let pass = 0; pass < 2; pass++)
    for (const axis of [0, 1, 2]) {
      const b = new Float32Array(a.length)
      for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            let s = 0
            for (let k = -2; k <= 2; k++) s += a[axis === 0 ? at(x + k, y, z) : axis === 1 ? at(x, y + k, z) : at(x, y, z + k)]
            b[at(x, y, z)] = s / 5
          }
      a = b
    }
  let lo = Infinity
  let hi = -Infinity
  for (const v of a) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)]
  const tex = new THREE.Data3DTexture(Uint8Array.from(a, (v) => ((v - lo) / (hi - lo)) * 255), n, n, n)
  tex.format = THREE.RedFormat
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return tex
}

/** marches the light into its own half-resolution buffer (read by SunRaysEffect) */
class SunRaysPass extends Pass {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  private readonly mat: THREE.ShaderMaterial

  constructor(
    private readonly view: THREE.Camera,
    private readonly sun: THREE.DirectionalLight,
    bounds: THREE.Box3,
    glasses: THREE.Object3D[],
  ) {
    super('SunRaysPass')
    this.needsSwap = false
    this.needsDepthTexture = true
    sun.updateMatrixWorld(true)
    const dir = sun.target.getWorldPosition(new THREE.Vector3()).sub(sun.getWorldPosition(new THREE.Vector3())).normalize()
    const inset = new THREE.Vector3(0.01, 0.01, 0.01)
    // each window's sun prism: glass corner + (width, height, sun direction) → inverse maps it to a unit box
    const prisms = glasses.map((g) => {
      const b = new THREE.Box3().setFromObject(g)
      const size = b.getSize(new THREE.Vector3())
      const thinX = size.x < size.z
      const across = thinX ? new THREE.Vector3(0, 0, size.z) : new THREE.Vector3(size.x, 0, 0)
      const up = new THREE.Vector3(0, size.y, 0)
      const m = new THREE.Matrix3().set(across.x, up.x, dir.x, across.y, up.y, dir.y, across.z, up.z, dir.z)
      return { origin: b.min.clone().setComponent(thinX ? 0 : 2, thinX ? b.getCenter(new THREE.Vector3()).x : b.getCenter(new THREE.Vector3()).z), inv: m.invert() }
    })
    this.mat = new THREE.ShaderMaterial({
      defines: { STEPS: RAYS.steps, BEAMS: prisms.length },
      uniforms: {
        uDepth: { value: null },
        uShadow: { value: null },
        uDust: { value: dustVolume() },
        uShadowMatrix: { value: sun.shadow.matrix },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uBoxMin: { value: bounds.min.clone().add(inset) },
        uBoxMax: { value: bounds.max.clone().sub(inset) },
        uBeamOrigin: { value: prisms.map((q) => q.origin) },
        uBeamInv: { value: prisms.map((q) => q.inv) },
        uSunDir: { value: dir },
        uAniso: { value: RAYS.anisotropy },
        uDustAmount: { value: RAYS.dust },
        uTime: { value: 0 },
      },
      vertexShader: RAYS_VS,
      fragmentShader: RAYS_FS,
      depthTest: false,
      depthWrite: false,
    })
    this.fullscreenMaterial = this.mat
  }

  override setDepthTexture(depth: THREE.Texture) {
    this.mat.uniforms.uDepth.value = depth
  }

  override setSize(width: number, height: number) {
    this.target.setSize(Math.max(1, Math.round(width * RAYS.scale)), Math.max(1, Math.round(height * RAYS.scale)))
  }

  override render(renderer: THREE.WebGLRenderer, _in: THREE.WebGLRenderTarget | null, _out: THREE.WebGLRenderTarget | null, dt = 0) {
    const u = this.mat.uniforms
    const shadow = this.sun.shadow.map?.depthTexture ?? null
    renderer.setRenderTarget(this.target)
    if (!shadow || !u.uDepth.value) return void renderer.clear() // shadow map not drawn yet
    u.uShadow.value = shadow
    u.uProjInv.value.copy(this.view.projectionMatrixInverse)
    u.uCamWorld.value.copy(this.view.matrixWorld)
    u.uTime.value += dt
    renderer.render(this.scene, this.camera)
  }

  override dispose() {
    super.dispose()
    this.target.dispose()
    ;(this.mat.uniforms.uDust.value as THREE.Texture).dispose()
    this.mat.dispose()
  }
}

/** adds the (softly blurred) beam light to the image, in HDR, before bloom / tone mapping */
class SunRaysEffect extends Effect {
  constructor(rays: THREE.Texture) {
    super(
      'SunRaysEffect',
      /* glsl */ `
        uniform sampler2D uRays;
        uniform vec3 uColor;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec2 px = 1.25 / vec2(textureSize(uRays, 0));
          float r = 0.0;
          for (int x = -1; x <= 1; x++)
            for (int y = -1; y <= 1; y++) r += texture2D(uRays, uv + vec2(x, y) * px).r;
          outputColor = vec4(inputColor.rgb + uColor * (r / 9.0), inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ['uRays', new THREE.Uniform(rays)],
          ['uColor', new THREE.Uniform(new THREE.Color(RAYS.color).multiplyScalar(RAYS.strength))],
        ]),
      },
    )
  }
}

/* ── film grade: split-toning (warm or cool), a soft S-curve and a vignette ─────────────────────────── */
class GradeEffect extends Effect {
  constructor(grade: LookTheme['grade']) {
    super(
      'GradeEffect',
      /* glsl */ `
        uniform float uWarmth;
        uniform float uContrast;
        uniform float uVignette;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec3 c = inputColor.rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 shadows = mix(vec3(1.0), vec3(1.07, 0.97, 0.85), uWarmth);
          vec3 highs = mix(vec3(1.0), vec3(1.05, 0.99, 0.9), uWarmth);
          c *= mix(shadows, highs, smoothstep(0.04, 0.55, l));
          c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
          float d = length((uv - 0.5) * vec2(1.0, 0.82));
          c *= 1.0 - smoothstep(0.38, 0.95, d) * uVignette;
          outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map([
          ['uWarmth', new THREE.Uniform(grade.warmth)],
          ['uContrast', new THREE.Uniform(grade.contrast)],
          ['uVignette', new THREE.Uniform(grade.vignette)],
        ]),
      },
    )
  }
}

/* ── the post pipeline (renders the frame instead of R3F's default render) ─────────────────── */
/**
 * `onSlow` is called when frames keep running long (a modest GPU): the parent lowers the render resolution a step,
 * which keeps motion fluid. While content covers the room (camera frozen) the last frame is simply kept.
 */
export function PostFX({ room, onSlow }: { room: RoomHandle; onSlow: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const pace = useRef({ t: 0, n: 0, slow: 0, settle: 3, frozen: 0, redraw: true })

  const composer = useMemo(() => {
    const look = lookOf(room)
    const c = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType })
    c.addPass(new RenderPass(scene, camera))
    const ao = new N8AOPostPass(scene, camera, size.width, size.height)
    Object.assign(ao.configuration, {
      aoRadius: look.ao.radius,
      distanceFalloff: look.ao.falloff,
      intensity: look.ao.intensity,
      color: new THREE.Color(look.ao.color),
      halfRes: true,
      depthAwareUpsampling: true,
      gammaCorrection: false,
    })
    ao.setQualityMode(AO_QUALITY)
    if (!OFF.has('ao')) c.addPass(ao)
    const sun = room.scene.getObjectByName('Sun') as THREE.DirectionalLight | undefined
    const glasses: THREE.Object3D[] = []
    room.scene.traverse((o) => /^Window_\d+_Glass$/.test(o.name) && glasses.push(o))
    const rays = look.rays && sun && glasses.length && !OFF.has('rays') ? new SunRaysPass(camera, sun, room.geometry.bounds, glasses) : null
    if (rays) c.addPass(rays)
    const bloom = new BloomEffect({ intensity: look.bloom.intensity, luminanceThreshold: look.bloom.threshold, luminanceSmoothing: look.bloom.smoothing, mipmapBlur: true, radius: look.bloom.radius })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    c.addPass(new EffectPass(camera, ...[rays && new SunRaysEffect(rays.target.texture), OFF.has('bloom') ? null : bloom, tone, OFF.has('grade') ? null : new GradeEffect(look.grade)].filter((e): e is Effect => !!e)))
    // high-DPR screens are already supersampled; elsewhere a light SMAA pass cleans up the edges
    if (!OFF.has('smaa') && window.devicePixelRatio < 1.5) c.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })))
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, room])

  useEffect(() => {
    composer.setSize(size.width, size.height)
    Object.assign(pace.current, { redraw: true, settle: 1.5, t: 0, n: 0 })
  }, [composer, size, dpr])
  useEffect(() => () => composer.dispose(), [composer])

  // compile every material and upload every texture now — three.js otherwise does it when an object first comes into
  // view, which stalls the first pull-back from the PC. Compiled for the composer's buffer (what the room renders into).
  useEffect(() => {
    scene.traverse((o) => {
      for (const m of [(o as THREE.Mesh).material ?? []].flat())
        for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) gl.initTexture(v as THREE.Texture)
    })
    gl.setRenderTarget(composer.inputBuffer)
    gl.compileAsync(scene, camera).catch(() => {})
    gl.setRenderTarget(null)
  }, [gl, scene, camera, composer])

  // priority 1: take over rendering from R3F
  useFrame((_, dt) => {
    const p = pace.current
    p.frozen = isFrozen() ? p.frozen + dt : 0
    if (p.frozen > 0.6 && !p.redraw) return // content is open over a still room: nothing to redraw
    gpuTimer?.begin(gl.getContext() as WebGL2RenderingContext)
    composer.render(dt)
    gpuTimer?.end()
    p.redraw = false

    // frame pacing (ignores stalls, hidden tabs, the first seconds of shader compiling and time behind content)
    if (p.frozen > 0 || dt > 0.25 || (p.settle -= dt) > 0) return void Object.assign(p, { t: 0, n: 0 })
    p.t += dt
    p.n++
    if (p.t < 1) return
    p.slow = p.n / p.t < 50 ? p.slow + 1 : 0
    Object.assign(p, { t: 0, n: 0 })
    if (p.slow >= 2 && !gpuTimer) {
      p.slow = 0
      onSlow()
    }
  }, 1)
  return null
}
