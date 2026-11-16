/**
 * The water the tyres throw: one instanced quad per particle, its age taken from the drift's
 * progress, so scrolling back rewinds the spray into the tyres.
 * - kind 0, droplets: ballistic, drawn as their 1/40 s streak, a few catching the low sun; one in
 *   a few rings the water where it falls.
 * - kind 1, mist: thin, lit from behind, slowed by the air and gone in a second (smoke lingers).
 * - kind 3, the sheet thrown at the visitor: each drop flies an arc from the tyre to its point on
 *   the lens and is gone there, where the water screen takes over. The arcs are worked out with the
 *   main camera, so the mirror pass draws the same ones.
 * The lens is focused on the car: what flies close to it spreads into a soft disc, as drops do in
 * front of a real lens.
 */
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const VERTEX = /* glsl */ `
  uniform float uU;
  uniform float uSeconds;
  uniform float uFade;
  uniform float uRingShare;
  uniform mat4 uAimViewProj;
  uniform vec3 uLensCentre;
  uniform vec3 uLensRight;
  uniform vec3 uLensUp;
  uniform float uFocus;
  uniform float uAperture;
  attribute vec3 aOrigin;
  attribute vec3 aVelocity; // m/s; the sheet's: aim x, aim y (half-screens from the tyre), flight s
  attribute vec4 aData; // birth u, life s, radius m, kind
  attribute float aSeed;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying float vSoft;
  varying float vStretch;
  const vec3 G = vec3(0.0, -9.81, 0.0);
  const float RING = 0.3; // how long a fallen drop's ring spreads on the water, s
  const float EXPOSURE = 0.025; // a droplet is drawn as its travel in 1/40 s
  void hide() {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
  }
  void main() {
    float t = (uU - aData.x) * uSeconds;
    float life = aData.y;
    float radius = aData.z;
    float kind = aData.w;
    vUv = uv;
    vSeed = aSeed;
    vKind = kind;
    vSoft = 0.0;
    vStretch = 1.0;
    if (t <= 0.0) { hide(); return; }
    bool mist = kind > 0.5 && kind < 1.5;
    bool sheet = kind > 2.5;
    vec3 pos;
    vec3 vel;
    if (sheet) {
      // a ballistic arc from the tyre to its point on the glass
      vec4 clip = uAimViewProj * vec4(aOrigin, 1.0);
      vec2 from = clamp(clip.xy / max(clip.w, 0.05), vec2(-1.3), vec2(1.3));
      vec2 aim = clamp(from + aVelocity.xy, vec2(-1.1), vec2(1.1));
      vec3 target = uLensCentre + uLensRight * aim.x + uLensUp * aim.y;
      vec3 launch = (target - aOrigin) / life - 0.5 * G * life;
      pos = aOrigin + launch * t + 0.5 * G * t * t;
      vel = launch + G * t;
    } else if (mist) {
      float drag = 2.6;
      pos = aOrigin + aVelocity * (1.0 - exp(-drag * t)) / drag + vec3(0.0, 0.12 * t, 0.0);
      vel = aVelocity * exp(-drag * t);
    } else {
      pos = aOrigin + aVelocity * t + 0.5 * G * t * t;
      vel = aVelocity + G * t;
      if (pos.y < 0.0) {
        // fallen: one drop in a few rings the water where it landed
        float vy = aVelocity.y;
        float landed = (vy + sqrt(vy * vy + 2.0 * 9.81 * aOrigin.y)) / 9.81;
        float age = t - landed;
        if (aSeed > uRingShare || age >= RING || landed >= life) { hide(); return; }
        vec3 at = aOrigin + aVelocity * landed;
        float spread = mix(0.02, 0.16, sqrt(age / RING)) * clamp(radius / 0.01, 0.7, 1.3);
        // v runs away from the camera so the quad faces up: seen from above, culled from below
        vec3 world = vec3(at.x, 0.006, at.z) + vec3(uv.x - 0.5, 0.0, 0.5 - uv.y) * spread * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
        vKind = 2.0;
        vAlpha = uFade * (1.0 - age / RING);
        return;
      }
    }
    if (t >= life) { hide(); return; }
    vec4 view = modelViewMatrix * vec4(pos, 1.0);
    vec3 v = (modelViewMatrix * vec4(vel, 0.0)).xyz;
    float k = t / life;
    float size = mist ? radius * (0.6 + 0.9 * k) : radius;
    // out of focus: the same light spread over a larger disc
    float depth = max(-view.z, 0.05);
    float blur = 0.5 * uAperture * abs(depth - uFocus) / uFocus;
    float spread = mist ? size : sqrt(size * size + blur * blur);
    float sharp = size / spread;
    vSoft = 1.0 - sharp;
    float speed = length(v.xy);
    vec2 dir = speed > 1e-4 ? v.xy / speed : vec2(0.0, 1.0);
    // (side, dir) must keep the quad's own handedness, or the billboard turns its back and is culled
    vec2 side = vec2(dir.y, -dir.x);
    float across = 2.0 * spread;
    float along = mist ? across : across + speed * EXPOSURE;
    vStretch = along / across;
    vec2 corner = uv - 0.5;
    view.xy += dir * corner.y * along + side * corner.x * across;
    gl_Position = projectionMatrix * view;
    float shown = mist
      ? smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.25, 1.0, k))
      : smoothstep(0.0, 0.04, k) * (sheet ? 1.0 : 1.0 - smoothstep(0.8, 1.0, k));
    // a blurred drop spreads its light over a larger disc, a fast one over its streak
    vAlpha = uFade * shown * max(sharp * sharp, 0.05) * clamp(1.6 / vStretch, 0.15, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uGlint;
  uniform vec3 uBody;
  uniform vec3 uMist;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying float vSoft;
  varying float vStretch;
  ${NOISE}
  void main() {
    if (vAlpha <= 0.0) discard;
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    if (vKind < 0.5 || vKind > 2.5) {
      // a drop: its motion blur, a capsule brightest at its head, where the lens is sharp; a soft
      // disc with a brighter rim where it is not
      vec2 s = vec2(q.x, q.y * vStretch);
      float d = length(vec2(s.x, max(abs(s.y) - (vStretch - 1.0), 0.0)));
      float shape = 1.0 - smoothstep(mix(0.4, 0.75, vSoft), 1.0, d);
      float rim = vSoft * smoothstep(0.55, 0.95, d) * shape;
      float lit = step(0.7, fract(vSeed * 7.13)); // a third catch the low sun, the rest the dark sky
      float head = smoothstep(-vStretch, vStretch, s.y);
      vec3 tint = mix(uBody, uGlint, clamp(0.15 + 0.6 * head * lit + 0.5 * rim, 0.0, 1.0));
      float a = shape * vAlpha * (0.3 + 0.5 * lit) * mix(0.55, 1.0, head);
      if (a < 0.006) discard;
      gl_FragColor = vec4(tint, a);
    } else if (vKind < 1.5) {
      // mist, thin: seen only where the low sun behind it catches it
      float n = fbm(vUv * 4.2 + vSeed * 13.0);
      float shape = 1.0 - smoothstep(0.15, 1.0, r + (n - 0.5) * 0.9);
      float a = shape * vAlpha * 0.07;
      if (a < 0.003) discard;
      gl_FragColor = vec4(uMist, a);
    } else {
      // a ring on the water: a thin crest, broken where the drop's splash was uneven
      float broken = 0.45 + 0.55 * noise(q / max(r, 1e-3) * 2.5 + vSeed * 9.0);
      float crest = exp(-pow((r - 0.8) / 0.07, 2.0)) * broken;
      float a = crest * vAlpha * 0.3;
      if (a < 0.004) discard;
      gl_FragColor = vec4(mix(uMist, uGlint * 0.8, 0.4), a);
    }
    // the scene's tone mapping and output colour space, as every lit thing in it gets
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SprayField {
  #mesh;
  #material;
  #ahead = new THREE.Vector3();

  /** `seconds`: the drift's length on its clock; `ringShare`: SPRAY's; `aperture`: SURGE's */
  constructor(particles, { seconds, ringShare, aperture }) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    const origin = new Float32Array(particles.length * 3);
    const velocity = new Float32Array(particles.length * 3);
    const data = new Float32Array(particles.length * 4);
    const seed = new Float32Array(particles.length);
    particles.forEach((particle, i) => {
      origin.set(particle.origin, i * 3);
      velocity.set(particle.velocity, i * 3);
      data.set([particle.birth, particle.life, particle.size, particle.kind], i * 4);
      seed[i] = particle.seed;
    });
    geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    geometry.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(velocity, 3));
    geometry.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geometry.instanceCount = particles.length;
    this.#material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uU: { value: 0 },
        uSeconds: { value: seconds },
        uFade: { value: 1 },
        uRingShare: { value: ringShare },
        uAimViewProj: { value: new THREE.Matrix4() },
        uLensCentre: { value: new THREE.Vector3() },
        uLensRight: { value: new THREE.Vector3(1, 0, 0) },
        uLensUp: { value: new THREE.Vector3(0, 1, 0) },
        uFocus: { value: 9 },
        uAperture: { value: aperture },
        uGlint: { value: new THREE.Color(1.6, 1.42, 1.18) }, // the low sun in a droplet, above white
        uBody: { value: new THREE.Color(0.24, 0.27, 0.3) }, // water against the dark: barely there
        uMist: { value: new THREE.Color(0.7, 0.68, 0.64) }, // warmed by the sun behind it
      },
      transparent: true,
      depthWrite: false,
    });
    this.#mesh = new THREE.Mesh(geometry, this.#material);
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = 10;
  }

  get object() {
    return this.#mesh;
  }

  /** The main camera: the sheet flies at its glass, `lens` metres ahead; it is focused `focus` away */
  aimAt(camera, { lens, focus }) {
    camera.updateMatrixWorld();
    const uniforms = this.#material.uniforms;
    uniforms.uAimViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    camera.getWorldDirection(this.#ahead);
    const centre = this.#onGlass(camera, [0, 0], lens, uniforms.uLensCentre.value);
    this.#onGlass(camera, [1, 0], lens, uniforms.uLensRight.value).sub(centre);
    this.#onGlass(camera, [0, 1], lens, uniforms.uLensUp.value).sub(centre);
    uniforms.uFocus.value = focus;
  }

  update(u, fade) {
    const uniforms = this.#material.uniforms;
    uniforms.uU.value = u;
    uniforms.uFade.value = fade;
    this.#mesh.visible = fade > 0.001 && u > 0;
  }

  dispose() {
    this.#mesh.geometry.dispose();
    this.#material.dispose();
  }

  /** The point `lens` metres ahead of the camera that shows at [x, y] on screen (NDC) */
  #onGlass(camera, [x, y], lens, out) {
    out.set(x, y, 0.5).unproject(camera).sub(camera.position);
    out.multiplyScalar(lens / out.dot(this.#ahead));
    return out.add(camera.position);
  }
}
