import { Rng, clamp } from './rng';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain';
export const WEATHER_LABEL: Record<WeatherKind, string> = { sunny: 'Nắng nhẹ', cloudy: 'Nhiều mây', rain: 'Mưa nhẹ' };
const PRESETS = {
  sunny: { cloud: 0, rain: 0, wind: 0.45 },
  cloudy: { cloud: 0.65, rain: 0, wind: 0.95 },
  rain: { cloud: 1, rain: 0.7, wind: 1.5 },
};
const ORDER: WeatherKind[] = ['sunny', 'cloudy', 'rain', 'cloudy'];

/** Weather changes on simulation time, independently of rendering and FPS.
 * A forecast precedes a 20-second smooth transition; rain never starts instantly. */
export class Weather {
  kind: WeatherKind;
  next: WeatherKind;
  cloud = 0;
  rain = 0;
  wind = 0.45;
  remaining: number;
  transitioning = false;
  private elapsed = 0;
  private step = 0;
  private from: { cloud: number; rain: number; wind: number };
  constructor(private rng = new Rng(), initial: WeatherKind = 'sunny') {
    this.kind = initial;
    this.step = ORDER.indexOf(initial);
    this.next = ORDER[(this.step + 1) % ORDER.length];
    this.from = { ...PRESETS[initial] };
    Object.assign(this, this.from);
    this.remaining = rng.range(90, 150);
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Consume overshoot so a long frame and many short frames agree.
    while (dt > 0) {
      if (!this.transitioning) {
        const used = Math.min(dt, this.remaining);
        this.remaining -= used; dt -= used;
        if (this.remaining > 1e-8) break;
        this.transitioning = true;
        this.elapsed = 0;
        this.from = { cloud: this.cloud, rain: this.rain, wind: this.wind };
      }
      const used = Math.min(dt, 20 - this.elapsed);
      this.elapsed += used; dt -= used;
      const u = clamp(this.elapsed / 20, 0, 1);
      const k = u * u * (3 - 2 * u);
      const target = PRESETS[this.next];
      this.cloud = this.from.cloud + (target.cloud - this.from.cloud) * k;
      this.rain = this.from.rain + (target.rain - this.from.rain) * k;
      this.wind = this.from.wind + (target.wind - this.from.wind) * k;
      if (this.elapsed >= 20 - 1e-8) {
        this.kind = this.next;
        this.step = (this.step + 1) % ORDER.length;
        this.next = ORDER[(this.step + 1) % ORDER.length];
        this.transitioning = false;
        this.remaining = this.rng.range(90, 150);
      }
      if (used === 0 && this.transitioning) break;
    }
  }
  get label() {
    return this.transitioning ? `Đang chuyển: ${WEATHER_LABEL[this.next]}` : WEATHER_LABEL[this.kind];
  }
  get forecast() {
    return !this.transitioning && this.remaining < 20 ? `Sắp ${WEATHER_LABEL[this.next].toLocaleLowerCase('vi')}` : '';
  }
}
