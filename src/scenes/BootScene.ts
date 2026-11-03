import Phaser from 'phaser';
import { createAnims, preloadAll } from '../game/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }
  preload() {
    const w = 1920, h = 1080;
    this.cameras.main.setBackgroundColor('#0b1d22');
    const bar = this.add.rectangle(w / 2 - 400, h / 2 + 40, 0, 18, 0x2ec4b6).setOrigin(0, 0.5);
    this.add.rectangle(w / 2, h / 2 + 40, 804, 22).setStrokeStyle(2, 0x2ec4b6, 0.6);
    const t = this.add.text(w / 2, h / 2 - 20, 'Đang tải hồ câu… 0%', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#cfe7ea' }).setOrigin(0.5);
    this.load.on('progress', (p: number) => {
      bar.width = 800 * p;
      t.setText(`Đang tải hồ câu… ${Math.round(p * 100)}%`);
    });
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('Không tải được', f.key, f.src));
    preloadAll(this.load);
  }
  async create() {
    createAnims(this.anims);
    try {
      await Promise.race([document.fonts.load("700 24px 'Be Vietnam Pro'"), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      /* font optional */
    }
    document.getElementById('boot')?.remove();
    this.scene.start('menu');
  }
}
