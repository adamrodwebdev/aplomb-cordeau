/**
 * The Cordeau (pass 7) as a rig: the body on a pivot at its centre of gravity (pitch and roll), four
 * wheels that spin, the front ones on steering knuckles; the calipers ride on the knuckles and never
 * spin. The master's hinges stay hinges: each `CTL_` empty (doors, bonnet, the cabin's lids) turns
 * about its local Y, the hinge line the generator gave it (its local Z in Blender).
 * The cabin arrives later, in the same frame, and rides with the body: readied off the scene
 * (`readyCabin`), its programs compiled, then seated (`seatCabin`), so no frame waits on it.
 * Every part that never moves on its own is drawn merged, one mesh per material: the master's
 * 560 parts were 560 draw calls, three times the pass-6 car's.
 * The wheels' designs: the Fan 25 comes with the car; the Aero 23 and Rayon 23 kits (and the 23 in
 * barrel, tyre and lettering they share) arrive later (`readyWheels`, `seatWheels`) and ride on the
 * same hubs; `useWheels` shows one design.
 * The engine set (phase 3) arrives last (`readyEngine`, `seatEngine`): the bay's walls, the Six's
 * engine, and the E's front boot over the Signature's front motor, each part with its exploded-view
 * data (the GLB's extras: where it goes, after what delay, whether it lies inside). What the bonnet
 * carries rides on its hinge, and the gas struts are aimed at each other's anchor as it lifts.
 * `usePowertrain` shows the configured energy and, on the Six, its exhaust's tips (in the exterior).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, smoothstep } from '../rules/math.js';
import { nextTask } from '../time.js';
import { LampGlow } from './LampGlow.js';
import { carryEdge, carryOcclusion, dress, lookOf } from './Materials.js';

const WHEEL = /^CTL_wheel_([FR])([LR])$/;
const WHEEL_PART = /^MDL_wheel_([FR][LR])_/;
const ON_KNUCKLE = /_caliper$/;
const FAN_PARTS = new Set(['face', 'rim', 'tyre', 'letters', 'cap', 'nuts']);
const KITS = Object.freeze({ fan: ['fan'], aero: ['t23', 'aero'], rayon: ['t23', 'rayon'] });
const TIP = /^MDL_exhaust_tip_(std|sport)_/; // the Six's tailpipes and their soot, by exhaust
const BONNET = 'CTL_bonnet';
const THROUGH_GRILLE = /^MDL_bay_(radiator|fans)$/; // the bay's only parts seen with the bonnet shut
// the catalogue's choices as the generator tags its parts
const ENERGY_TAG = Object.freeze({ Six: 'six', E: 'e' });
const EXHAUST_TAG = Object.freeze({ standard: 'std', sport: 'sport' });
// what the engine set's extras may hold (allow-lists): anything else reads as the default
const ENERGY_TAGS = new Set(['', 'six', 'e']);
const VERSION_TAGS = new Set(['', 'Essential', 'Signature']);
const STRUT_SIDES = new Set(['L', 'R']);
const STRUT_HALVES = new Set(['body', 'rod']);
const EXPLODE_SPAN = 0.6; // of the exploded view's progress: each part travels over this, after its own delay
const LIFT = [0, 0.5]; // the progress over which the baked occlusion of the parts fades
// the exploded view's "Épure" (the user's choice of 2026-11-15): dashed brass lines from each part
// to its seat, amber heat on the exhaust side, a brass ring sweeping the engine's length
const BRASS = new THREE.Color('#d2a65a');
const LEADER = Object.freeze({ alpha: 0.75, dash: 0.012, gap: 0.008 });
const HEAT = Object.freeze({ glow: 0.9, span: [0.35, 0.8] });
const SCAN = Object.freeze({ seconds: 6, z: [-1.53, -0.83], height: 0.55, radius: [0.385, 0.392], alpha: 0.6, from: [0.55, 0.9] });
// the exploded parts' way out from under the open bonnet (the user, 2026-11-15: rising straight up,
// they went through it): metres kept under its felt, the sampling step along the car, how far a
// part may glide forward, the band either side of the middle where the parts rise, the span sampled
const PATH = Object.freeze({ clearance: 0.04, step: 0.01, reach: 0.6, band: 0.35, z: [-2.4, -0.4] });
const SLICE_MS = 8; // the most a merge works before it lets the page draw (32 ms on Lighthouse's 4× slower phone, under its 50)

/** A wheel part's kit, as the generator tags it (c7wheels.design_of): '' for the brakes, shared */
function kitOf(name) {
  for (const tag of ['aero', 'rayon', 't23']) if (name.includes(`_${tag}_`)) return tag;
  return FAN_PARTS.has(name.slice(name.lastIndexOf('_') + 1)) ? 'fan' : '';
}
const PIVOT = /^CTL_/;
const HINGE = new THREE.Vector3(0, 1, 0);
const SCREEN_LEVEL = 1.3; // the screens' brightness with the light blade on

export class CarRig {
  #root = new THREE.Group();
  #pivot = new THREE.Group();
  #frame = new THREE.Group();
  #wheels = [];
  #hinges = new Map();
  #lamps = new Map();
  #blades = new Map();
  #screens = new Map();
  #replaced = new Map();
  #glow = null;
  #turn = new THREE.Quaternion();
  #hasCabin = false;
  #moving;
  #design = 'fan';
  #designs = new Set(['fan']);
  // the engine set and the tailpipes
  #tips = { std: new THREE.Group(), sport: new THREE.Group() };
  #parts = []; // { node, home, offset, at, inner, energy, version }
  #struts = []; // { body, rod, lower, socket, rest }: two pivots, the lower anchor, the upper in the hinge's frame
  #underBonnet = []; // what the bonnet carries or hides whatever the powertrain: its felt, the struts
  #lift = { value: 0 }; // the parts' occlusion fade (Materials' uAoLift), shared by their materials
  #powertrain = { energy: 'six', version: 'Signature', exhaust: 'std' };
  #exploded = 0;
  #bonnetOpen = false;
  #hasEngine = false;
  #uploads = 0; // frames left before the parts the bonnet hides are hidden (drawn once to upload them)
  #point = new THREE.Vector3();
  #inverse = new THREE.Matrix4();
  #heat = { value: 0 }; // the exhaust side's glow (Materials' uHeat), shared by its materials
  #leaders = null; // one dashed segment per part that moves
  #segmentOf = new Map(); // node → its leader's index
  #ring = null;
  #byName = new Map(); // the engine set's parts by name, for the notes

  /** `moving`: the hinges the page turns (their parts stay apart); every other part is merged */
  static async build(source, { cgHeight, moving = [] }) {
    const rig = new CarRig(moving);
    await rig.#assemble(source, cgHeight);
    return rig;
  }

  constructor(moving) {
    this.#moving = new Set(moving);
  }

  get object() {
    return this.#root;
  }

  /** The cabin's screens: role ('driver', 'centre') → their picture's uniforms and size in metres */
  get screens() {
    return this.#screens;
  }

  pose({ x, z, heading, steer, spinFront, spinRear, pitch, roll, lights, visible }) {
    this.#root.visible = visible;
    this.#root.position.set(x, 0, z);
    this.#root.rotation.y = heading;
    this.#pivot.rotation.set(-pitch, 0, -roll);
    for (const wheel of this.#wheels) {
      if (wheel.front) wheel.knuckle.rotation.y = steer;
      wheel.spin.rotation.x = wheel.front ? spinFront : spinRear;
    }
    for (const [material, base] of this.#lamps) material.emissiveIntensity = base * lights;
    this.#glow.setLevel(lights);
    if (this.#uploads > 0) {
      this.#uploads -= 1;
      if (this.#uploads === 0) this.#showPowertrain();
    }
  }

  /** Whether the engine set is seated: without it the bonnet stays shut (the bay is cut open under it) */
  get hasEngine() {
    return this.#hasEngine;
  }

  /**
   * Shows the configured powertrain (the configuration's options): the Six's engine and its
   * exhaust's tips, or the E's front boot, over the front motor on a Signature
   */
  usePowertrain({ energy, version, exhaust }) {
    this.#powertrain = {
      energy: Object.hasOwn(ENERGY_TAG, energy.id) ? ENERGY_TAG[energy.id] : 'six',
      version: VERSION_TAGS.has(version.id) ? version.id : '',
      exhaust: Object.hasOwn(EXHAUST_TAG, exhaust.id) ? EXHAUST_TAG[exhaust.id] : 'std',
    };
    this.#showPowertrain();
  }

  /** The exploded view, 0 (assembled) to 1: each part leaves after its own delay, the cover first, the crank last */
  explode(k) {
    if (k === this.#exploded) return;
    const opened = (k > 0) !== (this.#exploded > 0);
    this.#exploded = k;
    this.#lift.value = smoothstep(LIFT[0], LIFT[1], k);
    this.#heat.value = HEAT.glow * smoothstep(HEAT.span[0], HEAT.span[1], k);
    this.#place();
    if (opened) this.#showPowertrain();
  }

  /** The powertrain shown, as the generator tags it: { energy: 'six' | 'e', version } */
  get powertrain() {
    return this.#powertrain;
  }

  /**
   * The brass ring sweeping the Six's length while it is apart, at `time` seconds; `sweep` false
   * (reduced motion) keeps it away. True while it moves (the page keeps drawing).
   */
  scan(time, sweep) {
    if (!this.#ring) return false;
    const shown = this.#powertrain.energy === 'six' && sweep ? smoothstep(SCAN.from[0], SCAN.from[1], this.#exploded) : 0;
    this.#ring.visible = shown > 0;
    if (shown === 0) return false;
    const phase = 0.5 - 0.5 * Math.cos((time / SCAN.seconds) * Math.PI * 2);
    this.#ring.position.z = SCAN.z[0] + (SCAN.z[1] - SCAN.z[0]) * phase;
    this.#ring.material.opacity = SCAN.alpha * shown;
    return true;
  }

  /** Where a part of the engine set is in the world now (into `out`), or null if it does not show */
  partPosition(name, out) {
    const part = this.#byName.get(name);
    if (!part || !part.node.visible) return null;
    part.node.updateWorldMatrix(true, false);
    return part.node.getWorldPosition(out);
  }

  /**
   * Readies the engine set off the scene: the powertrain's parts wear their own copies of the set's
   * materials (their occlusion fades as they come apart, the bay's walls keep theirs), all dressed;
   * returned to be compiled, then seated as it is.
   */
  readyEngine(source) {
    source.updateMatrixWorld(true);
    const copies = new Map();
    const meshes = [];
    for (const node of source.children) {
      const powertrain = partData(node.userData).energy !== '';
      node.traverse((object) => {
        if (!object.isMesh) return;
        meshes.push(object);
        if (!powertrain) return;
        if (!copies.has(object.material)) {
          const copy = object.material.clone();
          copy.userData.lift = this.#lift;
          if (lookOf(copy.name).look?.heat) copy.userData.heat = this.#heat;
          copies.set(object.material, copy);
        }
        object.material = copies.get(object.material);
      });
    }
    this.#tune(meshes);
    this.#epure(source);
    return source;
  }

  /**
   * The exploded view's drawing aids, made with the set so they are compiled with it: one dashed
   * brass segment per part that moves (from its seat to where it is; each fades in as its part
   * leaves), and the scan ring round the crank's axis.
   */
  #epure(source) {
    const moving = source.children.filter((node) => partData(node.userData).offset.lengthSq() > 0);
    const count = moving.length * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(count), 1));
    const colour = new THREE.BufferAttribute(new Float32Array(count * 4), 4);
    for (let i = 0; i < count; i += 1) colour.setXYZW(i, BRASS.r, BRASS.g, BRASS.b, 0);
    geometry.setAttribute('color', colour);
    moving.forEach((node, i) => this.#segmentOf.set(node, i));
    this.#leaders = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, dashSize: LEADER.dash, gapSize: LEADER.gap,
    }));
    this.#leaders.name = 'epure-leaders';
    this.#leaders.frustumCulled = false;
    this.#ring = new THREE.Mesh(new THREE.RingGeometry(SCAN.radius[0], SCAN.radius[1], 128), new THREE.MeshBasicMaterial({
      color: BRASS, transparent: true, opacity: SCAN.alpha, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.#ring.name = 'epure-scan';
    this.#ring.position.set(0, SCAN.height, (SCAN.z[0] + SCAN.z[1]) / 2);
    source.add(this.#leaders, this.#ring);
  }

  /**
   * Seats a readied engine set in the body. What the bonnet carries (its felt, the struts' rods) is
   * placed with the bonnet shut: the hinge rests while it is attached, then turns back to where the
   * journey has it. Every part is drawn for a frame or two (its buffers upload before the bonnet
   * lifts), then only what the bonnet's angle and the powertrain show. `open`: the bonnet's angle in
   * the exploded view (radians), under which the parts' paths are bent.
   */
  seatEngine(source, open = 0) {
    if (this.#hasEngine) return;
    const hinge = this.#hinges.get(BONNET)?.node ?? null;
    const turned = hinge ? hinge.quaternion.clone() : null;
    if (hinge) hinge.quaternion.copy(this.#hinges.get(BONNET).rest);
    this.#frame.add(source);
    this.#frame.updateMatrixWorld(true);
    const halves = new Map();
    for (const node of [...source.children]) {
      const data = partData(node.userData);
      if (data.strut && data.anchor && hinge) {
        if (!halves.has(data.strut.side)) halves.set(data.strut.side, {});
        halves.get(data.strut.side)[data.strut.half] = { node, anchor: data.anchor };
      } else if (data.bonnet && hinge) {
        hinge.attach(node);
        this.#underBonnet.push(node);
      } else {
        const part = { node, home: node.position.clone(), ...data };
        this.#parts.push(part);
        this.#byName.set(node.name, part);
      }
    }
    if (hinge) {
      // the struts' upper anchors ride in the hinge's own frame: it must hang from the body's
      if (hinge.parent === this.#frame) {
        for (const { body, rod } of halves.values()) {
          if (!body || !rod) continue;
          const strut = this.#strut(source, hinge, body, rod);
          this.#struts.push(strut);
          this.#underBonnet.push(strut.body, strut.rod);
        }
      }
      this.#fitPaths(hinge, open);
      hinge.quaternion.copy(turned);
    }
    this.#hasEngine = true;
    this.#uploads = 2;
    this.#place();
    this.#aimStruts();
    this.#showPowertrain();
  }

  /** Shows one wheel design ('fan', 'aero', 'rayon'); a design not loaded yet shows once it is */
  useWheels(design) {
    if (!Object.hasOwn(KITS, design)) return;
    this.#design = design;
    const shown = this.#designs.has(design) ? KITS[design] : KITS.fan;
    for (const wheel of this.#wheels) {
      // the brakes (kit '') are every design's
      for (const [kit, parts] of wheel.kits) for (const part of parts) part.visible = kit === '' || shown.includes(kit);
    }
  }

  /** Readies the Aero and Rayon kits off the scene (materials dressed); returns them to be compiled */
  readyWheels(source) {
    const meshes = [];
    source.traverse((object) => {
      if (object.isMesh) meshes.push(object);
    });
    source.updateMatrixWorld(true);
    this.#tune(meshes);
    return source;
  }

  /**
   * Seats readied kits on their hubs: each part goes to its wheel's spinning hub, keeping its place
   * (the kits share the car's frame, whatever the wheels' turn by now), then the chosen design shows.
   */
  seatWheels(source) {
    this.#root.add(source);
    this.#root.updateMatrixWorld(true);
    for (const node of [...source.children]) {
      const key = WHEEL_PART.exec(node.name)?.[1];
      const wheel = this.#wheels.find((candidate) => candidate.key === key);
      if (!wheel) continue;
      wheel.spin.attach(node);
      const kit = kitOf(node.name);
      if (!wheel.kits.has(kit)) wheel.kits.set(kit, []);
      wheel.kits.get(kit).push(node);
      this.#designs.add(kit);
    }
    source.removeFromParent();
    this.useWheels(this.#design);
  }

  /**
   * Turns a hinge (`CTL_door_FL`, `CTL_bonnet`…) from where the master left it; unknown names do
   * nothing. The bonnet aims its struts, and shows what lies under it only while it is up.
   */
  swing(name, radians) {
    const hinge = this.#hinges.get(name);
    if (!hinge) return;
    hinge.node.quaternion.copy(hinge.rest).multiply(this.#turn.setFromAxisAngle(HINGE, radians));
    if (name !== BONNET) return;
    this.#aimStruts();
    const open = radians !== 0;
    if (open !== this.#bonnetOpen) {
      this.#bonnetOpen = open;
      this.#showPowertrain();
    }
  }

  /** The cabin's light blade and screens, 0 to 1 (they welcome whoever opens the door) */
  glow(level) {
    for (const [material, base] of this.#blades) material.emissiveIntensity = base * level;
    for (const { uniforms } of this.#screens.values()) uniforms.level.value = SCREEN_LEVEL * level;
  }

  /**
   * Readies the cabin's model off the scene: its materials dressed, its still parts merged, its
   * screens measured. Its nodes share the exterior's frame; it is returned to be compiled, then
   * seated as it is.
   */
  async readyCabin(source) {
    const meshes = [];
    source.traverse((object) => {
      if (object.isMesh) meshes.push(object);
    });
    source.updateMatrixWorld(true);
    this.#tune(meshes);
    // a few milliseconds at a time: merged at once, the cabin of the brief of 2026-11-15 took 50 to
    // 100 ms (it is off the scene meanwhile)
    await this.#mergeSliced(source);
    return source;
  }

  /** Seats a readied cabin in the body (the car may be anywhere by now: its frame carries it) */
  seatCabin(cabin) {
    if (this.#hasCabin) return;
    this.#frame.add(cabin);
    this.#collectHinges(cabin);
    this.#hasCabin = true;
  }

  async #assemble(source, cgHeight) {
    source.updateMatrixWorld(true);
    this.#root.add(this.#pivot);
    this.#pivot.position.set(0, cgHeight, 0);
    this.#pivot.add(this.#frame);
    this.#frame.position.set(0, -cgHeight, 0);

    const meshes = [];
    source.traverse((object) => {
      if (object.isMesh) meshes.push(object);
    });

    // each wheel: a knuckle on the axle's centre, square to the car, and the spinning hub in it
    const top = [...source.children];
    for (const node of top) {
      const match = WHEEL.exec(node.name);
      if (!match) continue;
      const knuckle = new THREE.Group();
      node.getWorldPosition(knuckle.position);
      const spin = new THREE.Group();
      knuckle.add(spin);
      this.#root.add(knuckle);
      this.#wheels.push({ key: match[1] + match[2], front: match[1] === 'F', knuckle, spin, node, kits: new Map() });
    }
    this.#root.updateMatrixWorld(true);
    for (const wheel of this.#wheels) {
      for (const part of [...wheel.node.children]) {
        (ON_KNUCKLE.test(part.name) ? wheel.knuckle : wheel.spin).attach(part);
        const kit = kitOf(part.name);
        if (!wheel.kits.has(kit)) wheel.kits.set(kit, []);
        wheel.kits.get(kit).push(part);
      }
      wheel.node.removeFromParent();
      delete wheel.node;
    }
    // the rest keeps its hierarchy: the doors and the bonnet swing on their hinges
    for (const node of top) {
      if (!WHEEL.test(node.name)) this.#frame.attach(node);
    }
    this.#collectHinges(this.#frame);
    this.#tune(meshes);
    this.#frame.updateMatrixWorld(true);
    this.#glow = new LampGlow(meshes);
    // a few milliseconds at a time: merged at once, the body held the boot in one task of 60 ms
    // (240 ms on Lighthouse's phone, 2026-11-16)
    await nextTask();
    await this.#mergeSliced(this.#frame);
    // the Six's tailpipes: one group per exhaust, each merged in its own, shown by `usePowertrain`
    for (const [kit, group] of Object.entries(this.#tips)) {
      group.name = `exhaust-${kit}`;
      this.#frame.add(group);
    }
    for (const mesh of meshes) {
      const kit = TIP.exec(mesh.name)?.[1];
      if (kit) this.#tips[kit].attach(mesh);
    }
    for (const group of Object.values(this.#tips)) await this.#mergeSliced(group, () => true);
    this.#showPowertrain();
  }

  /**
   * Merges the still parts under `space` into one mesh per material, in that space (the frame, or a
   * cabin not yet seated, whose space is the frame's), `SLICE_MS` at a time. The moving hinges'
   * parts, the glass (sorted and see-through) and the screens (their picture is laid in their own
   * frame) stay as they are; `accept` may choose otherwise (a group shown or hidden whole).
   */
  async #mergeSliced(space, accept = (mesh) => this.#still(mesh)) {
    const steps = this.#mergeSteps(space, accept);
    let since = performance.now();
    while (!steps.next().done) {
      if (performance.now() - since < SLICE_MS) continue;
      await nextTask();
      since = performance.now();
    }
  }

  /** The merge's work, one part or one material at a time */
  *#mergeSteps(space, accept) {
    space.updateMatrixWorld(true);
    const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert();
    const matrix = new THREE.Matrix4();
    const groups = new Map();
    const still = [];
    space.traverse((node) => {
      if (node.isMesh && !node.name.startsWith('merged-') && accept(node)) still.push(node);
    });
    for (const mesh of still) {
      const geometry = frameGeometry(mesh, matrix.multiplyMatrices(toSpace, mesh.matrixWorld));
      yield;
      if (!geometry) continue;
      if (!groups.has(mesh.material)) groups.set(mesh.material, []);
      groups.get(mesh.material).push({ mesh, geometry });
    }
    for (const [material, parts] of groups) {
      const merged = parts.length > 1 ? mergeGeometries(parts.map((part) => part.geometry), false) : null;
      for (const part of parts) part.geometry.dispose();
      if (!merged) continue;
      for (const { mesh } of parts) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `merged-${material.name}`;
      space.add(mesh);
      yield;
    }
  }

  /** A part that never moves on its own: opaque, not a screen, not merged yet, under no hinge the page turns, no tailpipe */
  #still(mesh) {
    if (mesh.material.transparent || mesh.material.userData.screen || mesh.name.startsWith('merged-') || TIP.test(mesh.name)) return false;
    for (let node = mesh.parent; node && node !== this.#frame; node = node.parent) {
      if (this.#moving.has(node.name)) return false;
    }
    return true;
  }

  #collectHinges(root) {
    root.traverse((node) => {
      if (PIVOT.test(node.name) && !this.#hinges.has(node.name)) this.#hinges.set(node.name, { node, rest: node.quaternion.clone() });
    });
  }

  #tune(meshes) {
    const dressed = new Set();
    for (const mesh of meshes) {
      carryOcclusion(mesh);
      const name = mesh.material?.name;
      const { look, baked } = lookOf(name);
      if (baked) {
        // baked in Blender: its maps hold the look; the page adds its heat, lift and the occlusion
        // between parts (the vertex `_AO`), nothing procedural
        const material = mesh.material;
        if (dressed.has(material)) continue;
        dressed.add(material);
        material.vertexColors = false;
        dress(material, { lift: material.userData.lift ?? null, heat: material.userData.heat ?? null });
        continue;
      }
      if (look?.frit) carryEdge(mesh);
      if (look?.replace) {
        if (!this.#replaced.has(name)) this.#replaced.set(name, new THREE.MeshPhysicalMaterial({ name, ...look.replace }));
        mesh.material = this.#replaced.get(name);
      }
      const material = mesh.material;
      if (dressed.has(material)) continue;
      dressed.add(material);
      // the master carries no vertex colours (its occlusion is `_AO`): none may tint a material
      material.vertexColors = false;
      if (look?.set) material.setValues(look.set);
      // the master has no UVs: the tangent frame anisotropy needs (the brushed aluminium's) came out
      // degenerate and burnt the spokes and the vents to white
      if (material.anisotropy > 0) material.anisotropy = 0;
      if (look?.emissive !== undefined) this.#lamps.set(material, look.emissive);
      if (look?.blade !== undefined) {
        this.#blades.set(material, look.blade);
        material.emissiveIntensity = 0;
      }
      if (look?.screen && !this.#screens.has(look.screen)) {
        const screen = screenOf(mesh);
        material.userData.screen = screen.uniforms;
        this.#screens.set(look.screen, screen);
      }
      dress(material, {
        paint: Boolean(look?.paint),
        tread: Boolean(look?.tread),
        disc: Boolean(look?.disc),
        wood: look?.wood ?? '',
        screen: material.userData.screen ?? null,
        frit: look?.frit ?? null,
        weave: Boolean(look?.weave),
        lift: material.userData.lift ?? null,
        heat: material.userData.heat ?? null,
        upholstery: Boolean(look?.upholstery),
        crease: Boolean(look?.crease),
        pebble: Boolean(look?.pebble),
        louvre: Boolean(look?.louvre),
        perforation: Boolean(look?.perforation),
        carpet: Boolean(look?.carpet),
        ao: look?.ao !== false,
      });
    }
  }

  /**
   * Bends the exploded paths out from under the open bonnet. From the underside of the bonnet and
   * its felt at `open` radians, each part whose way up would touch it glides forward, by as much as
   * it needs and no more (`lead`, metres along -z); the others keep their straight path.
   */
  #fitPaths(hinge, open) {
    const ceiling = this.#ceiling(hinge, open);
    const box = new THREE.Box3();
    const matrix = new THREE.Matrix4();
    for (const part of this.#parts) {
      part.lead = 0;
      const geometry = part.node.geometry;
      if (part.offset.y <= 0 || !geometry) continue;
      geometry.computeBoundingBox();
      box.copy(geometry.boundingBox).applyMatrix4(matrix.compose(part.home, part.node.quaternion, part.node.scale));
      const top = box.max.y + part.offset.y + PATH.clearance;
      const [z0, z1] = [box.min.z + part.offset.z, box.max.z + part.offset.z];
      for (let lead = 0; lead >= -PATH.reach; lead -= PATH.step) {
        part.lead = lead;
        if (ceiling(z0 + lead, z1 + lead, top)) break;
      }
    }
  }

  /**
   * The open bonnet's underside along the car, as a test of whether a part's top clears it over a
   * stretch of z: sampled every centimetre from the bonnet's and its felt's vertices near the middle,
   * the gaps between vertices filled in; behind the hinge, the cowl stands at the hinge's height.
   */
  #ceiling(hinge, open) {
    const turned = hinge.quaternion.clone();
    hinge.quaternion.copy(this.#hinges.get(BONNET).rest).multiply(this.#turn.setFromAxisAngle(HINGE, open));
    this.#frame.updateMatrixWorld(true);
    const toFrame = new THREE.Matrix4().copy(this.#frame.matrixWorld).invert();
    const matrix = new THREE.Matrix4();
    const vertex = new THREE.Vector3();
    const count = Math.round((PATH.z[1] - PATH.z[0]) / PATH.step);
    const bins = new Float32Array(count).fill(Number.POSITIVE_INFINITY);
    const binOf = (z) => Math.floor((z - PATH.z[0]) / PATH.step);
    hinge.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      matrix.multiplyMatrices(toFrame, mesh.matrixWorld);
      for (let i = 0; i < position.count; i += 1) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
        const b = binOf(vertex.z);
        if (Math.abs(vertex.x) <= PATH.band && b >= 0 && b < count) bins[b] = Math.min(bins[b], vertex.y);
      }
    });
    hinge.quaternion.copy(turned);
    this.#frame.updateMatrixWorld(true);
    const known = [];
    bins.forEach((y, b) => {
      if (Number.isFinite(y)) known.push(b);
    });
    for (let j = 0; j < known.length - 1; j += 1) {
      const [b0, b1] = [known[j], known[j + 1]];
      for (let b = b0 + 1; b < b1; b += 1) bins[b] = bins[b0] + ((bins[b1] - bins[b0]) * (b - b0)) / (b1 - b0);
    }
    for (let b = Math.max(0, binOf(hinge.position.z)); b < count; b += 1) bins[b] = Math.min(bins[b], hinge.position.y);
    return (z0, z1, top) => {
      for (let b = Math.max(0, binOf(z0)); b <= Math.min(count - 1, binOf(z1)); b += 1) if (top > bins[b]) return false;
      return true;
    };
  }

  /** Every part of the engine set at its place in the exploded view, each leader from its seat to it */
  #place() {
    const k = this.#exploded;
    for (const part of this.#parts) {
      const e = smoothstep(part.at, part.at + EXPLODE_SPAN, k);
      part.node.position.copy(part.home).addScaledVector(part.offset, e);
      // forward first, up after: the path curves out from under the bonnet (the climb follows e²,
      // the glide 2e − e²), clear of it all the way since the bonnet rises towards the front
      if (part.lead) {
        part.node.position.y += part.offset.y * (e * e - e);
        part.node.position.z += part.lead * e * (2 - e);
      }
    }
    if (!this.#leaders) return;
    const geometry = this.#leaders.geometry;
    const position = geometry.getAttribute('position');
    const distance = geometry.getAttribute('lineDistance');
    const colour = geometry.getAttribute('color');
    for (const part of this.#parts) {
      const i = this.#segmentOf.get(part.node);
      if (i === undefined) continue;
      const { home, node } = part;
      position.setXYZ(2 * i, home.x, home.y, home.z);
      position.setXYZ(2 * i + 1, node.position.x, node.position.y, node.position.z);
      distance.setX(2 * i, 0);
      distance.setX(2 * i + 1, home.distanceTo(node.position));
      const alpha = node.visible ? LEADER.alpha * smoothstep(0.03, 0.3, smoothstep(part.at, part.at + EXPLODE_SPAN, k)) : 0;
      colour.setW(2 * i, alpha);
      colour.setW(2 * i + 1, alpha);
    }
    position.needsUpdate = true;
    distance.needsUpdate = true;
    colour.needsUpdate = true;
    this.#leaders.visible = k > 0;
  }

  /**
   * What shows: the tips of the chosen exhaust on a Six; with the bonnet up (or the parts apart) the
   * bay, what the bonnet carries and the chosen powertrain, its internals only apart; with it shut,
   * only what the grille lets through. Everything shows for the frames that upload it.
   */
  #showPowertrain() {
    const { energy, version, exhaust } = this.#powertrain;
    for (const [kit, group] of Object.entries(this.#tips)) group.visible = energy === 'six' && kit === exhaust;
    const uploading = this.#uploads > 0;
    const open = this.#bonnetOpen || this.#exploded > 0;
    for (const part of this.#parts) {
      const mine = part.energy === energy && (part.version === '' || part.version === version);
      const shown = part.energy === '' ? open || THROUGH_GRILLE.test(part.node.name) : mine && open && (!part.inner || this.#exploded > 0);
      part.node.visible = uploading || shown;
    }
    for (const node of this.#underBonnet) node.visible = uploading || open;
    this.#place(); // the leaders of parts that just hid or showed
  }

  /**
   * A strut's two halves on pivots at their anchors, in the engine set's space (the body's): the
   * body's fixed, the rod's moved to the upper anchor, which the bonnet's hinge carries (`socket`,
   * in the hinge's own frame)
   */
  #strut(space, hinge, body, rod) {
    const [lower, upper] = [body.anchor, rod.anchor];
    const pivots = [lower, upper].map((anchor) => {
      const pivot = new THREE.Group();
      pivot.position.copy(anchor);
      space.add(pivot);
      return pivot;
    });
    space.updateMatrixWorld(true);
    pivots[0].attach(body.node);
    pivots[1].attach(rod.node);
    hinge.updateMatrix();
    const socket = upper.clone().applyMatrix4(this.#inverse.copy(hinge.matrix).invert());
    return { body: pivots[0], rod: pivots[1], lower, socket, rest: upper.clone().sub(lower).normalize() };
  }

  /** Aims each strut's halves along the line between its anchors as the bonnet sets them */
  #aimStruts() {
    if (this.#struts.length === 0) return;
    const hinge = this.#hinges.get(BONNET).node;
    hinge.updateMatrix();
    for (const strut of this.#struts) {
      const upper = this.#point.copy(strut.socket).applyMatrix4(hinge.matrix);
      strut.rod.position.copy(upper);
      // both halves turn alike: the rod points from the upper anchor to the lower one, the body back
      strut.body.quaternion.setFromUnitVectors(strut.rest, upper.sub(strut.lower).normalize());
      strut.rod.quaternion.copy(strut.body.quaternion);
    }
  }
}

/**
 * A vector of the master's (Blender's axes, metres) in three's frame, [x, y, z] → (x, z, -y); null
 * unless it is three finite numbers within `limit`
 */
function vectorOf(value, limit) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit)) return null;
  return new THREE.Vector3(value[0], value[2], -value[1]);
}

/**
 * A part's exploded-view data, the GLB's extras read at the door: closed sets through allow-lists,
 * numbers finite and bounded, anything else the default (a part that stays and always shows)
 */
function partData(data) {
  const at = data.explode_at;
  const strut = STRUT_SIDES.has(data.strut) && STRUT_HALVES.has(data.strut_part) ? { side: data.strut, half: data.strut_part } : null;
  return {
    offset: vectorOf(data.explode, 1) ?? new THREE.Vector3(),
    at: typeof at === 'number' && Number.isFinite(at) ? clamp(at, 0, 1 - EXPLODE_SPAN) : 0,
    inner: data.inner === true,
    bonnet: data.bonnet === true,
    energy: ENERGY_TAGS.has(data.energy) ? data.energy : '',
    version: VERSION_TAGS.has(data.version) ? data.version : '',
    strut,
    anchor: strut ? vectorOf(data.anchor, 3) : null,
  };
}

/** A float copy of an attribute (the GLB's are quantized: they would clip once moved) */
function floatCopy(attribute) {
  const { count, itemSize } = attribute;
  const array = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < itemSize; k += 1) array[i * itemSize + k] = attribute.getComponent(i, k);
  }
  return new THREE.BufferAttribute(array, itemSize);
}

/** A part's geometry carried into the frame's space (`matrix`), with what the materials read */
function frameGeometry(mesh, matrix) {
  const source = mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  // a baked material reads its maps through the UVs (every part wearing it has them); the others
  // draw in metres and leave theirs, so the parts that share a material keep the same attributes
  const read = lookOf(mesh.material?.name).baked ? ['position', 'normal', 'aoVertex', 'uv'] : ['position', 'normal', 'aoVertex'];
  for (const name of read) {
    const attribute = source.getAttribute(name);
    if (!attribute) return null;
    geometry.setAttribute(name, floatCopy(attribute));
  }
  const count = source.getAttribute('position').count;
  const index = source.index ? source.index.array.slice() : Uint32Array.from({ length: count }, (_, i) => i);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.applyMatrix4(matrix);
  return geometry;
}

/**
 * A screen's rectangle in its mesh's metric frame (the frame Materials draws in): the plane of its
 * mean normal, its width along the car's X, its height up the glass.
 */
function screenOf(mesh) {
  mesh.updateWorldMatrix(true, false);
  const scale = mesh.matrixWorld.getMaxScaleOnAxis(); // the quantization's (the car's own scale is 1)
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < normal.count; i += 1) n.add(p.fromBufferAttribute(normal, i));
  n.normalize();
  const u = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  if (v.y < 0) v.negate();
  let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i).multiplyScalar(scale);
    const a = p.dot(u);
    const b = p.dot(v);
    [u0, u1, v0, v1] = [Math.min(u0, a), Math.max(u1, a), Math.min(v0, b), Math.max(v1, b)];
  }
  const width = u1 - u0;
  const height = v1 - v0;
  const origin = u.clone().multiplyScalar((u0 + u1) / 2).addScaledVector(v, (v0 + v1) / 2);
  return {
    width,
    height,
    uniforms: {
      map: { value: null },
      origin: { value: origin },
      u: { value: u.divideScalar(width) },
      v: { value: v.divideScalar(height) },
      level: { value: 0 },
    },
  };
}
