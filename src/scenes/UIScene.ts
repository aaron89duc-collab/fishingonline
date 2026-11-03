import Phaser from 'phaser';

/**
 * Screen-space scene drawn above the world: HUD, rig, fishing line, panels, debug.
 * It owns all input so UI hit-testing is never affected by the world camera scroll.
 */
export class UIScene extends Phaser.Scene {
  line!: Phaser.GameObjects.Graphics;
  debugT!: Phaser.GameObjects.Text;
  constructor() {
    super('ui');
  }
  create() {
    this.input.mouse?.disableContextMenu();
    this.line = this.add.graphics().setDepth(490);
    this.debugT = this.add.text(470, 20, '', { fontFamily: 'monospace', fontSize: '16px', color: '#bff', backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 8, y: 6 } })
      .setDepth(2000).setVisible(false);
  }
}
