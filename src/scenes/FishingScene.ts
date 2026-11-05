import Phaser from 'phaser';
import { LocalAuthority, type CastResult } from '../core/authority';
import { ESCAPE_TEXT, BEHAVIOR_LABEL, type FightControls, type FishFightState } from '../core/fishFight';
import { BAIT_BY_ID, RARITY_LABEL, type BaitId } from '../core/data';
import { clamp, approach, Rng } from '../core/rng';
import { MOUTH, MOUTH_TEXT, type FloatPose, type StrikeDir } from '../core/bite';
import type { CatchRecord } from '../core/profile';
import { FightHud } from '../game/FightHud';
import { Lake } from '../game/Lake';
import { RodRig } from '../game/RodRig';
import { FloatView } from '../game/FloatView';
import { Hud } from '../game/Hud';
import { helpPanel, loadoutPanel, resultCard } from '../game/panels';
import { fishArtKey, shadowKey } from '../game/assets';
import { COL, fmtKg } from '../game/ui';
import { sfx } from '../game/sfx';
import type { UIScene } from './UIScene';
import { Weather, type WeatherKind } from '../core/weather';
import { WeatherView } from '../game/WeatherView';
import { TouchControls } from '../game/TouchControls';

type Mode = 'idle' | 'charging' | 'flight' | 'wait' | 'stuck' | 'fight' | 'landing' | 'result' | 'retrieve' | 'escaped';

/** QA only: ?speed=4 runs gameplay time faster (used by automated tests) */
const QA_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1));
const IDLE_POSE: FloatPose = { sink: 0, tilt: 0, dx: 0, tremor: 0 };

export class FishingScene extends Phaser.Scene {
  auth!: LocalAuthority;
  ui!: UIScene;
  hud!: Hud;
  rig!: RodRig;
  lake!: Lake;
  float!: FloatView;
  hangFloat!: Phaser.GameObjects.Image;
  private nightShade!: Phaser.GameObjects.Rectangle;
  private mode: Mode = 'idle';
  private vanishX = 1440;
  private aim = { x: 1440, y: 640, sx: 960, sy: 640 };
  private aimRing!: Phaser.GameObjects.Image;
  private aimDot!: Phaser.GameObjects.Image;
  private trajDots: Phaser.GameObjects.Image[] = [];
  private power = 0;
  private over = 0;
  private flight = { t: 0, dur: 1, sx: 0, sy: 0, ex: 0, ey: 0, peak: 200, s0: 0.3, s1: 0.3, res: null as CastResult | null };
  private hour = 6.5;
  private wind = 0.6;
  private windTarget = 0.6;
  private windT = 20;
  private fightState: FishFightState | null = null;
  private fightHud!: FightHud;
  private strike: { t0: number; dir: StrikeDir } | null = null;
  private reelGear = 2;
  private netOut = false;
  private scoopReq = false;
  private lastBehavior = '';
  private camTilt = 0;
  private input2: { reel: boolean; release: boolean; left: boolean; right: boolean; touchReel: boolean; touchRelease: boolean } = { reel: false, release: false, left: false, right: false, touchReel: false, touchRelease: false };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private shadows = new Map<number, Phaser.GameObjects.Image>();
  private wake!: Phaser.GameObjects.Sprite;
  private modal: Phaser.GameObjects.Container | null = null;
  private hintedNibble = false;
  private alert = false;
  private ambT = 1;
  private rng = new Rng();
  private fightCamX = 0;
  private wasRed = false;
  weather!: Weather;
  private weatherView!: WeatherView;
  private forecastShown = '';
  private lastFightMessage = '';
  private lastFightMessageAt = 0;
  private surfaceFish!: Phaser.GameObjects.Image;
  private netGuide!: Phaser.GameObjects.Graphics;
  private touchControls?: TouchControls;
  private waterPointer: number | null = null;

  constructor() {
    super('fishing');
  }

  create() {
    this.touchControls = undefined;
    this.waterPointer = null;
    this.hud = undefined!;
    this.modal = null;
    this.auth = new LocalAuthority();
    const zone = 'bo_co';
    this.auth.enterZone(zone, this.vanishX);
    this.lake = new Lake(this, this.auth.zone, this.auth.persp);
    const requested = new URLSearchParams(location.search).get('weather');
    const initial: WeatherKind = requested === 'rain' || requested === 'cloudy' ? requested : 'sunny';
    this.weather = new Weather(new Rng(), initial);
    this.weatherView = new WeatherView(this, this.auth.persp.H);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.lake.worldWidth, 1080);
    cam.scrollX = (this.lake.worldWidth - 1920) / 2;
    this.fightCamX = cam.scrollX;

    this.float = new FloatView(this, this.floatKey());
    this.aimRing = this.add.image(0, 0, 'target_ring').setDepth(25).setAlpha(0);
    this.aimDot = this.add.image(0, 0, 'traj_dot').setDepth(25).setAlpha(0).setTint(0xffd36b);
    this.wake = this.add.sprite(0, 0, 'line_wake_00').setDepth(29).setVisible(false).setAlpha(0.8);
    this.surfaceFish = this.add.image(0, 0, 'fish_ro_phi').setDepth(30).setVisible(false);

    // screen-space scene for HUD / rig / input
    this.scene.launch('ui');
    this.ui = this.scene.get('ui') as UIScene;
    this.ui.events.once(Phaser.Scenes.Events.CREATE, () => this.setupUi());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('ui'));
    this.netOut = false;
    this.strike = null;
    this.fightState = null;
    this.shadows.clear();
    this.trajDots = [];
    this.input2 = { reel: false, release: false, left: false, right: false, touchReel: false, touchRelease: false };
    this.mode = 'idle';
    this.forecastShown = '';
  }

  private setupUi() {
    const u = this.ui;
    const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
    this.rig = new RodRig(u);
    this.netGuide = u.add.graphics().setDepth(515);
    // darkens world + hands + line at night, but stays under the HUD (depth 700)
    this.nightShade = u.add.rectangle(0, 0, 1920, 1080, 0x0a1838, 0).setOrigin(0).setDepth(600);
    this.rig.shake = this.auth.profile.settings.shake;
    this.hangFloat = u.add.image(0, 0, this.floatKey()).setOrigin(0.5, 0).setScale(0.42).setDepth(495);
    for (let i = 0; i < 10; i++) this.trajDots.push(u.add.image(0, 0, 'traj_dot').setDepth(480).setAlpha(0));
    this.hud = new Hud(u, { help: () => this.openHelp(), menu: () => this.toMenu() }, touch);
    this.fightHud = new FightHud(u, touch);
    if (touch) this.touchControls = new TouchControls(u, {
      primaryDown: () => { sfx.unlock(); if (!this.modal) this.onPrimaryDown(true); },
      primaryUp: () => { if (!this.modal) this.onPrimaryUp(); },
      retrieve: () => {
        if (this.mode === 'charging') { this.mode = 'idle'; this.power = 0; }
        else this.retrieve();
      },
      net: () => this.toggleNet(), gear: () => this.openLoadout(),
      bait: () => {
        const baits = Object.keys(BAIT_BY_ID) as BaitId[];
        this.switchBait(baits[(baits.indexOf(this.auth.profile.bait) + 1) % baits.length]);
      },
      depth: delta => this.changeDepth(delta), speed: value => this.setGear(value),
      interrupt: () => {
        this.waterPointer = null; this.strike = null;
        this.input2.left = false; this.input2.right = false;
        if (this.mode === 'charging') { this.mode = 'idle'; this.power = 0; }
      },
    });

    const inp = u.input;
    inp.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      sfx.unlock();
      if (over.length || this.modal) return;
      if (this.touchControls) {
        this.touchControls.startWaterPointer(p.id);
        if (this.waterPointer !== null) return;
        this.waterPointer = p.id;
        this.onMove(p.x, p.y);
        return; // Touching the lake aims/drags the net; dedicated buttons act.
      }
      if (p.rightButtonDown()) this.onSecondaryDown();
      else this.onPrimaryDown(false);
    });
    inp.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.touchControls) {
        if (this.touchControls.owns(p.id) || this.waterPointer !== p.id) return;
        this.waterPointer = null;
        return;
      }
      if (p.button === 2) this.input2.right = false;
      else this.onPrimaryUp();
    });
    inp.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.touchControls && (!p.isDown || this.touchControls.owns(p.id) || this.waterPointer !== p.id)) return;
      this.onMove(p.x, p.y);
    });
    inp.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.mode === 'fight') this.setGear(this.reelGear + (dy > 0 ? -1 : 1));
      else this.changeDepth(dy > 0 ? -0.25 : 0.25);
    });
    const kb = inp.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,Q,E,F,L,R,SPACE,LEFT,RIGHT,UP,DOWN,H,ONE,TWO,THREE,OPEN_BRACKET,CLOSED_BRACKET,ESC,F1') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', (e: KeyboardEvent) => { e.preventDefault(); sfx.unlock(); if (!this.modal && !e.repeat) this.onPrimaryDown(false, true); });
    kb.on('keyup-SPACE', () => this.onPrimaryUp());
    kb.on('keydown-R', () => !this.modal && this.retrieve());
    kb.on('keydown-H', () => (this.modal ? this.closeModal() : this.openHelp()));
    kb.on('keydown-ESC', () => (this.modal ? this.closeModal() : this.toMenu()));
    kb.on('keydown-F1', (e: KeyboardEvent) => { e.preventDefault(); this.auth.profile.settings.showDebug = !this.auth.profile.settings.showDebug; this.auth.save(); });
    kb.on('keydown-OPEN_BRACKET', () => this.changeDepth(-0.25));
    kb.on('keydown-CLOSED_BRACKET', () => this.changeDepth(0.25));
    kb.on('keydown-ONE', () => (this.mode === 'fight' ? this.setGear(1) : this.switchBait('giun')));
    kb.on('keydown-TWO', () => (this.mode === 'fight' ? this.setGear(2) : this.switchBait('tep')));
    kb.on('keydown-THREE', () => this.mode === 'fight' && this.setGear(3));
    kb.on('keydown-F', () => this.toggleNet());
    kb.on('keydown-L', () => (this.modal ? this.closeModal() : this.openLoadout()));
    u.events.on('ui-click', () => sfx.click());
    sfx.setVolume(this.auth.profile.settings.volume);
    this.hud.toast(touch ? 'Chạm mặt nước để ngắm · giữ nút NÉM rồi thả để câu.' : 'Chào mừng đến Bờ cỏ! Rê chuột chọn hướng, giữ chuột trái để ném.', COL.text, 4200);
  }

  private floatKey() {
    const s = this.auth.profile.settings;
    if (this.lake && this.lake.night > 0.6) return 'float_long_night_glow';
    return s.highContrastFloat ? 'float_long_contrast' : 'float_long_basic';
  }

  // ------------------------------------------------------------------ input
  private onMove(sx: number, sy: number) {
    const cam = this.cameras.main;
    this.aim.sx = sx;
    this.aim.sy = sy;
    this.aim.x = sx + cam.scrollX;
    this.aim.y = Math.max(this.auth.persp.H + 18, sy);
  }

  private onPrimaryDown(fromTouchBtn: boolean, fromSpace = false) {
    switch (this.mode) {
      case 'idle':
        this.mode = 'charging';
        this.power = 0;
        this.over = 0;
        break;
      case 'wait':
        // Hook Setting: direction from A/D held at the strike, strength from how long the strike is held
        if (this.strike) break;
        this.strike = { t0: this.time.now, dir: this.touchControls?.direction ?? (this.keys.A.isDown || this.keys.LEFT.isDown ? 'left' : this.keys.D.isDown || this.keys.RIGHT.isDown ? 'right' : 'up') };
        this.rig.impulse(this.strike.dir === 'up' ? 18 : 12);
        break;
      case 'stuck':
        this.retrieve();
        break;
      case 'fight':
        if (this.netOut) this.scoopReq = true;
        else if (!fromTouchBtn && !fromSpace) this.input2.left = true;
        break;
    }
  }

  private onPrimaryUp() {
    this.input2.left = false;
    if (this.mode === 'charging') this.release();
    if (this.strike && this.mode === 'wait') this.resolveStrike();
  }

  private onSecondaryDown() {
    if (this.mode === 'charging') {
      this.mode = 'idle';
      this.hud.showCast(null);
      return;
    }
    if (this.mode === 'fight') this.input2.right = true;
    else if (this.mode === 'wait') this.input2.right = true;
    else if (this.mode === 'stuck') this.retrieve();
  }

  private setGear(g: number) {
    this.reelGear = clamp(Math.round(g), 1, 3);
  }

  private toggleNet() {
    if (this.mode !== 'fight' || this.modal) return;
    const s = this.fightState;
    if (!this.netOut && s) {
      if (s.dist > 4.2) {
        this.hud.toast(`Cá còn cách ${s.dist.toFixed(1).replace('.', ',')} m — thu dây tới dưới 4 m rồi mới đưa vợt (F).`, '#ffb27a', 1800);
        return;
      }
      if (s.fishStamina > 40) {
        this.hud.toast(`Cá còn khỏe (sức ${Math.round(s.fishStamina)}%) — làm cá mệt dưới 40% rồi mới đưa vợt.`, '#ffb27a', 1800);
        return;
      }
    }
    this.netOut = !this.netOut;
    if (this.netOut) this.input2.left = false;
  }

  private changeDepth(delta: number) {
    if (this.mode === 'fight' || this.modal) return;
    this.auth.setDepth(this.auth.profile.depth + delta);
    const c = this.auth.cast;
    if (c && c.outcome === 'water') {
      c.onBottom = this.auth.profile.depth >= c.waterDepth - 0.05;
      this.auth.bite?.setContext({ baitDepth: Math.min(this.auth.profile.depth, c.waterDepth), onBottom: c.onBottom });
      this.float.lying = false;
      if (c.onBottom) this.hud.toast('Mồi chạm đáy — chú ý cả tín hiệu phao nổi.', COL.dim, 1800);
    }
  }

  private switchBait(b: BaitId) {
    if (this.modal) return;
    if (this.mode !== 'idle') { this.hud.toast('Thu cần (R) trước khi đổi mồi.', COL.dim, 1500); return; }
    this.auth.setBait(b);
    this.hud.toast(`Đã móc mồi ${BAIT_BY_ID[b].name}. ${BAIT_BY_ID[b].desc}`, COL.text, 2200);
  }

  // ------------------------------------------------------------------ cast
  private release() {
    const p = this.power;
    this.hud.showCast(null);
    if (p < 0.06) { this.mode = 'idle'; return; }
    const res = this.auth.requestCast({ targetX: this.aim.x, targetY: this.aim.y, power: p, overcharge: this.over });
    const cam = this.cameras.main;
    const tip = this.rig.tip;
    const d = res.d;
    this.flight = {
      t: 0, dur: 0.55 + p * 0.55, sx: tip.x + cam.scrollX, sy: tip.y, ex: res.x, ey: res.y, peak: 160 + p * 260,
      s0: 0.42, s1: this.floatScale(d), res,
    };
    this.mode = 'flight';
    this.rig.impulse(-58);
    sfx.whoosh();
    this.hangFloat.setVisible(false);
    this.aimRing.setAlpha(0);
    this.aimDot.setAlpha(0);
    this.float.setTexture(this.floatKey());
  }

  private floatScale(d: number) {
    return Math.max(0.2, 2.1 * this.auth.persp.scaleAt(d));
  }

  private landFloat() {
    const r = this.flight.res!;
    this.float.place(r.x, r.y, this.flight.s1);
    this.float.lying = false; // bottom contact unloads the float; it need not lie flat
    const sc = this.auth.persp.scaleAt(r.d);
    if (r.outcome !== 'bank') {
      this.playFx('splash_light', r.x, r.y + 4, sc * 1.6, 0.5, 0.85);
      this.playFx('ripple', r.x, r.y, sc * 3.2);
      sfx.plop();
    }
    if (r.outcome === 'water') {
      this.mode = 'wait';
      this.hintedNibble = false;
      const depthTxt = r.onBottom ? 'mồi nằm đáy' : `mồi ở ${this.auth.profile.depth.toFixed(2).replace('.', ',')} m`;
      this.hud.toast(`Phao cách bờ ${r.d.toFixed(1).replace('.', ',')} m · nước sâu ${r.waterDepth.toFixed(1).replace('.', ',')} m · ${depthTxt}`, COL.dim, 2200);
    } else {
      this.mode = 'stuck';
      this.hud.toast(r.reason ?? '', '#ffb27a', 3000);
      if (r.outcome === 'bank') this.float.lying = true;
    }
  }

  private retrieve() {
    if (this.mode !== 'wait' && this.mode !== 'stuck') return;
    this.mode = 'retrieve';
    const fx = this.float.c.x, fy = this.float.c.y;
    const cam = this.cameras.main;
    const tx = this.rig.tip.x + cam.scrollX, ty = 1000;
    const o = { t: 0 };
    this.auth.endCastCycle();
    this.tweens.add({
      targets: o, t: 1, duration: 700, ease: 'Sine.in',
      onUpdate: () => {
        const sc = Phaser.Math.Linear(this.float.scale, 0.5, o.t);
        this.float.c.setPosition(Phaser.Math.Linear(fx, tx, o.t), Phaser.Math.Linear(fy, ty, o.t * o.t)).setScale(sc);
      },
      onComplete: () => {
        this.float.hide();
        this.mode = 'idle';
        this.hangFloat.setVisible(true).setTexture(this.floatKey());
      },
    });
    this.input2.reel = true;
    this.time.delayedCall(700, () => (this.input2.reel = false));
  }

  // ------------------------------------------------------------------ hook / fight / land
  private resolveStrike() {
    const st = this.strike;
    if (!st) return;
    this.strike = null;
    const held = (this.time.now - st.t0) * QA_SPEED;
    this.doHook(st.dir, clamp(0.38 + held / 600, 0.38, 1));
  }

  private doHook(dir: StrikeDir, strong: boolean | number) {
    const res = this.auth.hook(dir, strong);
    this.rig.impulse((typeof strong === 'number' ? 20 + strong * 28 : strong ? 44 : 28) * (dir === 'up' ? 1 : 0.8));
    sfx.hook();
    if (res.ok) {
      this.mode = 'fight';
      this.fightState = this.auth.fight!.s;
      this.lastBehavior = '';
      this.wasRed = false;
      this.netOut = false;
      this.scoopReq = false;
      this.reelGear = 2;
      this.fightCamX = this.cameras.main.scrollX;
      const q = res.quality;
      this.hud.toast(q >= 0.6 ? 'Đóng cá chuẩn — lưỡi ăn chắc!' : q >= 0.3 ? 'Dính cá — lưỡi ăn vừa.' : 'Dính cá nhưng lưỡi chỉ móc hờ — cẩn thận!', q >= 0.3 ? '#7ef0c8' : COL.gold, 1800);
      if (res.reason) this.hud.toast(res.reason, COL.dim, 2200);
      if (this.auth.profile.settings.shake) this.cameras.main.shake(180, 0.004);
      this.playFx('splash_light', this.float.c.x, this.float.y, this.float.scale * 0.8, 0.5, 0.85);
      this.float.hide();
      this.hud.hint('');
    } else {
      this.hud.toast(res.reason, '#ffb27a', 2200);
    }
  }

  private onLanded(s: FishFightState) {
    const r = this.auth.takeCatch();
    if (!r.ok || !r.record) return;
    const rec = r.record;
    this.mode = 'landing';
    this.netOut = false;
    this.hud.hint('');
    this.fightHud.hide();
    this.hud.prompt(null);
    const w = this.auth.persp.toWorld(s.dist, s.landing.fishX);
    const cam = this.cameras.main;
    const sc = this.auth.persp.scaleAt(s.dist);
    this.playFx('splash_strong', w.x, w.y + 10, sc * 1.5, 0.5, 0.85);
    sfx.splash();
    const sh = this.shadows.get(-1);
    sh?.destroy();
    this.shadows.delete(-1);
    const fish = this.add.image(w.x, w.y, fishArtKey(rec.species)).setDepth(40);
    const target = Math.min(0.55, 340 / fish.width);
    fish.setScale(target * 0.5).setRotation(-0.4);
    this.tweens.add({ targets: fish, y: w.y - 170, rotation: 0.25, scale: target, duration: 500, ease: 'Quad.out' });
    this.tweens.add({ targets: fish, angle: { from: -12, to: 12 }, duration: 110, yoyo: true, repeat: 6, delay: 500 });
    this.rig.showNet(w.x - cam.scrollX, w.y - 140, () => {
      sfx.success();
      this.time.delayedCall(500, () => {
        fish.destroy();
        this.wake.setVisible(false);
        this.showResult(rec);
      });
    });
  }

  private showResult(rec: CatchRecord) {
    this.mode = 'result';
    this.modal = resultCard(this.ui, this.auth, rec, (choice, info) => {
      this.modal = null;
      const def = this.auth.fishDef(rec.species);
      if (choice === 'release') {
        const cam = this.cameras.main;
        const x = cam.scrollX + 1100, y = 900;
        const f = this.add.image(x, y - 120, fishArtKey(rec.species)).setDepth(40).setScale(Math.min(0.4, 260 / 1000));
        this.tweens.add({ targets: f, y: y + 20, alpha: 0, angle: 30, duration: 650, ease: 'Quad.in', onComplete: () => f.destroy() });
        this.time.delayedCall(560, () => { this.playFx('splash_light', x, y, 0.8, 0.5, 0.85); sfx.plop(); });
        this.hud.toast(`Đã thả ${def.name} về hồ.`, '#7ef0c8', 2000);
      } else this.hud.toast(`Đã giữ ${def.name} ${fmtKg(rec.weight)} trong giỏ.`, '#7ef0c8', 2000);
      if (info?.newSpecies) this.hud.toast(`Loài mới: ${def.name} (${RARITY_LABEL[def.rarity]})`, COL.gold, 2600);
      if (info?.record) this.hud.toast('Kỷ lục cá nhân mới!', COL.gold, 2600);
      this.auth.endCastCycle();
      this.mode = 'idle';
      this.hangFloat.setVisible(true).setTexture(this.floatKey());
    });
  }

  private onEscaped(s: FishFightState) {
    this.mode = 'escaped';
    const reason = s.escapeReason!;
    if (reason === 'line_break') { sfx.snap(); this.rig.impulse(-20); } else sfx.fail();
    if (this.auth.profile.settings.shake && (reason === 'line_break' || reason === 'balance')) this.cameras.main.shake(reason === 'balance' ? 420 : 220, reason === 'balance' ? 0.012 : 0.006);
    const head = reason === 'line_break' ? 'ĐỨT DÂY! ' : reason === 'balance' ? 'NGÃ NHÀO! ' : 'CÁ THOÁT! ';
    this.hud.toast(head + ESCAPE_TEXT[reason], '#ff9a85', 3800);
    this.netOut = false;
    this.fightHud.hide();
    const w = this.auth.persp.toWorld(s.dist, s.lateral);
    this.playFx('splash_light', w.x, w.y, this.auth.persp.scaleAt(s.dist) * 1.4, 0.5, 0.85);
    this.hud.prompt(null);
    this.hud.hint('');
    this.wake.setVisible(false);
    this.time.delayedCall(1300, () => {
      this.auth.endCastCycle();
      this.mode = 'idle';
      this.hangFloat.setVisible(true).setTexture(this.floatKey());
    });
  }

  // ------------------------------------------------------------------ helpers
  private playFx(key: string, x: number, y: number, scale: number, ox = 0.5, oy = 0.5) {
    const s = this.add.sprite(x, y, `${key}_00`).setOrigin(ox, oy).setScale(scale).setDepth(key.startsWith('ripple') ? 9 : 35);
    s.play(key);
    s.once('animationcomplete', () => s.destroy());
    return s;
  }

  private openHelp() {
    if (this.modal) return;
    const m = helpPanel(this.ui, this.auth, () => this.closeModal(), () => {
      sfx.setVolume(this.auth.profile.settings.volume);
      this.rig.shake = this.auth.profile.settings.shake;
      if (this.mode === 'idle') this.hangFloat.setTexture(this.floatKey());
    });
    this.modal = m;
  }

  private openLoadout() {
    if (this.modal) return;
    if (this.mode !== 'idle') { this.hud.toast('Thu cần (R) trước khi đổi đồ câu.', COL.dim, 1500); return; }
    this.modal = loadoutPanel(this.ui, this.auth, () => this.closeModal(), () => undefined);
  }

  private closeModal() {
    if (!this.modal || this.mode === 'result') return;
    this.modal.destroy();
    this.modal = null;
  }

  private toMenu() {
    if (this.mode === 'fight' || this.mode === 'landing' || this.mode === 'result') return;
    this.auth.save();
    this.scene.start('menu');
  }

  // ------------------------------------------------------------------ frame
  update(_t: number, dms: number) {
    if (!this.hud) return;
    const dt = Math.min(0.05, dms / 1000) * QA_SPEED;
    const cam = this.cameras.main;
    const k = this.keys;
    this.hour = (this.hour + dt / 180) % 24; // 1 in-game hour = 3 real minutes (72-min day)

    // wind (P1-024)
    this.windT -= dt;
    if (this.windT <= 0) { this.windT = this.rng.range(20, 45); this.windTarget = this.rng.range(-2, 2); }
    this.weather.update(dt);
    this.wind = approach(this.wind, this.windTarget * this.weather.wind, 0.2, dt);
    if (this.weather.forecast && this.weather.forecast !== this.forecastShown) {
      this.forecastShown = this.weather.forecast;
      this.hud.toast(this.weather.forecast + ' — gió và ánh sáng sẽ đổi dần.', COL.dim, 3500);
    }
    if (!this.weather.forecast) this.forecastShown = '';

    // camera pan within limits (P1-004)
    const panning = this.mode !== 'fight' && this.mode !== 'landing' && this.mode !== 'result' && !this.modal;
    if (panning) {
      let v = 0;
      const ad = this.mode === 'idle' || this.mode === 'stuck'; // in 'wait' A/D chooses the strike direction
      if (k.LEFT.isDown && !this.strike || (k.A.isDown && ad)) v -= 1;
      if (k.RIGHT.isDown && !this.strike || (k.D.isDown && ad)) v += 1;
      if (this.touchControls?.held('left')) v -= 1;
      if (this.touchControls?.held('right')) v += 1;
      if (!this.touchControls) {
        if (this.input.activePointer && this.ui.input.activePointer.x < 40 && this.ui.input.activePointer.y > 300) v -= 1;
        if (this.ui.input.activePointer.x > 1880 && this.ui.input.activePointer.y > 300) v += 1;
      }
      cam.scrollX = clamp(cam.scrollX + v * 520 * dt * this.auth.profile.settings.sensitivity, 0, this.lake.worldWidth - 1920);
      if (v) this.onMove(this.aim.sx, this.aim.sy);
    }

    this.lake.update(dt, this.hour, this.weather.cloud, this.wind);
    this.weatherView.update(dt, this.weather, this.auth.persp.H, this.lake.night);
    this.auth.mendLine(dt, this.mode === 'wait' && (this.input2.right || this.input2.touchRelease || !!this.touchControls?.held('mend')), this.wind);
    const evs = this.auth.tick(dt, this.hour);
    this.handleBiteEvents(evs);
    this.updateShadows(dt);

    // ambient water rings (P1-005)
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = this.rng.range(0.8, 2.2);
      const p = this.lake.ambientRing();
      const sc = this.auth.persp.scaleAt(this.auth.persp.dOf(p.y));
      this.playFx('ripple_small', p.x, p.y, sc * 3).setAlpha(0.45);
    }

    let pose = { theta: -128, bend: 0.04, pullX: 0, pullY: 1, reel: 0 };
    let tension = 0;
    switch (this.mode) {
      case 'idle':
        this.updateAim(false);
        this.hud.hint(this.hintText());
        break;
      case 'charging': {
        this.power = Math.min(1, this.power + dt / 1.25);
        if (this.power >= 1) this.over += dt;
        this.updateAim(true);
        pose = { theta: -128 + this.power * 40 + (this.over > 0 ? Math.sin(this.time.now / 60) * 1.5 : 0), bend: 0.08 + this.power * 0.1, pullX: 0.6, pullY: 1, reel: 0 };
        this.hud.showCast(this.power, this.over);
        this.hud.hint(this.over > 0.25 ? 'Giữ quá lâu ở mức tối đa làm cú ném kém chính xác — thả ra!' : 'Thả chuột khi thanh lực tới vạch sáng (điểm bạn ngắm).');
        break;
      }
      case 'flight': {
        const f = this.flight;
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        const x = Phaser.Math.Linear(f.sx, f.ex, u);
        const y = Phaser.Math.Linear(f.sy, f.ey, u) - Math.sin(u * Math.PI) * f.peak;
        this.float.flight(x, y, Phaser.Math.Linear(f.s0, f.s1, u), u * Math.PI * 1.5);
        this.float.topX = x;
        this.float.topY = y;
        pose = { theta: -136, bend: 0.06, pullX: x - cam.scrollX - this.rig.tip.x, pullY: y - this.rig.tip.y, reel: 0 };
        if (u >= 1) this.landFloat();
        break;
      }
      case 'wait':
      case 'stuck': {
        const bp = this.mode === 'wait' && this.auth.bite ? this.auth.bite.pose() : IDLE_POSE;
        const alert = this.auth.profile.settings.assist && this.auth.bite?.state === 'HOOK_WINDOW';
        if (alert && !this.alert) this.hud.toast('CÁ ĂN MỒI! Đóng cá ngay (click / Space)!', COL.gold, 1200);
        this.alert = !!alert;
        if (this.strike && this.time.now - this.strike.t0 >= 300 / QA_SPEED) this.resolveStrike();
        if (this.mode !== 'wait' && this.mode !== 'stuck') break;
        const night = this.lake.night > 0.6;
        this.float.update(dt, this.mode === 'stuck' ? { ...IDLE_POSE, tremor: 0 } : bp, this.mode === 'wait' ? this.wind : 0, this.auth.zone.current, !!alert, night);
        const pull = { x: this.float.topX - cam.scrollX - this.rig.tip.x, y: this.float.topY - this.rig.tip.y };
        pose = { theta: -134, bend: 0.05 + Math.max(0, this.float.sinkNow - 0.3) * 0.12, pullX: pull.x, pullY: pull.y, reel: 0 };
        this.hud.hint(this.hintText());
        break;
      }
      case 'retrieve':
        pose = { theta: -126, bend: 0.12, pullX: 0, pullY: 1, reel: 1 };
        this.float.topX = this.float.c.x;
        this.float.topY = this.float.c.y - 20;
        break;
      case 'fight': {
        const s = this.fightTick(dt);
        if (!s) break;
        tension = s.lineTension;
        const w = this.auth.persp.toWorld(s.dist, s.phase === 'landing' ? s.landing.fishX : s.lateral);
        const pull = { x: w.x - cam.scrollX - this.rig.tip.x, y: w.y - this.rig.tip.y };
        pose = { theta: -135 + s.rodAngle * 45 + s.balance * 0.12, bend: 0.04 + s.rodLoad * 0.8, pullX: pull.x, pullY: pull.y, reel: s.reeling ? s.reelGear / 3 : 0 };
        break;
      }
      case 'landing':
      case 'escaped':
        pose = { theta: -112, bend: 0.1, pullX: 0, pullY: 1, reel: 0 };
        break;
      case 'result':
        pose = { theta: -128, bend: 0.03, pullX: 0, pullY: 1, reel: 0 };
        break;
    }
    if (this.mode !== 'charging') this.hud.showCast(null);
    if (this.mode !== 'fight') {
      this.fightHud.hide();
      this.camTilt = approach(this.camTilt, 0, 2, dt);
    }
    cam.setRotation(this.camTilt).setZoom(1 + Math.abs(this.camTilt) * 2.2);
    this.updateNet(dt);
    this.rig.update(dt, pose);
    this.nightShade.setAlpha(Math.min(0.65, this.lake.nightAlpha + this.weather.cloud * 0.12));
    this.drawLine();
    this.updateHangFloat(dt);
    this.hud.setInfo({
      zone: this.auth.zone.name, hour: this.hour, bait: this.auth.baitName(), baitIcon: BAIT_BY_ID[this.auth.profile.bait].icon,
      hook: 'lưỡi số 6', depth: `${this.auth.profile.depth.toFixed(2).replace('.', ',')} m`, wind: this.wind,
      caught: this.auth.profile.stats.catches, best: this.bestCatch(),
      weather: this.weather.label,
    });
    const fs = this.fightState;
    this.touchControls?.update(this.mode, !!this.modal, this.netOut,
      fs ? `Căng dây ${Math.round(fs.lineTension)}% · sức cá ${Math.round(fs.fishStamina)}%\nHãm ${Math.round(fs.drag*100)}% · góc cần ${Math.round(fs.rodAngle*90)}°\nTốc thu ${this.reelGear} · dây chùng ${fs.slack.toFixed(2)} m` : '',
      this.auth.baitName(), this.auth.profile.depth, this.reelGear);
    sfx.update(dt, this.mode === 'fight' ? (this.fightState?.reeling ? 1 : 0) : this.mode === 'retrieve' ? 1 : 0, tension, this.lake.night > 0.6);
    this.debug();
  }

  private bestCatch() {
    let best = '';
    let w = 0;
    for (const [id, j] of Object.entries(this.auth.profile.journal)) if (j.maxWeight > w) { w = j.maxWeight; best = `${this.auth.fishDef(id).name} ${fmtKg(w)}`; }
    return best || '—';
  }

  private hintText(): string {
    if (!this.auth.profile.settings.hints) return '';
    switch (this.mode) {
      case 'idle': return 'Rê chuột chọn hướng · GIỮ chuột trái tích lực · THẢ để ném   (H: hướng dẫn)';
      case 'wait': {
        const st = this.auth.bite?.state;
        if (st === 'NIBBLE') return 'Phao giật nhẹ: cá đang RỈA mồi — chờ thêm, đừng đóng vội!';
        if (st === 'TAKING_BAIT') return 'Phao bị kéo/chìm dần… sắp rồi!';
        if (st === 'HOOK_WINDOW') return 'PHAO KÉO / NỔI BẤT THƯỜNG — GIẬT CẦN! (Space · A/D chọn hướng)' + this.strikeGuide();
        return `Dây chùng ${this.auth.lineSlack.toFixed(2)} m · giữ chuột phải thu dây chùng · R thu cần`;
      }
      case 'stuck': return 'Click hoặc R để thu dây và ném lại';
      default: return '';
    }
  }

  /** Easy / Normal guides for Hook Setting: timing zone, best direction, mouth type */
  private strikeGuide(): string {
    const b = this.auth.bite;
    if (!b) return '';
    const diff = this.auth.difficulty();
    if (diff === 'hard' || !b.species) return '';
    const z = b.hookZone();
    const dir = b.bestStrike();
    const dirTxt = dir === 'up' ? 'giật LÊN' : dir === 'left' ? 'giật sang TRÁI (giữ A)' : 'giật sang PHẢI (giữ D)';
    const zt = z === 'early' ? 'hơi sớm' : z === 'ideal' ? 'ĐÚNG LÚC' : z === 'late' ? 'sắp muộn!' : '';
    const mouth = diff === 'easy' ? ` · ${MOUTH_TEXT[MOUTH[b.species.id] ?? 'any']}` : '';
    return `  ·  [${zt}] ${dirTxt}${mouth}`;
  }

  private updateAim(charging: boolean) {
    const p = this.auth.persp;
    const aim = p.fromWorld(this.aim.x, this.aim.y);
    const maxD = this.auth.maxCast();
    const aimD = clamp(aim.d, 3, maxD);
    const show = !this.modal && this.aim.sy > p.H;
    // aimed point (where the player wants it)
    const ap = p.toWorld(aimD, aim.lateral * (aimD / Math.max(0.5, aim.d)));
    this.aimDot.setPosition(ap.x, ap.y).setAlpha(show ? 0.9 : 0).setScale(1.4);
    // predicted landing for current power
    const d = charging ? this.auth.powerToDist(this.power) : aimD;
    const lp = p.toWorld(d, aim.lateral * (d / Math.max(0.5, aim.d)));
    const sc = p.scaleAt(d) * 3.2;
    const tooFar = aim.d > maxD + 0.5;
    this.aimRing.setPosition(lp.x, lp.y).setScale(sc).setAlpha(show ? (charging ? 0.95 : 0.45) : 0).setTint(tooFar && !charging ? 0xff8a6a : 0xffffff);
    // trajectory preview (P1-018)
    const cam = this.cameras.main;
    const tip = this.rig.tip;
    const peak = 160 + (charging ? this.power : this.auth.distToPower(aimD)) * 260;
    this.trajDots.forEach((dot, i) => {
      const u = (i + 1) / (this.trajDots.length + 1);
      const x = Phaser.Math.Linear(tip.x, lp.x - cam.scrollX, u);
      const y = Phaser.Math.Linear(tip.y, lp.y, u) - Math.sin(u * Math.PI) * peak;
      dot.setPosition(x, y).setAlpha(charging && show ? 0.55 * (1 - u * 0.4) : 0).setScale(1 - u * 0.5);
    });
    if (charging) this.hud.castSweet(this.auth.distToPower(aimD));
  }

  private updateHangFloat(dt: number) {
    const vis = this.mode === 'idle' || this.mode === 'charging';
    this.hangFloat.setVisible(vis);
    if (!vis) return;
    const tip = this.rig.tip;
    const sway = Math.sin(this.time.now / 500) * 0.12;
    this.hangFloat.setPosition(tip.x + Math.sin(sway) * 90, tip.y + 90).setRotation(sway);
    void dt;
  }

  private drawLine() {
    const g = this.ui.line;
    g.clear();
    const cam = this.cameras.main;
    const tip = this.rig.tip;
    let ex: number, ey: number, sag: number;
    if (this.mode === 'idle' || this.mode === 'charging') {
      ex = this.hangFloat.x;
      ey = this.hangFloat.y + 2;
      sag = 4;
    } else if (this.mode === 'fight' && this.fightState) {
      const s = this.fightState;
      const w = this.auth.persp.toWorld(s.dist, s.phase === 'landing' ? s.landing.fishX : s.lateral);
      ex = w.x - cam.scrollX;
      ey = w.y;
      sag = Math.min(160, s.slack * 95) + 15 * Math.max(0, 1 - s.lineTension / 30);
      if (s.behavior === 'BURST' || s.behavior === 'SHAKING') { ex += this.rng.range(-5, 5); ey += this.rng.range(-3, 3); }
    } else if (this.mode === 'landing' || this.mode === 'result' || this.mode === 'escaped') {
      return;
    } else {
      ex = this.float.topX - cam.scrollX;
      ey = this.float.topY;
      sag = this.mode === 'flight' ? 30 : 10 + this.auth.lineSlack * 100;
    }
    const mx = (tip.x + ex) / 2, my = (tip.y + ey) / 2 + sag;
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(tip.x, tip.y), new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(ex, ey));
    const t = this.fightState && this.mode === 'fight' ? this.fightState.lineTension : 0;
    const col = t > 85 ? 0xffb0a0 : 0xf4f7f2;
    g.lineStyle(this.mode === 'fight' ? 2.4 : 1.8, col, 0.9);
    g.strokePoints(curve.getPoints(28));
  }

  private handleBiteEvents(evs: ReturnType<LocalAuthority['tick']>) {
    for (const e of evs) {
      switch (e.type) {
        case 'approach':
          if (e.bubbles) this.bubblesAtFloat();
          break;
        case 'agent_arrived':
          if (this.rng.chance(0.6)) this.bubblesAtFloat();
          break;
        case 'nibble':
          sfx.nibble();
          this.playFx('ripple_small', this.float.c.x, this.float.y, this.float.scale * 1.6).setAlpha(0.8);
          if (!this.hintedNibble && this.auth.profile.settings.hints) {
            this.hintedNibble = true;
            this.hud.toast('Cá đang thử mồi…', COL.dim, 1400);
          }
          break;
        case 'take':
          sfx.nibble();
          break;
        case 'window':
          sfx.plop();
          this.playFx('ripple', this.float.c.x, this.float.y, this.float.scale * 1.8);
          break;
        case 'spit':
          this.hud.toast(e.baitLost ? 'Cá nhả mồi và rỉa mất mồi — thu cần (R) để móc mồi mới.' : 'Cá nhả mồi — quá muộn!', '#ffb27a', 2200);
          break;
        case 'leave':
          if (this.auth.profile.settings.hints) this.hud.toast(e.baitLost ? 'Cá rỉa sạch mồi rồi bỏ đi.' : 'Cá nghi ngờ và bỏ đi.', COL.dim, 1800);
          break;
      }
    }
  }

  private bubblesAtFloat() {
    const s = this.add.sprite(this.float.c.x + this.rng.range(-20, 20), this.float.y - 4, 'bubbles_00').setScale(this.float.scale * 1.4).setDepth(28).setOrigin(0.5, 1);
    s.play('bubbles');
    this.time.delayedCall(2200, () => s.destroy());
  }

  /** draw every fish agent as a faint shadow under the surface (P1-031) */
  private updateShadows(dt: number) {
    this.surfaceFish.setVisible(false);
    const p = this.auth.persp;
    const alive = new Set<number>();
    for (const a of this.auth.school.agents) {
      const hooked = a.state === 'hooked';
      const key = hooked ? -1 : a.id;
      alive.add(key);
      let img = this.shadows.get(key);
      if (!img) {
        img = this.add.image(0, 0, shadowKey(a.def.id)).setDepth(8).setAlpha(0);
        this.shadows.set(key, img);
      }
      const fs = hooked ? this.fightState : null;
      const d = fs ? fs.dist : a.d;
      const lat = fs ? (fs.phase === 'landing' ? fs.landing.fishX : fs.lateral) : a.lat;
      const w = p.toWorld(d, lat);
      const sizeM = (a.def.maxLength / 100) * Math.cbrt(a.weight / a.def.maxWeight) * 1.1;
      const px = sizeM * p.ppm(d);
      img.setPosition(w.x, w.y).setScale(px / img.width, (px / img.width) * 0.55);
      const dirX = Math.sin(a.heading);
      if (fs) {
        img.setFlipX(fs.phase === 'landing' ? false : fs.fishDir > 0);
        img.setRotation(fs.phase === 'landing' ? Math.PI / 2 * fs.landing.heading : fs.fishDir * 0.2);
        if (fs.phase === 'landing' && fs.depth < 0.35) {
          this.surfaceFish.setTexture(fishArtKey(a.def.id)).setVisible(true)
            .setPosition(w.x, w.y).setRotation(Math.PI / 2 * fs.landing.heading)
            .setScale(px / this.surfaceFish.width).setAlpha(clamp(1 - fs.depth * 2, 0.3, 0.9));
        }
      }
      else img.setFlipX(dirX > 0);
      const depthFade = clamp(1 - a.depth / 3.5, 0.2, 1);
      const near = clamp(1.4 - d / 22, 0.15, 1);
      const target = fs ? clamp(0.85 - fs.depth * 0.18, 0.3, 0.85) : (a.state === 'flee' ? 0.25 : 0.42) * depthFade * near;
      img.setAlpha(approach(img.alpha, target, 3, dt));
    }
    for (const [k, img] of this.shadows) if (!alive.has(k)) { img.destroy(); this.shadows.delete(k); }
  }

  private fightTick(dt: number): FishFightState | null {
    const k = this.keys;
    const left = k.A.isDown || k.LEFT.isDown || this.touchControls?.held('left'), right = k.D.isDown || k.RIGHT.isDown || this.touchControls?.held('right');
    const up = k.W.isDown || k.UP.isDown || this.touchControls?.held('raise'), down = k.S.isDown || k.DOWN.isDown || this.touchControls?.held('lower');
    const reelHeld = !this.netOut && (this.input2.left || this.input2.touchReel || !!this.touchControls?.held('reel'));
    this.input2.reel = reelHeld;
    const prev = this.fightState;
    const dist = prev?.dist ?? 5;
    // mouse x → lateral metres at the fish's distance (net aim)
    const p = this.auth.persp;
    const yAt = p.toWorld(dist, 0).y;
    const netX = p.fromWorld(this.aim.sx + this.cameras.main.scrollX, yAt).lateral;
    const c: FightControls = {
      reel: reelHeld ? this.reelGear : 0,
      balance: (right ? 1 : 0) - (left ? 1 : 0),
      rodCmd: (up ? 1 : 0) - (down ? 1 : 0),
      dragCmd: (k.E.isDown || this.touchControls?.held('dragUp') ? 1 : 0) - (k.Q.isDown || this.touchControls?.held('dragDown') || this.touchControls?.held('mend') || this.input2.right ? 1 : 0),
      netOut: this.netOut,
      netX,
      netDistance: clamp(p.dOf(this.aim.sy - 30), 0.5, 4.5),
      netDepth: clamp(0.35 + (this.aim.sy - yAt - 30) / 180, 0.02, 0.8),
      scoop: this.scoopReq,
    };
    this.scoopReq = false;
    const s = this.auth.fightTick(dt, c);
    if (!s) return null;
    this.fightState = s;
    // net is out but the fish is not in the landing window any more (final burst, failed scoop, ran off): put the net away so the player can reel again
    if (this.netOut && s.phase === 'fighting') {
      this.netOut = false;
      this.hud.toast(s.message || s.landing.reason || 'Cá vùng ra — cất vợt, thu dây lại.', '#ffb27a', 1800);
    }
    const fx = s.phase === 'landing' ? s.landing.fishX : s.lateral;
    const w = p.toWorld(s.dist, fx);
    const cam = this.cameras.main;
    this.fightCamX = approach(this.fightCamX, clamp(w.x - 900, 0, this.lake.worldWidth - 1920), 1.5, dt);
    cam.scrollX = this.fightCamX;
    // balance tilts the view (off when screen shake is disabled)
    this.camTilt = approach(this.camTilt, this.auth.profile.settings.shake ? (s.balance / 100) * 0.015 : 0, 3, dt);
    const sc = p.scaleAt(s.dist);
    this.wake.setVisible(true).setPosition(w.x, w.y).setScale(sc * 2.2);
    if (!this.wake.anims.isPlaying) this.wake.play('line_wake');
    // readable cues per behaviour
    if (s.behavior !== this.lastBehavior) {
      if (s.behavior === 'BURST' || s.behavior === 'TURNING') this.playFx('splash_light', w.x, w.y, sc * 1.4, 0.5, 0.85);
      if (s.behavior === 'DIVING' || s.behavior === 'SULKING') this.bubblesAt(w.x, w.y, sc);
      this.lastBehavior = s.behavior;
    }
    if ((s.behavior === 'BURST' || s.behavior === 'SHAKING') && this.rng.chance(dt * 3)) this.playFx('ripple_small', w.x, w.y, sc * 3);
    if (s.next === 'JUMPING' && this.rng.chance(dt * 4)) this.playFx('ripple', w.x, w.y, sc * 2.4).setAlpha(0.7);
    if ((s.next === 'DIVING' || s.next === 'SULKING') && this.rng.chance(dt * 2)) this.bubblesAt(w.x, w.y, sc);
    if (s.jumpNow) this.fishJump(w.x, w.y, s.dist);
    if (s.message && (s.message !== this.lastFightMessage || this.time.now - this.lastFightMessageAt > 3000)) {
      this.hud.toast(s.message, COL.gold, 1500);
      this.lastFightMessage = s.message;
      this.lastFightMessageAt = this.time.now;
    }
    const red = s.lineTension > 88;
    if (red && !this.wasRed) sfx.nibble();
    this.wasRed = red;
    const fight = this.auth.fight!;
    const def = fight.fish;
    const slipAt = (18 + 100 * s.drag * fight.gear.maxDrag) / fight.gear.lineStrength;
    const netPossible = !this.netOut && s.dist < 4.2 && s.fishStamina <= 40;
    this.fightHud.update(s, `${def.name} ~${fmtKg(fight.weight)}`, fight.prof.name, fight.diff, slipAt, netPossible);
    this.hud.prompt(null);
    this.hud.hint(this.auth.profile.settings.hints
      ? (this.netOut ? 'Rê chuột X/Y đặt miệng vợt dưới cá · dẫn đầu cá vào trước · Click nhấc · F cất'
        : 'A/D ép cần ngang · W nâng / S hạ cần · Q/E lực hãm · giữ chuột thu dây · F vợt')
      : '', 470);
    if (s.phase === 'escaped') {
      this.onEscaped(s);
      return null;
    }
    if (s.phase === 'landed') {
      this.onLanded(s);
      return null;
    }
    void BEHAVIOR_LABEL;
    return s;
  }

  /** net sprite follows the mouse while it is out (landing mini-game) */
  private updateNet(dt: number) {
    this.netGuide.clear();
    const s = this.fightState;
    if (this.mode === 'fight' && this.netOut && s) {
      const p = this.auth.persp;
      const w = p.toWorld(s.landing.netDistance, s.landing.netX);
      const scale = clamp(this.auth.loadout().net.netSize! * 2 * p.ppm(s.landing.netDistance) / 300, 0.12, 0.6);
      this.rig.holdNet(true, w.x - this.cameras.main.scrollX, w.y + s.landing.netDepth * 50, dt, scale);
      if (this.auth.difficulty() !== 'hard') {
        this.netGuide.lineStyle(2, s.landing.inside ? 0x7ef0c8 : 0xffd36b, 0.8)
          .strokeEllipse(w.x - this.cameras.main.scrollX, w.y + s.landing.netDepth * 50, scale * 300, scale * 145);
      }
    } else if (this.mode !== 'landing') this.rig.holdNet(false, 0, 0, dt);
  }

  private bubblesAt(x: number, y: number, sc: number) {
    const b = this.add.sprite(x + this.rng.range(-20, 20), y - 4, 'bubbles_00').setScale(sc * 2.2).setDepth(28).setOrigin(0.5, 1);
    b.play('bubbles');
    this.time.delayedCall(2200, () => b.destroy());
  }

  private fishJump(x: number, y: number, d: number) {
    const sp = this.auth.fight?.fish.id ?? 'ro_phi';
    const sc = this.auth.persp.scaleAt(d);
    const f = this.add.image(x, y, fishArtKey(sp)).setDepth(36);
    const s = Math.min(0.5, (sc * 900) / f.width);
    f.setScale(s).setRotation(-0.6);
    this.playFx('splash_strong', x, y + 6, sc * 1.4, 0.5, 0.85);
    sfx.splash();
    this.tweens.add({ targets: f, y: y - 260 * sc - 40, rotation: 0.6, duration: 380, yoyo: true, ease: 'Quad.out', onComplete: () => { f.destroy(); this.playFx('splash_light', x, y, sc * 1.6, 0.5, 0.85); } });
  }

  private debug() {
    const show = this.auth.profile.settings.showDebug;
    this.ui.debugT.setVisible(show);
    if (!show) return;
    const b = this.auth.bite;
    const f = this.fightState;
    const ag = this.auth.school.agents.map((a) => `${a.def.id.slice(0, 6)}:${a.state[0]} ${a.d.toFixed(1)}m`).join('  ');
    this.ui.debugT.setText([
      `mode=${this.mode}  fps=${this.game.loop.actualFps.toFixed(0)}  hour=${this.hour.toFixed(2)}  wind=${this.wind.toFixed(2)}`,
      `bite=${b?.state ?? '-'} species=${b?.species?.id ?? '-'} t=${b?.stateT.toFixed(2) ?? '-'} window=${b ? b.windowProgress().toFixed(2) : '-'}`,
      `renderer=${this.game.renderer.type === Phaser.CANVAS ? 'Canvas 2D' : 'WebGL'}  diff=${this.auth.difficulty()}  hook=${f ? f.hookStrength.toFixed(0) : '-'} beh=${f?.behavior ?? '-'} next=${f?.next ?? '-'}`,
      `float x=${this.float.c.x.toFixed(0)} y=${this.float.y.toFixed(0)} sink=${this.float.sinkNow.toFixed(2)} cast d=${this.auth.cast?.d.toFixed(1) ?? '-'} lat=${this.auth.cast?.lateral.toFixed(1) ?? '-'}`,
      f ? `fight ${f.phase} T=${f.lineTension.toFixed(0)} bal=${f.balance.toFixed(0)} rod=${f.rodAngle.toFixed(2)} drag=${f.drag.toFixed(2)} stam=${f.fishStamina.toFixed(0)} dist=${f.dist.toFixed(1)} lat=${f.lateral.toFixed(1)} win=${f.landing.window}` : 'fight -',
      `agents: ${ag}`,
    ].join('\n'));
  }
}
