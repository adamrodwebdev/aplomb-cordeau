/**
 * The scene's boot as a visitor waits for it (the story gate, the user's request of 2026-11-17): its
 * steps in order, each with the share of the bar it fills once reached. On a first visit the body's
 * file is most of the wait (3.0 MB, 1.6 MB on phones), so its bytes fill the bar between the code and
 * the files; on a repeat visit, read from the cache, compiling the car's programs is. Data and pure
 * functions: no DOM, no three.js.
 */

export const BOOT_STEPS = Object.freeze({
  code: 0.1, // the scene's modules, three.js with them, are in
  files: 0.75, // the body, its light and its shadow are read
  rig: 0.85, // the car is built and dressed
  warm: 0.97, // its programs are compiled
  live: 1, // its first frame is on screen
});

// the body's bytes fill the bar from the code's share to this one; the light and the shadow, read
// beside it, close the gap to the files' share
const BYTES_END = 0.7;

/** The bar's share for `received` bytes of the body's `total`; the code's share for anything not a count */
export function bytesShare(received, total) {
  const counts = Number.isSafeInteger(received) && Number.isSafeInteger(total) && total > 0 && received >= 0;
  if (!counts) return BOOT_STEPS.code;
  return BOOT_STEPS.code + (BYTES_END - BOOT_STEPS.code) * Math.min(1, received / total);
}

/** What the visitor is told: the files until they are read, then the engine starting */
export function bootPhase(value) {
  return value >= BOOT_STEPS.live ? 'ready' : value >= BOOT_STEPS.files ? 'engine' : 'files';
}
