import Phaser from 'phaser';
import { Rng } from '../core/rng';
import type { Weather } from '../core/weather';

/** Bounded sprite pools: no tweens/allocations per raindrop, works in Canvas. */
export class WeatherView {
  private sky: Phaser.GameObjects.Image;
  private mist: Phaser.GameObjects.Image;
  private drops: Array<{ image: Phaser.GameObjects.Image; speed: number }> = [];
  private rings: Array<{ image: Phaser.GameObjects.Image; life: number; duration: number; scale: number }> = [];
  private rng = new Rng(3401);
  constructor(private scene: Phaser.Scene, horizon: number) {
    this.sky = scene.add.image(0, 0, 'weather_sky').setOrigin(0).setScrollFactor(0)
      .setDisplaySize(2880, 1080).setDepth(0.5).setAlpha(0);
    this.mist = scene.add.image(960, horizon + 15, 'weather_mist').setScrollFactor(0)
      .setDepth(390).setDisplaySize(2100, 200).setAlpha(0);
    for (let i = 0; i < 110; i++) {
      const scale = this.rng.range(0.35, 0.9);
      const image = scene.add.image(this.rng.range(0, 1920), this.rng.range(-100, 1080), 'weather_drop')
        .setScrollFactor(0).setDepth(395).setScale(scale).setVisible(false);
      this.drops.push({ image, speed: 700 + scale * 650 });
    }
    for (let i = 0; i < 28; i++) {
      const image = scene.add.image(0, 0, 'weather_ring').setScrollFactor(0).setDepth(26).setVisible(false);
      this.rings.push({ image, life: -i * 0.08, duration: 0.8, scale: 1 });
    }
    // Game objects belong to the scene display list and are destroyed on shutdown.
  }
  update(dt: number, w: Weather, horizon: number, night: number) {
    this.sky.setAlpha(w.cloud * 0.95).setTint(night > 0.5 ? 0x8d9bb8 : 0xffffff);
    this.mist.setAlpha(w.rain * 0.24 + w.cloud * 0.04);
    const count = Math.floor(this.drops.length * w.rain);
    this.drops.forEach(({ image, speed }, i) => {
      image.setVisible(i < count);
      if (i >= count) return;
      image.y += speed * dt;
      image.x -= (35 + w.wind * 60) * dt;
      image.setAlpha((0.13 + i % 3 * 0.05) * (1 - night * 0.4));
      if (image.y > 1120) { image.y = -80; image.x = this.rng.range(0, 2000); }
      if (image.x < -30) image.x = 1950;
    });
    this.rings.forEach((r, i) => {
      r.life += dt;
      if (r.life > r.duration) {
        r.life = 0;
        r.duration = this.rng.range(0.6, 1.25);
        const y = this.rng.range(horizon + 20, 1010);
        r.image.setPosition(this.rng.range(30, 1890), y);
        r.scale = 0.12 + (y - horizon) / 650 * 0.5;
      }
      const u = Math.max(0, r.life / r.duration);
      r.image.setVisible(w.rain > 0.05 && i < w.rain * this.rings.length && r.life >= 0)
        .setScale(r.scale * (0.2 + u)).setAlpha(w.rain * (1-u) * 0.45);
    });
    void this.scene;
  }
}
