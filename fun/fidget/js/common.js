const commonCode = {
  init() {
    this.blockZoom();
  },

  // 같은 이름(type.namespace)으로 다시 바인딩하면 이전 핸들러를 먼저 떼고 붙임 (off → on)
  on(el, evt, fn, opt) {
    if (!el) return;
    const type = evt.split('.')[0];
    el._evt = el._evt || {};
    const old = el._evt[evt];
    if (old) el.removeEventListener(type, old.fn, old.opt);
    el.addEventListener(type, fn, opt);
    el._evt[evt] = { fn, opt };
  },

  // 모바일에서 더블탭/핀치 확대, 길게 눌러 메뉴 뜨는 것 막기
  blockZoom() {
    this.on(document, 'gesturestart.common', e => e.preventDefault());
    this.on(document, 'dblclick.common', e => e.preventDefault());
    this.on(document, 'contextmenu.common', e => {
      if (e.target.closest('.play__canvas')) e.preventDefault();
    });
  },

  fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    return { w: rect.width, h: rect.height, dpr };
  },

  pos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  hideHint() {
    const hint = document.querySelector('.play__hint');
    if (hint) hint.classList.add('is-hide');
  },

  toast(msg) {
    const stage = document.querySelector('.play__stage');
    if (!stage) return;
    const el = document.createElement('div');
    el.className = 'play__toast';
    el.textContent = msg;
    stage.appendChild(el);
    setTimeout(() => el.classList.add('is-out'), 1900);
    setTimeout(() => el.remove(), 2500);
  },

  vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  },

  rand(a, b) {
    return a + Math.random() * (b - a);
  },

  clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  },

  // 두 각도의 차이 (-PI ~ PI)
  angDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
};

document.addEventListener('DOMContentLoaded', () => { commonCode.init(); });
