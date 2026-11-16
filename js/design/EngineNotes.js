/**
 * The exploded engine's notes (the user's choice of 2026-11-15, "Épure Aplomb"): each a true figure
 * in the page's own words (index.html), pinned by the scene on its part with a brass dot and a
 * hairline. Only the configured powertrain's notes show, and only while the parts are apart. Each
 * label opens away from the others' middle, unless it would run off the screen or under the
 * journey's side panel; then it opens the other way. A label that would cover one placed before it
 * (the notes are in order of importance) waits hidden. The words stay in the DOM, for screen readers
 * and without WebGL.
 */
const MARGIN = 8; // px kept between a label and the screen's edge or the panel

export class EngineNotes {
  #root;
  #panel;
  #notes;
  #shown = null;
  #right = Number.POSITIVE_INFINITY; // the labels' right limit: the screen's edge, or the side panel's

  /** `panel`: the energy chapter's panel, whose left edge bounds the labels when it stands at the side */
  constructor(root, panel = null) {
    this.#root = root;
    this.#panel = panel;
    this.#notes = [...root.querySelectorAll('[data-part]')].map((element) => ({
      element,
      part: element.dataset.part,
      energy: element.dataset.energy ?? '',
      version: element.dataset.version ?? '',
      x: Number.NaN,
      y: Number.NaN,
      side: '',
      width: 0,
      height: 0,
      on: false,
    }));
    this.measure();
  }

  /** On resize: the room on the right (the side panel's place comes from the CSS, not the frame) */
  measure() {
    this.#right = window.innerWidth - MARGIN;
    const box = this.#panel?.getBoundingClientRect();
    // a side panel leaves most of the width to the car; the phone's sheet spans it, along the bottom
    if (box && box.width > 0 && box.width < window.innerWidth * 0.6) this.#right = Math.min(this.#right, box.left - MARGIN);
    for (const note of this.#notes) {
      note.width = 0;
      note.height = 0;
    }
  }

  /**
   * `shown`: the parts are apart; `powertrain`: the rig's ({ energy, version }); `place(part)`: the
   * part's point on screen in CSS pixels, or null when it is hidden or off screen
   */
  update(shown, { energy, version }, place) {
    if (shown !== this.#shown) {
      this.#shown = shown;
      this.#root.setAttribute('aria-hidden', String(!shown));
    }
    const placed = [];
    for (const note of this.#notes) {
      const mine = shown && note.energy === energy && (note.version === '' || note.version === version);
      const at = mine ? place(note.part) : null;
      if (at && at.x < this.#right) placed.push({ note, x: Math.round(at.x), y: Math.round(at.y) });
      else this.#toggle(note, false);
    }
    const middle = placed.reduce((sum, { x }) => sum + x, 0) / Math.max(1, placed.length);
    const boxes = [];
    for (const { note, x, y } of placed) {
      const side = this.#face(note, x, x < middle ? 'left' : 'right');
      const left = side === 'right' ? x : x - note.width;
      const box = { left, right: left + note.width, top: y - note.height / 2, bottom: y + note.height / 2 };
      const covers = boxes.some((b) => b.left < box.right && box.left < b.right && b.top < box.bottom && box.top < b.bottom);
      // a note the layout hides (the phone keeps the essential ones) measures nothing
      if (note.width === 0 || covers) {
        this.#toggle(note, false);
        continue;
      }
      boxes.push(box);
      this.#toggle(note, true);
      if (x !== note.x || y !== note.y) {
        note.x = x;
        note.y = y;
        note.element.style.setProperty('--x', `${x}px`);
        note.element.style.setProperty('--y', `${y}px`);
      }
    }
  }

  /** Opens a label on its preferred side, or on the other if it would not fit there; returns the side */
  #face(note, x, preferred) {
    if (note.width === 0) {
      note.width = note.element.offsetWidth;
      note.height = note.element.offsetHeight;
    }
    const room = { left: x - MARGIN, right: this.#right - x };
    let side = preferred;
    const other = preferred === 'left' ? 'right' : 'left';
    if (room[side] < note.width && room[other] > room[side]) side = other;
    if (side !== note.side) {
      note.side = side;
      note.element.dataset.side = side;
    }
    return side;
  }

  #toggle(note, on) {
    if (on === note.on) return;
    note.on = on;
    note.element.classList.toggle('is-shown', on);
  }
}
