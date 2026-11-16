/**
 * The water on the glass, the landing's transition (the user, 2026-11-10: the wave comes at the
 * visitor, the water rises from the tyres to the screen). The sheet the tyres throw lands where they
 * are on screen: its first drops, then a film that bursts out from there over the whole glass,
 * fingers running ahead; the stage turns behind it; then it drains from the top, a light line riding
 * its edge, and the drops it leaves linger and go.
 *
 * The water bends what is behind it: the frame the scene has just drawn, copied, over the page's
 * plates under the canvas, which the shader rebuilds from drift.css (keep both in step). So each drop
 * shows the scene upside down and small, as a drop on a window does. Drawn at a reduced size,
 * premultiplied, and laid over the canvas.
 */
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const WATER = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uTime;
  uniform float uAspect;
  uniform float uHit;
  uniform float uClear;
  uniform float uPhase;
  uniform float uHorizon;
  uniform float uWarm;
  uniform vec2 uOrigin;
  varying vec2 vUv;
  ${NOISE}
  const vec3 NIGHT = vec3(14.0, 17.0, 20.0) / 255.0;

  // drift.css .plate--road, rebuilt (y from the top): its gradient's stops, then the sun's glow
  vec3 roadPlate(vec2 q) {
    float h = uHorizon;
    float y = q.y;
    vec3 c = vec3(10.0, 13.0, 18.0) / 255.0;
    c = mix(c, vec3(24.0, 32.0, 44.0) / 255.0, clamp(y / max(h - 0.18, 1e-3), 0.0, 1.0));
    c = mix(c, vec3(111.0, 88.0, 72.0) / 255.0, clamp((y - h + 0.18) / 0.168, 0.0, 1.0));
    c = mix(c, vec3(180.0, 135.0, 102.0) / 255.0, clamp((y - h + 0.012) / 0.012, 0.0, 1.0));
    c = mix(c, vec3(58.0, 61.0, 65.0) / 255.0, clamp((y - h) / 0.004, 0.0, 1.0));
    c = mix(c, vec3(36.0, 39.0, 42.0) / 255.0, clamp((y - h - 0.004) / 0.176, 0.0, 1.0));
    c = mix(c, vec3(17.0, 19.0, 21.0) / 255.0, clamp((y - h - 0.18) / max(0.82 - h, 1e-3), 0.0, 1.0));
    vec2 e = (q - vec2(0.72, h)) / vec2(0.9, 0.38);
    return mix(c, vec3(222.0, 158.0, 104.0) / 255.0, 0.42 * (1.0 - clamp(length(e) / 0.62, 0.0, 1.0)));
  }

  // one of the studio's bars of light (.bar): its core and its glow
  vec3 softbox(vec2 q, float top, float inset, float strength) {
    float x = (q.x - inset) / (1.0 - 2.0 * inset);
    float along = smoothstep(0.0, 0.18, x) * (1.0 - smoothstep(0.82, 1.0, x));
    float core = 1.0 - smoothstep(0.0015, 0.003, abs(q.y - top - 0.002));
    float glow = exp(-pow((q.y - top - 0.002) / 0.022, 2.0)) * 0.22 * smoothstep(-0.1, 0.08, x) * (1.0 - smoothstep(0.92, 1.1, x));
    return vec3(0.957, 0.965, 0.973) * (core * along + glow) * strength;
  }

  // drift.css .plate--showroom, rebuilt
  vec3 showPlate(vec2 q) {
    float h = uHorizon;
    float y = q.y;
    vec3 c = vec3(15.0, 17.0, 20.0) / 255.0;
    c = mix(c, vec3(28.0, 31.0, 35.0) / 255.0, clamp(y / max(h - 0.005, 1e-3), 0.0, 1.0));
    c = mix(c, vec3(52.0, 56.0, 62.0) / 255.0, clamp((y - h + 0.005) / 0.005, 0.0, 1.0));
    c = mix(c, vec3(34.0, 37.0, 42.0) / 255.0, clamp((y - h) / 0.2, 0.0, 1.0));
    c = mix(c, vec3(19.0, 21.0, 24.0) / 255.0, clamp((y - h - 0.2) / max(0.8 - h, 1e-3), 0.0, 1.0));
    vec2 e = (q - vec2(0.55, h + 0.14)) / vec2(0.7, 0.3);
    c = mix(c, vec3(236.0, 238.0, 240.0) / 255.0, 0.12 * (1.0 - clamp(length(e) / 0.7, 0.0, 1.0)));
    return c + softbox(q, 0.09, 0.1, 1.0) + softbox(q, 0.14, 0.16, 0.75) + softbox(q, 0.185, 0.21, 0.55);
  }

  // the plates as the page stacks them: the road's fading out over the night, the showroom's in
  vec3 backdrop(vec2 q) {
    if (uPhase < 0.001) return roadPlate(q);
    if (uPhase > 0.999) return showPlate(q);
    return mix(mix(NIGHT, roadPlate(q), 1.0 - uPhase), showPlate(q), uPhase);
  }

  // what is behind the glass at uv: the scene's frame (premultiplied) over the plates, softened
  vec3 behind(vec2 uv, float blur) {
    vec4 s = texture2D(tScene, uv);
    if (blur > 0.0) {
      s += texture2D(tScene, uv + vec2(blur, 0.0));
      s += texture2D(tScene, uv - vec2(blur, 0.0));
      s += texture2D(tScene, uv + vec2(0.0, blur * uAspect));
      s += texture2D(tScene, uv - vec2(0.0, blur * uAspect));
      s *= 0.2;
    }
    return s.rgb + backdrop(vec2(uv.x, 1.0 - uv.y)) * (1.0 - s.a);
  }

  // the water's thickness: broad sheets and finer runs, sliding down the glass
  float relief(vec2 a) {
    return fbm(vec2(a.x * 2.2, a.y * 1.2 + uTime * 0.4)) + 0.3 * fbm(vec2(a.x * 5.5 + 3.1, a.y * 1.8 + uTime * 0.85));
  }

  // one layer of drops, on a grid turned by angle so they never line up: per cell maybe one, there
  // once the throw has reached it. xy its local position in its radii (+y up), z its mask, w its
  // radius (screen heights)
  vec4 drop(vec2 a, vec3 grid, float share, vec2 origin, vec3 state) {
    float cells = grid.x;
    float c = cos(grid.z);
    float s = sin(grid.z);
    vec2 p = mat2(c, s, -s, c) * a * cells;
    vec2 id = floor(p);
    float h1 = hash(id + grid.y);
    float h2 = hash(id + grid.y * 1.7 + 11.3);
    float h3 = hash(id + grid.y * 2.3 + 5.1);
    if (h3 > share) return vec4(0.0);
    vec2 centre = mat2(c, -s, s, c) * ((id + 0.5 + (vec2(h1, h2) - 0.5) * 0.44) / cells);
    float reach = state.x;
    if (length(centre - origin) > reach + (h2 - 0.5) * 0.25) return vec4(0.0);
    // the throw lands in gusts: clusters of drops and bare patches
    if (h1 > 0.35 + 0.9 * fbm(centre * 2.2 + grid.y)) return vec4(0.0);
    float r = mix(0.08, 0.27, pow(fract(h3 * 7.31), 2.2)); // most small, a few big
    // near the draining line a big drop runs: it stretches and slides down the glass
    float run = state.z * step(0.16, r) * (1.0 - smoothstep(0.0, 0.18, abs(a.y - state.y)));
    vec2 d = (a - centre) * cells / r;
    d.y = (d.y + run * 0.5) / (1.0 + run * 0.6);
    float wobble = 1.0 + 0.06 * sin(atan(d.y, d.x) * 3.0 + h2 * 6.283);
    float mask = 1.0 - smoothstep(0.88, 1.0, length(d * vec2(1.0, 1.08)) / wobble);
    return vec4(d, mask, r / cells);
  }

  // a drop on glass is a small lens: what is behind it, upside down and small, a dark rim where it
  // bends the light away, the light it gathers low inside and the sky's glint on its top
  vec4 dropOver(vec4 acc, vec2 uv, vec4 dr, float visible) {
    float m = dr.z * visible;
    if (m <= 0.0) return acc;
    vec2 d = dr.xy;
    float dist = length(d);
    vec3 seen = behind(uv - vec2(d.x / uAspect, d.y) * dr.w * 6.0, 0.0);
    seen *= 1.0 - 0.7 * smoothstep(0.6, 0.97, dist + 0.08 * d.y);
    seen += smoothstep(0.2, 0.85, -d.y) * (1.0 - smoothstep(0.5, 0.85, dist)) * 0.16 * vec3(1.0, 0.95, 0.86);
    vec2 g = d - vec2(-0.32, 0.45);
    seen += exp(-dot(g, g) / 0.016) * 0.85;
    return vec4(seen * m, m) + acc * (1.0 - m);
  }

  void main() {
    vec2 uv = vUv;
    vec2 a = vec2(uv.x * uAspect, uv.y);
    vec2 origin = vec2(uOrigin.x * uAspect, uOrigin.y);
    vec2 rel = a - origin;
    float r = length(rel);
    vec2 dir = rel / max(r, 1e-4);
    // the sheet bursts out from where the throw hit the glass: fast at first, fingers ahead
    float landed = step(0.0005, uHit);
    float spread = 1.0 - pow(1.0 - uHit, 2.4);
    float reach = spread * 1.75;
    float front = reach * (1.0 + 0.24 * (fbm(dir * 1.4 + 7.0) - 0.5) + 0.07 * (noise(dir * 8.0 + 2.0) - 0.5)
      + 0.05 * (noise(dir * 23.0 + 5.0) - 0.5));
    float sheet = smoothstep(front + 0.012, front - 0.012, r) * landed;
    // the drain line runs down from the top once the stage has turned, ragged where it runs faster
    float line = 1.08 - uClear * 1.35 + 0.035 * (fbm(vec2(a.x * 2.6, uClear * 3.0)) - 0.5) + 0.01 * (noise(vec2(a.x * 19.0, 4.0)) - 0.5);
    float drained = smoothstep(line - 0.035, line + 0.035, uv.y);
    float running = smoothstep(0.0, 0.05, uClear);
    float film = sheet * (1.0 - drained);
    // the relief of the water running down bends what is behind it, most along the thick front
    float h = relief(a);
    vec2 grad = vec2(relief(a + vec2(0.004, 0.0)) - h, relief(a + vec2(0.0, 0.004)) - h) / 0.004;
    float rim = exp(-pow((r - front + 0.02) / 0.022, 2.0)) * landed * (1.0 - drained);
    float thick = film * (0.5 + 0.5 * (1.0 - spread)) + rim;
    // the runs are tall: they bend the light sideways more than up and down
    vec2 bend = grad * vec2(0.012, 0.006) * thick - dir * rim * 0.02;
    bend.x /= uAspect;
    vec3 water = behind(uv + bend, (0.003 + 0.004 * thick) * film) * vec3(0.84, 0.92, 0.97);
    // the road's warm light low in it, before the stage turns
    water = mix(water, water * vec3(1.18, 0.96, 0.8), uWarm * (1.0 - uv.y) * 0.3);
    // the sky on its relief; its front is a meniscus: a thin dark line where it bends the light
    // away, a thinner lit one inside on the side that faces the sky
    vec3 n = normalize(vec3(-grad * 0.12, 1.0));
    float spec = pow(clamp(dot(n, normalize(vec3(-0.25, 0.35, 0.9))), 0.0, 1.0), 48.0);
    water += spec * 0.45 * film * vec3(0.95, 0.97, 1.0);
    float wet = landed * (1.0 - drained);
    water *= 1.0 - 0.5 * exp(-pow((r - front + 0.004) / 0.005, 2.0)) * wet;
    float facing = clamp(dot(-dir, normalize(vec2(-0.45, 0.9))), 0.0, 1.0);
    water += exp(-pow((r - front + 0.013) / 0.004, 2.0)) * facing * 0.3 * wet;
    vec4 acc = vec4(water * film, film);
    // the drops: thrown ahead of the sheet, part of it while it lies, left behind as it drains
    vec3 state = vec3(reach + 0.25, line, running);
    float visible = (1.0 - smoothstep(0.86, 1.0, uClear)) * (1.0 - 0.65 * film) * landed;
    acc = dropOver(acc, uv, drop(a, vec3(31.0, 1.3, 1.13), 0.75, origin, state), visible);
    acc = dropOver(acc, uv, drop(a, vec3(14.0, 9.1, -0.61), 0.62, origin, state), visible);
    acc = dropOver(acc, uv, drop(a, vec3(6.0, 3.7, 0.37), 0.5, origin, state), visible);
    // the light line riding the drain
    float glow = exp(-pow((uv.y - line) / 0.003, 2.0)) * running * (1.0 - smoothstep(0.9, 1.0, uClear)) * sheet * 0.6
      * (0.55 + 0.45 * noise(vec2(a.x * 7.0, 1.0)));
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * glow, glow) + acc * (1.0 - glow);
  }
`;

const COMPOSITE = /* glsl */ `
  uniform sampler2D tWater;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tWater, vUv); }
`;

export class WaterScreen {
  #target;
  #copy = null;
  #scale;
  #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  #waterScene = new THREE.Scene();
  #compositeScene = new THREE.Scene();
  #water;

  constructor(scale) {
    this.#scale = scale;
    this.#target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    const quad = new THREE.PlaneGeometry(2, 2);
    this.#water = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: WATER,
      uniforms: {
        tScene: { value: null },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uHit: { value: 0 },
        uClear: { value: 0 },
        uPhase: { value: 0 },
        uHorizon: { value: 0.4 },
        uWarm: { value: 1 },
        uOrigin: { value: new THREE.Vector2(0.3, 0.3) },
      },
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    const composite = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE,
      uniforms: { tWater: { value: this.#target.texture } },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    });
    this.#waterScene.add(new THREE.Mesh(quad, this.#water));
    this.#compositeScene.add(new THREE.Mesh(quad, composite));
  }

  /** Compiles both passes ahead: the water's program alone held the transition's first frame 0.8 s */
  warm(renderer) {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.#target);
    const water = renderer.compileAsync(this.#waterScene, this.#camera);
    renderer.setRenderTarget(previous);
    return Promise.all([water, renderer.compileAsync(this.#compositeScene, this.#camera)]);
  }

  /** The canvas's drawing buffer, in pixels */
  resize({ width, height }) {
    this.#target.setSize(Math.max(8, Math.round(width * this.#scale)), Math.max(8, Math.round(height * this.#scale)));
    this.#copy?.dispose();
    this.#copy = new THREE.FramebufferTexture(width, height);
    this.#copy.minFilter = THREE.LinearFilter;
    this.#copy.magFilter = THREE.LinearFilter;
    this.#water.uniforms.tScene.value = this.#copy;
    this.#water.uniforms.uAspect.value = width / height;
  }

  /**
   * Draws the glass over the frame the renderer has just drawn; does nothing while it is dry.
   * `hit` 0 → 1: the sheet spreads from `origin` (uv); `clear` 0 → 1: it drains; `phase`: road →
   * showroom; `horizon`: the plates' horizon from the top; `warm`: the road's light in the water.
   */
  render(renderer, { hit, clear, time, warm, phase, origin, horizon }) {
    if (hit <= 0.0005 || clear >= 0.999 || !this.#copy) return false;
    renderer.copyFramebufferToTexture(this.#copy);
    const uniforms = this.#water.uniforms;
    uniforms.uHit.value = hit;
    uniforms.uClear.value = clear;
    uniforms.uTime.value = time;
    uniforms.uWarm.value = warm;
    uniforms.uPhase.value = phase;
    uniforms.uHorizon.value = horizon;
    uniforms.uOrigin.value.copy(origin);
    renderer.setRenderTarget(this.#target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.#waterScene, this.#camera);
    renderer.setRenderTarget(null);
    renderer.render(this.#compositeScene, this.#camera);
    return true;
  }
}
