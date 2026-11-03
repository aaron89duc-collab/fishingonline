/** Game content data (fish, baits, gear, zones). Pure data, shared by client and a future server. */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type BaitId = 'giun' | 'ngo' | 'cam' | 'tep' | 'moi_gia';
export type ZoneId = 'bo_co' | 'cau_go' | 'bai_beo' | 'cua_suoi' | 'vung_sau';
export type NibbleStyle = 'small' | 'steady' | 'predator' | 'bottom' | 'filter';
export type FightStyle = 'small' | 'strong' | 'fast' | 'eel' | 'legendary';

export interface FishDefinition {
  id: string;
  name: string;
  latin: string;
  rarity: Rarity;
  minWeight: number; // kg
  maxWeight: number;
  maxLength: number; // cm at maxWeight
  preferredBaits: Partial<Record<BaitId, number>>; // 0..1
  depth: [number, number]; // preferred bait depth, m
  activeHours: number[]; // hour multipliers, 24 entries (built by helper)
  caution: number; // 0..1 chance to inspect & leave
  bitePatience: number; // how long it holds the bait (s)
  nibbles: [number, number]; // nibble count range before taking
  nibbleStyle: NibbleStyle;
  fightStyle: FightStyle;
  fightingPower: number; // 0..1.5
  speed: number; // m/s when running
  stamina: number; // seconds of hard fighting at full power
  burstFrequency: number; // bursts per 10 s
  obstacleSeeking: number; // 0..1
  jumps: boolean;
  pricePerKg: number;
  xp: number;
  art: string; // texture key
  variants?: string[]; // alternative art keys (koi)
  note: string;
}

const hours = (spec: Array<[number, number, number]>, base = 1): number[] => {
  const h = new Array(24).fill(base);
  for (const [from, to, m] of spec) {
    for (let i = 0; i < 24; i++) {
      const inRange = from <= to ? i >= from && i < to : i >= from || i < to;
      if (inRange) h[i] = m;
    }
  }
  return h;
};

export const FISH: FishDefinition[] = [
  {
    id: 'ro_phi', name: 'Rô phi', latin: 'Oreochromis niloticus', rarity: 'common',
    minWeight: 0.2, maxWeight: 2.0, maxLength: 40, preferredBaits: { giun: 1, cam: 0.8, ngo: 0.4, tep: 0.3 },
    depth: [0.4, 1.6], activeHours: hours([[6, 18, 1.2], [21, 4, 0.5]]), caution: 0.15, bitePatience: 1.4,
    nibbles: [1, 3], nibbleStyle: 'small', fightStyle: 'small', fightingPower: 0.45, speed: 1.6, stamina: 6,
    burstFrequency: 1.2, obstacleSeeking: 0.1, jumps: false, pricePerKg: 30, xp: 10, art: 'fish_ro_phi',
    note: 'Ăn mồi đều, hay ở gần bờ. Giật nhẹ và nhanh mệt — loài lý tưởng để tập.',
  },
  {
    id: 'ca_diec', name: 'Cá diếc', latin: 'Carassius auratus', rarity: 'common',
    minWeight: 0.1, maxWeight: 1.0, maxLength: 30, preferredBaits: { cam: 1, giun: 0.8, ngo: 0.7 },
    depth: [0.8, 2.0], activeHours: hours([[5, 10, 1.4], [16, 19, 1.3]]), caution: 0.35, bitePatience: 0.9,
    nibbles: [2, 4], nibbleStyle: 'small', fightStyle: 'small', fightingPower: 0.35, speed: 1.3, stamina: 5,
    burstFrequency: 1.0, obstacleSeeking: 0.1, jumps: false, pricePerKg: 38, xp: 12, art: 'fish_ca_diec',
    note: 'Rỉa mồi nhiều lần, tín hiệu nhỏ. Cần đóng đúng nhịp khi phao chìm hẳn.',
  },
  {
    id: 'ca_chep', name: 'Cá chép', latin: 'Cyprinus carpio', rarity: 'uncommon',
    minWeight: 0.8, maxWeight: 12, maxLength: 85, preferredBaits: { ngo: 1, cam: 0.8, giun: 0.6 },
    depth: [1.4, 3.2], activeHours: hours([[4, 9, 1.6], [17, 21, 1.3], [11, 15, 0.7]]), caution: 0.45, bitePatience: 1.6,
    nibbles: [1, 3], nibbleStyle: 'bottom', fightStyle: 'strong', fightingPower: 0.95, speed: 2.2, stamina: 16,
    burstFrequency: 1.4, obstacleSeeking: 0.3, jumps: false, pricePerKg: 60, xp: 22, art: 'fish_ca_chep',
    note: 'Dò mồi ở đáy, kéo bền và đổi hướng. Mồi ngô ở vùng nước sâu rất hiệu quả.',
  },
  {
    id: 'tram_co', name: 'Trắm cỏ', latin: 'Ctenopharyngodon idella', rarity: 'rare',
    minWeight: 1.5, maxWeight: 20, maxLength: 110, preferredBaits: { ngo: 0.9, cam: 0.6 },
    depth: [0.8, 2.6], activeHours: hours([[6, 11, 1.3], [15, 19, 1.3]]), caution: 0.4, bitePatience: 1.8,
    nibbles: [0, 2], nibbleStyle: 'steady', fightStyle: 'strong', fightingPower: 1.15, speed: 2.8, stamina: 20,
    burstFrequency: 1.0, obstacleSeeking: 0.25, jumps: false, pricePerKg: 55, xp: 35, art: 'fish_tram_co',
    note: 'Ưa thực vật. Lực lớn, chạy dài — cần nhả dây đúng lúc.',
  },
  {
    id: 'ca_tre', name: 'Cá trê', latin: 'Clarias batrachus', rarity: 'uncommon',
    minWeight: 0.3, maxWeight: 5, maxLength: 60, preferredBaits: { giun: 1, tep: 0.9 },
    depth: [1.6, 4.0], activeHours: hours([[18, 5, 2.4], [6, 17, 0.45]]), caution: 0.2, bitePatience: 2.2,
    nibbles: [0, 2], nibbleStyle: 'bottom', fightStyle: 'strong', fightingPower: 0.85, speed: 1.4, stamina: 14,
    burstFrequency: 0.5, obstacleSeeking: 0.45, jumps: false, pricePerKg: 50, xp: 20, art: 'fish_ca_tre',
    note: 'Mạnh về tối và đêm, ở sát đáy. Kéo lì, ít bùng tốc.',
  },
  {
    id: 'ca_loc', name: 'Cá lóc', latin: 'Channa striata', rarity: 'rare',
    minWeight: 0.4, maxWeight: 6, maxLength: 80, preferredBaits: { moi_gia: 1, tep: 0.9, giun: 0.3 },
    depth: [0.2, 1.3], activeHours: hours([[5, 8, 1.8], [17, 20, 1.8], [11, 15, 0.6]]), caution: 0.25, bitePatience: 0.6,
    nibbles: [0, 1], nibbleStyle: 'predator', fightStyle: 'fast', fightingPower: 1.0, speed: 3.4, stamina: 11,
    burstFrequency: 2.6, obstacleSeeking: 0.8, jumps: true, pricePerKg: 80, xp: 32, art: 'fish_ca_loc',
    note: 'Phục kích gần cỏ, tấn công nhanh. Bùng tốc, đổi hướng gắt, hay lao vào bụi.',
  },
  {
    id: 'me_trang', name: 'Cá mè trắng', latin: 'Hypophthalmichthys molitrix', rarity: 'uncommon',
    minWeight: 0.8, maxWeight: 10, maxLength: 90, preferredBaits: { cam: 1, ngo: 0.4 },
    depth: [0.5, 1.8], activeHours: hours([[8, 17, 1.3]]), caution: 0.3, bitePatience: 1.2,
    nibbles: [2, 5], nibbleStyle: 'filter', fightStyle: 'strong', fightingPower: 0.8, speed: 2.4, stamina: 12,
    burstFrequency: 2.0, obstacleSeeking: 0.1, jumps: true, pricePerKg: 40, xp: 20, art: 'fish_me_trang',
    note: 'Ăn theo vùng, theo đàn. Phao rung và giật liên tục khi đấu.',
  },
  {
    id: 'ca_chinh', name: 'Cá chình', latin: 'Anguilla marmorata', rarity: 'epic',
    minWeight: 0.3, maxWeight: 4, maxLength: 110, preferredBaits: { tep: 1, giun: 0.7 },
    depth: [2.2, 5.0], activeHours: hours([[19, 4, 2.6], [5, 18, 0.25]]), caution: 0.55, bitePatience: 1.4,
    nibbles: [1, 3], nibbleStyle: 'bottom', fightStyle: 'eel', fightingPower: 0.9, speed: 1.8, stamina: 15,
    burstFrequency: 1.4, obstacleSeeking: 1.0, jumps: false, pricePerKg: 150, xp: 70, art: 'fish_ca_chinh',
    note: 'Rất hiếm, ẩn nấp ban đêm ở đáy. Luồn chướng ngại — đừng để dây chùng.',
  },
  {
    id: 'koi', name: 'Cá koi', latin: 'Cyprinus rubrofuscus', rarity: 'epic',
    minWeight: 0.8, maxWeight: 8, maxLength: 75, preferredBaits: { ngo: 1, cam: 0.9 },
    depth: [0.4, 1.6], activeHours: hours([[6, 17, 1.2]]), caution: 0.5, bitePatience: 1.3,
    nibbles: [1, 3], nibbleStyle: 'steady', fightStyle: 'strong', fightingPower: 0.75, speed: 2.0, stamina: 11,
    burstFrequency: 1.0, obstacleSeeking: 0.2, jumps: false, pricePerKg: 220, xp: 60, art: 'fish_koi_01_do_trang',
    variants: ['fish_koi_01_do_trang', 'fish_koi_02_den_trang', 'fish_koi_03_vang', 'fish_koi_04_cam_den', 'fish_koi_05_trang_dau_do'],
    note: 'Cá sưu tầm với 5 biến thể màu. Mỗi biến thể được ghi riêng trong Sổ cá.',
  },
  {
    id: 'ca_huyen_thoai', name: 'Cá Chép Vàng (huyền thoại)', latin: 'Truyền thuyết hồ', rarity: 'legendary',
    minWeight: 15, maxWeight: 40, maxLength: 140, preferredBaits: { ngo: 1, cam: 0.6 },
    depth: [3.0, 5.5], activeHours: hours([[4, 7, 4.0], [7, 4, 0.0]]), caution: 0.7, bitePatience: 1.5,
    nibbles: [2, 4], nibbleStyle: 'bottom', fightStyle: 'legendary', fightingPower: 1.45, speed: 3.0, stamina: 34,
    burstFrequency: 1.6, obstacleSeeking: 0.4, jumps: true, pricePerKg: 600, xp: 300, art: 'fish_ca_huyen_thoai',
    note: 'Người làng kể có một con chép vàng chỉ ngoi lên Vùng sâu lúc rạng sáng. Cần cần mạnh và dây dù.',
  },
];
export const FISH_BY_ID: Record<string, FishDefinition> = Object.fromEntries(FISH.map((f) => [f.id, f]));

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Phổ biến', uncommon: 'Không phổ biến', rare: 'Hiếm', epic: 'Rất hiếm', legendary: 'Huyền thoại',
};
export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x9fb7b0, uncommon: 0x5cc98a, rare: 0x4aa3ff, epic: 0xb27cff, legendary: 0xffc24a,
};

export interface BaitDef { id: BaitId; name: string; price: number; pack: number; icon: string; reusable?: boolean; desc: string }
export const BAITS: BaitDef[] = [
  { id: 'giun', name: 'Giun', price: 20, pack: 10, icon: 'gear_bait_worm', desc: 'Mồi đa năng: rô phi, diếc, trê.' },
  { id: 'ngo', name: 'Ngô', price: 20, pack: 10, icon: 'gear_bait_corn', desc: 'Chép, trắm, koi rất thích.' },
  { id: 'cam', name: 'Cám', price: 30, pack: 10, icon: 'gear_bait_box', desc: 'Mồi xả, hợp mè, diếc.' },
  { id: 'tep', name: 'Tép sống', price: 50, pack: 10, icon: 'gear_bucket', desc: 'Mồi sống cho cá săn mồi: lóc, chình.' },
  { id: 'moi_gia', name: 'Mồi giả', price: 450, pack: 1, icon: 'gear_lure', reusable: true, desc: 'Dùng nhiều lần. Chuyên cá lóc.' },
];
export const BAIT_BY_ID: Record<BaitId, BaitDef> = Object.fromEntries(BAITS.map((b) => [b.id, b])) as Record<BaitId, BaitDef>;

export type GearSlot = 'rod' | 'reel' | 'line' | 'float';
export interface GearDef {
  id: string; slot: GearSlot; name: string; price: number; desc: string;
  maxCast?: number; power?: number; sensitivity?: number; // rod
  reelSpeed?: number; drag?: number; capacity?: number; // reel
  strength?: number; stealth?: number; // line
  floatKey?: string; // float texture
  minLevel?: number;
}
export const GEAR: GearDef[] = [
  { id: 'can_nhe', slot: 'rod', name: 'Cần tre nhẹ', price: 0, maxCast: 22, power: 0.8, sensitivity: 1.25, desc: 'Nhạy, ngọn mềm. Ném gần.' },
  { id: 'can_trung', slot: 'rod', name: 'Cần carbon trung', price: 900, maxCast: 28, power: 1.0, sensitivity: 1.0, desc: 'Cân bằng giữa tầm ném và sức ghì.', minLevel: 2 },
  { id: 'can_manh', slot: 'rod', name: 'Cần lực mạnh', price: 2600, maxCast: 34, power: 1.35, sensitivity: 0.85, desc: 'Cho cá lớn ở vùng sâu.', minLevel: 4 },
  { id: 'may_nho', slot: 'reel', name: 'Máy 2000 bạc', price: 0, reelSpeed: 1.0, drag: 0.55, capacity: 70, desc: 'Máy nhỏ, nhẹ tay.' },
  { id: 'may_lon', slot: 'reel', name: 'Máy 4000 vàng', price: 1800, reelSpeed: 1.35, drag: 0.8, capacity: 130, desc: 'Thu nhanh, phanh khỏe, nhiều dây.', minLevel: 3 },
  { id: 'day_manh', slot: 'line', name: 'Dây cước mảnh 0.20', price: 0, strength: 0.85, stealth: 1.15, desc: 'Khó thấy dưới nước, dễ đứt.' },
  { id: 'day_vua', slot: 'line', name: 'Dây cước 0.28', price: 350, strength: 1.05, stealth: 1.0, desc: 'Dây đa dụng.' },
  { id: 'day_du', slot: 'line', name: 'Dây dù bện PE', price: 1200, strength: 1.4, stealth: 0.85, desc: 'Rất bền, cá dễ thấy hơn.', minLevel: 3 },
  { id: 'phao_dai', slot: 'float', name: 'Phao dài đỏ trắng', price: 0, floatKey: 'float_long_basic', desc: 'Phao cơ bản, nhạy.' },
  { id: 'phao_tuong_phan', slot: 'float', name: 'Phao tương phản cao', price: 0, floatKey: 'float_long_contrast', desc: 'Hồng – đen, dễ nhìn trên nước.' },
  { id: 'phao_dem', slot: 'float', name: 'Phao phát sáng', price: 300, floatKey: 'float_long_night_glow', desc: 'Sáng trong đêm.' },
  { id: 'phao_giot', slot: 'float', name: 'Phao giọt nước đỏ', price: 200, floatKey: 'float_drop_red', desc: 'Dáng giọt nước, ném xa ổn định.' },
  { id: 'phao_tron', slot: 'float', name: 'Phao tròn vàng', price: 150, floatKey: 'float_round_yellow', desc: 'Dễ quan sát cho người mới.' },
  { id: 'phao_vang', slot: 'float', name: 'Phao vàng kim', price: 1500, floatKey: 'float_special_gold', desc: 'Phiên bản cao cấp.', minLevel: 3 },
];
export const GEAR_BY_ID: Record<string, GearDef> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export interface Ellipse { x: number; y: number; rx: number; ry: number }
export interface ZoneDef {
  id: ZoneId; name: string; minLevel: number; desc: string;
  kind: 'parallax' | 'plate'; plate?: string;
  worldWidth: number; horizon: number; // world px
  water: Array<[number, number]>; // valid water polygon in world px
  snags: Ellipse[]; // cover / obstacles in world px
  snagChance: number; // chance a cast outside open water tangles (Bãi bèo)
  shallow: number; deep: number; // water depth near/far (m)
  current: number; // px/s drift of float (Cửa suối)
  baseBite: number; // fish approach chance per second at perfect conditions
  fish: Partial<Record<string, number>>;
  mapScale?: number; // plate display scale
}

// Plate zones are authored in 1920×1080 space then scaled by 1.1 (pan ±96 px).
const K = 1.1;
const P = (pts: Array<[number, number]>): Array<[number, number]> => pts.map(([x, y]) => [x * K, y * K - 54]);
const E = (x: number, y: number, rx: number, ry: number): Ellipse => ({ x: x * K, y: y * K - 54, rx: rx * K, ry: ry * K });

export const ZONES: ZoneDef[] = [
  {
    id: 'bo_co', name: 'Bờ cỏ', minLevel: 1, desc: 'Bờ thoai thoải, nước nông. Hợp người mới.', kind: 'parallax',
    worldWidth: 2880, horizon: 440,
    water: [[0, 470], [2880, 470], [2880, 1000], [2300, 1000], [2050, 930], [800, 930], [560, 1000], [0, 1000]],
    snags: [{ x: 800, y: 640, rx: 190, ry: 42 }, { x: 2080, y: 610, rx: 170, ry: 36 }, { x: 1470, y: 535, rx: 90, ry: 16 }],
    snagChance: 0.75, shallow: 0.8, deep: 2.4, current: 0, baseBite: 0.11,
    fish: { ro_phi: 3, ca_tre: 1.5, ca_loc: 1.3 },
  },
  {
    id: 'cau_go', name: 'Cầu gỗ', minLevel: 2, desc: 'Nước sâu hơn dưới chân cầu, cá chép và mè hay về.', kind: 'plate', plate: 'zone_cau_go',
    worldWidth: 1920 * K, horizon: 430 * K - 54,
    water: P([[560, 770], [1120, 700], [1880, 570], [1920, 570], [1920, 1080], [600, 1080], [520, 900]]),
    snags: [E(1180, 690, 170, 36), E(1590, 610, 170, 30)], snagChance: 0, shallow: 1.2, deep: 3.2, current: 0, baseBite: 0.1,
    fish: { ro_phi: 2, ca_diec: 2, ca_chep: 2.4, tram_co: 1.3, me_trang: 2, koi: 0.35 },
  },
  {
    id: 'bai_beo', name: 'Bãi bèo', minLevel: 3, desc: 'Lục bình dày đặc. Ném vào khe nước trống, cá lóc phục kích.', kind: 'plate', plate: 'zone_bai_beo',
    worldWidth: 1920 * K, horizon: 290 * K - 54,
    water: P([[120, 330], [1840, 330], [1840, 860], [120, 860]]),
    snags: [E(470, 480, 230, 60), E(1050, 470, 160, 45), E(1520, 520, 200, 60), E(800, 640, 230, 70), E(1300, 700, 210, 70), E(330, 760, 200, 80)],
    snagChance: 0.85, shallow: 0.6, deep: 1.8, current: 0, baseBite: 0.12,
    fish: { ca_loc: 3, ro_phi: 2, ca_diec: 2, ca_tre: 1.4, ca_chinh: 0.35 },
  },
  {
    id: 'cua_suoi', name: 'Cửa suối', minLevel: 4, desc: 'Dòng chảy kéo phao trôi. Trắm cỏ và mè theo nước về.', kind: 'plate', plate: 'zone_cua_suoi',
    worldWidth: 1920 * K, horizon: 470 * K - 54,
    water: P([[80, 520], [700, 470], [760, 690], [640, 860], [900, 1000], [1150, 1080], [120, 1080], [60, 800]]),
    snags: [E(700, 830, 120, 60)], snagChance: 0, shallow: 0.8, deep: 2.6, current: -9, baseBite: 0.1,
    fish: { tram_co: 2.4, me_trang: 2, ca_chep: 1.5, ca_chinh: 0.9, ca_loc: 1, ro_phi: 1 },
  },
  {
    id: 'vung_sau', name: 'Vùng sâu', minLevel: 5, desc: 'Nước sâu, sương phủ. Nơi truyền thuyết Cá Chép Vàng ẩn mình.', kind: 'plate', plate: 'zone_vung_sau',
    worldWidth: 1920 * K, horizon: 500 * K - 54,
    water: P([[0, 545], [1920, 545], [1920, 1060], [0, 1060]]),
    snags: [], snagChance: 0, shallow: 2.4, deep: 5.5, current: 0, baseBite: 0.09,
    fish: { ca_chep: 2.5, tram_co: 2, ca_tre: 2, me_trang: 1.5, ca_chinh: 1.4, ca_huyen_thoai: 0.06 },
  },
];
export const ZONE_BY_ID: Record<ZoneId, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneDef>;

/** Phase 1 scope: one zone, three species, one basic loadout */
export const MVP_FISH = ['ro_phi', 'ca_tre', 'ca_loc'];

export const xpForLevel = (lvl: number) => 120 * ((lvl - 1) * lvl) / 2; // total xp needed to reach lvl
export const MAX_LEVEL = 20;
