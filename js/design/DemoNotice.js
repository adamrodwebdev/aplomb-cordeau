/**
 * The demo's notice (2026-11-16, the site going live): Aplomb is a fictional brand, so "Test drive",
 * "Book a test drive" and "Find it in stock" open a dialog that says so and leads to the maker's work,
 * instead of going nowhere. A native modal dialog: the focus moves in and comes back to the button that
 * opened it, Escape closes it, and so do its close button (always shown: the user's rule for every
 * modal), its second button and a click on the dim around it.
 */
export class DemoNotice {
  #dialog;
  #triggers;

  constructor(dialog, triggers) {
    this.#dialog = dialog;
    this.#triggers = [...triggers];
  }

  start() {
    if (!this.#dialog || typeof this.#dialog.showModal !== 'function') return;
    for (const trigger of this.#triggers) {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        if (!this.#dialog.open) this.#dialog.showModal();
      });
    }
    for (const close of this.#dialog.querySelectorAll('[data-demo-close]')) close.addEventListener('click', () => this.#dialog.close());
    // the dialog's own box is the dim around its body: a click there, and only there, closes it
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
  }
}
