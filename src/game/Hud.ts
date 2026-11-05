import Phaser from 'phaser';
import { Bar, Box, Button, COL, fmtHour, iconButton, panel, txt } from './ui';

export interface HudInfo {
  zone: string; hour: number; bait: string; baitIcon: string; hook: string; depth: string; wind: number;
  caught: number; best: string;
  weather?: string;
}

export class Hud {
  private root: Phaser.GameObjects.Container;
  private zoneT: Phaser.GameObjects.Text;
  private timeT: Phaser.GameObjects.Text;
  private baitIcon: Phaser.GameObjects.Image;
  private baitT: Phaser.GameObjects.Text;
  private depthT: Phaser.GameObjects.Text;
  private windT: Phaser.GameObjects.Text;
  private moneyT: Phaser.GameObjects.Text;
  private lvlT: Phaser.GameObjects.Text;
  private warnT: Phaser.GameObjects.Text;
  private questT: Phaser.GameObjects.Text;
  private hintT: Phaser.GameObjects.Text;
  private hintBg: Box;
  private castC: Phaser.GameObjects.Container;
  private castBar: Bar;
  private sweetRect: Phaser.GameObjects.Rectangle;
  private fightC: Phaser.GameObjects.Container;
  private tensionBar: Bar;
  private tensionT: Phaser.GameObjects.Text;
  private tensionIcon: Phaser.GameObjects.Text;
  private staminaBar: Bar;
  private lineBar: Bar;
  private hookBar: Bar;
  private phaseT: Phaser.GameObjects.Text;
  private promptC: Phaser.GameObjects.Container;
  private promptT: Phaser.GameObjects.Text;
  private toasts: Phaser.GameObjects.Container[] = [];
  touchC: Phaser.GameObjects.Container;
  touchMain: Button;
  touchAlt: Button;
  buttons: Record<string, Button> = {};

  constructor(private scene: Phaser.Scene, handlers: Record<string, () => void>, private touch: boolean) {
    const s = scene;
    this.root = s.add.container(0, 0).setScrollFactor(0).setDepth(700);
    // ---- top-left info panel
    const p = panel(s, 20, 18, 430, 196, 'ui_panel_info', 0.88);
    this.zoneT = txt(s, 44, 34, '', 28, COL.text, 800);
    this.timeT = txt(s, 430, 38, '', 24, COL.gold, 700).setOrigin(1, 0);
    this.baitIcon = s.add.image(64, 106, 'gear_bait_worm').setScale(0.42);
    this.baitT = txt(s, 98, 90, '', 22, COL.text, 600);
    this.depthT = txt(s, 44, 132, '', 21, COL.dim, 600);
    this.windT = txt(s, 44, 166, '', 19, COL.dim, 600);
    this.questT = txt(s, 30, 228, '', 18, '#cfe7e0', 600, { wordWrap: { width: 520 }, lineSpacing: 6 });
    this.root.add([p, this.zoneT, this.timeT, this.baitIcon, this.baitT, this.depthT, this.windT, this.questT]);
    // ---- top-right
    const pr = panel(s, 1440, 18, 460, 92, 'ui_panel_info', 0.88);
    this.moneyT = txt(s, 1466, 32, '', 24, COL.gold, 800);
    this.lvlT = txt(s, 1466, 68, '', 19, COL.dim, 600);
    this.root.add([pr, this.moneyT, this.lvlT]);
    const items: Array<[string, string, string]> = [['help', 'ico_help', 'Hướng dẫn (H)'], ['menu', 'ico_home', 'Menu (Esc)']];
    items.forEach(([id, icon, tip], i) => {
      const b = iconButton(s, 1846 - (items.length - 1 - i) * 82, 160, icon, handlers[id], 68, tip);
      b.label.setVisible(false);
      this.buttons[id] = b;
      this.root.add(b);
    });
    // ---- hint
    this.hintBg = new Box(s, 30, 1036, 600, 56, 'ui_toast').setOrigin(0, 1);
    this.hintBg.setAlpha(0.88);
    this.hintT = txt(s, 52, 1008, '', 21, '#e6f3ef', 600).setOrigin(0, 0.5);
    this.root.add([this.hintBg, this.hintT]);
    // ---- cast power
    this.castC = s.add.container(660, 960).setVisible(false);
    this.castBar = new Bar(s, 0, 0, 520, 34, 'ui_bar_cast_full');
    this.sweetRect = s.add.rectangle(0, 0, 520 * 0.08, 46, 0xffffff, 0.35).setOrigin(0.5, 0.5);
    this.castC.add([txt(s, 0, -46, 'LỰC NÉM', 20, COL.text, 800), this.castBar, this.sweetRect]);
    this.root.add(this.castC);
    // ---- fight
    this.fightC = s.add.container(0, 0).setVisible(false);
    const fx = 300, fy = 1000, fw = 760;
    const zones = s.add.graphics();
    zones.fillStyle(COL.green, 0.28).fillRect(fx, fy - 18, fw * 0.6, 36);
    zones.fillStyle(COL.yellow, 0.28).fillRect(fx + fw * 0.6, fy - 18, fw * 0.25, 36);
    zones.fillStyle(COL.red, 0.3).fillRect(fx + fw * 0.85, fy - 18, fw * 0.15, 36);
    this.tensionBar = new Bar(s, fx, fy, fw, 36, 'ui_bar_tension_full');
    const ticks = s.add.graphics();
    ticks.lineStyle(3, 0xffffff, 0.85).lineBetween(fx + fw * 0.6, fy - 24, fx + fw * 0.6, fy + 24).lineBetween(fx + fw * 0.85, fy - 24, fx + fw * 0.85, fy + 24);
    this.tensionT = txt(s, fx + fw + 20, fy, '0', 34, COL.text, 800).setOrigin(0, 0.5);
    this.tensionIcon = txt(s, fx - 20, fy, '✓', 34, '#45c97a', 800).setOrigin(1, 0.5);
    const lab = txt(s, fx, fy - 50, 'LỰC CĂNG DÂY', 20, COL.text, 800);
    this.staminaBar = new Bar(s, fx + 250, fy - 40, 160, 14, 'ui_bar_stamina_full');
    this.lineBar = new Bar(s, fx + 430, fy - 40, 160, 14, 'ui_bar_bg');
    this.hookBar = new Bar(s, fx + 610, fy - 40, 150, 14, 'ui_bar_cast_full');
    const sl = txt(s, fx + 250, fy - 68, 'Sức cá', 16, COL.dim, 700);
    const ll = txt(s, fx + 430, fy - 68, 'Độ bền dây', 16, COL.dim, 700);
    const hl = txt(s, fx + 610, fy - 68, 'Độ chắc lưỡi', 16, COL.dim, 700);
    this.phaseT = txt(s, fx, fy + 30, '', 22, COL.gold, 800);
    this.warnT = txt(s, 960, 860, '', 34, '#ff5a3c', 800).setOrigin(0.5);
    this.fightC.add([zones, this.tensionBar, ticks, this.tensionT, this.tensionIcon, lab, this.staminaBar, this.lineBar, this.hookBar, sl, ll, hl, this.phaseT, this.warnT]);
    this.root.add(this.fightC);
    // ---- prompt
    this.promptC = s.add.container(960, 540).setVisible(false);
    const pb = new Box(s, 0, 0, 520, 110, 'ui_panel_result');
    this.promptT = txt(s, 0, 0, '', 40, COL.gold, 800).setOrigin(0.5);
    this.promptC.add([pb, this.promptT]);
    this.root.add(this.promptC);
    // ---- touch controls (mobile)
    this.touchC = s.add.container(0, 0).setVisible(false); // replaced by TouchControls
    this.touchMain = new Button(s, 1790, 600, 'THU DÂY', () => undefined, { w: 190, h: 150, key: 'ui_button_round', size: 26 });
    this.touchAlt = new Button(s, 1600, 480, 'NHẢ DÂY', () => undefined, { w: 150, h: 120, key: 'ui_button_round', size: 22 });
    this.touchC.add([this.touchMain, this.touchAlt]);
    this.root.add(this.touchC);
  }

  setInfo(i: HudInfo) {
    this.zoneT.setText(i.zone);
    this.timeT.setText(fmtHour(i.hour));
    this.baitIcon.setTexture(i.baitIcon);
    this.baitT.setText(`Mồi: ${i.bait}  ·  ${i.hook}`);
    this.depthT.setText(`Độ sâu mồi: ${i.depth}${this.touch ? '' : '   (cuộn chuột / [ ])'}`);
    this.windT.setText(`${i.weather ?? ''} · Gió ${['lặng', 'nhẹ', 'vừa', 'mạnh'][Math.min(3, Math.round(Math.abs(i.wind)))]} ${i.wind > 0.2 ? '→' : i.wind < -0.2 ? '←' : ''}`);
    this.moneyT.setText(`Cá đã bắt: ${i.caught}`);
    this.lvlT.setText(`Nặng nhất: ${i.best}`);
  }

  setQuests(lines: string[]) {
    this.questT.setText(lines.join('\n'));
  }

  hint(s: string, top: boolean | number = false) {
    if (this.touch) s = '';
    this.hintT.setText(s);
    const w = Math.max(200, this.hintT.width + 50);
    this.hintBg.setVisible(!!s);
    this.hintBg.setBoxSize(w, 56);
    this.hintT.setVisible(!!s);
    if (top) {
      const y = typeof top === 'number' ? top : 372;
      this.hintBg.setPosition(960 - w / 2, y);
      this.hintT.setPosition(960 - w / 2 + 22, y - 28);
    } else {
      this.hintBg.setPosition(30, 1036);
      this.hintT.setPosition(52, 1008);
    }
  }

  showCast(power: number | null, over = 0) {
    this.castC.setVisible(power !== null);
    if (power !== null) this.castBar.set(power, over > 0.3 ? 0xff8a5a : undefined);
  }

  /** bright marker on the power bar = power needed to reach the aimed point */
  castSweet(p: number) {
    this.sweetRect.setX(520 * p);
  }

  /** legacy fight panel — replaced by FightHud (Fish Fight System) */
  showFight(_f: null) {
    this.fightC.setVisible(false);
  }

  prompt(s: string | null) {
    this.promptC.setVisible(!!s);
    if (s) {
      this.promptT.setText(s);
      this.promptC.setScale(1 + Math.sin(this.scene.time.now / 120) * 0.03);
    }
  }

  toast(msg: string, color: string = COL.text, life = 2600) {
    const s = this.scene;
    const y = 250 + this.toasts.length * 70;
    const c = s.add.container(960, y).setScrollFactor(0).setDepth(900);
    const t = txt(s, 0, 0, msg, 25, color, 700, { align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5);
    const bg = new Box(s, 0, 0, Math.min(1000, t.width + 80), t.height + 30, 'ui_toast');
    c.add([bg, t]).setAlpha(0);
    this.toasts.push(c);
    s.tweens.add({ targets: c, alpha: 1, duration: 200 });
    s.tweens.add({
      targets: c, alpha: 0, delay: life, duration: 400,
      onComplete: () => {
        this.toasts = this.toasts.filter((x) => x !== c);
        c.destroy();
        this.toasts.forEach((x, i) => s.tweens.add({ targets: x, y: 250 + i * 70, duration: 150 }));
      },
    });
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
  }
}
