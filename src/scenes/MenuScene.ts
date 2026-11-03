import Phaser from 'phaser';
import { Button, COL, txt } from '../game/ui';
import { sfx } from '../game/sfx';
import { SaveStore } from '../core/profile';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }
  create() {
    const bg = this.add.image(960, 540, 'menu_bg');
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
    this.tweens.add({ targets: bg, scale: bg.scale * 1.04, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.rectangle(0, 0, 1920, 1080, 0x061418, 0.35).setOrigin(0);
    const logo = this.add.image(960, 330, 'logo').setScale(0.62);
    this.tweens.add({ targets: logo, y: 318, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    txt(this, 960, 640, 'FISHING WORLD ONLINE', 84, COL.text, 800).setOrigin(0.5).setStroke('#0b2a30', 10);
    txt(this, 960, 720, 'Phase 1 — Câu cá góc nhìn thứ nhất · Bờ cỏ · Rô phi · Cá trê · Cá lóc', 26, '#cfe7e0', 600).setOrigin(0.5);
    const p = SaveStore.load();
    const start = () => {
      sfx.unlock();
      this.scene.start('fishing');
    };
    new Button(this, 960, 830, p.stats.casts ? 'TIẾP TỤC CÂU' : 'BẮT ĐẦU CÂU', start, { w: 420, h: 86, size: 32, color: 0x2b8a6e });
    if (p.stats.catches) txt(this, 960, 900, `Đã bắt ${p.stats.catches} con cá · tổng ${p.stats.totalWeight.toFixed(2).replace('.', ',')} kg`, 22, COL.dim, 600).setOrigin(0.5);
    txt(this, 960, 1040, 'Chuột trái: ném / đóng cá / thu dây · Chuột phải: nhả dây · A/D: hướng cần · Space: đóng / vớt · H: hướng dẫn', 20, COL.dim, 600).setOrigin(0.5);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.keyboard?.once('keydown-SPACE', start);
  }
}
