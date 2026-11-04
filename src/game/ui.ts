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

/** Box styles matching the UI kit art (UI-04 panel, UI-09 result, UI-05 toast, UI-08 buttons). */
const STYLE: Record<string, { fill: number; fillA: number; stroke: number; strokeW: number; radius: number | 'pill' }> = {
  ui_panel_info: { fill: 0x0f2530, fillA: 0.92, stroke: 0x2ec4b6, strokeW: 3, radius: 20 },
  ui_panel_result: { fill: 0x10242e, fillA: 0.96, stroke: 0xf2c94c, strokeW: 4, radius: 22 },
  ui_toast: { fill: 0x0f2530, fillA: 0.9, stroke: 0x2ec4b6, strokeW: 3, radius: 'pill' },
  ui_button_square: { fill: 0x165a63, fillA: 0.95, stroke: 0xbfe3ea, strokeW: 3, radius: 16 },
  ui_button_round: { fill: 0x165a63, fillA: 0.92, stroke: 0xbfe3ea, strokeW: 4, radius: 'pill' },
  ui_slot: { fill: 0x122a33, fillA: 0.95, stroke: 0x6f8f96, strokeW: 2, radius: 14 },
  ui_slot_selected: { fill: 0x122a33, fillA: 0.95, stroke: 0xf2c94c, strokeW: 3, radius: 14 },
};

/**
 * Rounded box drawn with Graphics. Replaces Phaser's NineSlice (WebGL-only) so the whole UI works on the Canvas renderer.
 * Position = origin point; origin works like Image.setOrigin.
 */
export class Box extends Phaser.GameObjects.Graphics {
  bw: number;
  bh: number;
  ox = 0.5;
  oy = 0.5;
  private st: (typeof STYLE)[string];
  private fillOverride?: number;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'ui_panel_info', fill?: number) {
    super(scene, { x, y });
    this.bw = w;
    this.bh = h;
    this.st = STYLE[key] ?? STYLE.ui_panel_info;
    this.fillOverride = fill;
    this.redraw();
    scene.add.existing(this);
  }
  private redraw() {
    const { fillA, stroke, strokeW, radius } = this.st;
    const fill = this.fillOverride ?? this.st.fill;
    const w = this.bw, h = this.bh;
    const r = radius === 'pill' ? Math.min(w, h) / 2 : Math.min(radius, w / 2, h / 2);
    const x = -this.ox * w, y = -this.oy * h;
    this.clear();
    this.fillStyle(fill, fillA).fillRoundedRect(x, y, w, h, r);
    this.fillStyle(0xffffff, 0.06).fillRoundedRect(x + 4, y + 4, w - 8, Math.max(2, h * 0.42), { tl: r, tr: r, bl: 6, br: 6 });
    this.lineStyle(strokeW, stroke, 0.95).strokeRoundedRect(x, y, w, h, r);
  }
  setOrigin(ox: number, oy = ox) {
    this.ox = ox;
    this.oy = oy;
    this.redraw();
    return this;
  }
  setBoxSize(w: number, h: number) {
    this.bw = w;
    this.bh = h;
    this.redraw();
    return this;
  }
  setFill(color: number) {
    this.fillOverride = color;
    this.redraw();
    return this;
  }
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'ui_panel_info', alpha = 0.96) {
  const p = new Box(scene, x, y, w, h, key).setOrigin(0, 0);
  p.setAlpha(alpha);
  return p;
}

export interface ButtonOpts {
  w?: number; h?: number; size?: number; icon?: string; iconScale?: number; color?: number; disabled?: boolean; key?: string; tip?: string;
}

export class Button extends Phaser.GameObjects.Container {
  bg: Box;
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
    this.bg = new Box(scene, 0, 0, this.w, this.h, o.key ?? 'ui_toast', o.color);
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

/** Horizontal bar drawn with Graphics (colour changes work on any renderer). */
export class Bar extends Phaser.GameObjects.Graphics {
  private v = 0;
  private col: number;
  constructor(scene: Phaser.Scene, x: number, y: number, private bw: number, private bh: number, fillKey: string) {
    super(scene, { x, y });
    this.col = fillKey.includes('tension') ? 0xff5a3c : fillKey.includes('cast') ? 0x3fa7ff : fillKey.includes('stamina') ? 0x45c97a : 0xd7e2e6;
    this.draw(this.col);
    scene.add.existing(this);
  }
  private draw(col: number) {
    const r = this.bh / 2;
    this.clear();
    this.fillStyle(0x0b1a20, 0.9).fillRoundedRect(0, -this.bh / 2, this.bw, this.bh, r);
    const fw = this.bw * this.v;
    if (fw > 1) {
      this.fillStyle(col, 1).fillRoundedRect(0, -this.bh / 2, Math.max(fw, Math.min(this.bh, this.bw)), this.bh, Math.min(r, fw / 2));
      this.fillStyle(0xffffff, 0.22).fillRoundedRect(2, -this.bh / 2 + 2, Math.max(0, fw - 4), this.bh * 0.35, Math.min(r, fw / 2));
    }
    this.lineStyle(2, 0x5f7e86, 0.9).strokeRoundedRect(0, -this.bh / 2, this.bw, this.bh, r);
  }
  set(v: number, color?: number) {
    this.v = Phaser.Math.Clamp(v, 0, 1);
    this.draw(color ?? this.col);
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
  const bg = new Box(scene, 0, 0, w, h, 'ui_toast');
  c.add([bg, t]);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, y: y + 8, duration: 220 });
  scene.tweens.add({ targets: c, alpha: 0, delay: life, duration: 400, onComplete: () => c.destroy() });
  return c;
}
