/**
 * The visitor's light or dark theme (the user's choice of 2026-11-16): it changes the studio (white
 * studio or night studio) and the page after the story; the road, the workshop, the night and dusk
 * belong to the story. index.html's inline script chooses it before the first paint (the visitor's
 * last choice, read at the door, else their system's); this switch flips it and remembers it.
 */
const THEME_KEY = 'aplomb-theme';

export class ThemeSwitch {
  #root;
  #button;
  #storage;

  constructor(root, button, storage) {
    this.#root = root;
    this.#button = button;
    this.#storage = storage;
  }

  get theme() {
    return this.#root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  start() {
    this.#show();
    this.#button.addEventListener('click', () => {
      const theme = this.theme === 'dark' ? 'light' : 'dark';
      this.#root.dataset.theme = theme;
      try {
        this.#storage?.setItem(THEME_KEY, theme);
      } catch {
        // private browsing: the choice lasts for the visit
      }
      this.#show();
    });
  }

  #show() {
    this.#button.setAttribute('aria-pressed', String(this.theme === 'dark'));
  }
}
