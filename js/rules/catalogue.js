/**
 * The Cordeau's options, as the mockup's configurator lists them (docs/mockup/index.html), for the
 * landing's configurators: the exterior in the showroom, the cabin, the energy under the bonnet.
 * Pure data and functions. Prices in euros, VAT included. Colours are sRGB hex.
 */

/** How each finish looks: its flakes, the coat's sheen; satin is matte under its coat */
export const FINISHES = Object.freeze({
  metallic: Object.freeze({ label: 'Metallic', metalness: 0.55, roughness: 0.36, clearcoatRoughness: 0.025, flake: 1 }),
  pearl: Object.freeze({ label: 'Pearl', metalness: 0.4, roughness: 0.28, clearcoatRoughness: 0.02, flake: 0.6 }),
  solid: Object.freeze({ label: 'Solid', metalness: 0, roughness: 0.42, clearcoatRoughness: 0.03, flake: 0 }),
  satin: Object.freeze({ label: 'Satin', metalness: 0.32, roughness: 0.55, clearcoatRoughness: 0.4, flake: 0.5 }),
});

const freezeAll = (list) => Object.freeze(list.map((item) => Object.freeze(item)));

export const PAINTS = freezeAll([
  { id: 'plomb', label: 'Plomb', hex: '#3A3C40', finish: 'metallic', price: 1200 },
  { id: 'laiton', label: 'Laiton', hex: '#A88A5A', finish: 'metallic', price: 1200 },
  { id: 'celadon', label: 'Céladon', hex: '#97AEA6', finish: 'metallic', price: 1200 },
  { id: 'craie', label: 'Craie', hex: '#ECE9E2', finish: 'solid', price: 0 },
  { id: 'encre', label: 'Encre', hex: '#0E1014', finish: 'pearl', price: 1200 },
  { id: 'ardoise', label: 'Ardoise', hex: '#4E5A66', finish: 'metallic', price: 1200 },
  { id: 'mousse', label: 'Mousse', hex: '#3B4A3A', finish: 'metallic', price: 1200 },
  { id: 'argile', label: 'Argile', hex: '#A4553A', finish: 'satin', price: 2400 },
]);

export const CALIPERS = freezeAll([
  { id: 'brass', label: 'Brass', hex: '#B8893E', price: 0 },
  { id: 'graphite', label: 'Graphite', hex: '#2B2E33', price: 0 },
]);

/**
 * The wheels (the design brief), all 0.81 m tall with their tyres. Each version has its standard
 * design (VERSIONS' `wheel`); a design of a higher tier than the standard costs its price, the
 * others are included.
 */
export const WHEELS = freezeAll([
  { id: 'aero', label: 'Aero 23', detail: 'Flat covers, less drag', tier: 1, price: 2600 },
  { id: 'rayon', label: 'Rayon 23', detail: 'Ten spokes, machined', tier: 1, price: 2600 },
  { id: 'fan', label: 'Fan 25', detail: 'Five swept blades', tier: 2, price: 2600 },
]);

/** The wheels' finish: the paint of the covers, spokes' sides and blades */
export const RIMS = freezeAll([
  { id: 'silver', label: 'Silver', hex: '#CFD3D7', roughness: 0.2, price: 0 },
  { id: 'graphite', label: 'Graphite', hex: '#4A4E54', roughness: 0.3, price: 0 },
]);

/** The window line and the badges' metal */
export const BRIGHTWORK = freezeAll([
  { id: 'chrome', label: 'Chrome', price: 0 },
  { id: 'shadow', label: 'Satin black', hex: '#141517', price: 0 },
]);

/** What a trim's surfaces are made of (CarLook draws each finish): the wool blend's, the leather's */
const WOOL_BLEND = Object.freeze({ main: 'wool', bolster: 'microfibre', dash: 'microfibre' });
const NAPPA = Object.freeze({ main: 'nappa', bolster: 'nappa', dash: 'nappa' });

/**
 * The cabin's upholstery. Each trim dresses five of the master's surfaces: `main` the seats' centres
 * and the door inserts, `bolster` the bolsters and armrests, `dash` the dash's dark top (no glare in
 * the screen), the wheel's rim and the seats' backs, `plastic` the light grained parts, `headliner`
 * the roof's lining and the pillars. `finish` says what main, bolster and dash are made of (wool,
 * Nappa, microfibre), `seams` whether the French seams contrast; `swatch` paints a two-tone dot.
 * Nacre is the store kits' 100,000-euro trim (the user's "Leather, microfibre, carbon",
 * 2026-11-16): pearl Nappa bolsters, dark microfibre perforated on the inserts, on the dash and the
 * rim, contrast thread; the site's default since 2026-11-17, the wool blends staying as options.
 */
export const TRIMS = freezeAll([
  { id: 'nacre', label: 'Nacre', detail: 'Nappa · microfibre', hex: '#C9C2B6', swatch: 'linear-gradient(135deg, #C9C2B6 50%, #2F2C2A 50%)',
    finish: Object.freeze({ main: 'microfibre', bolster: 'nappa', dash: 'microfibre' }), seams: 'contrast', price: 2200,
    palette: Object.freeze({ main: '#2F2C2A', bolster: '#C9C2B6', plastic: '#B7B0A4', dash: '#2F2C2A', headliner: '#CFC9BF' }) },
  { id: 'charbon', label: 'Charbon', detail: 'Wool blend', hex: '#2E3134', finish: WOOL_BLEND, seams: 'tonal', price: 0,
    palette: Object.freeze({ main: '#4B4C4E', bolster: '#3A3B3D', plastic: '#333436', dash: '#2B2B2C', headliner: '#3A3A3C' }) },
  { id: 'perle', label: 'Perle', detail: 'Wool blend', hex: '#BDBFBC', finish: WOOL_BLEND, seams: 'tonal', price: 0,
    palette: Object.freeze({ main: '#DAD5CB', bolster: '#C5BFB4', plastic: '#B7B0A4', dash: '#47433F', headliner: '#CFC9BF' }) },
  { id: 'sable', label: 'Sable', detail: 'Nappa leather', hex: '#C9B490', finish: NAPPA, seams: 'contrast', price: 2200,
    palette: Object.freeze({ main: '#C9B490', bolster: '#B9A27C', plastic: '#A8977A', dash: '#4A3F33', headliner: '#D3CABB' }) },
  { id: 'cognac', label: 'Cognac', detail: 'Nappa leather', hex: '#8A5530', finish: NAPPA, seams: 'contrast', price: 2200,
    palette: Object.freeze({ main: '#8A5530', bolster: '#7A4728', plastic: '#5E4636', dash: '#3B2A20', headliner: '#3D3733' }) },
]);

/** The woods' and the aluminium's satin lacquer, as the master coats the strips */
const LACQUER = Object.freeze({ clearcoat: 0.25, clearcoatRoughness: 0.3 });

/**
 * The inlays of the dash's band, the bridge and the doors' layered strips: open-pore woods
 * (`grain`; `figure` 1 bends walnut's bands into its cathedral figure), brushed metal, or carbon
 * twill (`weave`, the store kits' 100,000-euro trim) under a full gloss coat. `metalness`,
 * `roughness` and `coat` are each finish's own.
 */
export const INLAYS = freezeAll([
  { id: 'carbon', label: 'Carbon twill', hex: '#1E1F21', grain: 0, figure: 0, weave: 1, metalness: 0, roughness: 0.24,
    coat: Object.freeze({ clearcoat: 1, clearcoatRoughness: 0.06 }), price: 1200 },
  { id: 'ash-light', label: 'Light ash', hex: '#CBB696', grain: 1, figure: 0, weave: 0, metalness: 0, roughness: 0.46, coat: LACQUER, price: 0 },
  { id: 'ash-dark', label: 'Dark ash', hex: '#4B3B2D', grain: 1, figure: 0, weave: 0, metalness: 0, roughness: 0.46, coat: LACQUER, price: 0 },
  { id: 'oak', label: 'Light oak', hex: '#C29A66', grain: 1, figure: 0, weave: 0, metalness: 0, roughness: 0.46, coat: LACQUER, price: 600 },
  { id: 'walnut', label: 'Open-pore walnut', hex: '#5A3B26', grain: 1, figure: 1, weave: 0, metalness: 0, roughness: 0.46, coat: LACQUER, price: 800 },
  { id: 'alu', label: 'Brushed aluminium', hex: '#C9CDD0', grain: 0, figure: 0, weave: 0, metalness: 1, roughness: 0.32, coat: LACQUER, price: 400 },
]);

/** The light blade's colour (the "Lame lumineuse" across the dash, the doors and the bridge) */
export const BLADES = freezeAll([
  { id: 'warm', label: 'Warm white', hex: '#FFF3E5', price: 0 },
  { id: 'brass', label: 'Brass', hex: '#FFB25C', price: 0 },
  { id: 'celadon', label: 'Céladon', hex: '#9FE3CB', price: 0 },
  { id: 'glacier', label: 'Glacier', hex: '#CFE3FF', price: 0 },
]);

export const ENERGIES = freezeAll([
  { id: 'E', label: 'Cordeau E', detail: 'Electric · 800 V' },
  { id: 'Six', label: 'Cordeau Six', detail: 'Straight-six · 48 V' },
]);

/**
 * Versions by energy, with the figures the instruments show and the legal line they need. A figure is
 * [value, unit, gauge]: how far its instrument's arc goes (the range out of 700 km, the power out of
 * 450 kW, the torque out of 700 Nm, a sprint against 8 s: the shorter, the fuller).
 */
export const VERSIONS = Object.freeze({
  E: freezeAll([
    { id: 'Essential', price: 59900, co2: 'A', wheel: 'aero', figures: [['640', 'km WLTP', 0.91], ['250', 'kW', 0.56], ['5.6', 's 0–100 km/h', 0.3]],
      legal: 'Electricity consumption 16.0 kWh/100 km, range 640 km (WLTP combined). Electric cars pay no malus.' },
    { id: 'Signature', price: 72900, co2: 'A', wheel: 'fan', figures: [['590', 'km WLTP', 0.84], ['400', 'kW', 0.89], ['3.9', 's 0–100 km/h', 0.51]],
      legal: 'Electricity consumption 17.4 kWh/100 km, range 590 km (WLTP combined). Electric cars pay no malus.' },
  ]),
  Six: freezeAll([
    { id: 'Essential', price: 84900, co2: 'F', gkm: 225, wheel: 'rayon', figures: [['405', 'kW · 550 ch', 0.9], ['650', 'Nm', 0.93], ['3.9', 's 0–100 km/h', 0.51]],
      legal: 'Fuel consumption 9.6 l/100 km, CO₂ 225 g/km (WLTP combined). Plus the 2026 malus.' },
    { id: 'Signature', price: 96900, co2: 'F', gkm: 232, wheel: 'fan', figures: [['405', 'kW · 550 ch', 0.9], ['650', 'Nm', 0.93], ['3.6', 's 0–100 km/h', 0.55]],
      legal: 'Fuel consumption 9.9 l/100 km, CO₂ 232 g/km (WLTP combined). Plus the 2026 malus.' },
  ]),
});

/** The Six's options, chosen under the open bonnet: the exhaust (its tips in the rear grille) and
 * the engine cover's finish, brass or lacquered carbon. They cost nothing on an E, which has neither. */
export const EXHAUSTS = freezeAll([
  { id: 'standard', label: 'Standard', detail: 'Two tips', price: 0 },
  { id: 'sport', label: 'Sport', detail: 'Four tips, active valves', price: 2900 },
]);

export const COVERS = freezeAll([
  { id: 'brass', label: 'Brass', hex: '#C9A35A', metalness: 1, roughness: 0.3, weave: 0, price: 0 },
  { id: 'carbon', label: 'Carbon', hex: '#1E1F21', metalness: 0, roughness: 0.24, weave: 1, price: 1800 },
]);

/**
 * The car the landing shows: Céladon on Fan 25 wheels, the Nacre cabin in carbon twill (the store
 * kits' 100,000-euro trim, the user's choice of 2026-11-17), the Six Signature
 */
export const DEFAULT_CHOICE = Object.freeze({
  paint: 'celadon', wheel: 'fan', calipers: 'brass', rims: 'silver', brightwork: 'chrome', trim: 'nacre', inlay: 'carbon', blade: 'warm',
  energy: 'Six', version: 'Signature', exhaust: 'standard', cover: 'brass',
});

const LISTS = Object.freeze({
  paint: PAINTS, wheel: WHEELS, calipers: CALIPERS, rims: RIMS, brightwork: BRIGHTWORK, trim: TRIMS, inlay: INLAYS, blade: BLADES, energy: ENERGIES,
  exhaust: EXHAUSTS, cover: COVERS,
});

/** The fields a configuration holds, in the order the summary reads them */
export const FIELDS = Object.freeze(['paint', 'wheel', 'rims', 'calipers', 'brightwork', 'trim', 'inlay', 'blade', 'energy', 'version', 'exhaust', 'cover']);

/** The options of a field: the versions depend on the energy chosen */
export function optionsFor(field, energy) {
  if (field === 'version') return energy === 'E' ? VERSIONS.E : VERSIONS.Six;
  return Object.hasOwn(LISTS, field) ? LISTS[field] : [];
}

/** The option `id` of a field, or null: the allow-list every choice passes */
export function findOption(field, id, energy) {
  if (typeof id !== 'string' || id.length > 24) return null;
  return optionsFor(field, energy).find((option) => option.id === id) ?? null;
}

/** The options a choice resolves to (every field valid, or the default's) */
export function resolve(choice) {
  const energy = findOption('energy', choice.energy) ? choice.energy : DEFAULT_CHOICE.energy;
  const out = {};
  for (const field of FIELDS) {
    out[field] = findOption(field, choice[field], energy) ?? findOption(field, DEFAULT_CHOICE[field], energy);
  }
  return out;
}

/** What a wheel design costs on a version: nothing up to its standard design's tier */
export function wheelPrice(wheel, version) {
  const standard = WHEELS.find((option) => option.id === version.wheel) ?? WHEELS[WHEELS.length - 1];
  return wheel.tier <= standard.tier ? 0 : wheel.price;
}

/** The total, VAT included: the version, then what costs extra */
export function priceOf(choice) {
  const o = resolve(choice);
  const six = o.energy.id === 'Six' ? o.exhaust.price + o.cover.price : 0;
  return o.version.price + o.paint.price + wheelPrice(o.wheel, o.version) + o.trim.price + o.inlay.price + o.blade.price
    + o.calipers.price + o.rims.price + o.brightwork.price + six;
}
