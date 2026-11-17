/**
 * The configurators' panels: fills each `[data-options="field"]` with the catalogue's options as
 * radio inputs, tells the configuration what the visitor picks, and shows the result (the paint's
 * name, the figures and legal line of the version, the summary, the total, the showroom's line).
 * The panels' words are in the HTML; this only adds the options and the numbers.
 */
import { FINISHES, WHEELS, optionsFor, wheelPrice } from '../rules/catalogue.js';
import { Odometer } from './Odometer.js';

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const extra = (price) => (price > 0 ? `+${money.format(price)}` : 'Included');

/** How each field's options are drawn */
const DRAW = Object.freeze({
  paint: (o) => `<span class="cfg-swatch" style="--swatch: ${o.hex}" aria-hidden="true"></span><span class="visually-hidden">${o.label}, ${FINISHES[o.finish].label.toLowerCase()}, ${extra(o.price)}</span>`,
  // a design's price depends on the version: written by #refresh
  wheel: (o) => `<span>${o.label}</span><em data-wheel-price="${o.id}"></em>`,
  rims: (o) => `<span class="cfg-dot" style="--swatch: ${o.hex}" aria-hidden="true"></span><span>${o.label}</span>`,
  calipers: (o) => `<span class="cfg-dot" style="--swatch: ${o.hex}" aria-hidden="true"></span><span>${o.label}</span>`,
  brightwork: (o) => `<span class="cfg-dot" style="--swatch: ${o.hex ?? '#d9dde1'}" aria-hidden="true"></span><span>${o.label}</span>`,
  // what it is and its price in one phrase, which folds where the card is narrow
  // a two-tone trim (Nacre's pearl and dark) paints its dot with both (`swatch`)
  trim: (o) => `<span class="cfg-dot cfg-dot--big" style="--swatch: ${o.swatch ?? o.hex}" aria-hidden="true"></span><b>${o.label}</b><span>${o.detail}<span class="cfg-sep"> · </span><span class="cfg-price">${extra(o.price)}</span></span>`,
  inlay: (o) => `<span class="cfg-dot" style="--swatch: ${o.hex}" aria-hidden="true"></span><span>${o.label}</span>${o.price > 0 ? `<em>${extra(o.price)}</em>` : ''}`,
  blade: (o) => `<span class="cfg-dot cfg-dot--glow" style="--swatch: ${o.hex}" aria-hidden="true"></span><span>${o.label}</span>`,
  energy: (o) => `<b>${o.label}</b><span>${o.detail}</span>`,
  exhaust: (o) => `<span>${o.label}</span>${o.price > 0 ? `<em>${extra(o.price)}</em>` : ''}`,
  cover: (o) => `<span class="cfg-dot" style="--swatch: ${o.hex}" aria-hidden="true"></span><span>${o.label}</span>${o.price > 0 ? `<em>${extra(o.price)}</em>` : ''}`,
  // its figures follow under the cards (data-figures): the card keeps the name and the price
  version: (o) => `<b>${o.id}</b><em>From ${money.format(o.price)}</em>`,
});

export class Configurator {
  #root;
  #configuration;
  #lede;
  #totals = [];

  constructor(root, configuration, { lede = null } = {}) {
    this.#root = root;
    this.#configuration = configuration;
    this.#lede = lede;
    if (!root) return;
    this.#renderOptions();
    // each panel's total rolls like a counter
    this.#totals = [...root.querySelectorAll('[data-total]')].map((node) => new Odometer(node));
    root.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;
      // the field comes from our own markup; the value is checked against the catalogue there
      const field = input.closest('[data-options]')?.dataset.options;
      if (field) this.#configuration.choose(field, input.value);
      this.#refresh();   // a refused value leaves the radios showing the real choice
    });
    configuration.onChange(() => this.#refresh());
    this.#refresh();
  }

  /** Every group's options, as radio inputs named after their field */
  #renderOptions() {
    const { energy } = this.#configuration.choice;
    for (const box of this.#root.querySelectorAll('[data-options]')) {
      const field = box.dataset.options;
      if (!Object.hasOwn(DRAW, field)) continue;
      const draw = DRAW[field];
      box.innerHTML = optionsFor(field, energy).map((option) => (
        `<label class="cfg-option cfg-option--${field}"><input type="radio" name="cfg-${field}" value="${option.id}">${draw(option)}</label>`
      )).join('');
    }
  }

  #refresh() {
    const choice = this.#configuration.choice;
    const options = this.#configuration.options;
    // the versions' prices and figures follow the energy
    const versions = this.#root.querySelector('[data-options="version"]');
    if (versions && versions.dataset.energy !== choice.energy) {
      versions.dataset.energy = choice.energy;
      versions.innerHTML = optionsFor('version', choice.energy).map((option) => (
        `<label class="cfg-option cfg-option--version"><input type="radio" name="cfg-version" value="${option.id}">${DRAW.version(option)}</label>`
      )).join('');
    }
    for (const input of this.#root.querySelectorAll('input[type="radio"]')) {
      const field = input.closest('[data-options]')?.dataset.options;
      input.checked = Boolean(field) && choice[field] === input.value;
    }
    this.#text('[data-paint-name]', options.paint.label);
    this.#text('[data-paint-finish]', ` · ${FINISHES[options.paint.finish].label}`);
    // each tab of a dock reads its group's choices (one field or several, named by our own markup):
    // the first one's colour on its dot, its name, then the others', which a narrow dock leaves out
    for (const node of this.#root.querySelectorAll('[data-choice]')) {
      const chosen = node.dataset.choice.split(' ').filter((field) => Object.hasOwn(options, field)).map((field) => options[field]);
      const tinted = chosen.find((option) => typeof option.hex === 'string');
      if (tinted) node.style.setProperty('--swatch', tinted.swatch ?? tinted.hex);
      const label = node.querySelector('[data-choice-label]');
      if (!label) continue;
      const more = chosen.slice(1).map((option) => {
        const span = document.createElement('span');
        span.className = 'cfg-tab-more';
        span.textContent = ` · ${option.label}`;
        return span;
      });
      label.replaceChildren(chosen[0]?.label ?? '', ...more);
    }
    for (const price of this.#root.querySelectorAll('[data-wheel-price]')) {
      const wheel = WHEELS.find((option) => option.id === price.dataset.wheelPrice);
      // only what costs extra is priced, as for the inlays: three "Included" read as noise
      const cost = wheel ? wheelPrice(wheel, options.version) : 0;
      price.textContent = cost > 0 ? extra(cost) : '';
    }
    for (const total of this.#totals) total.show(money.format(this.#configuration.price));
    const version = options.version;
    // each figure in its instrument: an arc as far as its gauge (the catalogue's), the value inside
    this.#html('[data-figures]', version.figures.map(([value, unit, gauge]) => (
      `<div class="cfg-gauge" style="--gauge: ${gauge}"><dt class="mono">${unit}</dt><dd class="cfg-figure">${value}</dd></div>`
    )).join(''));
    this.#root.dataset.energy = choice.energy;   // the Six's figures take the face's fierce end
    const co2 = version.gkm ? `CO₂ class ${version.co2} · ${version.gkm} g/km.` : `CO₂ class ${version.co2}.`;
    this.#text('[data-legal]', `${co2} ${version.legal}`);
    const rows = [
      ['Paint', `${options.paint.label}, ${FINISHES[options.paint.finish].label.toLowerCase()}`],
      ['Wheels', `${options.wheel.label}, ${options.rims.label.toLowerCase()}`],
      ['Calipers', options.calipers.label],
      ['Brightwork', options.brightwork.label],
      ['Interior', `${options.trim.label}, ${options.trim.detail.toLowerCase()}`],
      ['Inlays', options.inlay.label],
      ['Light blade', options.blade.label],
      ['Energy', `${options.energy.label} ${version.id}, ${version.figures[0][0]} ${version.figures[0][1]}`],
    ];
    if (choice.energy === 'Six') {
      rows.push(['Exhaust', `${options.exhaust.label}, ${options.exhaust.detail.toLowerCase()}`], ['Engine cover', options.cover.label]);
    } else {
      rows.push(['Front boot', version.id === 'Signature' ? '60 L, over the front motor' : '60 L']);
    }
    this.#html('[data-summary]', rows.map(([key, value]) => `<div><dt class="mono">${key}</dt><dd>${value}</dd></div>`).join(''));
    if (this.#lede) this.#lede.textContent = `The Cordeau in ${options.paint.label}, on ${options.wheel.label} wheels.`;
  }

  #text(selector, value) {
    for (const node of this.#root.querySelectorAll(selector)) node.textContent = value;
  }

  /** Writes markup made here from the catalogue's own data (never from outside input) */
  #html(selector, markup) {
    for (const node of this.#root.querySelectorAll(selector)) node.innerHTML = markup;
  }
}
