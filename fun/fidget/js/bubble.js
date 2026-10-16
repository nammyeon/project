const bubbleCode = {
  canvas: null,
  ctx: null,
  w: 0,
  h: 0,
  dpr: 1,
  D: 0,
  bubbles: [],
  sheet: { x: 0, y: 0, w: 0, h: 0 },
  sprite: null,
  popSprites: [],
  pointers: new Map(),
  count: 0,
  slide: 0,
  anim: null,
  lastW: 0,
  lastH: 0,
  lastTime: 0,
  POP_TIME: 0.24,

  init() {
    this.canvas = document.querySelector('.play__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.bindEvents();
    this.resize();
    requestAnimationFrame(t => this.loop(t));
  },

  bindEvents() {
    commonCode.on(window, 'resize.bubble', () => this.resize());
    commonCode.on(this.canvas, 'pointerdown.bubble', e => this.onDown(e));
    commonCode.on(this.canvas, 'pointermove.bubble', e => this.onMove(e));
    commonCode.on(this.canvas, 'pointerup.bubble', e => this.onUp(e));
    commonCode.on(this.canvas, 'pointercancel.bubble', e => this.onUp(e));
    commonCode.on(document.querySelector('.play__btn--reset'), 'click.bubble', () => this.newSheet());
  },

  resize() {
    const s = commonCode.fitCanvas(this.canvas);
    this.w = s.w;
    this.h = s.h;
    this.dpr = s.dpr;
    // 모바일 주소창 때문에 생기는 작은 리사이즈에는 판을 새로 만들지 않음
    if (!this.bubbles.length || Math.abs(this.w - this.lastW) > 60 || Math.abs(this.h - this.lastH) > 60) {
      this.lastW = this.w;
      this.lastH = this.h;
      this.build();
    }
  },

  // 벌집 모양으로 뽁뽁이 배치
  build() {
    const D = this.w < 600 ? 50 : 62;
    const r = D / 2;
    const sx = D * 1.14;
    const sy = sx * 0.87;
    const padX = this.w < 600 ? 18 : 48;
    const padY = this.w < 600 ? 16 : 36;
    const bottom = 70; // 하단 카운터 자리
    const cols = Math.max(1, Math.floor((this.w - padX * 2 - sx / 2 - D) / sx) + 1);
    const rows = Math.max(1, Math.floor((this.h - padY - bottom - D) / sy) + 1);
    const gw = (cols - 1) * sx + sx / 2 + D;
    const gh = (rows - 1) * sy + D;
    const ox = (this.w - gw) / 2 + r;
    const oy = (this.h - bottom - gh) / 2 + r + 4;
    this.D = D;
    this.sheet = { x: ox - r - 14, y: oy - r - 14, w: gw + 28, h: gh + 28 };
    this.bubbles = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.bubbles.push({
          x: ox + col * sx + (row % 2 ? sx / 2 : 0),
          y: oy + row * sy,
          r,
          popped: false,
          t: 0,
          v: Math.floor(Math.random() * 6),
          rot: Math.random() * Math.PI * 2
        });
      }
    }
    this.count = 0;
    this.makeSprites();
    this.updateInfo();
  },

  // 매 프레임 그라데이션을 만들지 않도록 뽁뽁이 모양을 미리 그려둠
  makeSprites() {
    const r = this.D / 2;
    const k = this.dpr;
    const S = Math.ceil(this.D * 1.5 * k);
    const rand = commonCode.rand;
    const make = draw => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, S / 2, S / 2);
      draw(g);
      return c;
    };
    const circle = (g, x, y, rr) => {
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
    };

    this.sprite = make(g => {
      let gr = g.createRadialGradient(r * 0.12, r * 0.22, r * 0.3, r * 0.12, r * 0.22, r * 1.15);
      gr.addColorStop(0, 'rgba(30,60,100,.25)');
      gr.addColorStop(1, 'rgba(30,60,100,0)');
      g.fillStyle = gr;
      circle(g, r * 0.12, r * 0.22, r * 1.15);
      g.fill();

      gr = g.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.05, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,.85)');
      gr.addColorStop(0.3, 'rgba(235,246,255,.45)');
      gr.addColorStop(0.78, 'rgba(190,218,240,.35)');
      gr.addColorStop(1, 'rgba(140,180,215,.65)');
      g.fillStyle = gr;
      circle(g, 0, 0, r);
      g.fill();

      g.lineWidth = 1.3;
      g.strokeStyle = 'rgba(255,255,255,.85)';
      circle(g, 0, 0, r - 0.7);
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(100,140,185,.35)';
      circle(g, 0, 0, r - 2.4);
      g.stroke();

      g.save();
      g.translate(-r * 0.34, -r * 0.4);
      g.rotate(-0.7);
      g.scale(1, 0.55);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      circle(g, 0, 0, r * 0.32);
      g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.6)';
      circle(g, r * 0.38, r * 0.42, r * 0.07);
      g.fill();
    });

    // 터진 뽁뽁이: 납작하게 구겨진 비닐 (6가지 모양)
    this.popSprites = [];
    for (let v = 0; v < 6; v++) {
      this.popSprites.push(make(g => {
        const n = 10 + Math.floor(Math.random() * 4);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + rand(-0.2, 0.2);
          const rr = r * rand(0.76, 0.96);
          if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fillStyle = 'rgba(255,255,255,.22)';
        g.fill();
        g.lineJoin = 'round';
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(255,255,255,.9)';
        g.stroke();
        g.translate(0.8, 1);
        g.strokeStyle = 'rgba(50,85,135,.4)';
        g.stroke();
        g.translate(-0.8, -1);

        g.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          let x = rand(-r * 0.5, r * 0.5);
          let y = rand(-r * 0.5, r * 0.5);
          let a = rand(0, Math.PI * 2);
          const pts = [[x, y]];
          for (let s = 0; s < 3; s++) {
            a += rand(-1, 1);
            x += Math.cos(a) * r * 0.22;
            y += Math.sin(a) * r * 0.22;
            pts.push([x, y]);
          }
          g.beginPath();
          pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.strokeStyle = 'rgba(255,255,255,.75)';
          g.stroke();
          g.translate(0.7, 0.9);
          g.strokeStyle = 'rgba(50,85,135,.35)';
          g.stroke();
          g.translate(-0.7, -0.9);
        }
      }));
    }
  },

  // ===== 입력 =====
  getPos(e) {
    const p = commonCode.pos(e, this.canvas);
    return { x: p.x - this.slide, y: p.y };
  },

  onDown(e) {
    if (this.anim) return;
    commonCode.hideHint();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.getPos(e);
    this.pointers.set(e.pointerId, p);
    this.popAlong(p, p);
  },

  onMove(e) {
    if (!this.pointers.has(e.pointerId) || this.anim) return;
    const p = this.getPos(e);
    this.popAlong(this.pointers.get(e.pointerId), p);
    this.pointers.set(e.pointerId, p);
  },

  onUp(e) {
    this.pointers.delete(e.pointerId);
  },

  // 이전 위치 → 현재 위치 사이를 촘촘히 훑어서 지나간 뽁뽁이를 전부 터트림
  // 한 번에 여러 개가 터지면 아주 조금씩 시간차를 둬서 '타타타닥' 느낌
  popAlong(a, b) {
    const step = this.D * 0.2;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    let k = 0;
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n;
      const y = a.y + (b.y - a.y) * i / n;
      this.bubbles.forEach(bb => {
        if (bb.popped) return;
        const dx = bb.x - x;
        const dy = bb.y - y;
        if (dx * dx + dy * dy < bb.r * bb.r * 0.81) {
          this.pop(bb, Math.min(k * 0.022, 0.09));
          k++;
        }
      });
    }
  },

  pop(b, delay) {
    b.popped = true;
    b.t = -delay;
    this.count++;
    soundCode.pop(delay);
    if (delay) setTimeout(() => commonCode.vibrate(8), delay * 1000);
    else commonCode.vibrate(12);
    this.updateInfo();
    if (this.count === this.bubbles.length) {
      setTimeout(() => {
        commonCode.toast('다 터트렸어요! 🎉');
        document.querySelector('.play__btn--reset').classList.add('is-pulse');
      }, 400);
    }
  },

  // 새 뽁뽁이 판: 옆으로 휙 빼고 새 판을 밀어 넣음
  newSheet() {
    if (this.anim) return;
    document.querySelector('.play__btn--reset').classList.remove('is-pulse');
    this.pointers.clear();
    this.anim = { t: 0, built: false };
    soundCode.swoosh();
  },

  updateInfo() {
    const fill = document.querySelector('.play__info-fill');
    const text = document.querySelector('.play__info-text');
    const total = this.bubbles.length;
    if (fill) fill.style.width = (total ? this.count / total * 100 : 0) + '%';
    if (text) text.textContent = `${this.count} / ${total}`;
  },

  // ===== 갱신 / 그리기 =====
  loop(t) {
    const dt = Math.min(0.033, (t - (this.lastTime || t)) / 1000);
    this.lastTime = t;
    this.update(dt);
    this.draw();
    requestAnimationFrame(tt => this.loop(tt));
  },

  update(dt) {
    this.bubbles.forEach(b => { if (b.popped && b.t < this.POP_TIME) b.t += dt; });
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const out = 0.28;
      const inn = 0.4;
      const ease = x => 1 - Math.pow(1 - x, 3);
      if (a.t < out) {
        this.slide = -this.w * (a.t / out) * (a.t / out);
      } else {
        if (!a.built) {
          this.build();
          a.built = true;
        }
        const x = Math.min(1, (a.t - out) / inn);
        this.slide = this.w * (1 - ease(x));
        if (x >= 1) {
          this.slide = 0;
          this.anim = null;
        }
      }
    }
  },

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.translate(this.slide, 0);
    this.drawSheet(ctx);
    const D = this.D;
    const half = D * 0.75;
    const T = this.POP_TIME;

    this.bubbles.forEach(b => {
      if (!b.popped || b.t < 0) {
        ctx.drawImage(this.sprite, b.x - half, b.y - half, D * 1.5, D * 1.5);
        return;
      }
      const t = Math.min(1, b.t / T);
      // 납작해진 비닐
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.min(1, t * 2.5);
      ctx.drawImage(this.popSprites[b.v], -half, -half, D * 1.5, D * 1.5);
      ctx.restore();
      if (t >= 1) return;

      // 꺼지는 돔: 눌리면서 옆으로 퍼짐
      const e = Math.min(1, t / 0.35);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 0.45);
      ctx.translate(b.x, b.y);
      ctx.scale(1 + 0.14 * e, 1 - 0.38 * e);
      ctx.drawImage(this.sprite, -half, -half, D * 1.5, D * 1.5);
      ctx.restore();

      // 펑 터지는 선 + 공기 링
      const ee = 1 - Math.pow(1 - t, 3);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - t)})`;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = b.rot + i / 7 * Math.PI * 2;
        const r1 = b.r * (0.75 + 0.55 * ee);
        const r2 = b.r * (1 + 0.75 * ee);
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * (1 - t)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * (0.9 + 0.8 * ee), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  },

  // 비닐 판
  drawSheet(ctx) {
    const s = this.sheet;
    ctx.save();
    ctx.shadowColor = 'rgba(30,50,90,.25)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 18);
    const gr = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
    gr.addColorStop(0, 'rgba(255,255,255,.42)');
    gr.addColorStop(0.5, 'rgba(225,238,252,.28)');
    gr.addColorStop(1, 'rgba(255,255,255,.38)');
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.stroke();
    ctx.clip();
    // 비닐 광택 줄
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 40;
    for (let x = s.x - s.h; x < s.x + s.w; x += 180) {
      ctx.beginPath();
      ctx.moveTo(x, s.y + s.h);
      ctx.lineTo(x + s.h, s.y);
      ctx.stroke();
    }
    ctx.restore();
  }
};

document.addEventListener('DOMContentLoaded', () => { bubbleCode.init(); });
