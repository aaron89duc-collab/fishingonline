import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { FishingScene } from './scenes/FishingScene';
import { UIScene } from './scenes/UIScene';
import { installFullscreenControls } from './game/fullscreen';

// P1-007: fixed 1920×1080 design resolution, scaled to fit any screen (letterboxed)
// Canvas 2D renderer: no WebGL needed (works with hardware acceleration off, older GPUs, remote desktops)
const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#0b1d22',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, FishingScene, UIScene],
});

declare global {
  interface Window { __fwo?: Phaser.Game }
}
window.__fwo = game;
installFullscreenControls(() => game.scale.refresh());
