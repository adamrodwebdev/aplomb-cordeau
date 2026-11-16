/**
 * Puts the landing together each frame: reads the smoothed scroll and the arrival's clock, poses the
 * car, throws the spray and writes the traces in the wet road, switches the stage from road to
 * showroom behind the water screen, and feeds the page its custom properties. It decides nothing
 * the rules do not say.
 */
import * as THREE from 'three';
import { ARRIVAL, CAR, JOURNEY, LANDING, LAYOUTS, PAINT_SWEEP, PORTRAIT_BELOW, ROAD_TITLE, SPRAY, SURGE, arcEnvironment, arcLight } from '../rules/choreography.js';
import { DEG, clamp, curve, easeInCubic, keyframes, remap, smoothstep, wrapAngle } from '../rules/math.js';
import { sheetArrivals, sprayParticles, surgeParticles, traceSamples } from '../rules/drift.js';
import { ScrollChoreographer } from '../logic/ScrollChoreographer.js';
import { ArrivalTrigger } from '../logic/ArrivalTrigger.js';
import { CarChoreography } from '../logic/CarChoreography.js';
import { ExitEngine } from '../logic/ExitEngine.js';
import { SeededRandom } from '../time.js';
import { DAWN_SUN, DUSK_SUN } from './Environments.js';
import { ContactShadow, WetTraces } from './Ground.js';
import { SprayField } from './SprayField.js';
import { WaterScreen } from './WaterScreen.js';
import { WetRoad } from './WetRoad.js';
import { EngineNotes } from './EngineNotes.js';

const SPRAY_SEED = 1710;
/** The face the tyres write the headline in: Aplomb Estoc at full tension; cap height over the em */
const ROAD_FONT = Object.freeze({ family: '"Aplomb Estoc Fierce", sans-serif', weight: 400, capRatio: 0.7 });

/**
 * The direct light under each light of the tonal arc (its environment's name): the low dawn sun on
 * the road, the softbox above in the studio, white or night; the warm workshop's lamp, the night's
 * cool one, dusk's low sun opposite the dawn's
 */
const SUN = DAWN_SUN.clone().multiplyScalar(30);
const DUSK = DUSK_SUN.clone().multiplyScalar(30);
const LIGHTS = new Map([
  ['road', { key: [0xffc896, 2.6, [SUN.x, SUN.y, SUN.z]], sky: [0x1c2638, 0x15130f, 0.25], environment: 1 }],
  ['showroom', { key: [0xffffff, 1.1, [2, 9, 3]], sky: [0xd9dde2, 0x1d1f22, 0.15], environment: 1 }],
  ['studio-white', { key: [0xffffff, 1.0, [2, 9, 3]], sky: [0xf4f6f8, 0xc9ccd0, 0.3], environment: 0.85 }],
  ['workshop', { key: [0xffd2a6, 1.1, [3, 8, -2]], sky: [0x8a5a34, 0x1a120c, 0.2], environment: 1 }],
  ['night', { key: [0xb4c8ff, 0.8, [-3, 8, 2]], sky: [0x2a3c70, 0x05070c, 0.18], environment: 1 }],
  ['dusk', { key: [0xffbf9c, 1.3, [DUSK.x, DUSK.y, DUSK.z]], sky: [0x6a3a40, 0x140c10, 0.2], environment: 0.85 }],
]);
/** The journey's lamp, in the car's frame: warm under the roof in the cabin, cool over the open bay.
 * One lamp moved between them: a second light would recompile every program. */
const LAMPS = Object.freeze({
  cabin: { position: [-0.1, 1.12, -0.15], colour: 0xfff0dc, reach: 2.6 },
  engine: { position: [0.3, 2.3, -1.5], colour: 0xe6efff, reach: 2.6 }, // short reach: the seats behind the glass stay as they were
});
const pulse = ([a, b, c, d], p) => smoothstep(a, b, p) * (1 - smoothstep(c, d, p));

export class SceneDirector {
  #stage;
  #rig;
  #environments;
  #page;
  #root;
  #arc = '';
  #lit = ''; // the environment the paint reflects now (LIGHTS' name)
  #sweepAt = -1; // when the light began to sweep a new paint, or -1
  #plumb;
  #canvas;
  #caption;
  #settings;
  #debug;
  #journey;
  #look;
  #notes;
  #notePoint = new THREE.Vector3();
  #reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  #chapter = '';
  #lamp = new THREE.PointLight(0xfff0dc, 0, 2.6, 2);
  #shots = [{ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30, shift: [0, 0] },
    { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30, shift: [0, 0] }];
  #toCar = new THREE.Matrix4();
  #gazeA = new THREE.Vector3();
  #gazeB = new THREE.Vector3();
  #gazeTarget = new THREE.Vector3();
  #screen;
  #shadow;
  #key = new THREE.DirectionalLight();
  #sky = new THREE.HemisphereLight();
  #scroll = new ScrollChoreographer(LANDING.scrubSeconds);
  #arrival;
  #choreography = null;
  #road;
  #spray = null;
  #sheet = []; // the drops thrown at the lens, to find where they land first
  #hit = [1, 1]; // the scroll over which they land: the glass drowns from the first to most
  #impact = new THREE.Vector2(0.3, 0.3); // where on the glass (uv) the first land
  #horizon = 0.4;
  #point = new THREE.Vector3();
  #traces = null;
  #layoutName = '';
  #place = '';
  #style = new Map();
  #last = { stateBefore: 'away', debugAt: 0, frames: 0, fpsAt: 0, fps: 0 };
  #sound = null; // the exit's engine (EngineSound), once the visitor turns the sound on
  #exitEngine = new ExitEngine();
  #heard = new THREE.Vector3();

  constructor({ stage, rig, environments, shadowPlate, page, root, plumb, canvas, caption, journey, look, notes, settings, debug }) {
    this.#stage = stage;
    this.#rig = rig;
    this.#environments = environments;
    this.#page = page;
    this.#root = root;
    this.#plumb = plumb;
    this.#canvas = canvas;
    this.#caption = caption;
    this.#journey = journey;
    this.#look = look;
    this.#notes = notes ? new EngineNotes(notes, journey?.querySelector('[data-panel="energy"]') ?? null) : null;
    this.#settings = settings;
    this.#debug = debug;
    this.#screen = new WaterScreen(settings.screenScale);
    this.#road = new WetRoad(settings.reflect);
    this.#shadow = new ContactShadow(shadowPlate, CAR.shadowPlate);
    rig.object.add(this.#shadow.object);
    // the journey's lamp rides with the car (its own frame: metres)
    this.#lamp.position.fromArray(LAMPS.cabin.position);
    rig.object.add(this.#lamp);
    stage.scene.add(rig.object, this.#key, this.#sky, this.#road.object);
    this.#arrival = new ArrivalTrigger({
      arriveAt: LANDING.arriveAt,
      leaveAt: LANDING.leaveAt,
      parkAt: Number.POSITIVE_INFINITY, // set once the layout is known (the stop depends on it)
      leaveSeconds: ARRIVAL.leaveSeconds,
    });
  }

  /**
   * Compiles every program the scene will draw before it is drawn, with KHR_parallel_shader_compile
   * where the browser has it: the screen's, under the studio's light (the place's light is set at
   * the first frame, and programs compiled without it were all compiled again then), the wet
   * road's mirror pass and the water on the glass. With `object` (the cabin, before it is seated),
   * that object's only, as the scene will light it.
   */
  warm(object = null) {
    const { renderer, scene, camera } = this.#stage;
    scene.environment ??= this.#environments.for('showroom');
    // the lights count only while they show, and the journey's lamp rides with the car: a cabin
    // compiled while the car was away (before its arrival) lacked it, and its programs compiled
    // again when the car came in (0.4 s). The programs are made in the calls below, at once.
    const car = this.#rig.object;
    const shown = car.visible;
    car.visible = true;
    const what = { object: object ?? scene, camera, scene };
    const compiled = Promise.all([
      renderer.compileAsync(what.object, camera, scene),
      this.#road.warm(renderer, what),
      object ? null : this.#screen.warm(renderer),
    ]);
    car.visible = shown;
    return compiled;
  }

  /** The scroll's progress through the landing, in screens; `now` skips the smoothing */
  aim(progress, now = false) {
    if (now) this.#scroll.jump(progress);
    else this.#scroll.aim(progress);
  }

  resize(width, height) {
    this.#stage.resize(width, height);
    const name = this.#stage.aspect < PORTRAIT_BELOW ? 'portrait' : 'landscape';
    if (name !== this.#layoutName) this.#useLayout(name);
    this.#screen.resize(this.#stage.pixels);
    this.#road.resize(this.#stage.pixels);
    this.#frameCamera();
    this.#notes?.measure();
  }

  /** The visitor turns the parked car (drag or buttons) */
  turnBy(radians) {
    if (this.#arrival.state === 'parked') this.#choreography.turnBy(radians);
  }

  get ready() {
    return this.#arrival.state === 'parked' && (this.#chapter === '' || this.#chapter === 'exterior');
  }

  /** A new paint: a light sweeps the flank (none with reduced motion) */
  sweep() {
    if (!this.#reduced.matches) this.#sweepAt = -2; // started by the next frame, on its clock
  }

  /** The visitor's sound: an EngineSound for the exit, or null (silence). The engine starts afresh. */
  useSound(sound) {
    this.#sound = sound;
    this.#exitEngine = new ExitEngine();
  }

  /** One frame. Returns whether to keep animating, and whether only the water still breathes. */
  frame(dt, time) {
    const step = Math.min(dt, 1 / 20);
    this.#scroll.step(step);
    const p = this.#scroll.progress;
    const before = this.#arrival.state;
    this.#arrival.update(p, step);
    const pose = this.#choreography.frame(p, this.#arrival, step);
    if (pose.place !== this.#place) this.#enter(pose.place);
    this.#rig.pose(pose);
    // the driver's door swings with the journey; the light blade welcomes the visitor with it
    const showroom = pose.place === 'showroom';
    const door = JOURNEY.door;
    this.#rig.swing(door.hinge, showroom ? door.open * DEG * keyframes(door.keys, p) : 0);
    this.#rig.glow(showroom ? smoothstep(JOURNEY.blade[0], JOURNEY.blade[1], p) : 0);
    // the bonnet lifts as the camera comes round the nose (once the engine set is there to show),
    // and the engine opens into its exploded view with the scroll
    const bay = showroom && this.#rig.hasEngine;
    const bonnet = JOURNEY.bonnet;
    this.#rig.swing(bonnet.hinge, bay ? bonnet.open * DEG * keyframes(bonnet.keys, p) : 0);
    const apart = bay ? keyframes(JOURNEY.explode, p) : 0;
    this.#rig.explode(apart);
    // the "Épure": the scan ring sweeps the engine while it is apart (still with reduced motion)
    const scanning = this.#rig.scan(time, !this.#reduced.matches);
    const dressing = this.#look ? this.#look.update(step) : false;
    if (pose.place === 'showroom') {
      this.#journeyCamera(p);
      this.#light(p);
    }
    if (this.#notes) this.#notes.update(apart >= JOURNEY.notesFrom, this.#rig.powertrain, (name) => this.#onScreen(name));
    this.#setChapter(pose.place === 'showroom' ? (JOURNEY.chapters.find((ch) => p >= ch.shown[0] && p <= ch.shown[1])?.id ?? '') : '');
    this.#setArc(arcLight(pose.place, p, this.#rig.powertrain.energy));
    // the paint reflects the arc's light (the night studio's while another is still on its way)
    const wanted = arcEnvironment(this.#arc, this.#root.dataset.theme === 'light' ? 'light' : 'dark');
    this.#lightUp(this.#environments.for(wanted) ? wanted : (pose.place === 'road' ? 'road' : 'showroom'));
    const sweeping = this.#sweep(time);

    let sprayFade = 0;
    if (pose.place === 'road') {
      this.#traces.extendTo(pose.u);
      sprayFade = 1 - smoothstep(LANDING.swap[0] - 0.04, LANDING.swap[0] + 0.04, p);
    }
    this.#spray.update(pose.place === 'road' ? pose.u : 0, sprayFade);
    this.#road.update(time, 1);

    // the sheet the tyres threw lands on the glass: it drowns from where the first drops hit
    const hit = remap(p, this.#hit[0], this.#hit[1]);
    const clear = smoothstep(LANDING.screenClear[0], LANDING.screenClear[1], p);
    const phase = smoothstep(LANDING.swap[0], LANDING.swap[1], p);
    const offscreen = p > LANDING.screens + 0.02;
    this.#canvas.classList.toggle('is-off', offscreen);
    let screenShown = false;
    if (!offscreen) {
      this.#stage.clear();
      this.#stage.render();
      screenShown = this.#screen.render(this.#stage.renderer, { hit, clear, time, warm: 1 - phase, phase, origin: this.#impact, horizon: this.#horizon });
    }
    if (this.#sound) this.#hear(p, pose, step);

    this.#writePage(p, pose);
    const braking = before === 'arriving' && this.#arrival.state === 'arriving' && this.#arrival.clock >= ARRIVAL.cruiseFor && this.#arrival.clock - step < ARRIVAL.cruiseFor;
    const settled = this.#arrival.state === 'parked' || (this.#arrival.state === 'arriving' && this.#arrival.clock > this.#choreography.stopAt + 0.05);
    this.#plumb.update(step, this.#scroll.velocity * 120 + (braking ? 90 : 0), settled);
    this.#plumb.show(p);
    this.#writeDebug(time, p, pose);

    const busy = !this.#scroll.settled || this.#arrival.playing || this.#choreography.settling || this.#plumb.moving || dressing || sweeping;
    // the wind keeps the puddles moving while the road is in view, and the film breathes on the glass;
    // a running engine is heard at half rate too, so it can stop once the car stands
    const engine = this.#sound !== null && this.#exitEngine.state === 'running';
    const ambient = (!offscreen && (screenShown || pose.place === 'road' || scanning)) || engine;
    return { busy, ambient };
  }

  /**
   * The exit's engine, heard from the camera: ExitEngine follows the car rolling out (the exit's
   * share of the scroll, the metres it covers), the sound follows ExitEngine, from where the car is.
   */
  #hear(p, pose, step) {
    const exitU = pose.place === 'showroom' ? remap(p, LANDING.exit[0], LANDING.exit[1]) : 0;
    const engine = this.#exitEngine.update({ exitU, travel: easeInCubic(exitU) * ARRIVAL.exitDistance, dt: step });
    const sound = this.#sound;
    const at = sound.now;
    if (engine.ignite) {
      sound.configure(this.#rig.powertrain, at);
      sound.ignite(at);
    }
    if (engine.stop) sound.stop(at);
    if (engine.away) sound.driveAway(at);
    if (engine.back) sound.rejoin(at);
    if (engine.state !== 'running') return;
    const camera = this.#stage.camera;
    camera.updateMatrixWorld();
    this.#heard.set(pose.x, 0.7, pose.z).applyMatrix4(camera.matrixWorldInverse);
    const pan = clamp(this.#heard.x / (Math.abs(this.#heard.z) + 1.5), -1, 1);
    sound.follow(engine, { distance: this.#heard.length(), pan }, at);
  }

  #useLayout(name) {
    this.#layoutName = name;
    const layout = LAYOUTS[name];
    this.#choreography = new CarChoreography(layout);
    this.#arrival = new ArrivalTrigger({
      arriveAt: LANDING.arriveAt,
      leaveAt: LANDING.leaveAt,
      parkAt: this.#choreography.stopAt + ARRIVAL.parkAfter,
      leaveSeconds: ARRIVAL.leaveSeconds,
    });
    if (this.#spray) {
      this.#stage.scene.remove(this.#spray.object);
      this.#spray.dispose();
    }
    const plan = this.#choreography.drift;
    const random = new SeededRandom(SPRAY_SEED);
    const thrown = Math.round(this.#settings.spray * SURGE.share);
    const [from, to] = LANDING.drift;
    const span = layout.surge.map((p) => remap(p, from, to));
    this.#sheet = surgeParticles(plan, CAR, { surge: SURGE, random, count: thrown, span, camera: layout.road.position });
    this.#hit = sheetArrivals(this.#sheet, LANDING.driftSeconds, SURGE.arrived).map((u) => from + u * (to - from));
    const particles = [...sprayParticles(plan, CAR, SPRAY, random, this.#settings.spray - thrown), ...this.#sheet];
    this.#spray = new SprayField(particles, { seconds: LANDING.driftSeconds, ringShare: SPRAY.ringShare, aperture: SURGE.aperture });
    this.#stage.scene.add(this.#spray.object);
    this.#traces?.dispose();
    const traces = traceSamples(this.#choreography.drift, CAR);
    this.#traces = new WetTraces(layout.skid, this.#settings.skidPixels, traces, ROAD_TITLE, ROAD_FONT, SPRAY.minSlip);
    this.#road.useTraces(this.#traces.texture, this.#traces.rect);
    this.#place = '';
  }

  #enter(place) {
    this.#place = place;
    this.#road.object.visible = place === 'road';
    if (place === 'road') this.#choreography.resetTurn();
    this.#page.dataset.phase = place;
    this.#frameCamera();
  }

  /**
   * The journey's camera: eases from shot to shot along the scroll (JOURNEY.camera). It moves on an
   * arc round the car, in the car's own frame (radius, angle the short way, height), so it goes round
   * the nose instead of through the bonnet. Narrow screens pull every shot back but the cabin's.
   */
  #journeyCamera(p) {
    const keys = JOURNEY.camera;
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1][0]) i += 1;
    const [p0, a] = keys[i];
    const [p1, b] = keys[i + 1];
    const t = smoothstep(p0, p1, p);
    const car = this.#rig.object;
    car.updateMatrixWorld();
    this.#toCar.copy(car.matrixWorld).invert();
    const from = this.#shot(a, this.#shots[0]);
    const to = this.#shot(b, this.#shots[1]);
    let position;
    let target;
    if (from.inside && to.inside) {
      // a turn of the head inside the cabin (to the rear seats and back): the eye moves straight,
      // the gaze swings round; a straight line between the targets dipped through the seats
      const gaze = this.#gazeBetween(from, to, t);
      position = from.position.lerp(to.position, t);
      target = this.#gazeTarget.copy(position).add(gaze).applyMatrix4(car.matrixWorld);
      position.applyMatrix4(car.matrixWorld);
    } else {
      const ra = Math.hypot(from.position.x, from.position.z);
      const rb = Math.hypot(to.position.x, to.position.z);
      const ta = Math.atan2(from.position.z, from.position.x);
      let turn = Math.atan2(to.position.z, to.position.x) - ta;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      const radius = ra + (rb - ra) * t;
      const angle = ta + turn * t;
      position = from.position.set(radius * Math.cos(angle), from.position.y + (to.position.y - from.position.y) * t, radius * Math.sin(angle))
        .applyMatrix4(car.matrixWorld);
      target = from.target.lerp(to.target, t).applyMatrix4(car.matrixWorld);
    }
    this.#stage.frame({
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      fov: from.fov + (to.fov - from.fov) * t,
      shift: [from.shift[0] + (to.shift[0] - from.shift[0]) * t, from.shift[1] + (to.shift[1] - from.shift[1]) * t],
    }, 1);
    const horizon = this.#stage.horizon();
    this.#horizon = horizon;
    this.#setStyle('--horizon', `${(horizon * 100).toFixed(2)}%`);
    this.#setStyle('--horizon-y', horizon.toFixed(4));
  }

  /** Where a part of the engine set is on screen, in CSS pixels, or null (hidden, behind, off screen) */
  #onScreen(name) {
    const point = this.#rig.partPosition(name, this.#notePoint);
    if (!point) return null;
    const camera = this.#stage.camera;
    camera.updateMatrixWorld();
    point.project(camera);
    if (point.z > 1 || Math.abs(point.x) > 0.98 || Math.abs(point.y) > 0.98) return null;
    return { x: ((point.x + 1) / 2) * window.innerWidth, y: ((1 - point.y) / 2) * window.innerHeight };
  }

  /** The lamp: in the cabin while the camera sits there, over the bay in the engine's chapter */
  #light(p) {
    const engine = pulse(JOURNEY.engineLight, p);
    const lamp = engine > 0 ? LAMPS.engine : LAMPS.cabin;
    this.#lamp.position.fromArray(lamp.position);
    this.#lamp.color.setHex(lamp.colour);
    this.#lamp.distance = lamp.reach;
    this.#lamp.intensity = engine > 0 ? JOURNEY.engineLux * engine : JOURNEY.cabinLux * pulse(JOURNEY.cabinLight, p);
  }

  /**
   * The gaze between two shots inside the cabin, in the car's frame: its heading turns the short way
   * (forward to the rear seats goes over the right shoulder), its pitch and its reach ease across
   */
  #gazeBetween(from, to, t) {
    const a = this.#gazeA.subVectors(from.target, from.position);
    const b = this.#gazeB.subVectors(to.target, to.position);
    const [lengthA, lengthB] = [a.length(), b.length()];
    const yawA = Math.atan2(a.x, a.z);
    const yaw = yawA + wrapAngle(Math.atan2(b.x, b.z) - yawA) * t;
    const pitchA = Math.atan2(a.y, Math.hypot(a.x, a.z));
    const pitch = pitchA + (Math.atan2(b.y, Math.hypot(b.x, b.z)) - pitchA) * t;
    return a.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(lengthA + (lengthB - lengthA) * t);
  }

  /** A shot of the layout in the car's own frame, written into `out` */
  #shot(name, out) {
    const layout = LAYOUTS[this.#layoutName];
    const shot = name === 'showroom' ? layout.showroom : layout.journey[name];
    out.position.fromArray(shot.position);
    out.target.fromArray(shot.target);
    if (shot.space !== 'car') {
      out.position.applyMatrix4(this.#toCar);
      out.target.applyMatrix4(this.#toCar);
    }
    if (!shot.inside) {
      const pull = Math.max(1, layout.refAspect / this.#stage.aspect);
      out.position.sub(out.target).multiplyScalar(pull).add(out.target);
    }
    out.fov = shot.fov;
    out.shift = shot.shift;
    out.inside = Boolean(shot.inside);
    return out;
  }

  /** The chapter on screen: its panel shows, the turntable rests outside the showroom's own */
  #setChapter(chapter) {
    if (chapter === this.#chapter) return;
    if (this.#chapter === 'exterior' && chapter !== '') this.#choreography.resetTurn();
    this.#chapter = chapter;
    this.#page.dataset.chapter = chapter;
    if (this.#journey) this.#journey.dataset.chapter = chapter;
  }

  /** The light the scene is lit by, and the environment its paint reflects (one of LIGHTS) */
  #lightUp(name) {
    if (name === this.#lit) return;
    this.#lit = name;
    const light = LIGHTS.get(name);
    const [keyColour, keyPower, [x, y, z]] = light.key;
    this.#key.color.set(keyColour);
    this.#key.intensity = keyPower;
    this.#key.position.set(x, y, z);
    const [skyColour, groundColour, skyPower] = light.sky;
    this.#sky.color.set(skyColour);
    this.#sky.groundColor.set(groundColour);
    this.#sky.intensity = skyPower;
    this.#stage.scene.environment = this.#environments.for(name);
    this.#stage.scene.environmentIntensity = light.environment;
  }

  /** The sweep of a new paint: the studio turns about the car and back; true while it moves */
  #sweep(time) {
    if (this.#sweepAt === -2) this.#sweepAt = time;
    const rotation = this.#stage.scene.environmentRotation;
    if (this.#sweepAt < 0) return false;
    const u = (time - this.#sweepAt) / PAINT_SWEEP.seconds;
    if (u >= 1) {
      this.#sweepAt = -1;
      rotation.y = 0;
      return false;
    }
    rotation.y = PAINT_SWEEP.degrees * DEG * Math.sin(Math.PI * smoothstep(0, 1, u));
    return true;
  }

  /** The tonal arc's light: the page lays its plates, tones and masthead by it (drift.css) */
  #setArc(light) {
    if (light === this.#arc) return;
    this.#arc = light;
    this.#root.dataset.light = light;
  }

  #frameCamera() {
    if (!this.#place) return;
    const layout = LAYOUTS[this.#layoutName];
    const framing = layout[this.#place];
    this.#stage.frame(framing, Math.max(1, layout.refAspect / this.#stage.aspect));
    const horizon = this.#stage.horizon();
    this.#horizon = horizon;
    this.#setStyle('--horizon', `${(horizon * 100).toFixed(2)}%`);
    this.#setStyle('--horizon-y', horizon.toFixed(4));
    if (this.#place === 'road') this.#aimSheet(framing);
  }

  /** The sheet flies at this camera's glass, focused on the drift; the glass drowns from where its first drops land */
  #aimSheet(framing) {
    const camera = this.#stage.camera;
    const focus = camera.position.distanceTo(this.#point.fromArray(framing.target));
    this.#spray.aimAt(camera, { lens: SURGE.lens, focus });
    const seconds = LANDING.driftSeconds;
    const first = [...this.#sheet].sort((a, b) => a.birth + a.life / seconds - (b.birth + b.life / seconds)).slice(0, Math.max(1, Math.round(this.#sheet.length * 0.05)));
    let x = 0;
    let y = 0;
    for (const drop of first) {
      // as the shader aims it: the tyre's place on screen, then the drop's own offset
      this.#point.fromArray(drop.origin).project(camera);
      x += clamp(clamp(this.#point.x, -1.3, 1.3) + drop.velocity[0], -1.1, 1.1);
      y += clamp(clamp(this.#point.y, -1.3, 1.3) + drop.velocity[1], -1.1, 1.1);
    }
    this.#impact.set((x / first.length + 1) / 2, (y / first.length + 1) / 2);
  }

  #writePage(p, pose) {
    const arrival = this.#arrival;
    const stopAt = this.#choreography.stopAt;
    let showTension = 1;
    if (arrival.state === 'parked') showTension = 0;
    else if (arrival.state === 'arriving') showTension = 1 - smoothstep(stopAt - 0.2, stopAt + 0.35, arrival.clock);
    this.#setStyle('--phase', smoothstep(LANDING.swap[0], LANDING.swap[1], p).toFixed(3));
    const [out, gone] = LANDING.roadCopyOut.map((d) => this.#hit[0] + d);
    this.#setStyle('--road-copy', (1 - smoothstep(out, gone, p)).toFixed(3));
    const showCopy = smoothstep(LANDING.showCopyIn[0], LANDING.showCopyIn[1], p) * (1 - smoothstep(LANDING.showCopyOut[0], LANDING.showCopyOut[1], p));
    this.#setStyle('--show-copy', showCopy.toFixed(3));
    const caption = (smoothstep(LANDING.captionIn[0], LANDING.captionIn[1], p) * (1 - smoothstep(LANDING.captionOut[0], LANDING.captionOut[1], p))).toFixed(3);
    if (this.#caption && this.#style.get('--caption') !== caption) {
      this.#style.set('--caption', caption);
      this.#caption.style.setProperty('--caption', caption);
    }
    this.#setStyle('--t', curve(LANDING.tension, remap(p, 0, 1)).toFixed(3));
    this.#setStyle('--show-t', showTension.toFixed(3));
    const ready = String(arrival.state === 'parked' && pose.place === 'showroom');
    if (this.#page.dataset.ready !== ready) this.#page.dataset.ready = ready;
  }

  #setStyle(name, value) {
    if (this.#style.get(name) === value) return;
    this.#style.set(name, value);
    this.#page.style.setProperty(name, value);
  }

  #writeDebug(time, p, pose) {
    if (!this.#debug) return;
    this.#last.frames += 1;
    if (time - this.#last.fpsAt >= 1) {
      this.#last.fps = this.#last.frames / (time - this.#last.fpsAt);
      this.#last.frames = 0;
      this.#last.fpsAt = time;
    }
    if (time - this.#last.debugAt < 0.2) return;
    this.#last.debugAt = time;
    const info = this.#stage.renderer.info.render;
    this.#debug.hidden = false;
    this.#debug.textContent = [
      `p ${p.toFixed(3)}  ${pose.place}  ${this.#arrival.state} ${this.#arrival.clock.toFixed(2)}s`,
      `${this.#layoutName} · ${this.#settings.name} · ${this.#last.fps.toFixed(0)} fps · ${info.calls} calls · ${info.triangles} tris`,
    ].join('\n');
  }
}
