/**
 * The wet road at dawn: a film of water over the page's asphalt plate. Puddles mirror the car (a
 * planar reflection, on the high tier) and the warm horizon, wind ripples wobble them, and where
 * the tyres pushed the water aside (WetTraces' mask) the asphalt shows damp and matte, with a
 * bright meniscus along each edge. The plate stays the asphalt: this layer adds the water only.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { NOISE } from './glsl.js';

const VERTEX = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = textureMatrix * vec4(position, 1.0);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tTraces;
  uniform vec4 uTraceRect;
  uniform vec2 uTraceTexel;
  uniform float uTime;
  uniform float uReflect;
  uniform float uOpacity;
  uniform float uFadeFrom;
  uniform vec3 uSkyLow;
  uniform vec3 uSkyHigh;
  uniform vec3 color;
  varying vec4 vUv;
  varying vec3 vWorld;
  ${NOISE}
  float traceAt(vec2 uv) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(tTraces, uv).a;
  }
  void main() {
    vec2 p = vWorld.xz;
    float far = distance(cameraPosition.xz, p);
    // standing water in broad puddles, a thinner film between them
    float puddle = smoothstep(0.40, 0.66, fbm(p * 0.21 + vec2(3.1, 7.7)));
    float film = mix(0.5, 1.0, puddle);
    // wind ripples: slow, fine, stronger on the open puddles
    vec2 ripple = vec2(
      fbm(p * vec2(1.3, 2.6) + vec2(uTime * 0.22, 0.0)) - 0.5,
      fbm(p * vec2(2.4, 1.2) + vec2(5.3, -uTime * 0.17)) - 0.5);
    // the tyres' traces (and the words): the water pushed aside
    vec2 tuv = (p - uTraceRect.xy) / uTraceRect.zw + 0.5;
    float trace = traceAt(tuv);
    float around = 0.0;
    around += traceAt(tuv + vec2(uTraceTexel.x * 2.0, 0.0));
    around += traceAt(tuv - vec2(uTraceTexel.x * 2.0, 0.0));
    around += traceAt(tuv + vec2(0.0, uTraceTexel.y * 2.0));
    around += traceAt(tuv - vec2(0.0, uTraceTexel.y * 2.0));
    float rim = clamp(around * 0.25 - trace, 0.0, 1.0); // just outside a trace: the water's edge
    float water = film * (1.0 - trace);
    // water's Fresnel (n 1.33): little straight down, a mirror at grazing angles
    vec3 view = normalize(cameraPosition - vWorld);
    float cosT = clamp(view.y, 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    // the sky the water mirrors where nothing stands: the warm horizon low, the night above
    vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(0.02, 0.35, cosT));
    vec4 scene = vec4(0.0);
    if (uReflect > 0.5) {
      // fine wind ripples break a reflection into streaks down the road rather than bend it:
      // little across, more along, still in the puddles, rougher on the thin film between them
      vec4 at = vUv;
      vec2 fine = vec2(
        fbm(p * vec2(5.0, 11.0) + vec2(uTime * 0.5, 1.3)) - 0.5,
        fbm(p * vec2(9.0, 4.0) + vec2(7.1, -uTime * 0.4)) - 0.5);
      at.xy += (ripple * 0.35 + fine) * vec2(0.006, 0.016) * (0.45 + 1.1 * (1.0 - puddle)) * vUv.w;
      scene = texture2DProj(tDiffuse, at);
    }
    vec3 mirrored = mix(sky, scene.rgb, clamp(scene.a, 0.0, 1.0));
    float shine = water * fresnel * (0.75 + 0.5 * (ripple.x + ripple.y));
    float glint = water * scene.a * (0.45 + 0.35 * puddle);
    // damp asphalt in the traces: darker than the wet road, no mirror
    vec3 colour = mirrored;
    float alpha = max(shine, glint);
    colour = mix(colour, vec3(0.0), trace * 0.9);
    alpha = mix(alpha, 0.34, trace);
    // the water's edge along a trace catches the light
    colour = mix(colour, uSkyLow * 1.6 + 0.08, rim * 0.8);
    alpha = max(alpha, rim * 0.55);
    // far away the film melts into the plate's horizon
    alpha *= uOpacity * (1.0 - smoothstep(uFadeFrom, uFadeFrom * 1.6, far));
    gl_FragColor = vec4(colour * color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SHADER = Object.freeze({
  name: 'WetRoad',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tTraces: { value: null },
    uTraceRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uTraceTexel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
    uTime: { value: 0 },
    uReflect: { value: 1 },
    uOpacity: { value: 1 },
    uFadeFrom: { value: 28 },
    uSkyLow: { value: new THREE.Color(0.62, 0.42, 0.28) }, // the dawn's warm band, as the plate paints it
    uSkyHigh: { value: new THREE.Color(0.05, 0.07, 0.1) },
  },
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
});

export class WetRoad {
  #mesh;
  #reflector = null;
  #scale;

  /** `reflectScale`: the mirror pass's resolution against the canvas, 0 for none (phones) */
  constructor(reflectScale, size = 140) {
    this.#scale = reflectScale;
    const plane = new THREE.PlaneGeometry(size, size);
    if (reflectScale > 0) {
      this.#reflector = new Reflector(plane, { textureWidth: 4, textureHeight: 4, clipBias: 0.003, shader: SHADER, color: 0xffffff });
      this.#mesh = this.#reflector;
    } else {
      const material = new THREE.ShaderMaterial({
        name: SHADER.name,
        uniforms: THREE.UniformsUtils.clone(SHADER.uniforms),
        vertexShader: SHADER.vertexShader,
        fragmentShader: SHADER.fragmentShader,
      });
      material.uniforms.color.value = new THREE.Color(0xffffff);
      material.uniforms.textureMatrix.value = new THREE.Matrix4();
      material.uniforms.uReflect.value = 0;
      this.#mesh = new THREE.Mesh(plane, material);
    }
    const material = this.#mesh.material;
    material.transparent = true;
    material.depthWrite = false;
    this.#mesh.rotation.x = -Math.PI / 2;
    this.#mesh.renderOrder = 1;
  }

  get object() {
    return this.#mesh;
  }

  /** The traces' mask and where it lies: WetTraces.texture and .rect */
  useTraces(texture, [cx, cz, sx, sz]) {
    const uniforms = this.#mesh.material.uniforms;
    uniforms.tTraces.value = texture;
    uniforms.uTraceRect.value.set(cx, cz, sx, sz);
    uniforms.uTraceTexel.value.set(1 / texture.image.width, 1 / texture.image.height);
  }

  /**
   * Compiles the mirror pass's programs ahead: drawn into a target, every material takes another
   * program (no tone mapping), which the first frame otherwise compiled in one long task.
   */
  warm(renderer, { object, camera, scene }) {
    if (!this.#reflector) return Promise.resolve();
    const previous = renderer.getRenderTarget();
    const shown = this.#reflector.visible; // hidden in the showroom: it must stay so
    renderer.setRenderTarget(this.#reflector.getRenderTarget());
    this.#reflector.visible = false; // the mirror never draws itself
    const ready = renderer.compileAsync(object, camera, scene);
    this.#reflector.visible = shown;
    renderer.setRenderTarget(previous);
    return ready;
  }

  resize({ width, height }) {
    if (!this.#reflector) return;
    this.#reflector.getRenderTarget().setSize(Math.max(8, Math.round(width * this.#scale)), Math.max(8, Math.round(height * this.#scale)));
  }

  update(time, opacity) {
    const uniforms = this.#mesh.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.#reflector?.dispose();
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }
}
