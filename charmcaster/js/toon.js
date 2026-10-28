// WebGL2 cartoon pass for everything that isn't the drawn head:
// flattens the camera image, cel-shades it, recolors body parts into
// Charmcaster's palette (white hair, magenta outfit with a black panel,
// pink skin) and inks the outlines. Backgrounds: comic, lair, stained glass, off.

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Edge-preserving blur (bilateral) at half resolution.
const FS_SMOOTH = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 c0 = texture(uSrc, uv).rgb;
  vec3 acc = c0;
  float ws = 1.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      if (i == 0 && j == 0) continue;
      vec3 c = texture(uSrc, uv + vec2(float(i), float(j)) * uStep).rgb;
      vec3 d = c - c0;
      float w = exp(-dot(d, d) * 22.0 - float(i * i + j * j) * 0.15);
      acc += c * w;
      ws += w;
    }
  }
  o = vec4(acc / ws, 1.0);
}`;

const FS_COMPOSE = `#version 300 es
precision highp float;
uniform sampler2D uS;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform float uMirror;
uniform float uMaskOn;
uniform int uMode;
uniform float uTime;
uniform vec4 uPanelA[2];  // per person: panel top xy, bottom xy (px)
uniform vec4 uPanelB[2];  // half width at top, at bottom, on
uniform vec4 uMaskRoi;    // where the mask sits in the (unmirrored) frame, normalized
uniform vec4 uArm[6];     // limb segments in px: upper arm, forearm, hand (left then right)
uniform vec3 uArmR;
uniform vec4 uLeg[6];     // thigh, shin, foot (left then right)
uniform vec3 uLegR;
uniform vec4 uHem;        // point on the jacket hem line + unit normal pointing down the body
uniform float uBody;
uniform float uInk;
in vec2 vUv;
out vec4 o;

const vec3 INK = vec3(0.02, 0.0, 0.03);

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// cel shading: 4 flat tones picked by brightness relative to the neighbourhood
vec3 tone4(float r, float L, vec3 deep, vec3 shade, vec3 base, vec3 hi, float hiAt) {
  vec3 c = mix(deep, shade, smoothstep(0.575, 0.605, r) * smoothstep(0.035, 0.075, L));
  c = mix(c, base, smoothstep(0.85, 0.88, r));
  return mix(c, hi, smoothstep(hiAt, hiAt + 0.05, r));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float sdSeg(vec2 p, vec4 s) {
  vec2 pa = p - s.xy, ba = s.zw - s.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
  return length(pa - ba * h);
}
float capsule(vec2 p, vec4 s, float r) { return 1.0 - smoothstep(r - 1.5, r + 1.5, sdSeg(p, s)); }
// short line across a limb at the start of segment s (glove cuff, boot top)
float cuff(vec2 p, vec4 s, float r, float w) {
  vec2 d = normalize(s.zw - s.xy + vec2(1e-4));
  vec2 q = p - s.xy;
  float along = dot(q, d), across = abs(dot(q, vec2(-d.y, d.x)));
  return (1.0 - smoothstep(w * 0.5 - 0.6, w * 0.5 + 0.6, abs(along))) * (1.0 - smoothstep(r - 1.0, r + 1.0, across));
}

vec4 maskAt(vec2 raw) {
  vec2 q = (clamp(raw, 0.0, 1.0) - uMaskRoi.xy) / uMaskRoi.zw;
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  return texture(uMask, q) * inside * uMaskOn;
}

// Line along the 0.5 contour of a soft mask channel, constant width in pixels.
float iso(float v, float gx, float gy, float halfW) {
  float g = length(vec2(gx, gy));
  float d = abs(v - 0.5) / max(g, 1e-4);
  return (1.0 - smoothstep(halfW - 0.75, halfW + 0.75, d)) * smoothstep(0.004, 0.02, g);
}

vec3 comic(vec3 s) {
  vec3 hsv = rgb2hsv(s);
  float v = hsv.z * 4.0;
  float vq = (floor(v) + smoothstep(0.35, 0.65, fract(v))) / 4.0;
  hsv.z = clamp(mix(vq, hsv.z, 0.25) * 1.05, 0.0, 1.0);
  hsv.y = clamp(hsv.y * 1.3, 0.0, 1.0);
  return hsv2rgb(hsv);
}

vec3 lair(float L, vec2 uv) {
  vec3 c = vec3(0.035, 0.016, 0.06);
  c = mix(c, vec3(0.10, 0.05, 0.17), smoothstep(0.10, 0.16, L));
  c = mix(c, vec3(0.19, 0.11, 0.31), smoothstep(0.30, 0.36, L));
  c = mix(c, vec3(0.33, 0.21, 0.50), smoothstep(0.52, 0.58, L));
  c = mix(c, vec3(0.56, 0.40, 0.78), smoothstep(0.78, 0.84, L));
  float vig = 1.0 - smoothstep(0.35, 0.95, length((uv - 0.5) * vec2(1.0, 1.2)));
  float n = sin(uv.x * 7.0 + uTime * 0.4) * sin(uv.y * 5.0 - uTime * 0.3) * 0.5 + 0.5;
  c += vec3(0.22, 0.03, 0.25) * n * (1.0 - vig) * 0.35;
  return c * mix(0.45, 1.0, vig);
}

vec3 glass(vec2 uv, float L) {
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 10.0;
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(ip + g);
      vec2 r = g + 0.5 + 0.38 * sin(uTime * 0.35 + 6.2831 * h) - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = ip + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float h = hash12(id);
  float y = 1.0 - uv.y;
  vec3 top = vec3(0.70, 0.30, 0.86), mid = vec3(0.98, 0.42, 0.78), bot = vec3(1.0, 0.80, 0.42);
  vec3 grad = y < 0.5 ? mix(top, mid, y * 2.0) : mix(mid, bot, y * 2.0 - 1.0);
  vec3 col = grad * (0.78 + 0.36 * h);
  col = mix(col, vec3(1.0, 0.95, 1.0), step(0.92, h) * 0.55);
  col *= 0.9 + 0.2 * L;
  return mix(vec3(0.30, 0.10, 0.36), col, smoothstep(0.03, 0.08, edge));
}

void main() {
  vec2 uv = vUv;
  float mx = mix(uv.x, 1.0 - uv.x, uMirror);
  vec2 suv = vec2(mx, uv.y);
  vec2 muv = vec2(mx, 1.0 - uv.y);
  if (uMode == 3) {
    o = vec4(texture(uSrc, muv).rgb, 1.0);
    return;
  }

  vec3 s = textureLod(uS, suv, 0.0).rgb;
  float L = luma(s);
  float Lm = luma(textureLod(uS, suv, 4.0).rgb);
  float r = L / max(Lm, 0.04);

  vec2 px = 1.0 / uRes;
  float tl = luma(textureLod(uS, suv + vec2(-px.x, px.y), 0.0).rgb);
  float tc = luma(textureLod(uS, suv + vec2(0.0, px.y), 0.0).rgb);
  float tr = luma(textureLod(uS, suv + vec2(px.x, px.y), 0.0).rgb);
  float ml = luma(textureLod(uS, suv + vec2(-px.x, 0.0), 0.0).rgb);
  float mr = luma(textureLod(uS, suv + vec2(px.x, 0.0), 0.0).rgb);
  float bl = luma(textureLod(uS, suv + vec2(-px.x, -px.y), 0.0).rgb);
  float bc = luma(textureLod(uS, suv + vec2(0.0, -px.y), 0.0).rgb);
  float br = luma(textureLod(uS, suv + vec2(px.x, -px.y), 0.0).rgb);
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float edge = length(vec2(gx, gy));

  vec4 m = maskAt(muv);
  float person = m.a, hair = m.r, skin = m.g, cloth = m.b;
  float other = max(person - hair - skin - cloth, 0.0);

  vec3 bg;
  if (uMode == 1) bg = lair(L, uv);
  else if (uMode == 2) bg = glass(uv, L);
  else bg = comic(s);
  bg = mix(comic(s), bg, uMaskOn);

  // body parts are toned from blurrier brightness so fabric/hair texture flattens out
  float L1 = luma(textureLod(uS, suv, 1.5).rgb), r1 = L1 / max(Lm, 0.04);
  float L2 = luma(textureLod(uS, suv, 2.5).rgb), r2 = L2 / max(Lm, 0.04);
  // flatter brightness for the outfit/skin so it reads as drawn, not photographed
  float LB = mix(L1, L2, 0.5), rB = mix(r1, r2, 0.5);
  // her hair is white; only real shadows turn blue-grey
  vec3 hairC = mix(vec3(0.776, 0.839, 0.882), vec3(0.984, 0.992, 0.996), smoothstep(0.62, 0.7, r2));
  hairC = mix(vec3(0.62, 0.70, 0.78), hairC, smoothstep(0.38, 0.45, r2) * smoothstep(0.02, 0.05, L2));
  vec3 skinC = tone4(rB, LB, vec3(0.541, 0.31, 0.369), vec3(0.718, 0.451, 0.486), vec3(0.835, 0.592, 0.592), vec3(0.91, 0.69, 0.678), 1.22);
  vec3 clothC = tone4(rB, LB, vec3(0.20, 0.0, 0.13), vec3(0.33, 0.02, 0.24), vec3(0.463, 0.0, 0.341), vec3(0.64, 0.14, 0.49), 1.3);

  vec2 pp = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  float hw2 = uInk * 0.5;
  float panel = 0.0, panelLine = 0.0;
  for (int k = 0; k < 2; k++) {
    vec4 A = uPanelA[k], B = uPanelB[k];
    vec2 ax = A.zw - A.xy;
    float len = max(length(ax), 1.0);
    vec2 dir = ax / len;
    vec2 q = pp - A.xy;
    float t = dot(q, dir) / len;
    float hw = mix(B.x, B.y, clamp(t, 0.0, 1.0));
    float d = abs(dot(q, vec2(-dir.y, dir.x))) - hw;
    float inP = B.z * step(0.0, t) * step(t, 1.0);
    panel = max(panel, inP * (1.0 - smoothstep(-1.0, 1.0, d)));
    panelLine = max(panelLine, inP * (1.0 - smoothstep(hw2 * 0.7 - 0.7, hw2 * 0.7 + 0.7, abs(d))));
  }
  vec3 panelC = tone4(rB, LB, vec3(0.02, 0.01, 0.03), vec3(0.06, 0.02, 0.06), vec3(0.12, 0.04, 0.11), vec3(0.24, 0.10, 0.23), 1.6);
  vec3 sleeveC = clothC;
  clothC = mix(clothC, panelC, panel);
  vec3 otherC = comic(s);

  // her outfit on the whole body: sleeves, fingerless gloves, leggings, boots (from body tracking)
  float sleeve = 0.0, glove = 0.0, boot = 0.0, thigh = 0.0, lines = 0.0;
  for (int k = 0; k < 2; k++) {
    sleeve = max(sleeve, max(capsule(pp, uArm[k * 3], uArmR.x), capsule(pp, uArm[k * 3 + 1], uArmR.y)));
    glove = max(glove, capsule(pp, uArm[k * 3 + 2], uArmR.z));
    thigh = max(thigh, capsule(pp, uLeg[k * 3], uLegR.x));
    boot = max(boot, max(capsule(pp, uLeg[k * 3 + 1], uLegR.y), capsule(pp, uLeg[k * 3 + 2], uLegR.z)));
    lines = max(lines, cuff(pp, uArm[k * 3 + 2], uArmR.z * 1.1, uInk));
    lines = max(lines, cuff(pp, uLeg[k * 3 + 1], uLegR.y * 1.15, uInk));
  }
  float below = smoothstep(-2.0, 2.0, dot(pp - uHem.xy, uHem.zw));
  // gloves only where the hand's own skin shows; a hand hidden behind an arm leaves the sleeve alone
  float gW = glove * uBody * (skin + other) / max(person, 1e-3);
  float sW = max(sleeve, glove) * uBody * (1.0 - gW);
  float bW = boot * uBody * (1.0 - max(gW, sW));
  float lW = max(below, thigh) * uBody * (1.0 - max(gW, sW)) * (1.0 - bW);
  float tW = max(1.0 - gW - sW - bW - lW, 0.0);
  vec3 legC = tone4(rB, LB, vec3(0.02, 0.01, 0.04), vec3(0.07, 0.04, 0.10), vec3(0.13, 0.07, 0.18), vec3(0.34, 0.22, 0.46), 1.6);
  vec3 bootC = tone4(rB, LB, vec3(0.03, 0.02, 0.05), vec3(0.09, 0.05, 0.13), vec3(0.17, 0.09, 0.23), vec3(0.45, 0.30, 0.60), 1.6);
  vec3 gloveC = tone4(rB, LB, vec3(0.02, 0.01, 0.03), vec3(0.06, 0.03, 0.07), vec3(0.11, 0.06, 0.13), vec3(0.26, 0.16, 0.32), 1.6);
  vec3 dressed = sleeveC * sW + gloveC * gW + bootC * bW + legC * lW;
  vec3 clothD = clothC * tW + dressed;
  vec3 skinD = skinC * tW + dressed;
  vec3 otherD = otherC * (tW + sW + gW) + bootC * bW + legC * lW;

  vec3 col = bg * (1.0 - person) + hairC * hair + skinD * skin + clothD * cloth + otherD * other;

  vec2 mo = vec2(px.x * 1.5, 0.0), no = vec2(0.0, px.y * 1.5);
  vec4 mR = maskAt(muv + mo), mL = maskAt(muv - mo), mU = maskAt(muv + no), mD = maskAt(muv - no);
  vec4 gxm = (mR - mL) / 3.0;
  vec4 gym = (mU - mD) / 3.0;
  float line = iso(person, gxm.a, gym.a, hw2 * 1.25);
  line = max(line, iso(hair, gxm.r, gym.r, hw2 * 0.8));
  line = max(line, iso(cloth, gxm.b, gym.b, hw2 * 0.8));
  line = max(line, cloth * panelLine);
  line = max(line, lines * uBody * (skin + cloth));

  float edgeInk = smoothstep(0.40, 0.66, edge) * mix(0.6, 0.95, person) * (1.0 - 0.9 * hair) * (1.0 - 0.5 * cloth);
  if (uMode == 2) edgeInk *= person + (1.0 - uMaskOn);
  float ink = max(line, edgeInk);
  o = vec4(mix(col, INK, ink), 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
  const uni = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uni[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, uni };
}

export const MODES = ['comic', 'lair', 'glass', 'off'];
const NO_LIMBS = new Float32Array(24).fill(-1e5);

export class ToonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.init(); this.lost = false; });
    this.init();
  }

  init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.smooth = program(gl, VS, FS_SMOOTH);
    this.compose = program(gl, VS, FS_COMPOSE);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const tex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.texSrc = tex();
    this.texMask = tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.maskVersion = -1;
    this.texS = null;
    this.fbo = gl.createFramebuffer();
    this.w = this.h = 0;
  }

  // GPU name as WebGL reports it (e.g. "ANGLE (Intel ... Direct3D11)" or "SwiftShader" in software)
  rendererInfo() {
    const gl = this.gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }

  resize(w, h) {
    if (w === this.w && h === this.h && this.texS) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const sw = Math.max(1, Math.ceil(w / 2)), sh = Math.max(1, Math.ceil(h / 2));
    if (this.texS) gl.deleteTexture(this.texS);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const levels = Math.floor(Math.log2(Math.max(sw, sh))) + 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, sw, sh);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texS = t;
    this.sw = sw;
    this.sh = sh;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  uploadMask(mask) {
    if (!mask || mask.version === this.maskVersion) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mask.w, mask.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask.rgba);
    this.maskVersion = mask.version;
  }

  // opts: { mirror, maskOn, maskRoi, mode, time, ink,
  //         panels: up to 2 of [topX, topY, botX, botY, halfTop, halfBot, on],
  //         body: { arms[24], armR[3], legs[24], legR[3], hem[4] } | null }
  render(source, opts) {
    if (this.lost) return false;
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texSrc);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // pass 1: bilateral smooth -> half-res texture with mips
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.sw, this.sh);
    gl.useProgram(this.smooth.p);
    gl.uniform1i(this.smooth.uni.uSrc, 0);
    gl.uniform2f(this.smooth.uni.uStep, 2 / this.w, 2 / this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.texS);
    gl.generateMipmap(gl.TEXTURE_2D);

    // pass 2: compose to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    const u = this.compose.uni;
    gl.useProgram(this.compose.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texS);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texSrc);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.uniform1i(u.uS, 0);
    gl.uniform1i(u.uSrc, 1);
    gl.uniform1i(u.uMask, 2);
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uMirror, opts.mirror ? 1 : 0);
    gl.uniform1f(u.uMaskOn, opts.maskOn || 0);
    gl.uniform1i(u.uMode, opts.mode || 0);
    gl.uniform1f(u.uTime, opts.time || 0);
    const pa = new Float32Array(8), pb = new Float32Array(8);
    (opts.panels || []).slice(0, 2).forEach((p, k) => {
      pa.set(p.slice(0, 4), k * 4);
      pb.set([p[4], p[5], p[6], 0], k * 4);
    });
    gl.uniform4fv(u['uPanelA[0]'], pa);
    gl.uniform4fv(u['uPanelB[0]'], pb);
    const roi = opts.maskRoi || { x: 0, y: 0, w: 1, h: 1 };
    gl.uniform4f(u.uMaskRoi, roi.x, roi.y, roi.w, roi.h);
    const b = opts.body;
    gl.uniform1f(u.uBody, b ? 1 : 0);
    gl.uniform4fv(u['uArm[0]'], b ? b.arms : NO_LIMBS);
    gl.uniform4fv(u['uLeg[0]'], b ? b.legs : NO_LIMBS);
    gl.uniform3fv(u.uArmR, b ? b.armR : [0, 0, 0]);
    gl.uniform3fv(u.uLegR, b ? b.legR : [0, 0, 0]);
    gl.uniform4fv(u.uHem, b ? b.hem : [0, 1e6, 0, 1]);
    gl.uniform1f(u.uInk, opts.ink || 2.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    return true;
  }
}
