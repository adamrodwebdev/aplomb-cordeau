/**
 * What the paint reflects, drawn as two scenes of our own and turned into environment maps (PMREM):
 * - the studio of a car photographer: a dark room, a large overhead softbox, two long strip lights
 *   that draw the highlight lines along the flanks, a rim light behind, a dark floor;
 * - dawn on the road: a deep blue sky, a warm horizon, a low sun, dark asphalt.
 * The studio is drawn about the car's own axis (`SHOWROOM_HEADING`), so the strips follow its flanks.
 * The tonal arc (the user's choice of 2026-11-16) adds the same studio in three other lights (white
 * for the light theme, the warm workshop of the Six, the blue night of the E, with a Céladon strip
 * low on one side like a charging light) and dusk, a sky drawn like the dawn's with its sun opposite.
 *
 * The page does not draw them: PMREM compiles its blur programs on the main thread, one task of
 * about 0.5 s (2 s on Lighthouse's phone). `tools/bake-environments.mjs` draws them once into the
 * `environment-*.png` files the page reads (`Environments`). The page imports this module only if
 * those files cannot be read, to draw the same light itself.
 */
import * as THREE from 'three';
import { DEG } from '../rules/math.js';
import { SHOWROOM_HEADING } from '../rules/choreography.js';
import { DAWN_SUN, DUSK_SUN } from './Environments.js';

const ROOM_DROP = 1; // the probe sits 1 m above the floor, where the paint is

function panel(width, height, power, colour = 0xffffff) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(power), side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

/**
 * The studio's looks: the room and the floor (sRGB, as drawn), each light's colour and power. The
 * night studio is the showroom's own; the others are the arc's.
 */
const STUDIO = Object.freeze({
  showroom: { room: 0x0a0b0d, floor: 0x15171a, top: [0xffffff, 6], strip: [0xffffff, 14], high: [0xffffff, 7], fill: [0xffffff, 1.1], rim: [0xffffff, 8] },
  white: { room: 0xb2b5b9, floor: 0xd0d2d5, top: [0xffffff, 6], strip: [0xffffff, 10], high: [0xffffff, 6], fill: [0xffffff, 2.2], rim: [0xffffff, 6] },
  workshop: { room: 0x150d07, floor: 0x1d140d, top: [0xffd6ae, 4.5], strip: [0xffc68c, 10], high: [0xffc68c, 5], fill: [0xffe0c2, 1.2], rim: [0xff9a4c, 7] },
  night: { room: 0x03050b, floor: 0x070a13, top: [0xa8bcff, 2.6], strip: [0xa9c6ff, 9], high: [0x86a2ff, 4], fill: [0x9fb2ff, 0.6], rim: [0x4f7dff, 8], accent: [0x9fe3cb, 3] },
});

/** A strip light along the car's length (`light`: [colour, power]), `width` wide, at the side `x`, `y` up */
function strip([colour, power], { width, length, x, y }) {
  const mesh = panel(width, length, power, colour);
  mesh.rotation.z = Math.PI / 2;
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x, y, 0);
  return mesh;
}

function studioScene(heading, look) {
  const scene = new THREE.Scene();
  const rig = new THREE.Group();
  rig.rotation.y = heading;
  rig.position.y = -ROOM_DROP;
  scene.add(rig);
  const room = new THREE.Mesh(new THREE.BoxGeometry(36, 14, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.room), side: THREE.BackSide }));
  room.position.y = 7;
  rig.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.floor) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  rig.add(floor);
  // the overhead softbox, long like the car
  const top = panel(6, 12, look.top[1], look.top[0]);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 8.5, 0);
  rig.add(top);
  // the strips along both flanks: the photographer's highlight lines
  for (const side of [-1, 1]) {
    rig.add(strip(look.strip, { width: 0.5, length: 15, x: side * 7.5, y: 2.2 }));
    rig.add(strip(look.high, { width: 0.35, length: 13, x: side * 6.5, y: 4.6 }));
  }
  // the night's charging light, low on the left
  if (look.accent) rig.add(strip(look.accent, { width: 0.25, length: 11, x: -7.4, y: 0.7 }));
  // a soft fill ahead of the face, a rim light high behind the tail
  const fill = panel(9, 3, look.fill[1], look.fill[0]);
  fill.position.set(0, 2.6, -13);
  rig.add(fill);
  const rim = panel(10, 0.6, look.rim[1], look.rim[0]);
  rim.position.set(0, 6, 12);
  rig.add(rim);
  return scene;
}

/**
 * The dawn the page was judged with (linear colours): a dark navy zenith, a warm horizon, the sun's
 * glow, and the dark wet road below. A photographed sky is matched to it (tools/environmentBake.js).
 */
export const DAWN = Object.freeze({
  zenith: Object.freeze([0.016, 0.03, 0.075]),
  horizon: Object.freeze([1.0, 0.68, 0.46]),
  glow: Object.freeze([2.8, 1.65, 0.9]),
  ground: Object.freeze([0.012, 0.012, 0.014]),
  sunDisc: Object.freeze([60.0, 42.0, 26.0]), // the disc the paint's highlight shows, sharper than a photo's clipped sun
});

/**
 * Dusk at the finale (linear): a plum zenith, a soft terracotta horizon, the sun low opposite the
 * dawn's. Kept pale enough that the finale still shows the paint the visitor chose.
 */
export const DUSK = Object.freeze({
  zenith: Object.freeze([0.03, 0.02, 0.045]),
  horizon: Object.freeze([0.75, 0.47, 0.4]),
  glow: Object.freeze([1.6, 0.85, 0.55]),
  ground: Object.freeze([0.012, 0.01, 0.012]),
  sunDisc: Object.freeze([46.0, 26.0, 15.0]),
});

/** The drawn dawn sky in one direction (unit `d`, `sun`: arrays), without the sun's disc: as SKY_FRAGMENT draws it */
export function dawnSkyColour([x, y, z], [sx, sy, sz]) {
  const toSun = Math.max(x * sx + y * sy + z * sz, 0);
  const up = Math.min(Math.max(y, 0), 1) ** 0.42;
  const fade = 1 - Math.min(Math.max(y * 2.5, 0), 1);
  return [0, 1, 2].map((k) => DAWN.horizon[k] + (DAWN.zenith[k] - DAWN.horizon[k]) * up + DAWN.glow[k] * toSun ** 6 * fade);
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const GROUND_AND_SUN = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uSunDisc;
  varying vec3 vDir;
  vec3 ground(float y) { return mix(uHorizon * 0.18, uGround, clamp(-y * 7.0, 0.0, 1.0)); }
  vec3 disc(vec3 d) { return uSunDisc * smoothstep(0.9993, 0.9997, max(dot(d, uSun), 0.0)); }
`;
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uGlow;
  ${GROUND_AND_SUN}
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float toSun = max(dot(d, uSun), 0.0);
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.42));
    sky += uGlow * pow(toSun, 6.0) * (1.0 - clamp(y * 2.5, 0.0, 1.0));
    sky += disc(d);
    gl_FragColor = vec4(y >= 0.0 ? sky : ground(y), 1.0);
  }
`;
// a photographed sky (an equirectangular map, already matched to DAWN), turned so its sun stands at
// DAWN_SUN; the road below and the disc stay the drawn ones
const PHOTO_FRAGMENT = /* glsl */ `
  uniform sampler2D tSky;
  uniform float uTurn;
  ${GROUND_AND_SUN}
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec2 uv = vec2(fract(atan(d.z, d.x) * 0.15915494 + 0.5 - uTurn * 0.15915494), asin(clamp(y, -1.0, 1.0)) * 0.31830989 + 0.5);
    // one fixed level: a cube face's texel (256 for 90°) spans two of a 2K map's; a level chosen by
    // derivatives would blur a seam where the bearing wraps round
    vec3 sky = textureLod(tSky, uv, 1.0).rgb + disc(d);
    gl_FragColor = vec4(y >= 0.0 ? sky : ground(y), 1.0);
  }
`;

/** A sky with a low sun (`colours`: DAWN or DUSK), drawn, or from a photographed sky (`photo`: { texture, turn } from the bake tool) */
function skyScene(colours, sun, photo = null) {
  const scene = new THREE.Scene();
  const common = {
    uHorizon: { value: new THREE.Color(...colours.horizon) },
    uGround: { value: new THREE.Color(...colours.ground) },
    uSun: { value: sun },
    uSunDisc: { value: new THREE.Color(...colours.sunDisc) },
  };
  const material = photo
    ? new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: PHOTO_FRAGMENT,
      side: THREE.BackSide,
      uniforms: { ...common, tSky: { value: photo.texture }, uTurn: { value: photo.turn } },
    })
    : new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      uniforms: { ...common, uZenith: { value: new THREE.Color(...colours.zenith) }, uGlow: { value: new THREE.Color(...colours.glow) } },
    });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), material));
  return scene;
}

/** Each light's scene and the blur PMREM gives it (radians): the skies, the studio in its four lights */
const SCENES = new Map([
  ['road', { draw: (skies) => skyScene(DAWN, DAWN_SUN, skies.road ?? null), blur: 0.01 }],
  ['showroom', { draw: () => studioScene(SHOWROOM_HEADING * DEG, STUDIO.showroom), blur: 0.02 }],
  ['studio-white', { draw: () => studioScene(SHOWROOM_HEADING * DEG, STUDIO.white), blur: 0.02 }],
  ['workshop', { draw: () => studioScene(SHOWROOM_HEADING * DEG, STUDIO.workshop), blur: 0.02 }],
  ['night', { draw: () => studioScene(SHOWROOM_HEADING * DEG, STUDIO.night), blur: 0.02 }],
  ['dusk', { draw: () => skyScene(DUSK, DUSK_SUN), blur: 0.01 }],
]);

/**
 * Draws the environment maps of `names` (all by default) with PMREM (three r186: a 768 × 1024
 * half-float target in its cube-UV layout). `skies.road`: a photographed sky for the road (the bake
 * tool's), else the drawn dawn. Returns name → render target; the caller owns the targets. Slow: see above.
 */
export function drawEnvironments(renderer, skies = {}, names = [...SCENES.keys()]) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const targets = new Map();
  for (const name of names) {
    const scene = SCENES.get(name);
    if (scene) targets.set(name, pmrem.fromScene(scene.draw(skies), scene.blur));
  }
  pmrem.dispose();
  return targets;
}
