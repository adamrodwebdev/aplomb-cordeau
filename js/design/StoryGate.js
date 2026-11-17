/**
 * The story waits for its car (the user's request of 2026-11-17: on a first visit the car stood still
 * while they scrolled, and the drift began half way down the page). From the scene's boot to its first
 * frame, a visitor who tries to move on is held at the top: the page stops scrolling, the hero's
 * "Scroll" cue fades, and the boot's progress shows at the foot of the screen, with a way out to the
 * page without 3D. When the car is live the page lets go, and the drift starts from the top.
 * - Nothing shows to a visitor who only looks, nor to Lighthouse, which never moves: the scene boots
 *   on the first sign of intent (SceneWake), and the gate only answers a try to scroll.
 * - The visitor's first sign is often a scroll itself: the page is already down when the gate starts,
 *   so it holds at once and goes back to the top (the landing is pinned: nothing on screen moves).
 * - Held, the page cannot scroll (`story-held`: overflow hidden, its gutter kept so nothing shifts);
 *   a jump that scrolls it anyway (a link, a focus) is taken back.
 */
const SCROLL_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar']);
// keys that scroll the page only when the focus is not in a control (Space presses a button)
const CONTROLS = 'a[href], button, input, select, textarea, summary, [contenteditable="true"], [role="button"], [role="tab"]';
const READY_MS = 400; // the bar full and "Ready" read before the page lets go
const LABEL_MAX = 60;
const DEFAULT_LABELS = Object.freeze({ files: 'Preparing the drive', engine: 'Starting the engine', ready: 'Ready' });
const LISTEN = Object.freeze({ passive: true });

/** The gate's words from its data attributes, each a short line of text, else the default */
function labelsOf(element) {
  const read = (value, fallback) => {
    if (typeof value !== 'string') return fallback;
    const line = value.replace(/\s+/g, ' ').trim();
    return line.length > 0 && line.length <= LABEL_MAX ? line : fallback;
  };
  return Object.freeze({
    files: read(element.dataset.labelFiles, DEFAULT_LABELS.files),
    engine: read(element.dataset.labelEngine, DEFAULT_LABELS.engine),
    ready: read(element.dataset.labelReady, DEFAULT_LABELS.ready),
  });
}

/** Percentages in the page's language (its `lang`, read at the door), else English */
function percentFormat(lang) {
  const tag = typeof lang === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang) ? lang : 'en';
  try {
    return new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });
  }
}

export class StoryGate {
  #html;
  #element;
  #caption;
  #percent;
  #bar;
  #skip;
  #focusAfter;
  #progress;
  #onSkip;
  #labels;
  #format;
  #phase = '';
  #held = false;
  #done = false;
  #stopListening = () => {};

  /**
   * `element`: the gate ([data-gate]); `progress`: the boot's (BootProgress); `onSkip`: the way out
   * to the page without the scene; `focusAfter`: where the focus goes if the gate hides around it
   */
  constructor({ html, element, progress, onSkip, focusAfter }) {
    this.#html = html;
    this.#element = element;
    this.#caption = element.querySelector('[data-gate-caption]');
    this.#percent = element.querySelector('[data-gate-percent]');
    this.#bar = element.querySelector('[data-gate-bar]');
    this.#skip = element.querySelector('[data-gate-skip]');
    this.#focusAfter = focusAfter;
    this.#progress = progress;
    this.#onSkip = onSkip;
    this.#labels = labelsOf(element);
    this.#format = percentFormat(html.lang);
  }

  /** From the boot's start: holds the page on the visitor's first try to move on */
  start() {
    if (this.#done || this.#progress.live) return;
    this.#stopListening = this.#progress.onChange(this.#onProgress);
    this.#skip?.addEventListener('click', this.#onSkipClick);
    if (window.scrollY > 0) {
      this.#hold();
      return;
    }
    window.addEventListener('scroll', this.#onScroll, LISTEN);
    window.addEventListener('wheel', this.#onWheel, LISTEN);
    window.addEventListener('touchmove', this.#onTry, LISTEN);
    window.addEventListener('keydown', this.#onKey);
  }

  /** The car is live, or the page stacks without it: the page scrolls again and the gate fades */
  release() {
    if (this.#done) return;
    this.#done = true;
    this.#stopListening();
    this.#skip?.removeEventListener('click', this.#onSkipClick);
    this.#unwatchTries();
    window.removeEventListener('scroll', this.#pin, LISTEN);
    if (this.#element.contains(document.activeElement)) this.#focusAfter?.focus({ preventScroll: true });
    this.#html.classList.remove('story-held');
  }

  #onScroll = () => {
    if (window.scrollY > 0) this.#hold();
  };

  #onWheel = (event) => {
    if (event.deltaY > 0) this.#hold();
  };

  #onTry = () => this.#hold();

  #onKey = (event) => {
    if (!SCROLL_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest(CONTROLS)) return;
    this.#hold();
  };

  #onSkipClick = () => this.#onSkip();

  #onProgress = () => {
    if (this.#held) this.#render();
    if (!this.#progress.live) return;
    if (!this.#held) {
      this.release();
      return;
    }
    // full, and "Ready" read, then the page lets go
    window.setTimeout(() => this.release(), READY_MS);
  };

  #hold() {
    if (this.#held || this.#done) return;
    this.#held = true;
    this.#unwatchTries();
    this.#html.classList.add('story-held');
    window.scrollTo(0, 0);
    window.addEventListener('scroll', this.#pin, LISTEN);
    // drawn once shown: the bar fills up to where the boot is, and the caption, empty until then,
    // speaks (a live region that only appears says nothing)
    window.requestAnimationFrame(() => this.#render());
  }

  /** A scroll the gate did not stop (a link, a focus, a phone's own) is taken back */
  #pin = () => {
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };

  #unwatchTries() {
    window.removeEventListener('scroll', this.#onScroll, LISTEN);
    window.removeEventListener('wheel', this.#onWheel, LISTEN);
    window.removeEventListener('touchmove', this.#onTry, LISTEN);
    window.removeEventListener('keydown', this.#onKey);
  }

  #render() {
    const value = this.#progress.value;
    const percent = Math.round(value * 100);
    this.#element.style.setProperty('--boot', value.toFixed(3));
    if (this.#percent) this.#percent.textContent = this.#format.format(value);
    this.#bar?.setAttribute('aria-valuenow', String(percent));
    // the caption is a polite live region: it speaks when the phase changes, not at each percent
    const phase = this.#progress.phase;
    if (phase !== this.#phase && this.#caption) {
      this.#phase = phase;
      this.#caption.textContent = this.#labels[phase];
    }
  }
}
