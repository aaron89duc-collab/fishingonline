import Phaser from 'phaser';
import { COL, panel, txt } from './ui';
import { BEHAVIOR_LABEL, type FishFightState, type DifficultyProfile } from '../core/fishFight';

/**
 * HUD for the Fish Fight System: Angler Balance, Line Tension + drag point, Fish Stamina, Hook Strength,
 * Rod Angle gauge, Drag / Reel speed, behaviour tell, Landing Window. Drawn with Graphics (Canvas-friendly).
 */
export class FightHud {
  private c: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private fishT: Phaser.GameObjects.Text;
  private tellT: Phaser.GameObjects.Text;
  private balT: Phaser.GameObjects.Text;
  private balPct: Phaser.GameObjects.Text;
  private tenT: Phaser.GameObjects.Text;
  private dragT: Phaser.GameObjects.Text;
  private reelT: Phaser.GameObjects.Text;
  private angT: Phaser.GameObjects.Text;
  private warnT: Phaser.GameObjects.Text;
  private landC: Phaser.GameObjects.Container;
  private landG: Phaser.GameObjects.Graphics;
  private landT: Phaser.GameObjects.Text;
  private promptT: Phaser.GameObjects.Text;
  private X = 40;
  private Y = 760;
  private W = 1140;

  constructor(private scene: Phaser.Scene) {
    const s = scene;
    const X = this.X, Y = this.Y, W = this.W;
    this.c = s.add.container(0, 0).setDepth(720).setVisible(false);
    const bg = panel(s, X, Y, W, 300, 'ui_panel_info', 0.86);
    this.g = s.add.graphics();
    this.fishT = txt(s, X + 30, Y + 14, '', 22, COL.text, 800);
    this.tellT = txt(s, X + W / 2, Y - 34, '', 26, COL.gold, 800).setOrigin(0.5);
    const lb = txt(s, X + 30, Y + 54, 'THĂNG BẰNG  (A / D)', 18, COL.dim, 800);
    this.balT = txt(s, X + 300, Y + 54, '', 18, COL.text, 700);
    this.balPct = txt(s, X + W - 30, Y + 54, '', 20, COL.text, 800).setOrigin(1, 0);
    const lt = txt(s, X + 30, Y + 124, 'LỰC CĂNG DÂY', 18, COL.dim, 800);
    this.tenT = txt(s, X + W - 30, Y + 146, '', 30, COL.text, 800).setOrigin(1, 0.5);
    this.dragT = txt(s, X + 30, Y + 192, '', 20, COL.text, 700);
    this.reelT = txt(s, X + 30, Y + 230, '', 20, COL.text, 700);
    const l1 = txt(s, X + 600, Y + 204, 'Sức cá', 18, COL.dim, 700);
    const l2 = txt(s, X + 860, Y + 204, 'Độ chắc lưỡi', 18, COL.dim, 700);
    this.angT = txt(s, X + W + 52, Y + 270, 'Góc cần\n(W / S)', 16, COL.dim, 700, { align: 'center' }).setOrigin(0.5, 0);
    this.warnT = txt(s, X + W / 2, Y - 84, '', 30, '#ff5a3c', 800).setOrigin(0.5).setStroke('#0b1d22', 6);
    this.c.add([bg, this.g, this.fishT, this.tellT, lb, this.balT, this.balPct, lt, this.tenT, this.dragT, this.reelT, this.angT, this.warnT, l1, l2]);
    // landing window
    this.landC = s.add.container(960, 190).setDepth(720).setVisible(false);
    this.landG = s.add.graphics();
    this.landT = txt(s, 0, 52, '', 22, COL.text, 700, { align: 'center' }).setOrigin(0.5, 0);
    const lh = txt(s, 0, -58, 'CỬA SỔ VỚT CÁ', 20, COL.gold, 800).setOrigin(0.5);
    this.landC.add([this.landG, this.landT, lh]);
    this.promptT = txt(s, 960, 640, '', 40, COL.gold, 800).setOrigin(0.5).setDepth(720).setStroke('#0b1d22', 8);
  }

  hide() {
    this.c.setVisible(false);
    this.landC.setVisible(false);
    this.promptT.setText('');
  }

  update(s: FishFightState, fishName: string, profileName: string, diff: DifficultyProfile, slipAt: number, netPossible: boolean) {
    this.c.setVisible(true);
    const g = this.g;
    const X = this.X + 30, Y = this.Y, W = this.W - 60;
    g.clear();
    this.fishT.setText(`${fishName}  ·  ${profileName}  ·  ${BEHAVIOR_LABEL[s.behavior]}`);
    this.tellT.setText(diff.guides ? s.tell : '');

    // ---- Angler Balance: centre = stable, ends = falling
    const by = Y + 92, bh = 24;
    const zoneW = (diff.balanceZone / 100) * (W / 2);
    g.fillStyle(0x0b1a20, 0.95).fillRoundedRect(X, by - bh / 2, W, bh, 10);
    g.fillStyle(0xff5a3c, 0.55).fillRoundedRect(X, by - bh / 2, W * 0.08, bh, { tl: 10, bl: 10, tr: 0, br: 0 });
    g.fillStyle(0xff5a3c, 0.55).fillRoundedRect(X + W * 0.92, by - bh / 2, W * 0.08, bh, { tl: 0, bl: 0, tr: 10, br: 10 });
    g.fillStyle(0xf2c94c, 0.28).fillRect(X + W * 0.08, by - bh / 2, W / 2 - zoneW - W * 0.08, bh).fillRect(X + W / 2 + zoneW, by - bh / 2, W / 2 - zoneW - W * 0.08, bh);
    g.fillStyle(0x45c97a, 0.45).fillRect(X + W / 2 - zoneW, by - bh / 2, zoneW * 2, bh);
    g.lineStyle(2, 0xffffff, 0.6).lineBetween(X + W / 2, by - bh / 2 - 4, X + W / 2, by + bh / 2 + 4);
    const bx = X + W / 2 + (s.balance / 100) * (W / 2);
    const off = Math.abs(s.balance);
    const bcol = off <= diff.balanceZone ? 0x45c97a : off < 85 ? 0xf2c94c : 0xff5a3c;
    g.fillStyle(bcol, 1).fillTriangle(bx - 12, by - bh / 2 - 14, bx + 12, by - bh / 2 - 14, bx, by - bh / 2 + 2);
    g.fillStyle(0xffffff, 1).fillRect(bx - 2, by - bh / 2, 4, bh);
    const pct = Math.round(100 - off);
    this.balPct.setText(`${pct}%`).setColor(bcol === 0x45c97a ? '#7ef0a8' : bcol === 0xf2c94c ? '#f2d77a' : '#ff9a85');
    this.balT.setText(off <= diff.balanceZone ? 'Ổn định' : s.balance > 0 ? 'Lệch PHẢI — chống sang trái (A)' : 'Lệch TRÁI — chống sang phải (D)');

    // ---- Line tension with the drag slip point
    const ty = Y + 160, th = 28, tw = W - 90;
    const t = Math.min(100, s.lineTension);
    g.fillStyle(0x0b1a20, 0.95).fillRoundedRect(X, ty - th / 2, tw, th, 10);
    g.fillStyle(0x45c97a, 0.25).fillRect(X, ty - th / 2, tw * 0.6, th);
    g.fillStyle(0xf2c94c, 0.25).fillRect(X + tw * 0.6, ty - th / 2, tw * 0.3, th);
    g.fillStyle(0xff5a3c, 0.3).fillRect(X + tw * 0.9, ty - th / 2, tw * 0.1, th);
    const tcol = t < 60 ? 0x45c97a : t < 90 ? 0xf2c94c : 0xff5a3c;
    g.fillStyle(tcol, 1).fillRoundedRect(X, ty - th / 2 + 4, Math.max(8, tw * (t / 100)), th - 8, 8);
    const sx = X + tw * Math.min(1, slipAt / 100);
    g.lineStyle(4, 0xffffff, 0.9).lineBetween(sx, ty - th / 2 - 8, sx, ty + th / 2 + 8);
    this.tenT.setText(String(Math.round(t))).setColor(t < 60 ? '#7ef0a8' : t < 90 ? '#f2d77a' : '#ff9a85');

    // ---- bottom row: drag, reel gear, stamina, hook strength
    this.dragT.setText(`Lực hãm ${Math.round(s.drag * 100)}%  (Q / E)${s.slipping ? '  · đang xả dây' : ''}`).setColor(s.slipping ? '#f2d77a' : COL.text);
    this.reelT.setText(`Tốc thu ${s.reelGear}  (1 / 2 / 3)${s.reeling ? '  · đang thu' : ''}`);
    const small = (x: number, v: number, col: number) => {
      const y = Y + 248;
      g.fillStyle(0x0b1a20, 0.95).fillRoundedRect(x, y - 8, 230, 16, 8);
      g.fillStyle(col, 1).fillRoundedRect(x, y - 8, Math.max(6, 230 * (v / 100)), 16, 8);
    };
    small(this.X + 600, s.fishStamina, 0x45c97a);
    small(this.X + 860, s.hookStrength, s.hookStrength > 35 ? 0x3fa7ff : 0xff8a5a);

    // ---- rod angle gauge (vertical), ideal band shown when guides are on
    const gx = this.X + this.W + 40, gy0 = Y + 10, gh = 250;
    g.fillStyle(0x0b1a20, 0.9).fillRoundedRect(gx, gy0, 26, gh, 10);
    if (diff.guides) {
      const [lo, hi] = s.idealAngle;
      g.fillStyle(0x45c97a, 0.5).fillRect(gx, gy0 + gh * (1 - hi), 26, gh * (hi - lo));
    }
    const ay = gy0 + gh * (1 - s.rodAngle);
    const inBand = s.rodAngle >= s.idealAngle[0] && s.rodAngle <= s.idealAngle[1];
    g.fillStyle(inBand ? 0xffffff : 0xffb27a, 1).fillTriangle(gx - 14, ay - 9, gx - 14, ay + 9, gx, ay);
    g.fillRect(gx, ay - 2, 26, 4);
    void this.angT;

    // ---- warnings
    const warn = s.lineTension > 90 ? 'DÂY SẮP ĐỨT — NỚI LỰC HÃM (Q), NGỪNG THU!'
      : off > 85 ? 'SẮP MẤT THĂNG BẰNG!'
      : s.hookStrength < 25 ? 'Lưỡi sắp tuột — giữ dây vừa căng'
      : s.lineTension < 8 && s.phase !== 'landing' ? 'Dây chùng — thu dây!' : '';
    this.warnT.setText(warn).setAlpha(warn ? 0.6 + 0.4 * Math.sin(this.scene.time.now / 90) : 0);

    // ---- landing
    const L = s.landing;
    const landing = s.phase === 'landing';
    this.landC.setVisible(landing);
    this.promptT.setText(!landing && netPossible ? 'F — ĐƯA VỢT RA' : '');
    if (landing) {
      const lg = this.landG;
      lg.clear();
      const segs: Array<[string, string, number]> = [['lunge', 'Cá lao mạnh', 0xff5a3c], ['turn', 'Cá quay đầu', 0xf2c94c], ['tired', 'Cá mệt', 0x45c97a]];
      segs.forEach(([k, label, col], i) => {
        const x = -330 + i * 225;
        const on = L.window === k;
        lg.fillStyle(col, on ? 1 : 0.22).fillRoundedRect(x, -26, 210, 52, 14);
        if (on) lg.lineStyle(4, 0xffffff, 1).strokeRoundedRect(x, -26, 210, 52, 14);
        const key = `seg${i}`;
        let tt = this.landC.getByName(key) as Phaser.GameObjects.Text | null;
        if (!tt) {
          tt = txt(this.scene, x + 105, 0, label, 20, '#0b1d22', 800).setOrigin(0.5).setName(key);
          this.landC.add(tt);
        }
      });
      lg.fillStyle(0xffffff, 0.9).fillRect(-330, 30, 660 * L.ready, 6);
      this.landT.setText(L.reason || (L.window === 'lunge' ? 'Chờ… cá đang lao' : L.ready > 0.5 ? 'VỚT NGAY! (Click / Space)' : 'Giữ vợt dưới cá…'));
    }
  }
}
