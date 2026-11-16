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

function fallBack(reason) {
  failed = true;
  console.warn('[drift] the landing stays stacked:', reason);
  html.classList.remove('has-scene');
  html.classList.add('no-scene');
}

async function boot() {
  const watchdog = window.setTimeout(() => fallBack('the scene was not up after 8 s'), 8000);
  try {
    const { startScene } = await import('./design/startScene.js');
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
    });
    window.clearTimeout(watchdog);
  } catch (error) {
    window.clearTimeout(watchdog);
    fallBack(error);
  }
}

if (html.classList.contains('has-scene')) new SceneWake(boot).watch(firstScreenFiles(pickTier(flags)));
