/**
 * Dresses the car as configured: the paint (its colour and its finish's flakes and coat), the
 * calipers, the wheels' finish, the brightwork, and in the cabin the trim, the inlays and the light
 * blade's colour, eased over about half a second so a new paint flows over the body instead of
 * snapping. Finds the materials by the pass-7 master's names; the cabin's join when it loads
 * (`adopt`), dressed at once as the visitor left them.
 */
import * as THREE from 'three';
import { FINISHES } from '../rules/catalogue.js';

const RATE = 6; // 1/s: the ease towards the chosen look (95 % in half a second)

/** Which of the master's materials each part of the look dresses */
const ROLES = Object.freeze({
  paint: ['paint-Celadon'],
  caliper: ['caliper'],
  rim: ['rim'],
  brightwork: ['chrome', 'alu', 'exhaust-tip'], // the window line, the intakes' edges, the script, the nuts, the tips
  cover: ['engine-cover'],
  main: ['wool'],
  bolster: ['microfibre-pearl', 'seat-bolster'],
  plastic: ['trim-pearl'],
  dash: ['microfibre', 'microfibre-perf'],
  headliner: ['headliner'],
  inlay: ['ash-dash', 'ash-bridge', 'ash-door'], // the dash's band, the bridge, the doors' layered strips
  vinyl: ['vinyl-soft'], // the doors' tops, in the trim's dark tone
  seam: ['thread-seam'], // the seats' French seams: contrast on leather, tonal on wool
  blade: ['light-blade'],
});
const ROLE_OF = new Map(Object.entries(ROLES).flatMap(([role, names]) => names.map((name) => [name, role])));
const COLOURS = Object.freeze(['color', 'emissive', 'sheenColor']);

/**
 * How each upholstery finish catches the light, by surface (a trim's `finish`): its roughness and
 * sheen, and `leather`, which eases in the inserts' perforations and grain and the bolsters' creases
 * (Materials' UPHOLSTERY and CREASE). The microfibre inserts are perforated, as the store kits' are.
 */
const TRIM_FINISHES = new Map([
  ['main', new Map([
    ['wool', Object.freeze({ roughness: 0.95, sheen: 0.6, leather: 0 })],
    ['nappa', Object.freeze({ roughness: 0.42, sheen: 0.08, leather: 1 })],
    ['microfibre', Object.freeze({ roughness: 0.94, sheen: 0.45, leather: 1 })],
  ])],
  ['bolster', new Map([
    ['microfibre', Object.freeze({ roughness: 0.92, sheen: 0.5, leather: 0 })],
    ['nappa', Object.freeze({ roughness: 0.45, sheen: 0.08, leather: 1 })],
  ])],
  ['dash', new Map([
    ['microfibre', Object.freeze({ roughness: 0.94, sheen: 0.4 })],
    ['nappa', Object.freeze({ roughness: 0.55, sheen: 0.05 })],
  ])],
]);

/** A surface's finish by its name; a trim naming one that is not drawn is a catalogue error */
function finishOf(surface, name) {
  const finish = TRIM_FINISHES.get(surface)?.get(name);
  if (!finish) throw new Error(`no ${surface} finish "${name}"`);
  return finish;
}

/** A material's colours and numbers easing towards their targets */
class Easing {
  #material;
  #colours = new Map();
  #numbers = new Map();
  rest;

  constructor(material) {
    this.#material = material;
    this.rest = { colour: material.color.clone(), metalness: material.metalness, roughness: material.roughness };
  }

  /** `colours` by property (color, emissive, sheenColor), `numbers` by property or uniform (flake, grain) */
  aim(colours, numbers) {
    for (const [key, colour] of Object.entries(colours)) {
      if (!COLOURS.includes(key) || !this.#material[key]?.isColor || !colour) continue;
      const entry = this.#colours.get(key) ?? { current: this.#material[key].clone(), target: new THREE.Color() };
      entry.target.copy(colour);
      this.#colours.set(key, entry);
    }
    for (const [key, value] of Object.entries(numbers)) {
      const current = this.#numbers.get(key)?.current ?? this.#read(key);
      if (current === undefined) continue;
      this.#numbers.set(key, { current, target: value });
    }
  }

  /** Steps the ease; true while still moving */
  step(k) {
    let moving = false;
    for (const [key, { current, target }] of this.#colours) {
      current.lerp(target, k);
      if (Math.abs(current.r - target.r) + Math.abs(current.g - target.g) + Math.abs(current.b - target.b) > 0.002) moving = true;
      else current.copy(target);
      this.#material[key].copy(current);
    }
    for (const [key, value] of this.#numbers) {
      value.current += (value.target - value.current) * k;
      if (Math.abs(value.target - value.current) > 0.002) moving = true;
      else value.current = value.target;
      this.#write(key, value.current);
    }
    return moving;
  }

  #uniform(key) {
    return ['flake', 'grain', 'weave', 'leather', 'figure'].includes(key) ? this.#material.userData[key] : null;
  }

  #read(key) {
    const uniform = this.#uniform(key);
    if (uniform !== null) return uniform?.value;
    return typeof this.#material[key] === 'number' ? this.#material[key] : undefined;
  }

  #write(key, value) {
    const uniform = this.#uniform(key);
    if (uniform) uniform.value = value;
    else if (uniform === null) this.#material[key] = value;
  }
}

export class CarLook {
  #parts = new Map(); // role → Easing[]
  #seen = new Set();
  #options = null;
  #moving = false;

  constructor(carObject) {
    this.adopt(carObject);
  }

  /**
   * Takes in the materials of a model added to the car (the cabin, the wheels, the engine set),
   * dressed as already chosen; `roles` limits them to those parts of the look
   */
  adopt(object, roles = null) {
    let added = false;
    object.traverse((node) => {
      if (!node.isMesh || this.#seen.has(node.material)) return;
      const role = ROLE_OF.get(node.material.name);
      if (!role || (roles && !roles.includes(role))) return;
      this.#seen.add(node.material);
      if (!this.#parts.has(role)) this.#parts.set(role, []);
      this.#parts.get(role).push(new Easing(node.material));
      added = true;
    });
    if (added && this.#options) this.dress(this.#options, true);
  }

  /** Aims the car at the options of a configuration (resolved: labels, colours, finishes); `now` skips the ease */
  dress(options, now = false) {
    this.#options = options;
    const finish = FINISHES[options.paint.finish];
    this.#aim('paint', { color: options.paint.hex }, { metalness: finish.metalness, roughness: finish.roughness, clearcoatRoughness: finish.clearcoatRoughness, flake: finish.flake });
    this.#aim('caliper', { color: options.calipers.hex });
    this.#aim('rim', { color: options.rims.hex }, { roughness: options.rims.roughness });
    const shadow = options.brightwork.id === 'shadow';
    for (const part of this.#parts.get('brightwork') ?? []) {
      part.aim({ color: shadow ? colour(options.brightwork.hex) : part.rest.colour },
        { metalness: shadow ? 0.2 : part.rest.metalness, roughness: shadow ? 0.48 : part.rest.roughness });
    }
    // the cabin: each surface in its trim's finish (wool, Nappa with perforated inserts and creased
    // bolsters, or microfibre), the light plastics, the dash's dark top, the headliner
    const { finish: surfaces, palette, seams } = options.trim;
    const sheen = (hex, lift) => colour(hex).lerp(WHITE, lift);
    this.#aim('main', { color: palette.main, sheenColor: sheen(palette.main, 0.3) }, finishOf('main', surfaces.main));
    this.#aim('bolster', { color: palette.bolster, sheenColor: sheen(palette.bolster, 0.3) }, finishOf('bolster', surfaces.bolster));
    this.#aim('vinyl', { color: palette.dash, sheenColor: sheen(palette.dash, 0.2) });
    this.#aim('seam', { color: seams === 'contrast' ? SEAM_CONTRAST : colour(palette.bolster).multiplyScalar(0.8) });
    this.#aim('plastic', { color: palette.plastic });
    this.#aim('dash', { color: palette.dash, sheenColor: sheen(palette.dash, 0.25) }, finishOf('dash', surfaces.dash));
    this.#aim('headliner', { color: palette.headliner, sheenColor: sheen(palette.headliner, 0.2) });
    // the inlay: a wood's grain, brushed aluminium, or carbon twill under its gloss coat
    const inlay = options.inlay;
    this.#aim('inlay', { color: inlay.hex }, {
      grain: inlay.grain, figure: inlay.figure, weave: inlay.weave, metalness: inlay.metalness, roughness: inlay.roughness, ...inlay.coat,
    });
    this.#aim('blade', { emissive: options.blade.hex });
    const cover = options.cover;
    this.#aim('cover', { color: cover.hex }, { metalness: cover.metalness, roughness: cover.roughness, weave: cover.weave });
    this.#moving = true;
    if (now) for (const list of this.#parts.values()) for (const part of list) part.step(1);
  }

  /** One frame of the ease; true while the look still changes */
  update(dt) {
    if (!this.#moving) return false;
    const k = 1 - Math.exp(-RATE * Math.min(dt, 0.1));
    let moving = false;
    for (const list of this.#parts.values()) for (const part of list) moving = part.step(k) || moving;
    this.#moving = moving;
    return moving;
  }

  #aim(role, colours, numbers = {}) {
    const resolved = Object.fromEntries(Object.entries(colours).map(([key, value]) => [key, typeof value === 'string' ? colour(value) : value]));
    for (const part of this.#parts.get(role) ?? []) part.aim(resolved, numbers);
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const SEAM_CONTRAST = '#CDBA94'; // the saddle stitching on the leather trims

/** An sRGB hex as a linear colour (three.js converts on set) */
function colour(hex) {
  return new THREE.Color(hex);
}
