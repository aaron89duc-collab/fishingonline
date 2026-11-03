import Phaser from 'phaser';

export const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
export const COL = {
  text: '#eef6f3', dim: '#9fbfbd', gold: '#ffd36b', teal: 0x2ec4b6, tealDark: 0x12303a, panel: 0x0f2530,
  green: 0x45c97a, yellow: 0xf2c94c, red: 0xff5a3c, blue: 0x3fa7ff, white: 0xffffff,
};

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, size = 26, color = COL.text, weight = 600, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  const t = scene.add.text(x, y, s, {
    fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: String(weight), ...style,
  });
  t.setShadow(0, 2, 'rgba(0,0,0,0.45)', 4, false, true);
  return t;
}

export const fmtKg = (w: number) => w.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
export const fmtMoney = (m: number) => m.toLocaleString('vi-VN') + ' xu';
export const fmtHour = (h: number) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/** Nine-slice panel from UI kit art (UI-04 / UI-09). */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'ui_panel_info', alpha = 0.96) {
  const p = scene.add.nineslice(x, y, key, undefined, w, h, 28, 28, 28, 28);
  p.setOrigin(0, 0).setAlpha(alpha);
  return p;
}

export interface ButtonOpts {
  w?: number; h?: number; size?: number; icon?: string; iconScale?: number; color?: number; disabled?: boolean; key?: string; tip?: string;
}

export class Button extends Phaser.GameObjects.Container {
  bg: Phaser.GameObjects.NineSlice;
  label: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
  private onClick: () => void;
  private disabled = false;
  w: number;
  h: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, o: ButtonOpts = {}) {
    super(scene, x, y);
    this.w = o.w ?? 240;
    this.h = o.h ?? 64;
    this.onClick = onClick;
    this.bg = scene.add.nineslice(0, 0, o.key ?? 'ui_toast', undefined, this.w, this.h, 30, 30, 20, 20);
    if (o.color !== undefined) this.bg.setTint(o.color);
    this.add(this.bg);
    let lx = 0;
    if (o.icon) {
      this.icon = scene.add.image(text ? -this.w / 2 + 34 : 0, 0, o.icon);
      const s = (o.iconScale ?? 1) * Math.min((this.h - 14) / this.icon.height, (this.h - 14) / this.icon.width);
      this.icon.setScale(s);
      this.add(this.icon);
      lx = text ? 18 : 0;
    }
    this.label = txt(scene, lx, 0, text, o.size ?? 24, COL.text, 700).setOrigin(0.5);
    this.add(this.label);
    this.setSize(this.w, this.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => !this.disabled && this.bg.setAlpha(0.85).setScale(1.03));
    this.on('pointerout', () => this.bg.setAlpha(1).setScale(1));
    this.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.disabled) return;
      this.bg.setScale(0.97);
      scene.events.emit('ui-click');
      this.onClick();
    });
    this.on('pointerup', () => this.bg.setScale(1));
    if (o.disabled) this.setDisabled(true);
    scene.add.existing(this);
  }

  setDisabled(d: boolean) {
    this.disabled = d;
    this.setAlpha(d ? 0.45 : 1);
    return this;
  }
  setText(s: string) {
    this.label.setText(s);
    return this;
  }
}

export function iconButton(scene: Phaser.Scene, x: number, y: number, icon: string, onClick: () => void, size = 76, tip = '') {
  const b = new Button(scene, x, y, '', onClick, { w: size, h: size, icon, key: 'ui_button_square', iconScale: 0.82 });
  if (tip) {
    const t = txt(scene, 0, size / 2 + 6, tip, 15, COL.dim, 600).setOrigin(0.5, 0);
    b.add(t);
  }
  return b;
}

/** Simple horizontal bar with fill clipped by width (UI-01..03 art). */
export class Bar extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Image;
  private bgImg: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fillKey: string) {
    super(scene, x, y);
    this.bgImg = scene.add.image(0, 0, 'ui_bar_bg').setOrigin(0, 0.5).setDisplaySize(w, h);
    this.fill = scene.add.image(0, 0, fillKey).setOrigin(0, 0.5).setDisplaySize(w, h);
    this.add([this.bgImg, this.fill]);
    this.setSize(w, h);
    scene.add.existing(this);
  }
  set(v: number, tint?: number) {
    const f = Phaser.Math.Clamp(v, 0, 1);
    const tex = this.fill.texture.getSourceImage() as HTMLImageElement;
    this.fill.setCrop(0, 0, tex.width * f, tex.height);
    if (tint !== undefined) this.fill.setTint(tint);
    else this.fill.clearTint();
  }
}

/** Modal base: dim background + panel; closes with Esc or ✕. */
export class Modal extends Phaser.GameObjects.Container {
  content: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, title: string, w: number, h: number, onClose: () => void) {
    super(scene, 0, 0);
    const dim = scene.add.rectangle(0, 0, 1920, 1080, 0x061014, 0.62).setOrigin(0).setInteractive();
    dim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    const x = (1920 - w) / 2;
    const y = (1080 - h) / 2;
    const p = panel(scene, x, y, w, h, 'ui_panel_info', 0.98);
    const t = txt(scene, x + 40, y + 28, title, 38, COL.text, 800);
    const close = iconButton(scene, x + w - 50, y + 50, 'ico_close', onClose, 64);
    this.content = scene.add.container(x, y);
    this.add([dim, p, t, close, this.content]);
    this.setScrollFactor(0).setDepth(1000);
    scene.add.existing(this);
  }
}

export function toastBox(scene: Phaser.Scene, msg: string, color = COL.text, y = 150, life = 2600) {
  const c = scene.add.container(960, y).setScrollFactor(0).setDepth(900);
  const t = txt(scene, 0, 0, msg, 26, color, 700, { align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5);
  const w = Math.min(1000, t.width + 80);
  const h = t.height + 34;
  const bg = scene.add.nineslice(0, 0, 'ui_toast', undefined, w, h, 30, 30, 20, 20);
  c.add([bg, t]);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, y: y + 8, duration: 220 });
  scene.tweens.add({ targets: c, alpha: 0, delay: life, duration: 400, onComplete: () => c.destroy() });
  return c;
}
