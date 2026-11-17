/**
 * The composition root. The page paints from HTML first: the inline script of index.html chooses
 * the layout before that paint and asks for this module once the browser reports it (asked for
 * earlier, this module and its imports weighed in Lighthouse's first paint). Without WebGL 2, with
 * Save-Data or reduced motion, the landing stays stacked (the road, then the showroom, with no
 * drift); otherwise it takes the scene's layout, the poster shows the scene's first frame, and the
 * scene boots when the visitor moves (SceneWake).
 * - Chosen here, the switch to the scene's layout could follow the first paint and move the
 *   showroom panel by a whole screen (CLS 1 in one Lighthouse run of three, 2026-11-16).
 * - The inline script reads the address's `motion` switch at the door, as logic/flags.js does.
 * - WebGL 2 is opened once, by the scene's renderer (a test context of its own cost 0.15 s before
 *   the first paint); if it cannot be, the boot fails and the page stacks (`fallBack`).
 */
import { readFlags } from './logic/flags.js';
import { Configuration } from './logic/Configuration.js';
import { BootProgress } from './logic/BootProgress.js';
import { BOOT_STEPS } from './rules/boot.js';
import { StoryGate } from './design/StoryGate.js';
import { Configurator } from './design/Configurator.js';
import { OptionTabs } from './design/OptionTabs.js';
import { DockFold } from './design/DockFold.js';
import { DemoNotice } from './design/DemoNotice.js';
import { SceneWake } from './design/SceneWake.js';
import { ThemeSwitch } from './design/ThemeSwitch.js';
import { firstScreenFiles, pickTier } from './design/sceneFiles.js';

const html = document.documentElement;
const flags = readFlags(window.location.search);

let failed = false;

// the visitor's theme: the studio and the page after the story follow it, with or without the scene
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const themeButton = document.querySelector('[data-theme-toggle]');
if (themeButton) new ThemeSwitch(html, themeButton, storage).start();

// the visitor's Cordeau and its panels work with or without the scene (they stack without it)
const configuration = new Configuration();
const journey = document.querySelector('[data-journey]');
new Configurator(journey, configuration, { lede: document.querySelector('[data-config-lede]') });
// the docks in tabs, one group open at a time, and folding away to leave the render whole
if (journey) {
  for (const list of journey.querySelectorAll('[role="tablist"]')) new OptionTabs(list).start();
  new DockFold(journey).start();
}
// the demo's notice: no test drive nor stock to book, it says so and leads to the maker's work
new DemoNotice(document.querySelector('[data-demo-notice]'), document.querySelectorAll('[data-demo]')).start();

// The boot's watchdog (the story gate, 2026-11-17): the page stacks when the boot stops moving for
// STALL_MS (each step and each byte of the body counts), or is not up after LIMIT_MS. It was a flat
// 8 s, which a first visit on a slow network could pass while the car was still coming. While the
// code comes, its biggest module travels with no sign until it lands: that wait gets CODE_STALL_MS.
// On a 1.1 Mbit/s line a first visit took 24 s (2026-11-17); the visitor can always take the page
// without 3D from the gate.
const CODE_STALL_MS = 30000;
const STALL_MS = 12000;
const LIMIT_MS = 90000;
const headline = document.getElementById('road-title');
let gate = null;

function fallBack(reason) {
  failed = true;
  console.warn('[drift] the landing stays stacked:', reason);
  html.classList.remove('has-scene');
  html.classList.add('no-scene');
  gate?.release();
}

/**
 * While the scene's code comes (some forty modules, three.js among them, with no byte count), each
 * file that lands moves the bar a little and tells the watchdog the boot still moves: on a slow
 * network this phase alone took 6 s at 0 % (2026-11-17). Returns the way to stop counting.
 */
function countCodeFiles(progress) {
  if (typeof PerformanceObserver !== 'function') return () => {};
  const observer = new PerformanceObserver((list) => {
    for (let i = list.getEntries().length; i > 0; i -= 1) progress.codeFile();
  });
  try {
    observer.observe({ type: 'resource' });
  } catch {
    return () => {};
  }
  return () => observer.disconnect();
}

async function boot() {
  const now = () => performance.now();
  const progress = new BootProgress(now);
  // a visitor who scrolls before the car is live waits at the top, the boot's progress in sight
  const gateElement = document.querySelector('[data-gate]');
  if (gateElement) {
    gate = new StoryGate({
      html,
      element: gateElement,
      progress,
      focusAfter: headline,
      onSkip: () => {
        fallBack('the visitor chose the page without the scene');
        headline?.focus({ preventScroll: true });
      },
    });
    gate.start();
  }
  const startedAt = now();
  const watchdog = window.setInterval(() => {
    if (failed) {
      window.clearInterval(watchdog);
      return;
    }
    const time = now();
    const stall = progress.value < BOOT_STEPS.code ? CODE_STALL_MS : STALL_MS;
    if (time - progress.changedAt > stall) fallBack(`the scene stopped coming for ${stall / 1000} s`);
    else if (time - startedAt > LIMIT_MS) fallBack(`the scene was not up after ${LIMIT_MS / 1000} s`);
  }, 1000);
  const stopCounting = countCodeFiles(progress);
  try {
    const { startScene } = await import('./design/startScene.js').finally(stopCounting);
    await startScene({
      canvas: document.querySelector('[data-scene]'),
      page: document.querySelector('[data-stage]'),
      landing: document.querySelector('[data-landing]'),
      plumbElement: document.querySelector('[data-plumb]'),
      captionElement: document.querySelector('[data-water-caption]'),
      journeyElement: journey,
      notesElement: document.querySelector('[data-engine-notes]'),
      soundButton: document.querySelector('[data-sound]'),
      configuration,
      turntable: document.querySelector('[data-turntable]'),
      turnButtons: [...document.querySelectorAll('[data-turn]')],
      debugElement: document.querySelector('[data-debug]'),
      flags,
      stopped: () => failed,
      bootProgress: progress,
    });
    // up: its first frame comes with the next one (a hidden tab waits, and that is no stall)
    window.clearInterval(watchdog);
  } catch (error) {
    window.clearInterval(watchdog);
    fallBack(error);
  }
}

if (html.classList.contains('has-scene')) new SceneWake(boot).watch(firstScreenFiles(pickTier(flags)));
