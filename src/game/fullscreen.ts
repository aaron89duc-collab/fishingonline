type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type WebkitDocument = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean };
const mobile = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
const standalone = () => matchMedia('(display-mode: standalone)').matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;
const fullscreen = () => document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
const supported = () => !!((document.fullscreenEnabled && document.documentElement.requestFullscreen) ||
  ((document as WebkitDocument).webkitFullscreenEnabled && (document.documentElement as WebkitElement).webkitRequestFullscreen));
let button: HTMLButtonElement;
let help: HTMLDivElement;
let pending = false;

function refresh() {
  if (!button) return;
  button.hidden = !mobile() || !!fullscreen() || standalone();
  button.textContent = supported() ? '⛶ Toàn màn hình' : '⛶ Cách mở toàn màn hình';
  if (button.hidden) help.hidden = true;
}

/** Must be called synchronously from the start-button's user gesture. */
export async function requestMobileFullscreen() {
  if (!mobile() || fullscreen() || standalone() || pending || !supported()) return;
  pending = true;
  try {
    const root = document.documentElement as WebkitElement;
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else await root.webkitRequestFullscreen?.();
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
    try { await orientation?.lock?.('landscape'); } catch { /* User can rotate manually. */ }
  } catch {
    if (help) {
      help.textContent = 'Trình duyệt chưa cho phép. Thử nút Toàn màn hình, hoặc mở game trực tiếp bằng Chrome/Safari thay vì trình duyệt trong ứng dụng.';
      help.hidden = false;
    }
  } finally { pending = false; refresh(); }
}

export function installFullscreenControls(onResize: () => void) {
  button = document.createElement('button');
  button.id = 'fullscreen-button'; button.type = 'button'; button.hidden = true;
  help = document.createElement('div');
  help.id = 'fullscreen-help'; help.hidden = true; help.setAttribute('role', 'status');
  document.body.append(button, help);
  button.addEventListener('click', () => {
    if (supported()) void requestMobileFullscreen();
    else {
      help.textContent = 'Nếu dùng iPhone: mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính, rồi mở game từ biểu tượng mới. Trình duyệt này không hỗ trợ nút bật toàn màn hình cho game.';
      help.hidden = !help.hidden;
    }
  });
  const resize = () => { refresh(); requestAnimationFrame(onResize); };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  document.addEventListener('webkitfullscreenchange', resize);
  matchMedia('(display-mode: standalone)').addEventListener('change', resize);
  refresh();
}
