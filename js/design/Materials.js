/**
 * Real-time looks for the pass-7 master's Cycles materials, found by name, and the layers three.js
 * lacks out of the box:
 * - paint: metallic flakes under the clear coat, and a faint orange peel on the coat itself;
 * - the ambient occlusion baked in Blender into each vertex (attribute `aoVertex`), applied to the
 *   indirect light only, as a real AO map would be;
 * - the tyres' tread, the discs' drilling and the wood's open grain, drawn in each part's own frame
 *   (the master has no UVs);
 * - glass that keeps its whole reflection and lets the cabin through, and the black ceramic frit
 *   printed round the bonded panes (from each pane's distance to its edge, `aEdge`).
 *
 * The GLB's positions arrive quantized (KHR_mesh_quantization): each mesh fits in [-1, 1] and its
 * node scales it back. `vMetric` undoes that with the mesh's own scale, so every pattern is drawn in
 * metres, the same size on a door as on a wing.
 */
import * as THREE from 'three';

const NOISE = /* glsl */ `
  vec3 aplombHash33(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yxz + 19.19);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float aplombHash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float aplombNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(aplombHash13(i), aplombHash13(i + vec3(1, 0, 0)), f.x), mix(aplombHash13(i + vec3(0, 1, 0)), aplombHash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(aplombHash13(i + vec3(0, 0, 1)), aplombHash13(i + vec3(1, 0, 1)), f.x), mix(aplombHash13(i + vec3(0, 1, 1)), aplombHash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

/* The flakes (2.4 mm cells, the size the pass-6 car was judged with) show only where a pixel is
   smaller than a cell: at the showroom's distance one random cell per pixel drew a sandy grain over
   the whole car. Farther away they average out, as real flakes do, into the paint's metallic flop. */
const FLAKES = /* glsl */ `
  { float footprint = length(fwidth(vMetric));
    float seen = 1.0 - smoothstep(0.0013, 0.0055, footprint);
    if (seen > 0.0) {
      vec3 jitter = aplombHash33(floor(vMetric * 410.0)) * 2.0 - 1.0;
      normal = normalize(normal + jitter * 0.022 * seen * uFlake);
    } }
`;
const ORANGE_PEEL = /* glsl */ `
  #ifdef USE_CLEARCOAT
  { vec3 p = vMetric * 11.8; vec3 g = vec3(aplombNoise(p), aplombNoise(p + 9.2), aplombNoise(p + 4.4)) - 0.5; clearcoatNormal = normalize(clearcoatNormal + g * 0.014); }
  #endif
`;
/* The tyre's own frame: the axle along X, the tread past 0.38 m. Four circumferential grooves and
   sipes on the shoulders; the sidewall's lettering is real geometry on this car. */
const TREAD = /* glsl */ `
  {
    float r = length(vMetric.yz);
    float a = atan(-vMetric.z, vMetric.y);
    if (abs(vLocalNormal.x) < 0.5 && r > 0.38) {
      float w = abs(vMetric.x);
      float groove = max(1.0 - smoothstep(0.004, 0.007, abs(w - 0.035)), 1.0 - smoothstep(0.004, 0.007, abs(w - 0.088)));
      float sipe = (1.0 - smoothstep(0.0015, 0.003, abs(fract(a * 11.0) - 0.5) * 0.11)) * step(0.1, w);
      float cut = max(groove, sipe * 0.7);
      diffuseColor.rgb *= 1.0 - 0.75 * cut;
      roughnessFactor = mix(roughnessFactor, 0.95, cut);
    }
  }
`;
/* Cross-drilled friction ring: three rings of 36 holes between 122 and 179 mm */
const DISC = /* glsl */ `
  {
    float r = length(vMetric.yz);
    float a = atan(vMetric.z, vMetric.y);
    float ring = floor((r - 0.122) / 0.019);
    float k = fract(a * 36.0 / 6.2831853 + ring * 0.33);
    vec2 cell = vec2((k - 0.5) * r * 6.2831853 / 36.0, mod(r - 0.122, 0.019) - 0.0095);
    float hole = (ring >= 0.0 && ring < 3.0) ? 1.0 - smoothstep(0.0032, 0.0045, length(cell)) : 0.0;
    diffuseColor.rgb *= 1.0 - 0.9 * hole;
    roughnessFactor = mix(roughnessFactor, 1.0, hole);
    metalnessFactor = mix(metalnessFactor, 0.0, hole);
  }
`;
/* Open-pore wood under a satin lacquer: growth rings every 4.5 mm across `uGrainAxis`, barely wavy,
   thin darker late-wood lines, open pores, a slow drift in tone. `uGrain` 0 leaves the plain
   material (the brushed aluminium inlay). The rings fade to their mean below about two pixels. */
const WOOD = /* glsl */ `
  {
    float across = dot(vMetric, uGrainAxis);
    // walnut (uFigure 1): the bands bend into a cathedral figure, closer and darker, larger pores
    float along = length(vMetric - uGrainAxis * across);
    float bend = sin(along * 22.0 + aplombNoise(vMetric * 4.0) * 3.0) * 0.004 * uFigure;
    float bands = (across + bend + (aplombNoise(vMetric * 7.0) - 0.5) * 0.006) * mix(222.0, 300.0, uFigure);
    float band = fract(bands);
    float late = smoothstep(0.0, 0.06, band) * (1.0 - smoothstep(0.14, mix(0.3, 0.45, uFigure), band));
    float pore = step(mix(0.94, 0.9, uFigure), aplombHash13(floor(vMetric * mix(1400.0, 900.0, uFigure))));
    float seen = 1.0 - smoothstep(0.3, 0.7, fwidth(bands));
    vec3 base = diffuseColor.rgb * (0.9 + 0.2 * aplombNoise(vMetric * 3.0));
    vec3 grained = base * (1.0 - mix(0.38, 0.55, uFigure) * late) * (1.0 - mix(0.18, 0.35, uFigure) * pore);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(base * 0.93, grained, seen), uGrain);
  }
`;

/* A surface's own plane for the cabin's patterns (it has no UVs): the plane square to its dominant
   local axis. The seats' inserts face forward or up, the doors' inserts and grilles sideways.
   aplombBump tilts the normal by a height in metres (Mikkelsen's surface gradient, as three's
   bump maps do), so a 0.3 mm hole reads as deep as it is. */
const SURFACE = /* glsl */ `
  vec2 aplombPlane(vec3 p, vec3 n) {
    vec3 a = abs(n);
    if (a.x >= a.y && a.x >= a.z) return p.zy;
    if (a.y >= a.z) return p.xz;
    return p.xy;
  }
  vec3 aplombBump(vec3 n, float h) {
    vec3 dpdx = dFdx(-vViewPosition);
    vec3 dpdy = dFdy(-vViewPosition);
    vec3 r1 = cross(dpdy, n);
    vec3 r2 = cross(n, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * n - grad);
  }
  float aplombGrain(vec2 q) {
    return aplombNoise(vec3(q * 1700.0, 0.0)) * 0.6 + aplombNoise(vec3(q * 4100.0, 7.0)) * 0.4;
  }
`;

/* Perforated Nappa on the inserts (uLeather 1 with the leather trims; the wool keeps its sheen):
   a pebble grain of about 0.6 mm and 1 mm holes on a 3.2 mm diamond pitch, each shown only while
   it is larger than a pixel; farther, the holes average into a slightly darker hide */
const UPHOLSTERY = /* glsl */ `
  if (uLeather > 0.001) {
    vec2 q = aplombPlane(vMetric, vLocalNormal);
    float grainSeen = 1.0 - smoothstep(0.4, 0.9, length(fwidth(q * 1700.0)));
    vec2 d = vec2(q.x + q.y, q.x - q.y) * (0.70710678 / 0.0032);
    float r = length(fract(d) - 0.5) * 0.0032;
    float aa = length(fwidth(d)) * 0.0032;
    float hole = 1.0 - smoothstep(0.0005 - aa, 0.0005 + aa, r);
    float holeSeen = 1.0 - smoothstep(0.35, 0.7, length(fwidth(d)));
    normal = aplombBump(normal, (aplombGrain(q) * 0.00004 * grainSeen - hole * 0.0003 * holeSeen) * uLeather);
    diffuseColor.rgb *= 1.0 - uLeather * mix(0.06, 0.85 * hole, holeSeen);
  }
`;

/* The leather bolsters' soft creases where the body slides in (the user's choice of 2026-11-15:
   natural folds, no wear): fine wrinkles a few millimetres apart, long across the bolster and
   short along it, in patches, 0.12 mm deep, with the pebble grain. Folds 2 cm wide and 0.7 mm deep
   read as melted wax, wrinkles 0.2 mm deep as crackle. */
const CREASE = /* glsl */ `
  if (uLeather > 0.001) {
    vec2 q = aplombPlane(vMetric, vLocalNormal);
    float grainSeen = 1.0 - smoothstep(0.4, 0.9, length(fwidth(q * 1700.0)));
    vec3 s = vMetric * vec3(14.0, 170.0, 170.0);
    float ridge = 1.0 - abs(2.0 * aplombNoise(s) - 1.0);
    float zone = smoothstep(0.55, 0.85, aplombNoise(vMetric * vec3(5.0, 22.0, 22.0))); // 'patch' is reserved in GLSL ES 3
    float seen = 1.0 - smoothstep(0.5, 1.0, length(fwidth(s)));
    float crease = pow(ridge, 10.0) * zone * 0.00012 * seen;
    normal = aplombBump(normal, (aplombGrain(q) * 0.00004 * grainSeen + crease) * uLeather);
  }
`;

/* Soft-touch vinyl's grain on the doors' tops: 0.8 mm cells over a finer noise */
const PEBBLE = /* glsl */ `
  {
    vec2 q = aplombPlane(vMetric, vLocalNormal);
    float grain = aplombNoise(vec3(q * 1250.0, 3.0)) * 0.7 + aplombNoise(vec3(q * 5000.0, 9.0)) * 0.3;
    normal = aplombBump(normal, grain * 0.00005 * (1.0 - smoothstep(0.4, 0.9, length(fwidth(q * 1250.0)))));
  }
`;

/* Cut-pile carpet on the floor and the mats (the user, 2026-11-18: the car had carpets but no real
   flooring): tufts about 2 mm apart standing 0.4 mm proud, a fleck of lighter and darker fibres, and
   clumps of pile about 7 mm across that still read at a grazing view (the door shot looks along the
   floor, where the tufts alone faded out), and a slow drift in tone where the pile lies differently;
   each fades to its mean below about a pixel. The material's sheen stays the pile's glow. */
const CARPET = /* glsl */ `
  {
    vec2 q = aplombPlane(vMetric, vLocalNormal);
    float tuft = aplombNoise(vec3(q * 520.0, 5.0)) * 0.65 + aplombNoise(vec3(q * 1400.0, 11.0)) * 0.35;
    float seen = 1.0 - smoothstep(0.35, 0.8, length(fwidth(q * 520.0)));
    float clump = aplombNoise(vec3(q * 140.0, 23.0));
    float clumpSeen = 1.0 - smoothstep(0.4, 0.9, length(fwidth(q * 140.0)));
    normal = aplombBump(normal, tuft * 0.0004 * seen + clump * 0.0006 * clumpSeen);
    float fleck = aplombNoise(vec3(q * 900.0, 17.0));
    float drift = aplombNoise(vMetric * 9.0);
    diffuseColor.rgb *= (0.93 + 0.14 * drift) * mix(1.0, 0.8 + 0.4 * fleck, seen) * mix(1.0, 0.86 + 0.28 * clump, clumpSeen);
  }
`;

/* The hidden vent's micro-louvres: fins across the slot every 2.4 mm, a dark gap between */
const LOUVRE = /* glsl */ `
  {
    float t = vMetric.x / 0.0024;
    float fin = 0.5 + 0.5 * cos(6.2831853 * t);
    float seen = 1.0 - smoothstep(0.3, 0.6, fwidth(t));
    diffuseColor.rgb *= mix(0.55, 0.25 + 0.95 * fin, seen);
    roughnessFactor = mix(roughnessFactor, mix(0.9, 0.5, fin), seen);
  }
`;

/* Heat where the exhaust and the turbos run hot (the engine's "Épure", the user's choice of
   2026-11-15): an amber glow strongest at grazing angles, as hot metal reads, `uHeat` 0 to 1 */
const HEAT = /* glsl */ `
  {
    float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += uHeat * vec3(1.0, 0.42, 0.1) * (0.25 + 0.75 * rim * rim);
  }
`;

/* The speakers' hexagonal micro-perforation: a 2 mm pitch, holes shrinking from 1.1 mm at the
   grille's centre to 0.5 mm at its rim; farther, the open share darkens the metal */
const HEXPERF = /* glsl */ `
  {
    vec2 p = aplombPlane(vMetric, vLocalNormal);
    vec2 q = vec2(p.x / 0.002, p.y / 0.0034641);
    float d = min(length((fract(q) - 0.5) * vec2(1.0, 1.7320508)), length((fract(q + 0.5) - 0.5) * vec2(1.0, 1.7320508))) * 0.002;
    float rad = 0.00055 - 0.0003 * clamp(length(p) / 0.062, 0.0, 1.0);
    float aa = length(fwidth(q)) * 0.002;
    float hole = 1.0 - smoothstep(rad - aa, rad + aa, d);
    float open = mix(0.18, hole, 1.0 - smoothstep(0.35, 0.7, length(fwidth(q))));
    diffuseColor.rgb *= 1.0 - 0.95 * open;
    metalnessFactor = mix(metalnessFactor, 0.0, open);
    roughnessFactor = mix(roughnessFactor, 1.0, open);
  }
`;

/* Carbon: a 2/2 twill of 6 mm tows on the bias across the surface's own plane (the engine cover's
   top, the inlays' strips facing the cabin), each tow over two and under two; the tows of one
   direction catch more light than the other's, each rounded across its width. Below about a pixel
   a cell fades to its mean. `uWeave` 0 leaves the plain finish (brass, graphite, the woods) */
const WEAVE = /* glsl */ `
  {
    vec2 plane = aplombPlane(vMetric, vLocalNormal);
    vec2 q = vec2(plane.x + plane.y, plane.x - plane.y) * 118.0;
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float over = step(mod(cell.x + cell.y, 4.0), 1.5);
    float across = over > 0.5 ? f.x : f.y;
    float tone = mix(0.68, 1.0, over) * (0.6 + 0.4 * sin(3.14159 * across));
    float seen = 1.0 - smoothstep(0.35, 0.75, length(fwidth(q)));
    diffuseColor.rgb *= mix(1.0, mix(0.84, 0.45 + 0.8 * tone, seen), uWeave);
    roughnessFactor = mix(roughnessFactor, mix(roughnessFactor, roughnessFactor * (1.45 - 0.75 * tone), seen), uWeave);
  }
`;

/* A screen's picture (CabinScreens' canvas) laid on its glass: the rectangle CarRig measured in the
   mesh's metric frame, lit with the light blade */
const SCREEN = /* glsl */ `
  { vec2 suv = vec2(dot(vMetric - uScreenOrigin, uScreenU), dot(vMetric - uScreenOrigin, uScreenV)) + 0.5;
    if (uScreenLevel > 0.0 && suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0)
      totalEmissiveRadiance += texture2D(uScreen, suv).rgb * uScreenLevel; }
`;

/* The frit: opaque black ceramic `uFrit.x` wide round a bonded pane, fading out over `uFrit.y` (the
   halftone of the real print is finer than a pixel here) */
const FRIT_COLOUR = /* glsl */ `
  float aplombFrit = 1.0 - smoothstep(uFrit.x, uFrit.x + uFrit.y, vEdge);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008, 0.008, 0.009), aplombFrit);
  diffuseColor.a = mix(diffuseColor.a, 1.0, aplombFrit);
`;
const FRIT_ROUGHNESS = /* glsl */ `
  roughnessFactor = mix(roughnessFactor, 0.32, aplombFrit);
`;

/* Only real cavities darken (arches, intakes, sills, the underbody): on a low-poly panel the
   darkness of a 3 mm shut line spread across whole triangles and soiled the doors. With `lift` (the
   engine's parts) the occlusion fades as they come apart: it was baked assembled, and the faces an
   exploded view reveals (the block's deck under the head, the head's ports) came out black. */
const occlusion = (lift) => /* glsl */ `
  float aplombAo = ${lift ? 'mix(smoothstep(0.12, 0.6, vAo), 1.0, uAoLift)' : 'smoothstep(0.12, 0.6, vAo)'};
  reflectedLight.indirectDiffuse *= aplombAo;
  reflectedLight.indirectSpecular *= mix(1.0, aplombAo, 0.9);
  reflectedLight.directDiffuse *= mix(1.0, aplombAo, 0.45);
  #ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= mix(1.0, aplombAo, 0.9);
  #endif
`;

/**
 * Layers a material with paint, tread, disc, wood or screen details and the occlusion; one shader
 * program per combination. `wood` is the axis the growth rings cross ('x', 'y' or 'z'); `screen`
 * the uniforms of a screen's picture (`material.userData.screen`); `weave` the carbon twill;
 * `lift` a uniform (0 to 1) that fades the baked occlusion, shared by the parts that come apart.
 * The cabin's (the brief of 2026-11-15): `upholstery` perforated Nappa and `crease` the bolsters'
 * folds (both under `leather`, which CarLook eases), `pebble` the vinyl's grain, `louvre` the
 * hidden vent, `perforation` the grilles, `carpet` the floor's and the mats' pile; the wood's
 * `figure` (CarLook) turns ash into walnut.
 */
export function dress(material, {
  paint = false, tread = false, disc = false, wood = '', screen = null, frit = null, weave = false, lift = null,
  upholstery = false, crease = false, pebble = false, louvre = false, perforation = false, carpet = false, heat = null,
  ao = true,
}) {
  const flags = { paint, tread, disc, wood: Boolean(wood), screen: Boolean(screen), frit: Boolean(frit), weave, lift: Boolean(lift), upholstery, crease, pebble, louvre, perforation, carpet, heat: Boolean(heat), ao };
  const key = `aplomb7-${Object.entries(flags).filter(([, on]) => on).map(([name]) => name).join('-')}`;
  const leather = upholstery || crease;
  const surface = leather || pebble || perforation || weave || carpet; // the twill lies on the surface's plane too
  if (leather) material.userData.leather = { value: 0 };
  if (weave) material.userData.weave = { value: 0 };
  if (paint) material.userData.flake = { value: 1 };
  if (wood) {
    material.userData.grain = { value: 1 };
    material.userData.figure = { value: 0 };
    material.userData.grainAxis = { value: new THREE.Vector3(wood === 'x' ? 1 : 0, wood === 'y' ? 1 : 0, wood === 'z' ? 1 : 0) };
  }
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aoVertex;\nvarying float vAo;\nvarying vec3 vMetric;\nvarying vec3 vLocalNormal;${frit ? '\nattribute float aEdge;\nvarying float vEdge;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvAo = aoVertex;\nvMetric = position * length(modelMatrix[0].xyz);\nvLocalNormal = normal;${frit ? '\nvEdge = aEdge;' : ''}`);
    let fragment = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vAo;\nvarying vec3 vMetric;\nvarying vec3 vLocalNormal;\n${paint ? 'uniform float uFlake;' : ''}\n${wood ? 'uniform float uGrain;\nuniform float uFigure;\nuniform vec3 uGrainAxis;' : ''}\n${leather ? 'uniform float uLeather;' : ''}\n${screen ? 'uniform sampler2D uScreen;\nuniform vec3 uScreenOrigin;\nuniform vec3 uScreenU;\nuniform vec3 uScreenV;\nuniform float uScreenLevel;' : ''}\n${frit ? 'varying float vEdge;\nuniform vec2 uFrit;' : ''}\n${weave ? 'uniform float uWeave;' : ''}\n${lift ? 'uniform float uAoLift;' : ''}\n${heat ? 'uniform float uHeat;' : ''}\n${NOISE}\n${surface ? SURFACE : ''}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${ao ? occlusion(Boolean(lift)) : ''}`);
    if (paint) {
      fragment = fragment
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FLAKES}`)
        .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>\n${ORANGE_PEEL}`);
    }
    if (wood) fragment = fragment.replace('#include <color_fragment>', `#include <color_fragment>\n${WOOD}`);
    if (weave) fragment = fragment.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${WEAVE}`);
    if (louvre) fragment = fragment.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${LOUVRE}`);
    if (perforation) fragment = fragment.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${HEXPERF}`);
    const bumps = `${upholstery ? UPHOLSTERY : ''}${crease ? CREASE : ''}${pebble ? PEBBLE : ''}${carpet ? CARPET : ''}`;
    if (bumps) fragment = fragment.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${bumps}`);
    if (screen) fragment = fragment.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${SCREEN}`);
    if (heat) fragment = fragment.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${HEAT}`);
    if (frit) {
      fragment = fragment
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRIT_COLOUR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRIT_ROUGHNESS}`);
    }
    if (tread || disc) fragment = fragment.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${tread ? TREAD : DISC}`);
    // the flakes' strength: 1 metallic, 0 for a solid paint; the grain: 1 wood, 0 metal (CarLook sets them)
    if (paint) shader.uniforms.uFlake = material.userData.flake;
    if (wood) {
      shader.uniforms.uGrain = material.userData.grain;
      shader.uniforms.uFigure = material.userData.figure;
      shader.uniforms.uGrainAxis = material.userData.grainAxis;
    }
    if (leather) shader.uniforms.uLeather = material.userData.leather;
    if (frit) shader.uniforms.uFrit = { value: new THREE.Vector2(frit.width, frit.fade) };
    if (weave) shader.uniforms.uWeave = material.userData.weave;
    if (lift) shader.uniforms.uAoLift = lift;
    if (heat) shader.uniforms.uHeat = heat;
    if (screen) {
      shader.uniforms.uScreen = screen.map;
      shader.uniforms.uScreenOrigin = screen.origin;
      shader.uniforms.uScreenU = screen.u;
      shader.uniforms.uScreenV = screen.v;
      shader.uniforms.uScreenLevel = screen.level;
    }
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}

/**
 * Gives a pane its distance to the edge as `aEdge` (the master's `_EDGE`, lower-cased by the
 * loader); a pane without one gets a metre everywhere, so no frit rather than a black pane.
 */
export function carryEdge(mesh) {
  const geometry = mesh.geometry;
  if (geometry.getAttribute('aEdge')) return;
  const edge = geometry.getAttribute('_edge');
  if (edge) {
    geometry.setAttribute('aEdge', edge);
    geometry.deleteAttribute('_edge');
    return;
  }
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
}

/**
 * Gives every mesh its baked occlusion as `aoVertex`, one float per vertex: the generator's `_AO`
 * attribute (glTF custom attributes reach three.js lower-cased), or 1 where nothing was baked.
 */
export function carryOcclusion(mesh) {
  const geometry = mesh.geometry;
  if (geometry.getAttribute('aoVertex')) return;
  const baked = geometry.getAttribute('_ao');
  if (baked) {
    geometry.setAttribute('aoVertex', baked);
    geometry.deleteAttribute('_ao');
    return;
  }
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aoVertex', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
}

/* Glass as it reads: its reflection whole (Fresnel, strong at grazing angles), what lies behind it
   dimmed by the pane's absorption, the opacity here. Premultiplied, so the reflection is never
   faded with the see-through: the canvas composites premultiplied over the page's plates too. */
const GLASS = Object.freeze({
  metalness: 0, roughness: 0.02, ior: 1.5, envMapIntensity: 1.6, color: 0x000000,
  transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
});
const SUEDE = Object.freeze({ sheenRoughness: 0.3 });

/**
 * The looks by the master's material names. `replace` swaps in a new material, `set` adjusts the
 * loaded one; `emissive` is a lamp's intensity with the lights on, `blade` the cabin's light blade's.
 * The cabin is the modelled Perle; CarLook dresses the chosen trim, inlays and light.
 */
export const LOOKS = Object.freeze({
  'paint-Celadon': { set: { metalness: 0.55, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1 }, paint: true },
  // the windscreen and front windows let the cabin through; the rear ones and the roof are privacy glass
  // the bonded panes carry the frit as the master prints it (cordeau7.py frit_glass)
  'glass-clear': { replace: { ...GLASS, opacity: 0.2 }, frit: { width: 0.024, fade: 0.012 } },
  // frameless door glass: its polished edge reads as a thin dark line, never a sparkle of white
  'glass-door': { replace: { ...GLASS, opacity: 0.24 }, frit: { width: 0.005, fade: 0.004 } },
  'glass-privacy-door': { replace: { ...GLASS, opacity: 0.8 }, frit: { width: 0.005, fade: 0.004 } },
  'glass-privacy': { replace: { ...GLASS, opacity: 0.8 }, frit: { width: 0.024, fade: 0.012 } },
  'glass-roof': { replace: { ...GLASS, opacity: 0.86 }, frit: { width: 0.03, fade: 0.012 } },
  lens: { replace: { ...GLASS, ior: 1.585, opacity: 0.08 } }, // polycarbonate
  'lens-red': { replace: { metalness: 0, roughness: 0.04, ior: 1.585, color: 0x3a0508, transparent: true, opacity: 0.78, envMapIntensity: 1.4 } },
  // deep in its recess the AO would put it out: a grille reads by its highlights
  honeycomb: { set: { color: 0x0c0d0f, roughness: 0.2, metalness: 0 }, ao: false },
  // unpainted textured plastic (sills, liners, ducts): satin, so it stays black at grazing angles
  trim: { set: { color: 0x1e1f20, roughness: 0.66, metalness: 0 } },
  // the measured tyre (albedo 0.023, roughness 0.7); the raised letters a little glossier
  tyre: { set: { color: 0x2a2a2a, roughness: 0.72, metalness: 0 }, tread: true },
  'tyre-letters': { set: { color: 0x303030, roughness: 0.5, metalness: 0 } },
  rim: { set: { color: 0xcfd3d7, roughness: 0.2, metalness: 1 } },
  // the Rayon's diamond-cut faces stay bright whatever the finish (the painted parts take it)
  'rim-machined': { set: { color: 0xe0e3e6, roughness: 0.14, metalness: 1 } },
  disc: { set: { color: 0x7d8186, roughness: 0.42, metalness: 1 }, disc: true },
  led: { emissive: 6 },
  'led-red': { emissive: 2.4 },
  'light-blade': { blade: 1.6 },
  // the cabin, Perle as modelled (wool blend, recycled microfibre, light ash); the inserts turn to
  // perforated Nappa with the leather trims, the seats' own bolsters crease (CarLook's `leather`)
  wool: { set: { color: 0xdad5cb, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.4, sheenColor: 0xf1ede6 }, upholstery: true },
  'seat-bolster': { set: { color: 0xc5bfb4, roughness: 0.92, sheen: 0.5, sheenColor: 0xe2ddd4, sheenRoughness: 0.3 }, crease: true },
  // the brief of 2026-11-15: soft-touch vinyl on the doors' tops, the doors' layered wood strips,
  // the hidden vent, the hexagonal grilles, anodised and knurled aluminium, black glass keys, the pad
  'vinyl-soft': { set: { color: 0x47433f, roughness: 0.62, metalness: 0, sheen: 0.15, sheenRoughness: 0.5, sheenColor: 0x6a655f }, pebble: true },
  // the inlays (CarLook): an open-pore wood, brushed aluminium or carbon twill (`weave`)
  'ash-door': { set: { color: 0xcbb696, roughness: 0.46, metalness: 0 }, wood: 'y', weave: true },
  'vent-louvre': { set: { color: 0x1a1a1b, roughness: 0.7, metalness: 0 }, louvre: true },
  speaker: { set: { color: 0x3e3f40, roughness: 0.45, metalness: 1 }, perforation: true },
  'alu-anodised': { set: { color: 0xc4c7ca, roughness: 0.38, metalness: 1 } },
  'alu-knurled': { set: { color: 0xd9dcdf, roughness: 0.38, metalness: 1 } },
  'key-gloss': { set: { color: 0x0a0a0b, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 } },
  'rubber-pad': { set: { color: 0x141414, roughness: 0.92, metalness: 0 } },
  'thread-seam': { set: { transparent: false, roughness: 0.6 } },
  'microfibre-pearl': { set: { color: 0xc5bfb4, roughness: 0.92, sheen: 0.5, sheenColor: 0xe2ddd4, ...SUEDE } },
  microfibre: { set: { color: 0x47433f, roughness: 0.94, sheen: 0.4, sheenColor: 0x8d877f, ...SUEDE } },
  'microfibre-perf': { set: { color: 0x423e3a, roughness: 0.94, sheen: 0.4, sheenColor: 0x8d877f, ...SUEDE } },
  'trim-pearl': { set: { color: 0xb7b0a4, roughness: 0.6, metalness: 0 } },
  'trim-dark': { set: { color: 0x2c2a28, roughness: 0.62, metalness: 0 } },
  carpet: { set: { color: 0x3b3835, roughness: 1, sheen: 0.5, sheenRoughness: 0.5, sheenColor: 0x6b6660 }, carpet: true },
  'carpet-mat': { set: { color: 0x4c4844, roughness: 1, sheen: 0.5, sheenRoughness: 0.5, sheenColor: 0x7a756e }, carpet: true },
  'ash-dash': { set: { color: 0xcbb696, roughness: 0.46, metalness: 0 }, wood: 'y', weave: true },
  'ash-bridge': { set: { color: 0xcbb696, roughness: 0.46, metalness: 0 }, wood: 'x', weave: true },
  'alu-brushed': { set: { color: 0xd3d6d8, roughness: 0.3, metalness: 1 } },
  'alu-brushed-y': { set: { color: 0xd3d6d8, roughness: 0.3, metalness: 1 } },
  'vent-slots': { set: { color: 0x0d0d0e, roughness: 0.7, metalness: 0 } },
  // its dashes were a procedural cut-out: solid thread reads better than a transparent sort
  thread: { set: { transparent: false, roughness: 0.6 } },
  // screens: anti-glare glass (a mirror coat showed every facet of the curved display), lit with the
  // light blade by CabinScreens' pictures
  'display-driver': { set: { emissive: 0x000000, roughness: 0.34, clearcoat: 0, envMapIntensity: 0.15, specularIntensity: 0.35 }, screen: 'driver' },
  'display-centre': { set: { emissive: 0x000000, roughness: 0.34, clearcoat: 0, envMapIntensity: 0.15, specularIntensity: 0.35 }, screen: 'centre' },
  // the seamless curved OLED (the brief of 2026-11-15): one picture, the dials and the welcome
  'display-wide': { set: { emissive: 0x000000, roughness: 0.34, clearcoat: 0, envMapIntensity: 0.15, specularIntensity: 0.35 }, screen: 'wide' },
  // the powertrains (phase 3): cast and machined aluminium, forged steel, cast iron, heat-tinted
  // stainless, wrinkle black, the engine cover (CarLook dresses its finish), hoses, the E's cables
  'alu-cast': { set: { color: 0xbfc2c5, roughness: 0.55, metalness: 1 } },
  // the charge pipes: satin, a mirror finish outshone the engine in the studio's light
  'alu-machined': { set: { color: 0xdfe2e5, roughness: 0.3, metalness: 1 } },
  'wrinkle-black': { set: { color: 0x141416, roughness: 0.78, metalness: 0 } },
  'engine-cover': { set: { color: 0xc9a35a, roughness: 0.3, metalness: 1 }, weave: true },
  'steel-forged': { set: { color: 0xc4c6c9, roughness: 0.32, metalness: 1 } },
  'iron-cast': { set: { color: 0x6e6a67, roughness: 0.62, metalness: 1 }, heat: true }, // the turbines' housings
  'steel-heat': { set: { color: 0xb5a694, roughness: 0.4, metalness: 1 }, heat: true }, // the exhaust manifolds
  piston: { set: { color: 0xe0e1e2, roughness: 0.3, metalness: 1 } },
  hose: { set: { color: 0x1c1c1e, roughness: 0.62, metalness: 0 } },
  'hv-orange': { set: { color: 0xe8701a, roughness: 0.45, metalness: 0 } },
  felt: { set: { color: 0x232325, roughness: 0.95, metalness: 0 } },
  reservoir: { set: { color: 0xe4e0d6, roughness: 0.45, metalness: 0 } },
  'exhaust-tip': { set: { color: 0xe0e2e5, roughness: 0.28, metalness: 1 } },
  // the headliner follows the trim (CarLook); the A-pillars wear it too
  headliner: { set: { roughness: 0.9, sheen: 0.5, sheenRoughness: 0.5 } },
});

/**
 * A material baked in Blender (`<master name>·baked`, the Six's engine since 2026-11-16): its maps
 * already hold the colour, roughness, relief and the parts' own occlusion, so the page keeps only
 * what is its own on top (the heat of its master's look, the occlusion between parts and its fade
 * as the parts come apart), never the procedural detail.
 */
export const BAKED = '·baked';

/** The look of a material by name, and whether it is baked: `{ look, baked }` */
export function lookOf(name) {
  const baked = typeof name === 'string' && name.endsWith(BAKED);
  const master = baked ? name.slice(0, -BAKED.length) : name;
  return { look: master && Object.hasOwn(LOOKS, master) ? LOOKS[master] : undefined, baked };
}
