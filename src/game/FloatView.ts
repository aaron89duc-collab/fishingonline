import Phaser from 'phaser';
import type { FloatPose } from '../core/bite';

/**
 * Float sprite cut at the waterline (Mốc 5 waterline = 40% from top). Waves and wind are local,
 * fish signals come from the authority's bite pose. Sinking moves the texture down and crops what is under water.
 */
export class FloatView {
  readonly c: Phaser.GameObjects.Container;
  private above: Phaser.GameObjects.Image;
  private below: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private mark: Phaser.GameObjects.Text;
  private texH = 256;
  private texW = 21;
  private wl = 0.4;
  private t = Math.random() * 10;
  x = 0;
  y = 0;
  driftX = 0;
  scale = 1;
  lying = false; // bait on bottom with float rig → float lies flat
  visible = false;
  sinkNow = 0;
  private sinkVelocity = 0;
  topX = 0;
  topY = 0;

  constructor(scene: Phaser.Scene, key: string) {
    this.c = scene.add.container(0, 0).setDepth(30).setVisible(false);
    this.glow = scene.add.image(0, 0, 'sparkle_6').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setTint(0xfff2a8);
    this.below = scene.add.image(0, 0, key).setOrigin(0.5, 0).setAlpha(0.28).setTint(0x6fa6b6);
    this.above = scene.add.image(0, 0, key).setOrigin(0.5, 0);
    this.mark = scene.add.text(0, 0, '!', { fontFamily: "'Be Vietnam Pro', sans-serif", fontSize: '64px', color: '#ffd36b', fontStyle: '800' })
      .setOrigin(0.5, 1).setAlpha(0).setShadow(0, 3, 'rgba(0,0,0,0.6)', 6, false, true);
    this.c.add([this.glow, this.below, this.above, this.mark]);
    this.setTexture(key);
  }

  setTexture(key: string) {
    this.above.setTexture(key);
    this.below.setTexture(key);
    const src = this.above.texture.getSourceImage() as HTMLImageElement;
    this.texW = src.width;
    this.texH = src.height;
    // round / drop floats sit lower: waterline ~ 55%
    this.wl = key.includes('round') ? 0.55 : key.includes('drop') ? 0.5 : 0.4;
  }

  place(x: number, y: number, scale: number) {
    this.x = x;
    this.y = y;
    this.driftX = 0;
    this.sinkNow = 0;
    this.sinkVelocity = 0;
    this.scale = scale;
    this.c.setVisible(true);
    this.visible = true;
  }

  hide() {
    this.c.setVisible(false);
    this.visible = false;
  }

  /** Draw float in flight (no crop, full sprite) */
  flight(x: number, y: number, scale: number, rot: number) {
    this.c.setVisible(true).setPosition(x, y).setScale(scale).setRotation(rot);
    this.above.setCrop().setPosition(0, -this.texH * this.wl);
    this.below.setVisible(false);
    this.mark.setAlpha(0);
  }

  update(dt: number, pose: FloatPose, wind: number, current: number, alert: boolean, glow: boolean) {
    if (!this.visible) return;
    this.t += dt;
    // Tethered float: wind bows the line instead of drifting off indefinitely.
    this.driftX += ((wind * 0.8 + current) - this.driftX * 0.12) * dt;
    const wave = Math.sin(this.t * 2.1) * 0.035 + Math.sin(this.t * 3.7 + 1) * 0.02 + Math.sin(this.t * 0.7) * 0.03;
    const tremor = pose.tremor * (Math.sin(this.t * 41) * 0.04 + Math.sin(this.t * 27) * 0.03);
    const target = Phaser.Math.Clamp(pose.sink + wave + tremor, -0.6, 1.6);
    // Buoyancy/inertia: spring back after a nibble, no instantaneous teleport.
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.sinkVelocity += ((target - this.sinkNow) * 180 - this.sinkVelocity * 22) * h;
      this.sinkNow += this.sinkVelocity * h;
    }
    const sink = this.sinkNow;
    // sink in texture px: 1.0 ≈ the whole above-water part
    const aboveH = this.texH * this.wl;
    const sinkPx = sink * aboveH;
    const vis = Math.max(0, aboveH - sinkPx);
    const lieTilt = this.lying ? 1.25 : 0;
    const rot = pose.tilt + Math.sin(this.t * 1.7) * 0.05 + lieTilt;
    this.c.setPosition(this.x + this.driftX + pose.dx * this.scale * 3, this.y).setScale(this.scale).setRotation(rot);
    // texture top moves down by sinkPx; crop keeps only rows above the waterline (y=0)
    this.above.setVisible(vis > 0.5).setPosition(0, -aboveH + sinkPx);
    this.above.setCrop(0, 0, this.texW, Math.min(this.texH, vis));
    this.below.setVisible(true).setPosition(0, -aboveH + sinkPx);
    this.below.setCrop(0, vis, this.texW, this.texH - vis);
    const top = new Phaser.Math.Vector2(0, (-aboveH + sinkPx) * this.scale).rotate(rot);
    this.topX = this.c.x + top.x;
    this.topY = this.c.y + top.y;
    this.mark.setPosition(0, -aboveH - 30).setAlpha(alert ? 0.6 + 0.4 * Math.sin(this.t * 14) : 0).setScale(1 / Math.max(0.3, this.scale) * 0.6);
    this.glow.setAlpha(glow ? 0.65 + 0.2 * Math.sin(this.t * 3) : 0).setPosition(0, -aboveH + sinkPx).setScale(1.2 / Math.max(0.4, this.scale) * 0.5);
  }

  worldPos() {
    return { x: this.c.x, y: this.y };
  }
}
