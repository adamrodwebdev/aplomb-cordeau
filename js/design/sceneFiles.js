/**
 * The scene's files and quality tiers, without three.js: the boot reads them, and the page fetches
 * the first screen's files ahead (while the poster shows) without loading the scene's code.
 */

// the pass-7 Cordeau (c7export.py): the exterior with the doors, then the cabin when it is needed
const MODEL = new URL('../../cordeau7-exterior.glb', import.meta.url).href;
// the same exterior decimated further (c7export.py --phone): the first screen's download on phones
const MODEL_PHONE = new URL('../../cordeau7-exterior-phone.glb', import.meta.url).href;

export const FILES = Object.freeze({
  cabin: new URL('../../cordeau7-cabin.glb', import.meta.url).href,
  wheels: new URL('../../cordeau7-wheels.glb', import.meta.url).href,
  engine: new URL('../../cordeau7-engine.glb', import.meta.url).href,
  shadow: new URL('../../cordeau7-shadow.png', import.meta.url).href,
  // the light the paint reflects, drawn once into files by tools/bake-environments.mjs
  environments: Object.freeze({
    road: new URL('../../environment-road.png', import.meta.url).href,
    showroom: new URL('../../environment-showroom.png', import.meta.url).href,
    // the tonal arc's (2026-11-16), read once the scene is up
    'studio-white': new URL('../../environment-studio-white.png', import.meta.url).href,
    workshop: new URL('../../environment-workshop.png', import.meta.url).href,
    night: new URL('../../environment-night.png', import.meta.url).href,
    dusk: new URL('../../environment-dusk.png', import.meta.url).href,
  }),
});

/**
 * `spray`: particles thrown by the tyres; `screenScale`: the water screen's resolution against the
 * canvas; `reflect`: the wet road's mirror pass (0 on phones: the car drawn twice is too much
 * there, the water keeps its sheen and the sky); `skidPixels`: the traces' mask; `exterior`: the
 * body's file (3.0 MB, or 1.5 MB with 155,000 triangles instead of 369,000 on phones).
 */
export const TIERS = Object.freeze({
  high: { name: 'high', dpr: 1.5, spray: 4000, screenScale: 0.5, reflect: 0.5, skidPixels: [2048, 1024], exterior: MODEL },
  low: { name: 'low', dpr: 1.25, spray: 1600, screenScale: 0.4, reflect: 0, skidPixels: [1024, 512], exterior: MODEL_PHONE },
});

/** The tier: the address's switch (flags.tier, read at the door), else phones and small memories get the low one */
export function pickTier(flags) {
  if (flags.tier) return TIERS[flags.tier];
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const memory = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : 8;
  return coarse || memory < 4 ? TIERS.low : TIERS.high;
}

/**
 * What the first screen needs, fetched ahead into the HTTP cache while the poster shows: the body,
 * the environments, the shadow, and three.js's modules (the import map's), so that the scene boots
 * from the cache when the visitor moves. The scene's own small modules come with it then.
 */
export function firstScreenFiles(tier) {
  const three = import.meta.resolve('three');
  const addons = import.meta.resolve('three/addons/');
  return [
    tier.exterior,
    FILES.environments.road,
    FILES.environments.showroom,
    FILES.shadow,
    three,
    // the core beside the module, minified as it is (three.module.min.js imports three.core.min.js)
    new URL(three.endsWith('.min.js') ? 'three.core.min.js' : 'three.core.js', three).href,
    new URL('loaders/GLTFLoader.js', addons).href,
    new URL('libs/meshopt_decoder.module.js', addons).href,
    new URL('utils/BufferGeometryUtils.js', addons).href,
    new URL('utils/SkeletonUtils.js', addons).href,
    new URL('objects/Reflector.js', addons).href,
  ];
}
