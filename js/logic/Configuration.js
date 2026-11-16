/**
 * The visitor's Cordeau: one choice per field (paint, wheels' finish, calipers, brightwork, cabin
 * trim, inlays, light blade, energy, version). Every value comes through `choose`, which takes only an option the catalogue
 * lists (an allow-list); listeners hear each change. No DOM, no three.js.
 */
import { DEFAULT_CHOICE, FIELDS, findOption, priceOf, resolve } from '../rules/catalogue.js';

export class Configuration {
  #choice;
  #listeners = new Set();

  constructor(initial = DEFAULT_CHOICE) {
    const options = resolve(initial);
    this.#choice = Object.fromEntries(FIELDS.map((field) => [field, options[field].id]));
  }

  /** The current choice, field by field (a copy) */
  get choice() {
    return { ...this.#choice };
  }

  /** The options the choice resolves to (labels, colours, prices…) */
  get options() {
    return resolve(this.#choice);
  }

  get price() {
    return priceOf(this.#choice);
  }

  /**
   * Takes `value` for `field` if the catalogue lists it; anything else is refused. A new energy
   * keeps the version's name (Essential or Signature exist for both).
   */
  choose(field, value) {
    if (!FIELDS.includes(field)) return;
    const energy = field === 'energy' ? value : this.#choice.energy;
    if (!findOption(field, value, energy) || this.#choice[field] === value) return;
    this.#choice[field] = value;
    if (field === 'energy' && !findOption('version', this.#choice.version, value)) this.#choice.version = DEFAULT_CHOICE.version;
    for (const listener of this.#listeners) listener(this);
  }

  /** Calls `listener(configuration)` on every change; returns the way to stop */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
