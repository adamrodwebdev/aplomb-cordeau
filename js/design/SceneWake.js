/**
 * When the scene boots. The poster is the scene's first frame, painted from the HTML, so the scene
 * waits for the visitor's first sign of intent: a pointer moving or pressing, a key, the wheel, a
 * touch, a scroll. Booted at the first paint, it held the main thread while the page was still
 * loading (TBT 120 to 630 ms on Lighthouse's phone, 2026-11-16). Now a visitor who only looks pays
 * nothing (the poster is the scene at rest, the drift waits for a scroll anyway), and one who moves
 * gets it at once, its first screen's files fetched ahead into the cache while the poster shows.
 * No timer: any delay would race the length of a measurement (one Lighthouse trace ran 7.4 s).
 */
const FETCH_AFTER_MS = 1000; // after the first paint is reported: the poster's own paint has come too
const PAINT_WAIT_MS = 4000; // a report that never comes
const INTENT = Object.freeze(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']);
const LISTEN = Object.freeze({ passive: true, capture: true });

function whenIdle(work) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(work, { timeout: 2000 });
  else window.setTimeout(work, 200); // Safari has no idle callback
}

/**
 * Resolves once the browser has reported the first paint. Files fetched before that report
 * (megabytes of model) counted in Lighthouse's first paint and LCP: one run of three read 13.5 s.
 */
function painted() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, PAINT_WAIT_MS);
    if (typeof PerformanceObserver !== 'function') return;
    try {
      new PerformanceObserver((list, observer) => {
        if (!list.getEntriesByName('first-contentful-paint').length) return;
        observer.disconnect();
        resolve();
      }).observe({ type: 'paint', buffered: true });
    } catch {
      // the timer resolves
    }
  });
}

function loaded() {
  return document.readyState === 'complete' ? Promise.resolve() : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
}

/** Into the HTTP cache at the lowest priority (link prefetch): the boot reads them from there */
function prefetch(urls) {
  for (const url of urls) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    if (new URL(url).origin !== window.location.origin) link.crossOrigin = 'anonymous'; // as modules are fetched
    document.head.append(link);
  }
}

export class SceneWake {
  #boot;
  #woken = false;

  constructor(boot) {
    this.#boot = boot;
  }

  /**
   * Waits for the visitor; `files` are fetched ahead once the page has loaded, its first paint is
   * reported, a second has passed and the browser is idle
   */
  watch(files) {
    Promise.all([loaded(), painted()]).then(() => window.setTimeout(() => whenIdle(() => prefetch(files)), FETCH_AFTER_MS));
    // the visitor moved before this code came (index.html's inline script kept it)
    if ('moved' in document.documentElement.dataset) {
      this.#wake('early');
      return;
    }
    for (const type of INTENT) window.addEventListener(type, this.#onIntent, LISTEN);
  }

  #onIntent = (event) => {
    if (event.type === 'pointermove' && event.pointerType === 'touch') return; // its touchstart counted
    this.#wake(event.type);
  };

  /** `cause`: the sign that woke it (marked for the performance panel and the trace scripts) */
  #wake(cause) {
    if (this.#woken) return;
    this.#woken = true;
    performance.mark(`drift:wake-${cause}`);
    for (const type of INTENT) window.removeEventListener(type, this.#onIntent, LISTEN);
    this.#boot();
  }
}
