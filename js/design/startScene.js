/**
 * Boots the scene after the first paint, one short task at a time, then runs the loop only while
 * something moves (or the water breathes, at half rate), and never while the tab is hidden.
 */
import { TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAR, JOURNEY } from '../rules/choreography.js';
import { DEG } from '../rules/math.js';
import { Clock, nextTask } from '../time.js';
import { Environments } from './Environments.js';
import { Stage } from './Stage.js';
import { CarRig } from './CarRig.js';
import { PlumbLine } from './PlumbLine.js';
import { SceneDirector } from './SceneDirector.js';
import { CarLook } from './CarLook.js';
import { CabinScreens } from './CabinScreens.js';
import { SoundToggle } from './SoundToggle.js';
import { FILES, pickTier } from './sceneFiles.js';

const { cabin: CABIN, wheels: WHEELS, engine: ENGINE, shadow: SHADOW, environments: ENVIRONMENT_FILES } = FILES;
const MAX_MODEL_BYTES = 4 * 1024 * 1024; // each file is read at the door: size first, then the GLB magic

/**
 * The declared length of a body read as it comes: a plain count of bytes, within the limit; null when
 * it is missing, not digits only, or compressed (the count would be the compressed one)
 */
function declaredLength(response) {
  if (response.headers.get('content-encoding')) return null;
  const text = response.headers.get('content-length');
  if (text === null || !/^\d{1,10}$/.test(text)) return null;
  const length = Number(text); // digits only, checked above: a whole, strict count
  return Number.isSafeInteger(length) && length > 0 ? length : null;
}

/**
 * The body, at most MAX_MODEL_BYTES, its bytes told to `onBytes(received, total)` as they come (the
 * story gate's bar). `total` is the declared length; when the host compresses the file (GitHub Pages
 * gzips GLB), the declared length is the compressed one, so the bytes, counted as they come out
 * decoded, are told against `expected`, the file's known size. Without a way to tell, it is read
 * whole, then measured.
 */
async function readBody(response, { onBytes = null, expected = null } = {}) {
  const declared = declaredLength(response);
  if (declared !== null && declared > MAX_MODEL_BYTES) throw new Error('model: too large');
  const total = declared ?? (Number.isSafeInteger(expected) && expected > 0 ? expected : null);
  if (total === null || !response.body || !onBytes) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_MODEL_BYTES) throw new Error('model: too large');
    return buffer;
  }
  const chunks = [];
  const reader = response.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    // a declared length is a promise; the decoded body is only held to the limit
    if (received > (declared ?? MAX_MODEL_BYTES)) {
      await reader.cancel();
      throw new Error(declared === null ? 'model: too large' : 'model: longer than declared');
    }
    chunks.push(value);
    onBytes(received, total);
  }
  if (declared !== null && received !== declared) throw new Error('model: shorter than declared');
  const body = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return body.buffer;
}

/** `counting`: { onBytes, expected } for the story gate's bar, or nothing for a file read later */
async function loadModel(url, counting = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`model: HTTP ${response.status}`);
  const buffer = await readBody(response, counting);
  const head = new DataView(buffer, 0, Math.min(12, buffer.byteLength));
  if (buffer.byteLength < 12 || head.getUint32(0, true) !== 0x46546c67 || head.getUint32(4, true) !== 2) throw new Error('model: not a glTF 2 binary');
  // meshopt-compressed (2.9 MB instead of 9.4 for the exterior): its decoder is WebAssembly, which a
  // strict CSP must allow with 'wasm-unsafe-eval' on the real site. It decodes in two workers (their
  // code comes as a blob: the real site's CSP needs `worker-src blob:`): on the main thread the
  // exterior took one task of 0.4 s
  MeshoptDecoder.useWorkers(2);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
}

/**
 * `bootProgress` (BootProgress) hears each step of the boot and the body's bytes: the story gate draws
 * them for a visitor who tries to scroll before the car is live
 */
export async function startScene({ canvas, page, landing, plumbElement, captionElement, journeyElement, notesElement, soundButton, configuration, turntable, turnButtons, debugElement, flags, stopped, bootProgress }) {
  bootProgress.reach('code');
  const settings = pickTier(flags);
  // the modules' evaluation and the WebGL context's opening, each in its own task (one of 78 ms)
  await nextTask();
  const stage = new Stage(canvas, settings.dpr);
  // three checks each new program's link on its first use: a synchronous round trip to the GPU that
  // held frames 40 to 60 ms while the cabin's and the engine's programs compiled. Off but in debug.
  stage.renderer.debug.checkShaderErrors = flags.checks;
  await nextTask();
  // the tyres write the headline in the road with the page's face: it must be there before. The
  // environments come from files: drawn here, PMREM held the main thread 0.5 s (2 s on Lighthouse's phone)
  const [environments, gltf, shadowPlate] = await Promise.all([
    Environments.load(stage.renderer, ENVIRONMENT_FILES),
    loadModel(settings.exterior, { onBytes: (received, total) => bootProgress.bytes(received, total), expected: settings.exteriorBytes }),
    new TextureLoader().loadAsync(SHADOW),
    document.fonts.load('64px "Aplomb Estoc Fierce"').catch(() => []),
  ]);
  bootProgress.reach('files');
  await nextTask();
  const rig = await CarRig.build(gltf.scene, { cgHeight: CAR.cgHeight, moving: CAR.hinges });
  // the car wears the visitor's configuration from the start, then follows each choice
  const look = new CarLook(rig.object);
  look.dress(configuration.options, true);
  bootProgress.reach('rig');
  rig.useWheels(configuration.options.wheel.id);
  rig.usePowertrain(configuration.options);
  const screens = new CabinScreens();
  // the plumb line, the chapters' index: a link takes the visitor that many screens down the landing
  const plumb = new PlumbLine(plumbElement, {
    goTo: (screens) => window.scrollTo({
      top: landing.getBoundingClientRect().top + window.scrollY + screens * window.innerHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    }),
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)'),
  });
  // a link elsewhere that names a chapter (the showroom's "Configure") goes there as the index's would;
  // the chapter's name is checked against the index's own (PlumbLine.jump)
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-jump]') : null;
    if (!link) return;
    event.preventDefault();
    plumb.jump(link.dataset.jump);
  });
  const director = new SceneDirector({
    stage,
    rig,
    environments,
    shadowPlate,
    page,
    root: document.documentElement,
    plumb,
    canvas,
    caption: captionElement,
    journey: journeyElement,
    look,
    notes: notesElement,
    settings,
    debug: flags.debug ? debugElement : null,
  });
  // ?debug=1 only: the scene for inspection from the console or a test script
  if (flags.debug) window.aplombDebug = Object.freeze({ scene: stage.scene, camera: stage.camera, renderer: stage.renderer });
  const progress = () => -landing.getBoundingClientRect().top / window.innerHeight;
  director.resize(window.innerWidth, window.innerHeight);
  director.aim(progress(), true);
  await nextTask();
  await director.warm();
  if (stopped()) return;
  bootProgress.reach('warm');
  // the visitor's sound, off until they ask: the engine they configured, as the car leaves
  if (soundButton) new SoundToggle(soundButton, director);

  const clock = new Clock();
  let last = clock.now();
  let scheduled = false;
  let live = false;
  let hidden = document.hidden;
  const tick = () => {
    scheduled = false;
    const now = clock.now();
    const dt = now - last;
    last = now;
    const { busy, ambient } = director.frame(dt, now);
    // the scene's own first frame is on screen at the next one: the poster, the same frame, gives way
    if (!live) {
      live = true;
      requestAnimationFrame(() => {
        document.documentElement.classList.add('scene-live');
        bootProgress.reach('live'); // the story gate lets the page go
      });
      // the tonal arc's other lights (1 MB), read once the scene is up: the white studio, the
      // workshop, the night and dusk; the night studio stands in until they are there
      window.setTimeout(() => environments.more().then(schedule), 1200);
    }
    if (busy) schedule();
    else if (ambient) setTimeout(schedule, 33); // only the water moves: half rate is enough
  };
  const schedule = () => {
    if (scheduled || hidden) return;
    scheduled = true;
    requestAnimationFrame(tick);
  };

  // the cabin, once the visitor heads for it: seated in the body, dressed as chosen, compiled ahead.
  // The late models' steps are marked (drift:…) for the performance panel and the trace scripts.
  let cabinAsked = false;
  let seated = null; // the cabin and the wheels, settled: the engine set waits for them
  const askCabin = () => {
    if (cabinAsked || progress() < JOURNEY.cabinFrom) return;
    cabinAsked = true;
    const cabinDone = loadModel(CABIN)
      .then(async (cabin) => {
        performance.mark('drift:cabin-parsed');
        if (stopped()) return;
        await nextTask();
        // readied off the scene and compiled before it is seated: no frame waits on its programs.
        // Each step in its own task: merged, dressed and compiled at once they took 66 ms
        const inside = await rig.readyCabin(cabin.scene);
        await nextTask();
        if (stopped()) return;
        look.adopt(inside);
        screens.bind(rig.screens);
        screens.draw(configuration.options);
        await nextTask();
        if (stopped()) return;
        performance.mark('drift:cabin-warm');
        await director.warm(inside);
        if (stopped()) return;
        rig.seatCabin(inside);
        performance.mark('drift:cabin-seated');
        schedule();
      })
      .catch((error) => console.warn('[drift] the cabin stays closed:', error));
    // the Aero 23 and Rayon 23 (0.7 MB), for the exterior's wheel choice
    const wheelsDone = loadModel(WHEELS)
      .then(async (kits) => {
        performance.mark('drift:wheels-parsed');
        if (stopped()) return;
        await nextTask();
        const wheels = rig.readyWheels(kits.scene);
        look.adopt(wheels);
        await director.warm(wheels);
        if (stopped()) return;
        rig.seatWheels(wheels);
        performance.mark('drift:wheels-seated');
        schedule();
      })
      .catch((error) => console.warn('[drift] only the Fan 25 wheels:', error));
    seated = Promise.all([cabinDone, wheelsDone]);
    askEngine();
  };

  // the engine set (1.5 MB, its Six baked), from the exterior chapter on, after the cabin and the wheels: the bay,
  // the Six's engine and the E's boot, readied and compiled off the scene, then seated under the bonnet
  let engineAsked = false;
  const askEngine = () => {
    if (engineAsked || !seated || progress() < JOURNEY.engineFrom) return;
    engineAsked = true;
    seated
      .then(() => loadModel(ENGINE))
      .then(async (set) => {
        performance.mark('drift:engine-parsed');
        if (stopped()) return;
        await nextTask();
        const engine = rig.readyEngine(set.scene);
        look.adopt(engine, ['cover']); // the struts' chrome stays chrome whatever the brightwork
        performance.mark('drift:engine-warm');
        await director.warm(engine);
        if (stopped()) return;
        const seatedAt = performance.now();
        rig.seatEngine(engine, JOURNEY.bonnet.open * DEG); // the parts' paths bend under the bonnet open that far
        performance.measure('drift:seat-engine', { start: seatedAt, end: performance.now() });
        schedule();
      })
      .catch((error) => console.warn('[drift] the bonnet stays shut:', error));
  };

  window.addEventListener('scroll', () => {
    director.aim(progress());
    askCabin();
    askEngine();
    schedule();
  }, { passive: true });
  window.addEventListener('resize', () => {
    director.resize(window.innerWidth, window.innerHeight);
    director.aim(progress());
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!hidden) {
      last = clock.now();
      schedule();
    }
  });

  // turning the parked car: drag, or the two buttons for the keyboard
  let dragFrom = null;
  turntable.addEventListener('pointerdown', (event) => {
    if (!director.ready) return;
    dragFrom = event.clientX;
    turntable.setPointerCapture(event.pointerId);
    turntable.classList.add('is-grabbing');
  });
  turntable.addEventListener('pointermove', (event) => {
    if (dragFrom === null) return;
    director.turnBy(((event.clientX - dragFrom) / window.innerWidth) * Math.PI * 1.6);
    dragFrom = event.clientX;
    schedule();
  });
  const release = () => {
    dragFrom = null;
    turntable.classList.remove('is-grabbing');
  };
  turntable.addEventListener('pointerup', release);
  turntable.addEventListener('pointercancel', release);
  for (const button of turnButtons) {
    button.addEventListener('click', () => {
      director.turnBy(button.dataset.turn === '-1' ? -Math.PI / 6 : Math.PI / 6);
      schedule();
    });
  }

  // the studio's light follows the visitor's theme: a switch is drawn at once
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let paint = configuration.options.paint.id;
  configuration.onChange(() => {
    if (configuration.options.paint.id !== paint) director.sweep();
    paint = configuration.options.paint.id;
    look.dress(configuration.options);
    rig.useWheels(configuration.options.wheel.id);
    rig.usePowertrain(configuration.options);
    screens.draw(configuration.options);
    schedule();
  });

  askCabin(); // a reload half-way down the landing
  schedule();
}
