import Phaser from 'phaser';
import { Button, COL, txt } from './ui';
import type { StrikeDir } from '../core/bite';

export interface TouchActions {
  primaryDown: () => void; primaryUp: () => void; retrieve: () => void;
  net: () => void; gear: () => void; bait: () => void; depth: (delta: number) => void;
  speed: (value: number) => void;
  interrupt: () => void;
}
type Hold = 'left' | 'right' | 'raise' | 'lower' | 'dragDown' | 'dragUp' | 'reel' | 'mend';
export type TouchMode = 'idle' | 'charging' | 'flight' | 'wait' | 'stuck' | 'fight' | 'landing' | 'result' | 'retrieve' | 'escaped';

/** Controls own their pointer IDs, so a second finger never moves the net/aim or
 * releases the first finger's cast. No synthesized keyboard events. */
export class TouchControls {
  readonly root: Phaser.GameObjects.Container;
  direction: StrikeDir = 'up';
  private owners = new Map<number, { hold?: Hold; primary?: boolean; button?: Button }>();
  private controlPointers = new Set<number>();
  private buttons = new Map<string, Button>();
  private groups: Record<string, Button[]> = { prep: [], fight: [], directions: [], pan: [] };
  private status: Phaser.GameObjects.Text;
  private previousMode: TouchMode = 'idle';
  private active = true;
  private hint: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene, private actions: TouchActions) {
    this.root = scene.add.container(0, 0).setDepth(780);
    this.status = txt(scene, 960, 810, '', 30, COL.text, 700, {
      align: 'center', backgroundColor: '#10242ee8', padding: { x: 18, y: 12 },
    }).setOrigin(0.5);
    this.hint = txt(scene, 960, 735, '', 28, COL.gold, 700, { align: 'center', wordWrap: { width: 760 } }).setOrigin(0.5);
    this.root.add([this.status, this.hint]);
    const primary = this.make('primary', 1700, 940, 'GIỮ ĐỂ NÉM', 330, 140);
    this.bindHold(primary, 'reel', true);
    const alt = this.make('alt', 1700, 780, 'THU DÂY CHÙNG', 330, 120);
    this.bindHold(alt, 'mend');
    this.make('retrieve', 1350, 940, 'THU CẦN', 250, 130, actions.retrieve);
    this.make('net', 1700, 280, 'ĐƯA VỢT', 300, 120, actions.net);
    this.groups.prep.push(this.make('gear', 1700, 280, 'ĐỒ CÂU', 300, 120, actions.gear));
    this.groups.prep.push(this.make('bait', 1700, 440, 'ĐỔI MỒI', 300, 120, actions.bait));
    this.groups.prep.push(this.make('depthDown', 1510, 600, 'NÔNG −', 180, 120, () => actions.depth(-0.25)));
    this.groups.prep.push(this.make('depthUp', 1790, 600, 'SÂU +', 180, 120, () => actions.depth(0.25)));
    const holds: Array<[string, number, number, string, Hold]> = [
      ['left', 110, 930, 'ÉP TRÁI', 'left'], ['right', 330, 930, 'ÉP PHẢI', 'right'],
      ['raise', 220, 640, 'NÂNG CẦN', 'raise'], ['lower', 220, 785, 'HẠ CẦN', 'lower'],
      ['dragDown', 1510, 600, 'HÃM −', 'dragDown'], ['dragUp', 1790, 600, 'HÃM +', 'dragUp'],
    ];
    for (const [id, x, y, label, hold] of holds) {
      const b = this.make(id, x, y, label, 190, 120);
      this.bindHold(b, hold); this.groups.fight.push(b);
    }
    for (let i = 1; i <= 3; i++) this.groups.fight.push(this.make(`speed${i}`, 1500 + (i-1)*160, 440,
      `TỐC ${i}`, 150, 110, () => actions.speed(i)));
    (['left', 'up', 'right'] as StrikeDir[]).forEach((dir, i) => {
      const b = this.make(`strike${dir}`, 110 + i*200, 930,
        ['GIẬT TRÁI', 'GIẬT LÊN', 'GIẬT PHẢI'][i], 185, 120, () => { this.direction = dir; });
      this.groups.directions.push(b);
    });
    for (const [id, x, label, hold] of [['panLeft', 110, 'NHÌN TRÁI', 'left'], ['panRight', 330, 'NHÌN PHẢI', 'right']] as const) {
      const b = this.make(id, x, 930, label, 190, 120);
      this.bindHold(b, hold); this.groups.pan.push(b);
    }
    const release = (p: Phaser.Input.Pointer) => this.release(p.id);
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    const move = (p: Phaser.Input.Pointer) => {
      const owner = this.owners.get(p.id);
      if (owner?.button && !owner.button.getBounds().contains(p.x, p.y)) this.release(p.id);
    };
    scene.input.on('pointermove', move);
    const cancel = () => { this.cancel(); actions.interrupt(); };
    window.addEventListener('blur', cancel);
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', visibility);
    const canvas = scene.game.canvas;
    canvas.addEventListener('touchcancel', cancel);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cancel();
      scene.input.off('pointerup', release); scene.input.off('pointerupoutside', release);
      scene.input.off('pointermove', move);
      window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('touchcancel', cancel);
    });
  }
  private make(id: string, x: number, y: number, label: string, w: number, h: number, action?: () => void) {
    const b = new Button(this.scene, x, y, label, () => { if (this.active) action?.(); }, { w, h, size: 28 });
    b.setName('touch-' + id);
    b.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.active) return;
      this.controlPointers.add(p.id);
      if (!this.owners.has(p.id)) this.owners.set(p.id, {});
    });
    this.root.add(b); this.buttons.set(id, b);
    return b;
  }
  private bindHold(b: Button, hold: Hold, primary = false) {
    b.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.active) return;
      this.owners.set(p.id, { hold, primary, button: b });
      if (primary) this.actions.primaryDown();
    });
    // Scene-level movement checks this pointer's bounds. Phaser pointerout can
    // also fire when another finger changes the topmost interactive object.
  }
  private release(id: number) {
    const owner = this.owners.get(id);
    this.owners.delete(id);
    if (owner?.primary) this.actions.primaryUp();
  }
  owns(id: number) { return this.controlPointers.has(id); }
  startWaterPointer(id: number) { this.release(id); this.controlPointers.delete(id); }
  held(hold: Hold) { return this.active && [...this.owners.values()].some(o => o.hold === hold); }
  cancel() {
    // Do not fire primaryUp: interruption cancels rather than casts/hooks.
    this.owners.clear();
  }
  update(mode: TouchMode, modal: boolean, netOut: boolean, summary: string, bait: string, depth: number, speed: number) {
    if (mode !== this.previousMode && !(this.previousMode === 'idle' && mode === 'charging')) this.cancel();
    this.previousMode = mode;
    this.active = !modal;
    if (modal) this.cancel();
    const playable = ['idle', 'charging', 'wait', 'stuck', 'fight'].includes(mode) && !modal;
    this.root.setVisible(playable);
    if (!playable) return;
    const fight = mode === 'fight', prep = mode === 'idle' || mode === 'wait';
    const visible = (id: string, on: boolean) => this.buttons.get(id)!.setVisible(on);
    this.groups.prep.forEach(b => b.setVisible(prep));
    this.groups.fight.forEach(b => b.setVisible(fight && (!netOut || ['touch-left', 'touch-right', 'touch-raise', 'touch-lower'].includes(b.name))));
    this.groups.directions.forEach(b => b.setVisible(mode === 'wait'));
    this.groups.pan.forEach(b => b.setVisible(mode === 'idle' || mode === 'charging'));
    visible('net', fight);
    visible('retrieve', mode === 'wait' || mode === 'stuck' || mode === 'charging');
    visible('alt', mode === 'wait' || fight && !netOut);
    this.buttons.get('net')!.setText(netOut ? 'CẤT VỢT' : 'ĐƯA VỢT');
    this.buttons.get('primary')!.setText(mode === 'wait' ? 'GIỮ / THẢ GIẬT' : fight ? netOut ? 'NHẤC VỢT' : 'GIỮ THU DÂY' : mode === 'stuck' ? 'THU CẦN' : 'GIỮ ĐỂ NÉM');
    this.buttons.get('alt')!.setText(fight ? 'NỚI HÃM / NHẢ' : 'THU DÂY CHÙNG');
    this.buttons.get('bait')!.setText('MỒI: ' + bait.toLocaleUpperCase('vi'));
    this.buttons.get('bait')!.setDisabled(mode !== 'idle');
    this.buttons.get('gear')!.setDisabled(mode !== 'idle');
    this.status.setVisible(!netOut).setText(fight ? summary : `Mồi ${bait} · độ sâu ${depth.toFixed(2)} m`);
    this.hint.setVisible(!netOut).setText(mode === 'wait' ? `Hướng giật: ${this.direction === 'up' ? 'LÊN' : this.direction === 'left' ? 'TRÁI' : 'PHẢI'} · giữ lâu để giật mạnh`
      : fight ? 'Nâng cần kéo cá · hạ cần và thu dây' : 'Chạm nước để ngắm · giữ nút NÉM rồi thả');
    for (let i = 1; i <= 3; i++) this.buttons.get(`speed${i}`)!.bg.setFill(speed === i ? 0x2b8a6e : 0x12303a);
    this.groups.directions.forEach((b, i) => b.bg.setFill(['left','up','right'][i] === this.direction ? 0x2b8a6e : 0x12303a));
  }
}
