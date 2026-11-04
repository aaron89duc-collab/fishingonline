import Phaser from 'phaser';

const A = 'assets/';
const pad = (i: number) => String(i).padStart(2, '0');

export const SEQ = {
  ripple: { n: 12, fps: 24 },
  ripple_small: { n: 8, fps: 24 },
  bubbles: { n: 8, fps: 12, loop: true },
  line_wake: { n: 8, fps: 24, loop: true },
  fish_wake: { n: 8, fps: 24, loop: true },
  splash_light: { n: 10, fps: 30 },
  splash_strong: { n: 12, fps: 30 },
} as const;

// Phase 1 scope: three species
export const FISH_ART = ['ro_phi', 'ca_tre', 'ca_loc', 'ca_chep', 'tram_co'];

export function preloadAll(load: Phaser.Loader.LoaderPlugin) {
  // backgrounds
  for (const k of ['sky.jpg', 'mtn_far.png', 'mtn_near.png', 'treeline.png', 'water.jpg', 'reflection.png'])
    load.image('boco_' + k.split('.')[0], `${A}bg/boco/${k}`);
  for (let i = 0; i < 7; i++) load.image(`cloud_${i}`, `${A}bg/clouds/cloud_${i}.png`);
  load.image('menu_bg', `${A}bg/menu_boco.jpg`);
  // props
  for (const p of ['lotus_leaf_01', 'lotus_leaf_02', 'lotus_leaf_03', 'lotus_leaf_04', 'lotus_leaf_05', 'lotus_leaf_06', 'lotus_flower_01', 'lotus_flower_02',
    'lotus_bud_01', 'lotus_bud_02', 'hyacinth_01', 'hyacinth_02', 'hyacinth_03', 'reed_01', 'reed_02', 'reed_03', 'reed_04', 'rock', 'tackle_box',
    'bait_box', 'angler_sitting', 'angler_standing', 'creature_heron', 'creature_dragonfly', 'creature_butterfly', 'creature_frog'])
    load.image('prop_' + p, `${A}props/${p}.png`);
  // fx sequences
  for (const [k, v] of Object.entries(SEQ)) for (let i = 0; i < v.n; i++) load.image(`${k}_${pad(i)}`, `${A}fx/${k}_${pad(i)}.png`);
  for (let i = 1; i <= 6; i++) load.image(`sparkle_${i}`, `${A}fx/sparkle_${i}.png`);
  load.image('target_ring', `${A}fx/target_ring.png`);
  load.image('traj_dot', `${A}fx/trajectory_dot.png`);
  // rig
  for (const r of ['hand_right_grip', 'forearm_sleeve', 'sleeve_only', 'rod_blank', 'reel_spinning', 'net'])
    load.image('rig_' + r, `${A}rig/${r}.png`);
  // floats
  for (const f of ['long_basic', 'long_contrast', 'long_night_glow']) load.image('float_' + f, `${A}float/${f}.png`);
  // fish
  for (const f of FISH_ART) {
    load.image('fish_' + f, `${A}fish/${f}.png`);
    load.image('shadow_' + f, `${A}fish/shadow_${f}.png`);
  }
  // ui
  for (const u of ['bar_bg', 'bar_tension_full', 'bar_cast_full', 'bar_stamina_full', 'panel_info', 'panel_result', 'toast', 'button_round', 'button_square'])
    load.image('ui_' + u, `${A}ui/${u}.png`);
  for (const u of ['home', 'help', 'close']) load.image('ico_' + u, `${A}ui/icon_${u}.png`);
  for (const g of ['bait_worm', 'bucket', 'hook']) load.image('gear_' + g, `${A}ui/gear_${g}.png`);
  load.image('logo', `${A}ui/logo.png`);
}

export function createAnims(anims: Phaser.Animations.AnimationManager) {
  for (const [k, v] of Object.entries(SEQ)) {
    if (anims.exists(k)) continue;
    anims.create({
      key: k,
      frames: Array.from({ length: v.n }, (_, i) => ({ key: `${k}_${pad(i)}` })),
      frameRate: v.fps,
      repeat: 'loop' in v && v.loop ? -1 : 0,
    });
  }
}

/** species id → texture keys */
export function fishArtKey(species: string, variant?: string) {
  if (variant) return variant;
  return species === 'koi' ? 'fish_koi_01_do_trang' : 'fish_' + species;
}
export const shadowKey = (species: string) => 'shadow_' + species;
