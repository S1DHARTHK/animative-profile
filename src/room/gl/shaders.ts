// GLSL for the room renderer (WebGL2). See renderer.ts for how the passes fit together.

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
`

/** fullscreen triangle */
export const FULLSCREEN_VS = /* glsl */ `${HEADER}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`

/* ── pass 1a · single angle: every screen pixel is re-projected through the virtual camera ─────────── */
export const PHOTO_FS = /* glsl */ `${HEADER}
uniform sampler2D uPhoto;
uniform mat3 uS;          // screen css px -> normalised image coords
uniform vec2 uTexSize;
uniform float uPx;        // canvas px per css px
uniform float uCanvasH;
uniform float uSharp;     // 1 = bicubic (magnifying), 0 = plain bilinear
out vec4 outColor;

// Catmull-Rom in 9 bilinear taps: crisp magnification of a small photo without the mushy bilinear look
vec3 catmullRom(vec2 uv) {
  vec2 sp = uv * uTexSize;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / uTexSize;
  vec2 t3 = (t1 + 2.0) / uTexSize;
  vec2 t12 = (t1 + w2 / w12) / uTexSize;
  vec3 c = vec3(0.0);
  c += textureLod(uPhoto, vec2(t0.x, t0.y), 0.0).rgb * w0.x * w0.y;
  c += textureLod(uPhoto, vec2(t12.x, t0.y), 0.0).rgb * w12.x * w0.y;
  c += textureLod(uPhoto, vec2(t3.x, t0.y), 0.0).rgb * w3.x * w0.y;
  c += textureLod(uPhoto, vec2(t0.x, t12.y), 0.0).rgb * w0.x * w12.y;
  c += textureLod(uPhoto, vec2(t12.x, t12.y), 0.0).rgb * w12.x * w12.y;
  c += textureLod(uPhoto, vec2(t3.x, t12.y), 0.0).rgb * w3.x * w12.y;
  c += textureLod(uPhoto, vec2(t0.x, t3.y), 0.0).rgb * w0.x * w3.y;
  c += textureLod(uPhoto, vec2(t12.x, t3.y), 0.0).rgb * w12.x * w3.y;
  c += textureLod(uPhoto, vec2(t3.x, t3.y), 0.0).rgb * w3.x * w3.y;
  return max(c, 0.0);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uCanvasH - gl_FragCoord.y) / uPx;
  vec3 h = uS * vec3(css, 1.0);
  vec2 uv = h.xy / h.z;
  vec3 c = uSharp > 0.5 ? catmullRom(uv) : texture(uPhoto, uv).rgb;
  outColor = vec4(c, 1.0);
}
`

/* ── pass 1b · transition: each photo is a grid mesh that slides along its optical flow ─────────────── */
export const MESH_VS = /* glsl */ `${HEADER}
layout(location = 0) in vec2 aQ;   // vertex position in the destination (B) image frame, normalised
uniform highp sampler2D uFlow;     // 12-bit fixed-point flow packed in RGB8 (scripts/build-morphs.py)
uniform ivec2 uGrid;               // flow grid size
uniform float uScale;              // flow range
uniform float uT;                  // how far along its flow this mesh has travelled (A: t, B: 1-t)
uniform mat3 uP;                   // B frame -> clip (homogeneous)
uniform mat3 uToPhoto;             // B frame -> this photo's own coords
out vec3 vSrc;
out vec2 vRigid;                   // where this point would be on screen WITHOUT the flow (NDC)

vec2 flowAt(ivec2 i) {
  vec3 c = floor(texelFetch(uFlow, clamp(i, ivec2(0), uGrid - 1), 0).rgb * 255.0 + 0.5);
  float x = c.r * 16.0 + floor(c.g / 16.0);
  float y = mod(c.g, 16.0) * 256.0 + c.b;
  return (vec2(x, y) / 4095.0 * 2.0 - 1.0) * uScale;
}

void main() {
  ivec2 i = ivec2(floor(aQ * vec2(uGrid - 1) + 0.5));
  vec2 f = flowAt(i);
  vec3 rigid = uP * vec3(aQ, 1.0);
  vRigid = rigid.xy / rigid.z;
  vec3 c = uP * vec3(aQ + uT * f, 1.0);
  // nearer surfaces (more parallax) win the depth test
  float near = clamp(length(f) / uScale, 0.0, 1.0);
  gl_Position = vec4(c.xy, (0.92 - 0.9 * near) * c.z, c.z);
  vSrc = uToPhoto * vec3(aQ, 1.0);
}
`

export const MESH_FS = /* glsl */ `${HEADER}
uniform sampler2D uPhoto;
uniform vec2 uRes;
in vec3 vSrc;
in vec2 vRigid;
out vec4 outColor;
void main() {
  vec2 uv = vSrc.xy / vSrc.z;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  // Per-TRIANGLE tear test: how much bigger is this triangle on screen than it would be without the flow?
  // Triangles bridging a depth edge get stretched open and hand over to the other photo; thin objects
  // (a lamp arm, a pen) keep their own, unstretched triangles.
  vec2 rx = dFdx(vRigid) * uRes * 0.5;
  vec2 ry = dFdy(vRigid) * uRes * 0.5;
  float stretch = 1.0 / max(abs(rx.x * ry.y - rx.y * ry.x), 1e-4);
  float conf = clamp(1.0 - (stretch - 1.6) * 0.45, 0.0, 1.0);
  vec2 e = min(uv, 1.0 - uv);
  float edge = smoothstep(0.0, 0.012, min(e.x, e.y));
  // alpha = confidence, but never below 2/255 so "torn yet present" stays distinguishable from "absent"
  outColor = vec4(texture(uPhoto, uv).rgb, max(conf * conf * edge, 2.0 / 255.0));
}
`

/* ── pass 1c · blend the two warped photos into the in-between frame ────────────────────────────────── */
export const COMBINE_FS = /* glsl */ `${HEADER}
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uRes;
uniform float uMix;       // 0 = all A, 1 = all B
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 a = texture(uA, uv);
  vec4 b = texture(uB, uv);
  const float PRESENT = 1.0 / 255.0;
  bool hasA = a.a >= PRESENT;
  bool hasB = b.a >= PRESENT;
  if (!hasA && !hasB) { outColor = vec4(0.08, 0.05, 0.035, 1.0); return; }
  float wa = hasA ? a.a * (1.0 - uMix) : 0.0;
  float wb = hasB ? b.a * uMix : 0.0;
  vec3 blended = (a.rgb * wa + b.rgb * wb) / max(wa + wb, 1e-5);
  // where one image is torn or absent the other fills in, whatever the mix; if both are torn, the less torn wins
  vec3 best = (hasA && (!hasB || a.a >= b.a)) ? a.rgb : b.rgb;
  outColor = vec4(mix(best, blended, smoothstep(0.02, 0.25, wa + wb)), 1.0);
}
`

/* ── pass 2 · lens + film: depth of field, focus pull, exposure, vignette, grain, the doorway ────────── */
export const POST_FS = /* glsl */ `${HEADER}
uniform sampler2D uScene;
uniform vec2 uRes;         // canvas px
uniform float uPx;         // canvas px per css px
uniform vec2 uView;        // css px
uniform float uBlur;       // css px
uniform float uDim;
uniform vec4 uFocus;       // centre xy, radii zw (css px)
uniform float uFocusAmt;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec4 uPortal;      // l, t, r, b (css px)
uniform float uPortalOpen; // 1 = no doorway
uniform float uGlow;
out vec4 outColor;

const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

// integer hash: no visible banding (the classic sin() hash shows diagonal lines on some GPUs)
float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / 4294967295.0);
}

float roundedBox(vec2 p, vec2 c, vec2 half_, float r) {
  vec2 q = abs(p - c) - half_ + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec2 css = vec2(frag.x, uRes.y - frag.y) / uPx;

  // focus pull: an ellipse of sharp, lit subject; the rest falls out of focus and into shade
  vec2 fd = (css - uFocus.xy) / max(uFocus.zw, vec2(1.0));
  float focus = uFocusAmt * (1.0 - smoothstep(0.38, 1.0, length(fd)));
  float r = uBlur * (1.0 - focus) * uPx;
  vec3 col;
  if (r > 0.35) {
    float lod = log2(max(r / 2.6, 1.0));
    float a = hash(frag) * 6.2832;
    mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
    col = textureLod(uScene, uv, lod).rgb;
    for (int i = 0; i < 12; i++) col += textureLod(uScene, uv + rot * POISSON[i] * r / uRes, lod).rgb;
    col /= 13.0;
  } else {
    col = texture(uScene, uv).rgb;
  }
  col *= mix(uDim, 1.0, focus);

  // vignette (same falloff as the old CSS radial gradient)
  float d = length((uv * vec2(1.0, -1.0) + vec2(0.0, 1.0) - vec2(0.5, 0.48)) / vec2(0.88, 0.82));
  col = mix(col, vec3(0.047, 0.024, 0.008), smoothstep(0.46, 1.0, d) * 0.62 * uVignette);

  // the doorway: outside it, a dark hallway lit by the room's warm spill
  if (uPortalOpen < 0.999) {
    vec2 c = vec2(uPortal.x + uPortal.z, uPortal.y + uPortal.w) * 0.5;
    vec2 h = vec2(uPortal.z - uPortal.x, uPortal.w - uPortal.y) * 0.5;
    float sd = roundedBox(css, c, h, 6.0 * (1.0 - uPortalOpen));
    vec2 gp = (css - vec2(uView.x * 0.645, uView.y * 0.5)) / (uView * vec2(0.27, 0.5));
    float gl = length(gp);
    vec3 hall = vec3(0.055, 0.039, 0.027);
    hall += vec3(0.314, 0.165, 0.071) * 0.35 * (1.0 - smoothstep(0.0, 1.35, length((css - uView * vec2(0.64, 0.5)) / (uView * vec2(0.6, 0.7)))));
    hall = mix(hall, vec3(1.0, 0.667, 0.376), 0.34 * uGlow * (1.0 - smoothstep(0.0, 0.76, gl)));
    col = mix(hall, col, 1.0 - smoothstep(-0.75, 0.75, sd));
  }

  // film grain, a little stronger in the mid-tones, 24 fps
  float n = hash(floor(frag / max(uPx, 1.0)) + vec2(floor(uTime * 24.0) * 131.0, 0.0)) - 0.5;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col += n * uGrain * (0.55 + 0.9 * l * (1.0 - l));
  outColor = vec4(col, 1.0);
}
`
