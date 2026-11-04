import type { BaitId, ZoneId } from './data';
import { MAX_LEVEL, xpForLevel } from './data';

export interface CatchRecord {
  id: string; // unique per catch (idempotent rewards)
  species: string;
  variant?: string; // art key for koi variants
  weight: number; // kg, decided by authority — never by the view
  length: number; // cm
  bait: BaitId;
  zone: ZoneId;
  hour: number;
  at: number; // epoch ms
  quality: number; // fight rating 0..100
  trophy: boolean;
  decision?: 'keep' | 'release' | 'sell';
}

export interface JournalEntry {
  caught: number;
  released: number;
  maxWeight: number;
  maxLength: number;
  firstAt: number;
  baits: Partial<Record<BaitId, number>>;
  zones: Partial<Record<ZoneId, number>>;
  hours: number[]; // catches per hour block (6 x 4h)
  variants: string[];
}

export interface Settings {
  assist: boolean; // wider hook window + hints
  hints: boolean;
  highContrastFloat: boolean;
  autoNightFloat: boolean;
  shake: boolean;
  volume: number; // 0..1
  sensitivity: number; // pan / steer sensitivity 0.5..2
  showDebug: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
}

export interface QuestProgress { id: string; progress: number; done: boolean; claimed: boolean }

export interface Profile {
  v: 1;
  name: string;
  money: number;
  xp: number;
  level: number;
  reputation: number;
  baits: Record<BaitId, number>;
  owned: string[];
  equip: { rod: string; reel: string; line: string; float: string; net?: string };
  bait: BaitId;
  depth: number;
  zone: ZoneId;
  journal: Record<string, JournalEntry>;
  catches: CatchRecord[];
  processed: string[];
  settings: Settings;
  quests: { day: string; list: QuestProgress[]; tutorial: number };
  stats: { casts: number; catches: number; released: number; sold: number; escapes: number; totalWeight: number; baitsTried: BaitId[]; zonesVisited: ZoneId[]; baitLost?: number };
  tutorialDone: boolean;
  createdAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  assist: false, hints: true, highContrastFloat: false, autoNightFloat: true, shake: true, volume: 0.7, sensitivity: 1, showDebug: false, difficulty: 'normal',
};

export function newProfile(): Profile {
  return {
    v: 1, name: 'Người câu', money: 300, xp: 0, level: 1, reputation: 0,
    baits: { giun: 30, ngo: 10, cam: 5, tep: 0, moi_gia: 0 },
    owned: ['can_nhe', 'can_trung', 'can_manh', 'may_nho', 'may_lon', 'day_manh', 'day_vua', 'day_du', 'phao_dai', 'phao_tuong_phan', 'vot_nho', 'vot_lon'],
    equip: { rod: 'can_trung', reel: 'may_nho', line: 'day_vua', float: 'phao_dai', net: 'vot_nho' },
    bait: 'giun', depth: 1.0, zone: 'bo_co',
    journal: {}, catches: [], processed: [],
    settings: { ...DEFAULT_SETTINGS },
    quests: { day: '', list: [], tutorial: 0 },
    stats: { casts: 0, catches: 0, released: 0, sold: 0, escapes: 0, totalWeight: 0, baitsTried: ['giun'], zonesVisited: ['bo_co'] },
    tutorialDone: false,
    createdAt: Date.now(),
  };
}

export function levelFromXp(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

const KEY = 'fwo_save_v1';

/** Persistence (localStorage, guarded — may be unavailable in private mode). */
export const SaveStore = {
  load(): Profile {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Profile;
        if (p && p.v === 1) {
          const base = newProfile();
          // v1.1 difficulty update: assist becomes opt-in for existing saves
          const raw2 = p as Profile & { diffV?: number };
          if (!raw2.diffV) { raw2.diffV = 2; if (raw2.settings) raw2.settings.assist = false; }
          return { ...base, ...p, settings: { ...base.settings, ...p.settings }, stats: { ...base.stats, ...p.stats }, baits: { ...base.baits, ...p.baits }, equip: { ...base.equip, ...p.equip } };
        }
      }
    } catch {
      /* ignore */
    }
    return newProfile();
  },
  save(p: Profile) {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  },
  reset(): Profile {
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return newProfile();
  },
};
