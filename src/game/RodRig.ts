import Phaser from 'phaser';
import { approach } from '../core/rng';

const DEG = Math.PI / 180;
// hand_right_grip.png (2x art): cork axis endpoints in texture px
const CORK_TOP = { x: 60, y: 40 };
const CORK_BOT = { x: 690, y: 640 };
const CORK_ANGLE = Math.atan2(CORK_TOP.y - CORK_BOT.y, CORK_TOP.x - CORK_BOT.x);
const CUFF = { x: 565, y: 245 };

export interface RigPose {
  theta: number; // rod angle in degrees (screen, atan2 convention)
  bend: number; // 0..1
  pullX: number; // direction of line pull (screen vector)
  pullY: number;
  reel: number; // 0..1 crank speed
}

/** First-person hands + rod + reel, built from the separated rig art and animated in code (GDD 14.3). */
export class RodRig {
  readonly c: Phaser.GameObjects.Container;
  // rod blank: textured segments (works on both WebGL and Canvas renderers) + a dark under-stroke for contrast
  private segs: Phaser.GameObjects.Image[] = [];
  private blankG: Phaser.GameObjects.Graphics;
  private segW = 1;
  private hand: Phaser.GameObjects.Image;
  private sleeve: Phaser.GameObjects.Image;
  private reel: Phaser.GameObjects.Image;
  private leftArm: Phaser.GameObjects.Image;
  private net: Phaser.GameObjects.Image;
  private N = 22;
  private pts: Phaser.Math.Vector2[] = [];
  private theta = -128 * DEG;
  private bend = 0.04;
  private crank = 0;
  private t = 0;
  private kick = 0; // short impulse for cast / hook
  base = new Phaser.Math.Vector2(1450, 700);
  readonly L = 640;
  tip = new Phaser.Math.Vector2();
  private scale = 0.55;
  shake = true;

  constructor(private scene: Phaser.Scene) {
    const s = scene;
    this.c = s.add.container(0, 0).setScrollFactor(0).setDepth(500);
    this.leftArm = s.add.image(0, 0, 'rig_forearm_sleeve').setOrigin(120 / 991, 235 / 417).setScale(0.5);
    this.sleeve = s.add.image(0, 0, 'rig_sleeve_only').setOrigin(0.02, 0.55).setScale(0.62);
    for (let i = 0; i <= this.N; i++) this.pts.push(new Phaser.Math.Vector2(i * 30, 0));
    this.blankG = s.add.graphics();
    const rodTex = s.textures.get('rig_rod_blank');
    const src = rodTex.getSourceImage() as HTMLImageElement;
    this.segW = src.width / this.N;
    for (let i = 0; i < this.N; i++) {
      const key = `seg${i}`;
      if (!rodTex.has(key)) rodTex.add(key, 0, Math.floor(i * this.segW), 0, Math.ceil(this.segW) + 1, src.height);
      this.segs.push(s.add.image(0, 0, 'rig_rod_blank', key).setOrigin(0, 0.5));
    }
    this.reel = s.add.image(0, 0, 'rig_reel_spinning').setScale(0.36);
    const hand = s.add.image(0, 0, 'rig_hand_right_grip');
    const tex = hand.texture.getSourceImage() as HTMLImageElement;
    hand.setOrigin(CORK_TOP.x / tex.width, CORK_TOP.y / tex.height).setScale(this.scale);
    this.hand = hand;
    this.net = s.add.image(-400, 1300, 'rig_net').setScale(0.7).setOrigin(0.05, 0.5).setVisible(false);
    this.c.add([this.sleeve, this.blankG, ...this.segs, this.reel, this.leftArm, this.hand, this.net]);
  }

  /** impulse (deg) added to theta that decays — used by cast & hook-set */
  impulse(deg: number) {
    this.kick += deg;
  }

  update(dt: number, pose: RigPose) {
    this.t += dt;
    this.kick = approach(this.kick, 0, 7, dt);
    const sway = Math.sin(this.t * 1.1) * 0.6 + Math.sin(this.t * 2.7) * 0.25;
    const target = (pose.theta + sway + this.kick) * DEG;
    this.theta = approach(this.theta, target, 9, dt);
    this.bend = approach(this.bend, pose.bend, 7, dt);
    this.crank += pose.reel * dt * Math.PI * 4;

    const th = this.theta;
    const dir = new Phaser.Math.Vector2(Math.cos(th), Math.sin(th));
    const nrm = new Phaser.Math.Vector2(-dir.y, dir.x); // perpendicular
    // pull direction → bend side: project pull onto the perpendicular
    const pull = new Phaser.Math.Vector2(pose.pullX, pose.pullY).normalize();
    const side = pull.dot(nrm) || 0.6;
    const along = Math.max(0, pull.dot(dir) * -1); // pulling toward the butt shortens
    const B = this.base.clone();
    // body breathing + reaction to tension
    B.x += Math.sin(this.t * 0.9) * 2;
    B.y += Math.sin(this.t * 1.3) * 2 + this.bend * 10;

    for (let i = 0; i <= this.N; i++) {
      const s = i / this.N;
      const defl = this.bend * this.L * 0.55 * Math.pow(s, 2.2);
      const shorten = (this.bend * 0.18 + along * this.bend * 0.1) * this.L * Math.pow(s, 3);
      const len = s * this.L - shorten;
      this.pts[i].set(B.x + dir.x * len + nrm.x * defl * side + pull.x * defl * 0.25, B.y + dir.y * len + nrm.y * defl * side + pull.y * defl * 0.25);
    }
    this.drawBlank();
    this.tip.copy(this.pts[this.N]);

    // hand + cork aligned with the butt section of the rod
    const rot = th - CORK_ANGLE;
    this.hand.setPosition(B.x, B.y).setRotation(rot);
    const cuff = this.local(this.hand, CUFF.x, CUFF.y);
    this.sleeve.setPosition(cuff.x, cuff.y).setRotation(36 * DEG + (th + 128 * DEG) * 0.6);
    // reel hangs under the rod, ~110px down the cork from the blank joint
    const rp = B.clone().add(dir.clone().scale(-118)).add(nrm.clone().scale(-82));
    this.reel.setPosition(rp.x, rp.y).setRotation(th + 128 * DEG + 0.15);
    // left fist on the crank knob, circling while reeling
    const knob = rp.clone().add(new Phaser.Math.Vector2(-70, 34).rotate(th + 128 * DEG));
    knob.x += Math.cos(this.crank) * 16 * Math.min(1, pose.reel * 3);
    knob.y += Math.sin(this.crank) * 12 * Math.min(1, pose.reel * 3);
    this.leftArm.setPosition(knob.x, knob.y).setRotation(118 * DEG + (th + 128 * DEG) * 0.4 + Math.sin(this.crank) * 0.03 * pose.reel);
  }

  private drawBlank() {
    const g = this.blankG;
    g.clear();
    for (let i = 0; i < this.N; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const u = i / this.N;
      g.lineStyle(9 - 6 * u, 0x1b2026, 0.9).lineBetween(a.x, a.y, b.x, b.y);
      const seg = this.segs[i];
      const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      seg.setPosition(a.x, a.y).setRotation(Math.atan2(b.y - a.y, b.x - a.x)).setScale((len + 1.5) / Math.ceil(this.segW), 0.8);
    }
  }

  private local(img: Phaser.GameObjects.Image, tx: number, ty: number) {
    const ox = img.originX * img.width;
    const oy = img.originY * img.height;
    const v = new Phaser.Math.Vector2((tx - ox) * img.scaleX, (ty - oy) * img.scaleY).rotate(img.rotation);
    return { x: img.x + v.x, y: img.y + v.y };
  }

  /** landing mini-game: the net follows the mouse while F is held out */
  holdNet(on: boolean, x = 0, y = 0, dt = 0.016) {
    const n = this.net;
    if (!on) {
      if (n.visible && !this.scene.tweens.isTweening(n)) n.setPosition(n.x - 2400 * dt, n.y + 1600 * dt);
      if (n.y > 1240) n.setVisible(false);
      return;
    }
    if (!n.visible) n.setVisible(true).setPosition(-300, 1250).setRotation(-0.6).setAlpha(1);
    const k = Math.min(1, dt * 9);
    n.setPosition(n.x + (x - 180 - n.x) * k, n.y + (y + 40 - n.y) * k).setRotation(-0.15);
  }

  showNet(x: number, y: number, done: () => void) {
    const n = this.net;
    n.setVisible(true).setPosition(-300, 1250).setRotation(-0.6).setAlpha(1);
    this.scene.tweens.add({
      targets: n, x: x - 180, y: y + 40, rotation: -0.15, duration: 520, ease: 'Cubic.out',
      onComplete: () => {
        this.scene.tweens.add({ targets: n, x: -300, y: 1250, rotation: -0.6, delay: 380, duration: 520, ease: 'Cubic.in', onComplete: () => n.setVisible(false) });
        done();
      },
    });
  }
}
