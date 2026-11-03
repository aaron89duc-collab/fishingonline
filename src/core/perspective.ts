import type { ZoneDef } from './data';

/**
 * Pseudo-3D mapping between lake coordinates (distance d from angler in metres, lateral offset in metres)
 * and world pixels. Camera sits above the bank: y(d) = H + (Yb - H) * D0 / (d + D0).
 */
export const D0 = 3;
export const PPM_NEAR = 183; // px per metre multiplier

export class Perspective {
  readonly H: number;
  readonly Yb: number;
  constructor(public zone: ZoneDef, public vanishX: number) {
    this.H = zone.horizon;
    this.Yb = 1080 + 120;
  }
  yOf(d: number): number {
    return this.H + (this.Yb - this.H) * (D0 / (d + D0));
  }
  dOf(y: number): number {
    const f = (y - this.H) / (this.Yb - this.H);
    return Math.max(0, D0 / Math.max(1e-4, f) - D0);
  }
  ppm(d: number): number {
    return (PPM_NEAR * D0) / (d + D0);
  }
  /** 0..1 apparent size factor (1 = at the angler's feet) */
  scaleAt(d: number): number {
    return D0 / (d + D0);
  }
  toWorld(d: number, lateral: number): { x: number; y: number } {
    return { x: this.vanishX + lateral * this.ppm(d), y: this.yOf(d) };
  }
  fromWorld(x: number, y: number): { d: number; lateral: number } {
    const d = this.dOf(y);
    return { d, lateral: (x - this.vanishX) / this.ppm(d) };
  }
}

export function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inEllipse(x: number, y: number, e: { x: number; y: number; rx: number; ry: number }): boolean {
  const dx = (x - e.x) / e.rx;
  const dy = (y - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}

/** water depth at distance d for a zone (m) */
export function waterDepth(zone: ZoneDef, d: number): number {
  const t = Math.min(1, Math.max(0, (d - 2) / 24));
  return zone.shallow + (zone.deep - zone.shallow) * Math.pow(t, 0.8);
}
