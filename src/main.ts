import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { FishingScene } from './scenes/FishingScene';
import { UIScene } from './scenes/UIScene';

// The game uses WebGL-only features (nine-slice panels, blend modes). If WebGL is off, explain how to enable it.
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
if (!hasWebGL()) {
  const b = document.getElementById('boot');
  if (b) b.innerHTML = 'Trình duyệt đang tắt WebGL.<br>Chrome: Cài đặt → Hệ thống → bật “Sử dụng tính năng tăng tốc đồ họa”, rồi mở lại trang.';
}

// P1-007: fixed 1920×1080 design resolution, scaled to fit any screen (letterboxed)
const game = hasWebGL() ? new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#0b1d22',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, FishingScene, UIScene],
}) : undefined;

declare global {
  interface Window { __fwo?: Phaser.Game }
}
window.__fwo = game ?? undefined;
