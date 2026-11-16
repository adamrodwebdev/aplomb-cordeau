/**
 * The arrival plays on its own clock once the showroom shows, and replays each time the visitor
 * comes back; above the threshold the car backs out. States: away → arriving → parked → leaving.
 */
export class ArrivalTrigger {
  #state = 'away';
  #clock = 0;
  #leaveFrom = 0;
  #arriveAt;
  #leaveAt;
  #parkAt;
  #leaveSeconds;

  constructor({ arriveAt, leaveAt, parkAt, leaveSeconds }) {
    this.#arriveAt = arriveAt;
    this.#leaveAt = leaveAt;
    this.#parkAt = parkAt;
    this.#leaveSeconds = leaveSeconds;
  }

  update(progress, dt) {
    if ((this.#state === 'away' || this.#state === 'leaving') && progress >= this.#arriveAt) this.#begin('arriving');
    else if ((this.#state === 'arriving' || this.#state === 'parked') && progress < this.#leaveAt) {
      this.#leaveFrom = this.#clock;
      this.#begin('leaving');
    }
    this.#clock += dt;
    if (this.#state === 'arriving' && this.#clock >= this.#parkAt) this.#state = 'parked';
    if (this.#state === 'leaving' && this.#clock >= this.#leaveSeconds) this.#begin('away');
  }

  #begin(state) {
    this.#state = state;
    this.#clock = 0;
  }

  get state() {
    return this.#state;
  }

  get clock() {
    return this.#clock;
  }

  /** The arrival's time when the car started backing out */
  get leaveFrom() {
    return this.#leaveFrom;
  }

  /** True while something plays on the arrival's clock */
  get playing() {
    return this.#state === 'arriving' || this.#state === 'leaving';
  }
}
