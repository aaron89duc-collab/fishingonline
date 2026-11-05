import Phaser from 'phaser';
import { Button, COL, txt } from '../game/ui';
import { sfx } from '../game/sfx';
import { SaveStore } from '../core/profile';
import { DIFFICULTY, type Difficulty } from '../core/fishFight';

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
    txt(this, 960, 720, 'Phase 1 — Bờ cỏ · Rô phi · Cá trê · Cá lóc · Cá chép · Trắm cỏ', 26, '#cfe7e0', 600).setOrigin(0.5);
    const p = SaveStore.load();
    const start = () => {
      sfx.unlock();
      this.scene.start('fishing');
    };
    new Button(this, 960, 830, p.stats.casts ? 'TIẾP TỤC CÂU' : 'BẮT ĐẦU CÂU', start, { w: 420, h: 86, size: 32, color: 0x2b8a6e });
    // difficulty
    const diffT = txt(this, 960, 990, '', 20, '#cfe7e0', 600).setOrigin(0.5);
    const btns: Button[] = [];
    const draw = () => {
      const cur = p.settings.difficulty ?? 'normal';
      (['easy', 'normal', 'hard'] as Difficulty[]).forEach((d, i) => btns[i]?.destroy());
      btns.length = 0;
      (['easy', 'normal', 'hard'] as Difficulty[]).forEach((d, i) => {
        btns.push(new Button(this, 700 + i * 260, 940, ['DỄ', 'THƯỜNG', 'KHÓ'][i], () => { p.settings.difficulty = d; SaveStore.save(p); draw(); }, { w: 230, h: 56, size: 22, color: cur === d ? 0x2b8a6e : 0x41545a }));
      });
      diffT.setText('Độ khó: ' + DIFFICULTY[cur].label);
    };
    draw();
    if (p.stats.catches) txt(this, 960, 890, `Đã bắt ${p.stats.catches} con cá · tổng ${p.stats.totalWeight.toFixed(2).replace('.', ',')} kg`, 22, COL.dim, 600).setOrigin(0.5);
    txt(this, 960, 1040, 'Space giật cần · A/D ép cần ngang · W/S nâng/hạ cần · Q/E lực hãm · chuột trái thu dây · F vợt · L đồ câu · H hướng dẫn', 20, COL.dim, 600).setOrigin(0.5);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.keyboard?.once('keydown-SPACE', start);
  }
}
