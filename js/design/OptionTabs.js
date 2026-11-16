/**
 * A dock's tabs (the cabin's: interior, inlays, light blade; the user's request of 2026-11-16): one
 * group of options open at a time, each tab reading its group's choice (the Configurator writes it),
 * so the dock still says the whole cabin. The WAI-ARIA tabs pattern with automatic activation, as a
 * panel shows at once: Left and Right walk the tabs and wrap round, Home and End go to the ends, Tab
 * goes on into the open panel's choices. The panels, and the one open first, are in the HTML (the
 * others carry `hidden`); this only switches them.
 */
const STEPS = new Map([
  ['ArrowRight', (index, count) => (index + 1) % count],
  ['ArrowLeft', (index, count) => (index - 1 + count) % count],
  ['Home', () => 0],
  ['End', (index, count) => count - 1],
]);

export class OptionTabs {
  #tabs;
  #panels;

  constructor(list) {
    this.#tabs = [...list.querySelectorAll('[role="tab"]')];
    // each tab's panel, named by our own markup
    this.#panels = this.#tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  }

  start() {
    this.#tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.#open(index));
      tab.addEventListener('keydown', (event) => this.#step(event, index));
    });
  }

  /** An arrow, Home or End opens that tab and moves the focus there; the browser's shortcuts pass */
  #step(event, index) {
    const step = STEPS.get(event.key);
    if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = step(index, this.#tabs.length);
    this.#open(next);
    this.#tabs[next].focus();
  }

  #open(index) {
    this.#tabs.forEach((tab, k) => {
      const open = k === index;
      tab.setAttribute('aria-selected', String(open));
      tab.tabIndex = open ? 0 : -1;
      if (this.#panels[k]) this.#panels[k].hidden = !open;
    });
  }
}
