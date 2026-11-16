/**
 * The docks fold away (the user's request of 2026-11-16: a button that folds the dock, to see the
 * render in full). On a wide screen each dock has a fold button at its corner; folded, it leaves a
 * pill with the total, which unfolds it. One state for both docks, so a visitor who wants the car
 * keeps it from the exterior to the cabin: written on the journey (`data-docks`), which the styles
 * read, and said by every fold control (`aria-expanded`). The focus goes to the control that stays
 * in view (the pill once folded, the fold button once open), never left on a hidden one.
 */
export class DockFold {
  #journey;
  #controls;
  #folded = false;

  constructor(journey) {
    this.#journey = journey;
    this.#controls = [...journey.querySelectorAll('[data-dock-fold]')];
  }

  start() {
    for (const control of this.#controls) control.addEventListener('click', () => this.#toggle(control));
  }

  #toggle(control) {
    this.#folded = !this.#folded;
    this.#journey.dataset.docks = this.#folded ? 'folded' : 'open';
    for (const each of this.#controls) each.setAttribute('aria-expanded', String(!this.#folded));
    const panel = control.closest('[data-panel]');
    panel?.querySelector(this.#folded ? '.dock-pill' : '.dock-fold')?.focus({ preventScroll: true });
  }
}
