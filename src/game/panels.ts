import Phaser from 'phaser';
import { Button, COL, Modal, fmtHour, fmtKg, panel, txt } from './ui';
import { BAIT_BY_ID, FISH_BY_ID, RARITY_COLOR, RARITY_LABEL, ZONE_BY_ID } from '../core/data';
import type { LocalAuthority } from '../core/authority';
import type { CatchRecord } from '../core/profile';
import { fishArtKey } from './assets';

/** P1-059..064: catch result with fish image, weight, length, keep / release. */
export function resultCard(scene: Phaser.Scene, a: LocalAuthority, rec: CatchRecord, onDone: (choice: 'keep' | 'release', info: { newSpecies: boolean; record: boolean } | null) => void) {
  const def = FISH_BY_ID[rec.species];
  const j = a.profile.journal[rec.species];
  const isNew = !j || j.caught === 0;
  const isRecord = !!j && j.caught > 0 && rec.weight > j.maxWeight;
  const c = scene.add.container(0, 0).setDepth(1100);
  const dim = scene.add.rectangle(0, 0, 1920, 1080, 0x061014, 0.5).setOrigin(0).setInteractive();
  const W = 960, H = 680, X = 480, Y = 180;
  const p = panel(scene, X, Y, W, H, 'ui_panel_result', 0.97);
  const head = txt(scene, 960, Y + 46, 'BẠN ĐÃ BẮT ĐƯỢC!', 30, COL.gold, 800).setOrigin(0.5);
  const name = txt(scene, 960, Y + 98, def.name.toUpperCase(), 48, COL.text, 800).setOrigin(0.5);
  const badge = scene.add.graphics();
  badge.fillStyle(RARITY_COLOR[def.rarity], 1).fillRoundedRect(X + W - 255, Y + 26, 210, 48, 24);
  const badgeT = txt(scene, X + W - 150, Y + 50, RARITY_LABEL[def.rarity], 19, '#0b1d22', 800).setOrigin(0.5);
  const glow = scene.add.ellipse(960, Y + 270, 780, 230, 0x2ec4b6, 0.12);
  const art = scene.add.image(960, Y + 270, fishArtKey(rec.species));
  const sc = Math.min(720 / art.width, 220 / art.height);
  art.setScale(sc * 0.3);
  scene.tweens.add({ targets: art, scale: sc, duration: 450, ease: 'Back.out' });
  const stars = Math.max(1, Math.round(rec.quality / 20));
  const rows: Array<[string, string]> = [
    ['Cân nặng', fmtKg(rec.weight)], ['Chiều dài', `${rec.length} cm`], ['Mồi', BAIT_BY_ID[rec.bait].name],
    ['Khu câu', ZONE_BY_ID[rec.zone].name], ['Giờ bắt', fmtHour(rec.hour)], ['Trận đấu', '★'.repeat(stars) + '☆'.repeat(5 - stars)],
  ];
  const items: Phaser.GameObjects.GameObject[] = [dim, p, glow, art, head, name, badge, badgeT];
  rows.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = X + 80 + col * 420, y = Y + 410 + row * 46;
    items.push(txt(scene, x, y, k, 22, COL.dim, 600), txt(scene, x + 340, y, v, i <= 1 ? 30 : 24, i <= 1 ? COL.gold : COL.text, 800).setOrigin(1, 0));
  });
  const ribbons: string[] = [];
  if (isNew) ribbons.push('LOÀI MỚI');
  if (isRecord) ribbons.push(`KỶ LỤC CÁ NHÂN! (cũ ${fmtKg(j!.maxWeight)})`);
  if (rec.trophy) ribbons.push('CÁ CỠ LỚN');
  if (ribbons.length) items.push(txt(scene, 960, Y + 370, ribbons.join('   ·   '), 22, '#7ef0c8', 800).setOrigin(0.5));
  let done = false;
  const choose = (choice: 'keep' | 'release') => {
    if (done) return;
    done = true;
    const info = a.decide(rec.id, choice);
    scene.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
    onDone(choice, info);
  };
  const b1 = new Button(scene, 960 - 170, Y + H - 66, 'GIỮ CÁ  (K)', () => choose('keep'), { w: 300, h: 72, color: 0x2b8a6e, size: 24 });
  const b2 = new Button(scene, 960 + 170, Y + H - 66, 'THẢ VỀ HỒ  (T)', () => choose('release'), { w: 300, h: 72, color: 0x3f86b8, size: 24 });
  items.push(b1, b2);
  c.add(items).setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 250 });
  const kb = scene.input.keyboard;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'k' || e.key === 'K' || e.key === 'Enter') choose('keep');
    if (e.key === 't' || e.key === 'T') choose('release');
  };
  kb?.on('keydown', onKey);
  c.once('destroy', () => kb?.off('keydown', onKey));
  return c;
}

/** Controls + basic settings (assist, hints, high contrast float, shake, volume, debug). */
export function helpPanel(scene: Phaser.Scene, a: LocalAuthority, onClose: () => void, onChange: () => void) {
  const m = new Modal(scene, 'Hướng dẫn & cài đặt', 1300, 860, onClose);
  const b = m.content;
  const render = () => {
    b.removeAll(true);
    const lines = [
      ['Ném phao', 'Rê chuột chọn hướng · GIỮ chuột trái để tích lực · THẢ để ném'],
      ['Chọn điểm rơi', 'Lực ném quyết định khoảng cách — vòng trắng là điểm dự kiến'],
      ['Đọc phao', 'Nhấp nhô đều = sóng · Giật ngắn = cá rỉa · Chìm hẳn / bị kéo = cá ăn'],
      ['Đóng cá', 'Click / Space ngay khi phao CHÌM HẲN và ở dưới nước — chìm thoáng rồi nổi lại là cá rỉa (chìm giả)'],
      ['Đấu cá', 'Giữ chuột trái / W = thu dây · Giữ chuột phải / S = nhả dây'],
      ['Hướng cần', 'A / D hoặc rê chuột — nghiêng cần NGƯỢC hướng cá chạy'],
      ['Cá lắc đầu', 'Ngừng thu dây, nhả nhẹ nếu căng cao — ghì mạnh lúc này sẽ xé lưỡi'],
      ['Vớt cá', 'Khi cá mệt và sát bờ: Space hoặc click'],
      ['Khác', 'R = thu cần · [ ] / cuộn chuột = độ sâu · 1/2 = đổi mồi · ← → = lia camera · F1 = debug'],
    ];
    lines.forEach(([k, v], i) => {
      b.add(txt(scene, 50, 96 + i * 44, k, 21, COL.gold, 800));
      b.add(txt(scene, 270, 96 + i * 44, v, 19, COL.text, 600));
    });
    const s = a.profile.settings;
    const toggles: Array<[keyof typeof s, string]> = [
      ['assist', 'Hỗ trợ đóng cá (cửa sổ rộng + dấu !)'], ['hints', 'Gợi ý thao tác'], ['highContrastFloat', 'Phao tương phản cao'],
      ['shake', 'Rung màn hình'], ['showDebug', 'Chế độ debug'],
    ];
    toggles.forEach(([k, label], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 50 + col * 620, y = 500 + row * 80;
      const on = !!s[k];
      b.add(txt(scene, x, y + 12, label, 21, COL.text, 600));
      b.add(new Button(scene, x + 520, y + 28, on ? 'BẬT' : 'TẮT', () => {
        (s as unknown as Record<string, boolean>)[k] = !on;
        a.save(); render(); onChange();
      }, { w: 110, h: 48, color: on ? 0x2b8a6e : 0x5a6a70, size: 19 }));
    });
    b.add(txt(scene, 670, 672, `Âm lượng ${Math.round(s.volume * 100)}%`, 21, COL.text, 600));
    b.add(new Button(scene, 1010, 690, '−', () => { s.volume = Math.max(0, +(s.volume - 0.1).toFixed(1)); a.save(); render(); onChange(); }, { w: 64, h: 48 }));
    b.add(new Button(scene, 1090, 690, '+', () => { s.volume = Math.min(1, +(s.volume + 0.1).toFixed(1)); a.save(); render(); onChange(); }, { w: 64, h: 48 }));
    const st = a.profile.stats;
    b.add(txt(scene, 50, 780, `Đã ném ${st.casts} lần · bắt ${st.catches} cá · thả ${st.released} · cá thoát ${st.escapes} · tổng ${fmtKg(st.totalWeight)}`, 18, COL.dim, 600));
  };
  render();
  return m;
}
