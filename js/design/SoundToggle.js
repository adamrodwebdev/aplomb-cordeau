/**
 * The masthead's Sound switch, off by default (its state in aria-pressed). Turned on, it opens the
 * audio inside the visitor's click (browsers start no sound before one), fetches EngineSound then,
 * never before, and hands it to the director. Turned off, the director goes silent and the audio is
 * suspended, as it is while the tab is hidden and once nothing has sounded for a while (no work for
 * silent oscillators).
 */
const NAP_CHECK_MS = 3000;

export class SoundToggle {
  #button;
  #director;
  #context = null;
  #engine = null;
  #on = false;
  #nap = 0;

  constructor(button, director) {
    this.#button = button;
    this.#director = director;
    button.hidden = false; // the scene runs: the switch has something to play
    button.addEventListener('click', () => this.#toggle());
    document.addEventListener('visibilitychange', () => this.#visibility());
  }

  #toggle() {
    this.#on = !this.#on;
    this.#button.setAttribute('aria-pressed', String(this.#on));
    if (!this.#on) {
      this.#director.useSound(null);
      window.clearInterval(this.#nap);
      this.#context?.suspend();
      return;
    }
    this.#context ??= new AudioContext({ latencyHint: 'interactive' }); // inside the click: allowed to start
    this.#context.resume();
    this.#nap = window.setInterval(() => this.#napIfSilent(), NAP_CHECK_MS);
    if (this.#engine) {
      this.#director.useSound(this.#engine);
      return;
    }
    import('./EngineSound.js')
      .then(({ EngineSound }) => {
        if (!this.#on || this.#engine) return;
        this.#engine = new EngineSound(this.#context);
        this.#director.useSound(this.#engine);
      })
      .catch((error) => console.warn('[drift] the sound stays off:', error));
  }

  /** Nothing has sounded since the last drive faded: suspend (EngineSound wakes the audio when the engine starts) */
  #napIfSilent() {
    const context = this.#context;
    if (!this.#engine || context.state !== 'running') return;
    if (context.currentTime > this.#engine.silentAt) context.suspend();
  }

  #visibility() {
    if (!this.#context) return;
    if (document.hidden) this.#context.suspend();
    else if (this.#on && this.#engine && this.#context.currentTime <= this.#engine.silentAt) this.#context.resume();
  }
}
