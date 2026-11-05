import { clamp } from './rng';

export interface LineState {
  lineOut: number; slack: number; stretch: number; tension: number;
  rodLoad: number; slipRate: number; retrieveRate: number;
}

/** A compliant rod + elastic line in series. All lengths are metres;
 * tension is a percentage of the equipped line's working breaking load.
 * This is a lightweight game model, not an engineering rod simulation. */
export function solveLine(
  s: LineState, dt: number, path: number, reelSpeed: number,
  drag: number, maxDrag: number, lineStrength: number, rodPower: number,
): void {
  const compliance = (0.22 + s.lineOut * 0.018 + 0.22 / rodPower) * lineStrength;
  const brake = (18 + 100 * drag * maxDrag) / lineStrength;
  // The handle cannot recover line against a slipping spool.
  const loaded = Math.max(0, (path - s.lineOut) / compliance * 100);
  s.retrieveRate = reelSpeed * clamp(1 - loaded / Math.max(25, brake + 15), 0, 1);
  s.lineOut = Math.max(0.35, s.lineOut - s.retrieveRate * dt);
  const extension = Math.max(0, path - s.lineOut);
  const raw = extension / compliance * 100;
  s.slipRate = raw > brake ? (raw - brake) * compliance / 100 * 12 : 0;
  const payout = Math.min(extension, s.slipRate * dt);
  s.lineOut += payout;
  s.slack = Math.max(0, s.lineOut - path);
  s.stretch = Math.max(0, path - s.lineOut);
  s.tension = clamp(s.stretch / compliance * 100, 0, 140);
  s.rodLoad = clamp(s.tension / 100 / Math.sqrt(rodPower), 0, 1.2);
}
