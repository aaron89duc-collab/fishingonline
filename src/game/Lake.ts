import Phaser from 'phaser';
import type { ZoneDef } from '../core/data';
import type { Perspective } from '../core/perspective';
import { Rng } from '../core/rng';

/** Renders a fishing zone: parallax layers (Bờ cỏ) or a painted plate, props, ambient life, light of day. */
export class Lake {
  readonly worldWidth: number;
  private clouds: Phaser.GameObjects.Image[] = [];
  private reflection?: Phaser.GameObjects.Image;
  private tint: Phaser.GameObjects.Rectangle;
  private warm: Phaser.GameObjects.Rectangle;
  private ambientT = 3;
  private sparkleT = 0;
  private reeds: Phaser.GameObjects.Image[] = [];
  private t = 0;
  private rng = new Rng(7);
  night = 0;
  nightAlpha = 0;

  constructor(private scene: Phaser.Scene, public zone: ZoneDef, private persp: Perspective) {
    this.worldWidth = zone.worldWidth;
    if (zone.kind === 'parallax') this.buildBoco();
    else this.buildPlate();
    this.warm = scene.add.rectangle(0, 0, 1920, 1080, 0xff9a4a, 0).setOrigin(0).setScrollFactor(0).setDepth(400).setBlendMode(Phaser.BlendModes.ADD);
    this.tint = scene.add.rectangle(0, 0, 1920, 1080, 0x0a1838, 0).setOrigin(0).setScrollFactor(0).setDepth(401);
  }

  /** parallax helper: layer that is centered at default scroll (worldWidth-1920)/2 */
  private layer(key: string, y: number, f: number, depth: number, originY = 0) {
    const def = (this.worldWidth - 1920) / 2;
    const img = this.scene.add.image(-def + def * f, y, key).setOrigin(0, originY).setScrollFactor(f).setDepth(depth);
    return img;
  }

  private buildBoco() {
    const s = this.scene;
    this.layer('boco_sky', 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const c = s.add.image(this.rng.range(-200, 2600), this.rng.range(40, 300), `cloud_${i % 7}`)
        .setScrollFactor(0.06).setDepth(1).setAlpha(0.92).setScale(this.rng.range(0.6, 1.1));
      this.clouds.push(c);
    }
    this.layer('boco_mtn_far', 440, 0.2, 2, 1).setAlpha(0.85);
    this.layer('boco_mtn_near', 450, 0.35, 3, 1);
    // other anglers on the far bank (ambient only; no online players in this phase)
    const tl = this.layer('boco_treeline', 440, 0.5, 4, 1);
    void tl;
    s.add.image(1760, 438, 'prop_angler_sitting').setOrigin(0.5, 1).setScale(0.085).setScrollFactor(0.5).setDepth(5);
    s.add.image(980, 436, 'prop_angler_standing').setOrigin(0.5, 1).setScale(0.06).setScrollFactor(0.5).setDepth(5);
    s.add.image(560, 440, 'prop_creature_heron').setOrigin(0.5, 1).setScale(0.09).setScrollFactor(0.5).setDepth(5);
    this.scene.add.image(0, 440, 'boco_water').setOrigin(0, 0).setDepth(6);
    this.reflection = this.scene.add.image(0, 440, 'boco_reflection').setOrigin(0, 0).setDepth(7).setAlpha(0.75);
    // lotus clusters on the snag areas
    for (const e of this.zone.snags) this.lotusCluster(e.x, e.y, e.rx, e.ry);
    this.foreground();
  }

  private lotusCluster(x: number, y: number, rx: number, ry: number) {
    const s = this.scene;
    const d = this.persp.dOf(y);
    const sc = this.persp.scaleAt(d) * 1.5;
    const n = Math.max(3, Math.round(rx / 30));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.range(-0.4, 0.4);
      const r = this.rng.range(0.1, 0.9);
      const px = x + Math.cos(a) * rx * r;
      const py = y + Math.sin(a) * ry * r;
      const k = this.rng.pick(['prop_lotus_leaf_01', 'prop_lotus_leaf_02', 'prop_lotus_leaf_03', 'prop_lotus_leaf_04', 'prop_lotus_leaf_05', 'prop_lotus_leaf_06']);
      s.add.image(px, py, k).setScale(sc * this.rng.range(0.55, 0.9)).setDepth(10 + py / 1000).setAngle(this.rng.range(-8, 8));
    }
    s.add.image(x + rx * 0.2, y - ry * 0.2, this.rng.pick(['prop_lotus_flower_01', 'prop_lotus_flower_02'])).setScale(sc * 0.55).setOrigin(0.5, 0.85).setDepth(10.9);
    s.add.image(x - rx * 0.45, y - ry * 0.1, this.rng.pick(['prop_lotus_bud_01', 'prop_lotus_bud_02'])).setScale(sc * 0.5).setOrigin(0.5, 0.9).setDepth(10.9);
  }

  private foreground() {
    const s = this.scene;
    const def = (this.worldWidth - 1920) / 2;
    // bottom-left bank: rocks, reeds, tackle box (camera-attached a little: factor 1.1 for depth)
    const fg = (x: number, y: number, key: string, sc: number, depth = 60, ox = 0.5, oy = 1) => {
      const img = s.add.image(x + def, y, key).setScale(sc).setOrigin(ox, oy).setDepth(depth).setScrollFactor(1);
      return img;
    };
    fg(-40, 1100, 'prop_rock', 1.5, 58);
    fg(140, 1110, 'prop_rock', 1.1, 59).setFlipX(true);
    this.reeds.push(fg(60, 1100, 'prop_reed_02', 1.2, 61), fg(250, 1110, 'prop_reed_01', 1.05, 62), fg(-60, 1090, 'prop_reed_03', 1.3, 60));
    fg(420, 1100, 'prop_tackle_box', 0.55, 63);
    fg(560, 1110, 'prop_bait_box', 0.42, 64);
    // right side reeds behind the rig
    this.reeds.push(fg(1930, 1090, 'prop_reed_04', 1.25, 61), fg(2060, 1100, 'prop_reed_02', 1.1, 60).setFlipX(true));
    // floating lilies near shore
    fg(980, 1010, 'prop_lotus_leaf_02', 0.75, 20, 0.5, 0.5);
    fg(1160, 1040, 'prop_lotus_leaf_05', 0.7, 20, 0.5, 0.5);
  }

  private buildPlate() {
    const s = this.scene;
    s.add.image(0, -54, this.zone.plate!).setOrigin(0).setScale(1.1 * (1920 / 2048)).setDepth(0);
    if (this.zone.id === 'bai_beo') this.reeds.push(s.add.image(1980, 1150, 'prop_reed_02').setOrigin(0.5, 1).setScale(1.1).setDepth(60));
  }

  update(dt: number, hour: number, cloud = 0, wind = 0.5) {
    this.t += dt;
    for (const c of this.clouds) {
      c.x += dt * (6 + Math.abs(wind) * 6);
      c.setAlpha(0.92 * (1 - cloud * 0.8)).setTint(cloud > 0.5 ? 0xb0bfce : 0xffffff);
      if (c.x > 3000) c.x = -400;
    }
    if (this.reflection) this.reflection.x = Math.sin(this.t * 0.6) * 3;
    for (const r of this.reeds) r.rotation = Math.sin(this.t * (1.2 + Math.abs(wind) * 0.2) + r.x * 0.01) * (0.012 + Math.abs(wind) * 0.015);

    // light of day: dawn 5-7, dusk 17-19, night 19-5
    const h = hour % 24;
    let night = 0;
    if (h >= 19.5 || h < 4.5) night = 1;
    else if (h >= 17.5) night = (h - 17.5) / 2;
    else if (h < 6.5) night = (6.5 - h) / 2;
    night = Phaser.Math.Clamp(night, 0, 1);
    this.night = night;
    const warm = (h > 5 && h < 8 ? 1 - Math.abs(h - 6.3) / 1.7 : 0) + (h > 16 && h < 19.5 ? 1 - Math.abs(h - 18) / 1.6 : 0);
    this.warm.setAlpha(Phaser.Math.Clamp(warm, 0, 1) * 0.12 * (1 - cloud));
    this.tint.setAlpha(0); // night darkening is drawn once over world + hands in the UI scene (see FishingScene)
    this.nightAlpha = night * 0.55;

    // ambient sparkles on water (sun glint) and creatures
    this.sparkleT -= dt;
    if (this.sparkleT <= 0 && night < 0.6 && cloud < 0.5) {
      this.sparkleT = 0.15;
      const cam = this.scene.cameras.main;
      const x = cam.scrollX + (this.zone.kind === 'parallax' ? this.rng.range(1050, 1650) : this.rng.range(200, 1700));
      const y = this.rng.range(this.persp.H + 30, this.persp.H + 300);
      const sp = this.scene.add.image(x, y, `sparkle_${this.rng.int(1, 4)}`).setDepth(8).setScale(this.persp.scaleAt(this.persp.dOf(y)) * 0.9).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: sp, alpha: 0.75, yoyo: true, duration: 380, onComplete: () => sp.destroy() });
    }
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = this.rng.range(14, 30);
      this.creature();
    }
  }

  private creature() {
    const s = this.scene;
    const left = this.rng.chance(0.5);
    const night = this.night > 0.6;
    const key = night ? 'prop_creature_frog' : this.rng.pick(['prop_creature_dragonfly', 'prop_creature_butterfly']);
    if (night) return;
    const y = this.rng.range(500, 820);
    const c = s.add.image(left ? -80 : 2000, y, key).setScrollFactor(0).setDepth(300).setScale(0.22).setFlipX(!left);
    s.tweens.add({ targets: c, x: left ? 2000 : -80, duration: this.rng.range(7000, 11000), ease: 'Linear', onComplete: () => c.destroy() });
    s.tweens.add({ targets: c, y: y - 60, yoyo: true, repeat: 6, duration: 700, ease: 'Sine.inOut' });
  }

  ambientRing() {
    const cam = this.scene.cameras.main;
    const x = cam.scrollX + this.rng.range(120, 1800);
    const y = this.rng.range(this.persp.H + 40, 950);
    return { x, y };
  }
}
