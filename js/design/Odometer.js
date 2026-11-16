/**
 * A price that rolls its digits like a counter (the tonal arc's motion set, 2026-11-16): each digit
 * a column of 0 to 9 moved by a transform (drift.css times it, 0.6 s, the last columns a little
 * later). Screen readers read the plain price beside it; the columns are hidden from them.
 */
const DIGITS = '0123456789';

export class Odometer {
  #node;
  #text = '';
  #plain;
  #wheel;
  #columns = [];

  constructor(node) {
    this.#node = node;
    this.#plain = Object.assign(document.createElement('span'), { className: 'visually-hidden' });
    this.#wheel = Object.assign(document.createElement('span'), { className: 'odometer' });
    this.#wheel.setAttribute('aria-hidden', 'true');
    node.replaceChildren(this.#plain, this.#wheel);
  }

  /** Shows `text` (a formatted price): a new shape is laid out at once, the same shape rolls */
  show(text) {
    if (text === this.#text) return;
    this.#plain.textContent = text;
    const same = text.length === this.#text.length && [...text].every((c, k) => DIGITS.includes(c) === DIGITS.includes(this.#text[k]));
    if (!same) this.#build(text);
    [...text].forEach((c, k) => {
      if (DIGITS.includes(c)) this.#columns[k].style.transform = `translateY(${-DIGITS.indexOf(c)}em)`;
    });
    this.#text = text;
  }

  #build(text) {
    this.#wheel.replaceChildren();
    this.#wheel.classList.add('is-still');
    this.#columns = [...text].map((c) => {
      if (!DIGITS.includes(c)) {
        this.#wheel.append(Object.assign(document.createElement('span'), { className: 'odo-sep', textContent: c }));
        return null;
      }
      const digit = Object.assign(document.createElement('span'), { className: 'odo-digit' });
      const column = Object.assign(document.createElement('span'), { className: 'odo-col' });
      for (const d of DIGITS) column.append(Object.assign(document.createElement('span'), { textContent: d }));
      digit.append(column);
      this.#wheel.append(digit);
      return column;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => this.#wheel.classList.remove('is-still')));
  }
}
