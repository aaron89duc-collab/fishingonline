# Fishing World Online — Phase 0 + Phase 1 (Core Fishing Gameplay)

Game câu cá góc nhìn thứ nhất, **TypeScript + Phaser 3.90 + Vite**, chạy trên Chrome, deploy lên Vercel.
Phạm vi: 1 khu **Bờ cỏ**, 3 loài **rô phi / cá trê / cá lóc**, 1 bộ trang bị cơ bản, chơi đơn (chưa online, chưa tài khoản, chưa cửa hàng).

## Chạy thử trên máy

```bash
npm install
npm run dev        # mở http://localhost:5173 trên Chrome
npm test           # 10 bài test logic (ném, cắn câu, đấu cá, vớt cá)
npm run build      # build ra thư mục dist/
```

## Deploy lên Vercel

**Cách 1 — qua GitHub (khuyên dùng):** đẩy thư mục này lên một repo GitHub → vào vercel.com → *Add New → Project* → chọn repo.
Vercel tự nhận Vite (`vercel.json` đã cấu hình: build `npm run build`, output `dist`). Bấm *Deploy* là có link `*.vercel.app`.

**Cách 2 — dòng lệnh:**
```bash
npm i -g vercel
vercel          # lần đầu: đăng nhập, chọn tên project
vercel --prod   # đưa lên link chính thức
```

## Điều khiển

| Hành động | PC | Ghi chú |
|---|---|---|
| Ngắm hướng | Rê chuột | Chấm vàng = điểm ngắm, vòng trắng = điểm rơi dự kiến |
| Ném | **Giữ** chuột trái (hoặc Space) tích lực, **thả** để ném | Thả khi thanh lực tới vạch sáng; giữ ở mức tối đa quá lâu → ném lệch |
| Đóng cá | Click chuột trái / Space | Chỉ đóng khi phao **chìm hẳn / bị kéo**; đóng lúc cá đang rỉa sẽ hụt |
| Thu dây | Giữ chuột trái / W | |
| Nhả dây | Giữ chuột phải / S | Khi lực căng vào vùng đỏ |
| Hướng cần | A / D hoặc rê chuột | Nghiêng **ngược** hướng cá chạy để cá mất sức nhanh |
| Vớt cá | Space / click khi hiện "VỚT CÁ!" | Cá phải mệt và sát bờ |
| Giữ / Thả cá | K / T hoặc nút trên thẻ kết quả | |
| Khác | R thu cần · [ ] / cuộn chuột đổi độ sâu · 1 / 2 đổi mồi giun / tép · ← → lia camera · H hướng dẫn · F1 debug | |

Trên điện thoại (xoay ngang): chạm-giữ lên mặt nước để ném, chạm để đóng cá, nút **THU DÂY / NHẢ DÂY** khi đấu cá.

## Cấu trúc mã

```
src/core/        Logic thuần, KHÔNG phụ thuộc Phaser (sẵn sàng chuyển lên server sau này)
  data.ts          Dữ liệu cá (GDD Phụ lục A), mồi, trang bị, khu Bờ cỏ
  perspective.ts   Phối cảnh giả 3D: khoảng cách (m) ↔ tọa độ màn hình
  school.ts        Cá trong hồ: sinh ra, bơi, phát hiện mồi, tiếp cận, bỏ chạy (P1-030..036)
  bite.ts          Máy trạng thái cắn câu WAITING → APPROACH → NIBBLE → TAKING_BAIT → HOOK_WINDOW → HOOKED / MISSED
  fight.ts         Đấu cá (GDD Phụ lục B): tension, stamina, độ bền dây, các pha RUN / STRUGGLE / TIRED / FINAL_BURST
  authority.ts     "Trọng tài": quyết định điểm rơi, cá nào ăn, cân nặng, chiều dài. View chỉ gửi ý định
  profile.ts       Lưu dữ liệu (localStorage): lượt bắt, sổ cá, cài đặt
src/game/        Hiển thị bằng Phaser: Lake (parallax, sóng), RodRig (tay + cần cong), FloatView, Hud, panels, sfx
src/scenes/      Boot → Menu → Fishing (thế giới) + UI (HUD, tay cần, input)
public/assets/   Asset từ E:\game\Fish\asset đã được làm sạch (tools/build_assets.py)
tools/           build_assets.py (xử lý asset), smoke.cjs / smoke2.cjs (test tự động bằng Chrome headless)
```

Cân nặng và chiều dài cá được authority quyết định lúc cá xuất hiện trong hồ, chỉ lộ ra khi vớt lên.
Mỗi lượt bắt có ID riêng, ghi nhận một lần (bấm hai lần không cộng hai lần).
Debug: bấm F1 để xem state cá, cửa sổ đóng cá, tension, stamina, độ bền dây, tọa độ phao, vị trí từng con cá.
Mở `?speed=4` sau URL để thời gian trong game chạy nhanh hơn (chỉ dùng khi test).

## Đối chiếu tiêu chí hoàn thành Phase 1

| # | Tiêu chí | Cách game đáp ứng | Kiểm chứng |
|---|---|---|---|
| 1 | Ném phao đến vị trí mong muốn | Hướng theo chuột, khoảng cách theo lực; vạch sáng trên thanh lực = lực cần cho điểm ngắm | `authority.test.ts`: sai số trung bình 0,21 m |
| 2 | Phao chuyển động tự nhiên theo sóng | 3 sóng sin chồng nhau + gió đổi hướng + trôi | Quan sát trong game |
| 3 | Cá tiếp cận, thử mồi và bỏ đi | Cá bơi tới mồi (thấy bóng cá), rỉa 0–4 lần, có thể nghi ngờ bỏ đi hoặc rỉa mất mồi | `authority.test.ts`, smoke test |
| 4 | Người chơi phải tự đóng cá đúng lúc | Không có đóng tự động; đóng lúc cá rỉa → hụt; quá muộn → cá nhả mồi | test "hooking during nibble misses" |
| 5 | Điều khiển được trận đấu cá | Thu / nhả / hướng cần thay đổi tension, khoảng cách, sức cá | `sim.test.ts` |
| 6 | Điều khiển sai có thể mất cá | Đứt dây (đỏ quá lâu), tuột lưỡi (dây chùng), cá lao vào sen, hết dây, vớt chậm | `sim.test.ts`: giữ thu dây liên tục → 100% đứt dây; không làm gì → 100% tuột |
| 7 | Điều khiển tốt có thể đưa cá lên bờ | Pha TIRED → vào vùng vớt → VỚT CÁ | `sim.test.ts`: chơi đúng 85–100% |
| 8 | Hiển thị cân nặng và chiều dài | Thẻ kết quả: ảnh cá, kg, cm, mồi, giờ, sao trận đấu | smoke test |
| 9 | Câu lượt mới không cần tải lại trang | Sau Giữ / Thả hoặc cá thoát, tự quay về trạng thái ném | smoke test |

## Giới hạn hiện tại

- Âm thanh được tạo bằng code (WebAudio), chưa có file âm thanh thật.
- Tay / cần là các mảnh PNG ghép và chuyển động bằng code. Các file Spine starter của họa sĩ chưa được kiểm chứng nên chưa dùng.
- Font Be Vietnam Pro tải từ Google Fonts. Nếu bị chặn mạng, game dùng font hệ thống.
