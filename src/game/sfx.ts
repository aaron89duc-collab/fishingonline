/** Procedural sound (WebAudio) — no audio files needed in this phase. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private amb: { wind: GainNode; birdsT: number } | null = null;
  private reelGain: GainNode | null = null;
  private reelOsc: OscillatorNode | null = null;
  private creakGain: GainNode | null = null;
  volume = 0.7;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.startAmbience();
      this.startLoops();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseBuffer(sec = 2): AudioBuffer {
    const c = this.ctx!;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  private startAmbience() {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    // slow gusts
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    this.amb = { wind: g, birdsT: 2 };
  }

  private startLoops() {
    const c = this.ctx!;
    // reel ratchet: pulse train
    this.reelOsc = c.createOscillator();
    this.reelOsc.type = 'square';
    this.reelOsc.frequency.value = 30;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    this.reelGain = c.createGain();
    this.reelGain.gain.value = 0;
    this.reelOsc.connect(hp).connect(this.reelGain).connect(this.master!);
    this.reelOsc.start();
    // line creak under tension
    const n = c.createBufferSource();
    n.buffer = this.noiseBuffer(2);
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 8;
    this.creakGain = c.createGain();
    this.creakGain.gain.value = 0;
    n.connect(bp).connect(this.creakGain).connect(this.master!);
    n.start();
  }

  /** call every frame */
  update(dt: number, reel: number, tension: number, night: boolean) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    if (this.reelGain && this.reelOsc) {
      this.reelGain.gain.setTargetAtTime(reel > 0 ? 0.05 : 0, t, 0.03);
      this.reelOsc.frequency.setTargetAtTime(18 + reel * 26, t, 0.05);
    }
    if (this.creakGain) this.creakGain.gain.setTargetAtTime(tension > 70 ? (tension - 70) / 30 * 0.08 : 0, t, 0.08);
    if (this.amb) {
      this.amb.birdsT -= dt;
      if (this.amb.birdsT <= 0) {
        this.amb.birdsT = 3 + Math.random() * 7;
        if (night) this.cricket();
        else this.bird();
      }
    }
  }

  private env(g: GainNode, a: number, peak: number, d: number) {
    const t = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private bird() {
    const c = this.ctx!;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      const t0 = c.currentTime + i * 0.13;
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t0 + 0.08);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.025, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.12);
    }
  }

  private cricket() {
    const c = this.ctx!;
    for (let i = 0; i < 6; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      const t0 = c.currentTime + i * 0.07;
      o.frequency.value = 4400;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.06);
    }
  }

  private burst(freq: number, q: number, peak: number, dur: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuffer(1);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    s.connect(f).connect(g).connect(this.master!);
    this.env(g, 0.005, peak, dur);
    s.start();
    s.stop(c.currentTime + dur + 0.05);
  }

  plop() { this.burst(700, 1.2, 0.35, 0.25); this.tone(380, 160, 0.12, 0.15); }
  splash() { this.burst(1200, 0.6, 0.5, 0.6); }
  nibble() { this.burst(1800, 3, 0.08, 0.06); }
  whoosh() { this.burst(1500, 0.7, 0.18, 0.35); }
  hook() { this.tone(220, 520, 0.12, 0.12); this.burst(2500, 2, 0.12, 0.08); }
  snap() { this.burst(3200, 4, 0.5, 0.12); this.tone(900, 120, 0.2, 0.2); }
  click() { this.tone(900, 900, 0.05, 0.04); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.12, 0.18), i * 110)); }
  fail() { [392, 330].forEach((f, i) => setTimeout(() => this.tone(f, f * 0.95, 0.1, 0.22), i * 160)); }

  private tone(f0: number, f1: number, peak: number, dur: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    o.connect(g).connect(this.master!);
    this.env(g, 0.01, peak, dur);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }
}

export const sfx = new Sfx();
