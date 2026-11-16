/**
 * The plumb line at the edge of the screen, and the chapters' index (the user's request of
 * 2026-11-16: a keyboard's table of contents). A tick per chapter, each a link: the bob hangs at the
 * chapter on screen (its thread grows as the visitor reads), swings with the scroll and with the
 * braking, then rests, true and vertical, on the frame the car settles: d'aplomb. A pendulum on a
 * spring, still with reduced motion. A link takes the visitor to its chapter (`goTo`, in screens) and
 * gives the chapter's heading the focus once it shows, so the keyboard carries on from there.
 */
import { springStep } from '../rules/math.js';
import { CHAPTER_INDEX, chapterAt } from '../rules/choreography.js';

const LOOSE = { omega: 5.2, zeta: 0.14 };
const RESTING = { omega: 5.2, zeta: 0.75 };
const FOCUS_WITHIN_MS = 3000; // a jump gives up the focus if its chapter has not shown by then

export class PlumbLine {
  #element;
  #links;
  #goTo;
  #reduced;
  #state = { x: 0, v: 0 };
  #shown = Number.NaN;
  #current = -1;

  constructor(element, { goTo, reduced }) {
    this.#element = element;
    this.#goTo = goTo;
    this.#reduced = reduced;
    // the links, in the chapters' order (their names come from our own markup)
    this.#links = CHAPTER_INDEX.map(({ id }) => element.querySelector(`[data-chapter-link="${id}"]`));
    element.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('[data-chapter-link]') : null;
      const index = link ? this.#links.indexOf(link) : -1;
      if (index < 0) return;
      event.preventDefault();
      this.#jump(index, link);
    });
    window.addEventListener('resize', () => this.#place(), { passive: true });
  }

  /** `push` adds swing (degrees per second), `rest` damps it to a stop */
  update(dt, push, rest) {
    const force = this.#reduced.matches ? 0 : push;
    this.#state = springStep({ x: this.#state.x, v: this.#state.v + force * dt }, 0, rest ? RESTING : LOOSE, dt);
    const angle = Math.max(-14, Math.min(14, this.#state.x));
    if (Math.abs(angle - this.#shown) > 0.01) {
      this.#element.style.setProperty('--swing', `${angle.toFixed(2)}deg`);
      this.#shown = angle;
    }
  }

  get moving() {
    return Math.abs(this.#state.x) + Math.abs(this.#state.v) > 0.02;
  }

  /** The chapter on screen at `progress` screens: its tick is the current one, the bob hangs there */
  show(progress) {
    const index = chapterAt(progress);
    if (index === this.#current) return;
    this.#current = index;
    this.#links.forEach((link, k) => {
      if (k === index) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
      link.classList.toggle('is-past', k < index);
    });
    this.#place();
  }

  /** Goes to a chapter by its name (`CHAPTER_INDEX`), as its link would: the showroom's "Configure" */
  jump(id) {
    const index = CHAPTER_INDEX.findIndex((chapter) => chapter.id === id);
    if (index >= 0) this.#jump(index, this.#links[index]);
  }

  /** The bob's place: the current tick's, along the line (down the rail when wide, across the line when narrow) */
  #place() {
    const link = this.#links[this.#current];
    if (!link) return;
    const tick = link.firstElementChild.getBoundingClientRect();
    const box = this.#element.getBoundingClientRect();
    const tall = box.height > box.width;
    const offset = tall ? tick.top + tick.height / 2 - box.top : tick.left + tick.width / 2 - box.left;
    const length = tall ? box.height : box.width;
    this.#element.style.setProperty('--bob', `${offset.toFixed(1)}px`);
    this.#element.style.setProperty('--bob-n', offset.toFixed(1));
    this.#element.style.setProperty('--progress', (length ? offset / length : 0).toFixed(4));
  }

  /** To the chapter, then the focus to its heading once the chapter shows (its panel may still be hidden) */
  #jump(index, link) {
    const target = document.getElementById(link.hash.slice(1));
    this.#goTo(CHAPTER_INDEX[index].at);
    if (!target) return;
    const until = performance.now() + FOCUS_WITHIN_MS;
    const focusWhenShown = () => {
      const shown = this.#current === index && target.getClientRects().length > 0 && getComputedStyle(target).visibility === 'visible';
      if (shown) target.focus({ preventScroll: true });
      else if (performance.now() < until) requestAnimationFrame(focusWhenShown);
    };
    requestAnimationFrame(focusWhenShown);
  }
}
