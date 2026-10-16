// 좌표는 공 반지름을 1로 둔 정규화 좌표(공 중심 = 0,0)로 계산하고 그릴 때 R만큼 키움
const wakpuCode = {
  canvas: null,
  ctx: null,
  w: 0,
  h: 0,
  dpr: 1,
  R: 0,
  cx: 0,
  cy: 0,
  mode: 'shell', // shell: 왁스 깨는 중 / mallang: 다 깨져서 말랑이
  pieces: [],
  cracks: [],
  chips: [],
  shellImg: null,
  squash: { x: 0, v: 0 },
  nudge: { x: 0, y: 0, vx: 0, vy: 0 },
  blob: { n: 64, d: [], v: [] },
  press: null,
  dent: { x: 0, y: 0, depth: 0 },
  lastTime: 0,

  init() {
    this.canvas = document.querySelector('.play__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.bindEvents();
    this.resize();
    this.reset();
    requestAnimationFrame(t => this.loop(t));
  },

  bindEvents() {
    commonCode.on(window, 'resize.wakpu', () => this.resize());
    commonCode.on(this.canvas, 'pointerdown.wakpu', e => this.onDown(e));
    commonCode.on(this.canvas, 'pointermove.wakpu', e => this.onMove(e));
    commonCode.on(this.canvas, 'pointerup.wakpu', e => this.onUp(e));
    commonCode.on(this.canvas, 'pointercancel.wakpu', e => this.onUp(e));
    commonCode.on(document.querySelector('.play__btn--reset'), 'click.wakpu', () => this.reset());
  },

  resize() {
    const s = commonCode.fitCanvas(this.canvas);
    this.w = s.w;
    this.h = s.h;
    this.dpr = s.dpr;
    this.R = Math.min(this.w * 0.38, this.h * 0.32, 240);
    this.cx = this.w / 2;
    this.cy = this.h * 0.45;
    this.makeShellImg();
  },

  reset() {
    this.mode = 'shell';
    this.makePieces();
    this.cracks = [];
    this.chips = [];
    this.press = null;
    this.dent.depth = 0;
    for (let i = 0; i < this.blob.n; i++) {
      this.blob.d[i] = 0;
      this.blob.v[i] = 0;
    }
    this.squash.v += 6;
    this.updateInfo();
  },

  // ===== 만들기 =====
  // 왁스 껍질 텍스처 (반짝이 + 마블 + 광택)
  makeShellImg() {
    const r = commonCode.rand;
    const size = Math.ceil(this.R * 2.1 * this.dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const k = size / 2.1;
    g.setTransform(k, 0, 0, k, size / 2, size / 2);
    g.beginPath();
    g.arc(0, 0, 1.005, 0, Math.PI * 2);
    g.clip();

    let gr = g.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.05);
    gr.addColorStop(0, '#fff3fa');
    gr.addColorStop(0.4, '#f6b3d6');
    gr.addColorStop(0.75, '#c49cf2');
    gr.addColorStop(1, '#8d78e0');
    g.fillStyle = gr;
    g.fillRect(-1.1, -1.1, 2.2, 2.2);

    [['140,230,255', 0.5, 0.3, 0.5], ['255,236,150', -0.45, 0.45, 0.42], ['170,255,210', 0.25, -0.6, 0.36], ['255,170,210', -0.6, -0.1, 0.3]].forEach(([col, x, y, rr]) => {
      const m = g.createRadialGradient(x, y, 0, x, y, rr);
      m.addColorStop(0, `rgba(${col},.55)`);
      m.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = m;
      g.fillRect(-1.1, -1.1, 2.2, 2.2);
    });

    for (let i = 0; i < 340; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random());
      const s = r(0.004, 0.012);
      g.fillStyle = Math.random() < 0.7 ? `rgba(255,255,255,${r(0.4, 0.95)})` : `rgba(255,214,120,${r(0.5, 0.9)})`;
      g.fillRect(Math.cos(a) * d - s / 2, Math.sin(a) * d - s / 2, s, s);
    }

    gr = g.createRadialGradient(0, 0, 0.55, 0, 0, 1.005);
    gr.addColorStop(0, 'rgba(60,20,90,0)');
    gr.addColorStop(1, 'rgba(60,20,90,.3)');
    g.fillStyle = gr;
    g.fillRect(-1.1, -1.1, 2.2, 2.2);

    g.save();
    g.translate(-0.38, -0.46);
    g.rotate(-0.6);
    g.scale(1, 0.55);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.34);
    gr.addColorStop(0, 'rgba(255,255,255,.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 0.34, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath();
    g.arc(-0.12, -0.66, 0.04, 0, Math.PI * 2);
    g.fill();

    this.shellImg = c;
  },

  // 껍질을 3겹 링 x 여러 조각으로 나눔. 경계선은 같은 함수에서 샘플링해서 조각끼리 빈틈없이 맞물림
  makePieces() {
    const r = commonCode.rand;
    const TAU = Math.PI * 2;
    const rings = [0, 0.36, 0.69, 1];
    const secs = [5, 9, 14];
    const ph = [0, r(0, TAU), r(0, TAU), 0];
    const center = { x: r(-0.05, 0.05), y: r(-0.05, 0.05) };
    const bound = (i, a) => {
      if (i === 0 || i === 3) return rings[i];
      return rings[i] + 0.035 * Math.sin(3 * a + ph[i]) + 0.025 * Math.sin(7 * a + ph[i] * 2);
    };
    const arc = (i, a0, a1) => {
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.06));
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const a = a0 + (a1 - a0) * k / n;
        const d = bound(i, a);
        pts.push([Math.cos(a) * d, Math.sin(a) * d]);
      }
      return pts;
    };

    this.pieces = [];
    for (let ring = 0; ring < 3; ring++) {
      const n = secs[ring];
      const step = TAU / n;
      const off = r(0, step);
      const edges = [];
      for (let j = 0; j < n; j++) {
        const ain = off + j * step + r(-0.28, 0.28) * step;
        edges.push({ ain, aout: ain + r(-0.18, 0.18) * step });
      }
      for (let j = 0; j < n; j++) {
        const e1 = edges[j];
        const e2 = edges[(j + 1) % n];
        const wrap = j === n - 1 ? TAU : 0;
        const inner = ring === 0 ? [[center.x, center.y]] : arc(ring, e1.ain, e2.ain + wrap);
        const outer = arc(ring + 1, e2.aout + wrap, e1.aout);
        const poly = inner.concat(outer);
        const c = poly.reduce((s, p) => ({ x: s.x + p[0] / poly.length, y: s.y + p[1] / poly.length }), { x: 0, y: 0 });
        this.pieces.push({ poly, c, hp: r(1.6, 2.8), dmg: 0, on: true, fall: null });
      }
    }
  },

  // ===== 입력 =====
  toLocal(e) {
    const p = commonCode.pos(e, this.canvas);
    return { x: (p.x - this.cx) / this.R, y: (p.y - this.cy) / this.R };
  },

  onDown(e) {
    const p = this.toLocal(e);
    if (Math.hypot(p.x, p.y) > 1.12) return;
    commonCode.hideHint();
    if (this.mode === 'shell') {
      this.hit(p);
      return;
    }
    if (this.press) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.press = { id: e.pointerId, x: p.x, y: p.y, depth: this.dent.depth, moved: 0 };
    soundCode.sherbet(1);
    commonCode.vibrate(10);
  },

  onMove(e) {
    if (!this.press || e.pointerId !== this.press.id) return;
    const p = this.toLocal(e);
    const len = Math.hypot(p.x, p.y);
    if (len > 0.9) {
      p.x *= 0.9 / len;
      p.y *= 0.9 / len;
    }
    const dx = p.x - this.press.x;
    const dy = p.y - this.press.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.001) this.kick(Math.atan2(dy, dx), dist * 2.5);
    this.press.x = p.x;
    this.press.y = p.y;
    this.press.moved += dist;
    if (this.press.moved > 0.3) {
      this.press.moved = 0;
      soundCode.sherbet(0.45, 0.15);
    }
  },

  onUp(e) {
    if (!this.press || e.pointerId !== this.press.id) return;
    this.dent.x = this.press.x;
    this.dent.y = this.press.y;
    this.dent.depth = this.press.depth;
    this.squash.v -= 4 * this.press.depth;
    this.press = null;
    soundCode.sherbet(0.5, 0.25);
  },

  // ===== 왁스 깨기 =====
  hit(p) {
    const alive = this.pieces.filter(pc => pc.on);
    if (!alive.length) return;
    let target = alive.find(pc => this.inPoly(p, pc.poly));
    const onPiece = !!target;
    if (!target) target = alive.reduce((a, b) => (this.dist(p, a.c) < this.dist(p, b.c) ? a : b));
    // 구멍 난 곳을 눌렀으면 가장 가까운 조각 쪽에서 금이 감
    const start = onPiece ? p : { x: p.x + (target.c.x - p.x) * 0.7, y: p.y + (target.c.y - p.y) * 0.7 };

    target.dmg += 1;
    alive.forEach(pc => {
      if (pc !== target && this.dist(pc.c, start) < 0.4) pc.dmg += 0.35;
    });
    this.addCracks(start, 2 + Math.floor(Math.random() * 3));

    const broken = alive.filter(pc => pc.dmg >= pc.hp);
    broken.forEach(pc => this.detach(pc, start));
    this.addChips(start, broken.length ? 12 : 5);

    this.squash.v += 5 + broken.length * 2;
    this.nudge.vx -= start.x * 0.6;
    this.nudge.vy -= start.y * 0.6;
    soundCode.crunch(broken.length ? Math.min(1, 0.55 + broken.length * 0.15) : commonCode.rand(0.15, 0.35));
    commonCode.vibrate(broken.length ? 20 : 8);
    this.updateInfo();

    if (!this.pieces.some(pc => pc.on)) setTimeout(() => this.complete(), 350);
  },

  addCracks(start, count) {
    const r = commonCode.rand;
    const grow = (from, ang, len, depth) => {
      const pts = [[from.x, from.y]];
      let x = from.x;
      let y = from.y;
      let a = ang;
      const steps = Math.ceil(len / 0.03);
      for (let i = 0; i < steps; i++) {
        a += r(-0.45, 0.45);
        x += Math.cos(a) * 0.03;
        y += Math.sin(a) * 0.03;
        if (Math.hypot(x, y) > 1.02) break;
        pts.push([x, y]);
        if (depth < 2 && Math.random() < 0.12) grow({ x, y }, a + r(-1.2, 1.2), len * 0.5, depth + 1);
      }
      if (pts.length > 1) this.cracks.push({ pts, w: depth ? 0.006 : 0.009 });
    };
    for (let i = 0; i < count; i++) grow(start, r(0, Math.PI * 2), r(0.12, 0.3), 0);
    if (this.cracks.length > 260) this.cracks.splice(0, this.cracks.length - 260);
  },

  detach(pc, from) {
    const r = commonCode.rand;
    pc.on = false;
    const dx = pc.c.x - from.x;
    const dy = pc.c.y - from.y;
    const l = Math.hypot(dx, dy) || 1;
    pc.fall = {
      x: 0,
      y: 0,
      vx: dx / l * r(0.4, 0.9) + pc.c.x * 0.6,
      vy: dy / l * 0.3 - r(0.4, 0.9),
      r: 0,
      vr: r(-4, 4),
      landed: false,
      t: 0,
      alpha: 1
    };
  },

  addChips(at, count) {
    const r = commonCode.rand;
    const colors = ['#f7b8d9', '#c79cf0', '#ffffff', '#ffd6ec', '#b5e8ff'];
    for (let i = 0; i < count; i++) {
      this.chips.push({
        x: at.x,
        y: at.y,
        vx: r(-1, 1),
        vy: r(-1.5, -0.3),
        r: r(0, 6),
        vr: r(-10, 10),
        s: r(0.012, 0.032),
        col: colors[Math.floor(Math.random() * colors.length)],
        life: r(1, 1.8)
      });
    }
  },

  complete() {
    if (this.mode !== 'shell' || this.pieces.some(pc => pc.on)) return;
    this.mode = 'mallang';
    for (let i = 0; i < this.blob.n; i++) this.blob.v[i] += commonCode.rand(-1.4, 1.4);
    this.squash.v += 12;
    soundCode.mallang();
    commonCode.vibrate([20, 40, 20]);
    commonCode.toast('말랑이 완성! 꾹꾹 눌러보세요');
    this.updateInfo();
  },

  updateInfo() {
    const fill = document.querySelector('.play__info-fill');
    const text = document.querySelector('.play__info-text');
    const gone = this.pieces.filter(pc => !pc.on).length;
    const per = Math.round(gone / this.pieces.length * 100);
    if (fill) fill.style.width = per + '%';
    if (text) text.textContent = this.mode === 'mallang' ? '말랑!' : per + '%';
  },

  // 드래그 방향으로 말랑이 출렁
  kick(angle, amt) {
    const b = this.blob;
    for (let i = 0; i < b.n; i++) {
      const a = i / b.n * Math.PI * 2;
      b.v[i] += Math.cos(commonCode.angDiff(a, angle)) * amt;
    }
  },

  // ===== 갱신 =====
  loop(t) {
    const dt = Math.min(0.033, (t - (this.lastTime || t)) / 1000);
    this.lastTime = t;
    this.update(dt);
    this.draw();
    requestAnimationFrame(tt => this.loop(tt));
  },

  update(dt) {
    // 공 전체 눌림/흔들림 스프링
    const sq = this.squash;
    sq.v += (-220 * sq.x - 9 * sq.v) * dt;
    sq.x += sq.v * dt;
    const nd = this.nudge;
    nd.vx += (-160 * nd.x - 11 * nd.vx) * dt;
    nd.vy += (-160 * nd.y - 11 * nd.vy) * dt;
    nd.x += nd.vx * dt;
    nd.y += nd.vy * dt;

    this.updateBlob(dt);

    if (!this.press && this.dent.depth > 0) this.dent.depth = Math.max(0, this.dent.depth - dt * 2.5);

    const floor = Math.min(1.14, (this.h - this.cy) / this.R - 0.05);
    this.pieces.forEach(pc => {
      const f = pc.fall;
      if (!f || f.alpha <= 0) return;
      if (!f.landed) {
        f.vy += 4.2 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.r += f.vr * dt;
        if (pc.c.y + f.y > floor && f.vy > 0) {
          f.y = floor - pc.c.y;
          if (!f.t) soundCode.tick();
          f.t = 0.001;
          f.vy *= -0.3;
          f.vx *= 0.55;
          f.vr *= 0.5;
          if (Math.abs(f.vy) < 0.25) f.landed = true;
        }
      } else {
        f.t += dt;
        if (f.t > 3) f.alpha -= dt * 0.8;
      }
    });

    this.chips = this.chips.filter(ch => {
      ch.vy += 4.2 * dt;
      ch.x += ch.vx * dt;
      ch.y += ch.vy * dt;
      ch.r += ch.vr * dt;
      if (ch.y > floor && ch.vy > 0) {
        ch.y = floor;
        ch.vy *= -0.35;
        ch.vx *= 0.6;
        ch.vr *= 0.5;
      }
      ch.life -= dt;
      return ch.life > 0;
    });
  },

  // 말랑이 외곽을 점 64개 스프링으로 만들어 출렁이게 함
  updateBlob(dt) {
    const b = this.blob;
    const n = b.n;
    const pr = this.press;
    if (pr) pr.depth += (1 - pr.depth) * Math.min(1, dt * 5);
    const pd = pr ? pr.depth : 0;
    const pa = pr ? Math.atan2(pr.y, pr.x) : 0;
    const pm = pr ? Math.min(1, Math.hypot(pr.x, pr.y)) : 0;
    const acc = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const diff = commonCode.angDiff(a, pa);
      const target = pd * (0.06 + 0.1 * pm * Math.exp(-diff * diff / 0.5));
      const lap = b.d[(i + n - 1) % n] + b.d[(i + 1) % n] - 2 * b.d[i];
      acc[i] = (target - b.d[i]) * 140 - b.v[i] * 3.5 + lap * 80;
    }
    for (let i = 0; i < n; i++) {
      b.v[i] += acc[i] * dt;
      b.d[i] += b.v[i] * dt;
    }
  },

  // ===== 그리기 =====
  draw() {
    const ctx = this.ctx;
    const R = this.R;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // 바닥 그림자
    const sh = ctx.createRadialGradient(this.cx, this.cy + R * 1.06, 0, this.cx, this.cy + R * 1.06, R * 0.8);
    sh.addColorStop(0, 'rgba(90,50,120,.22)');
    sh.addColorStop(1, 'rgba(90,50,120,0)');
    ctx.save();
    ctx.translate(this.cx, this.cy + R * 1.06);
    ctx.scale(1, 0.14);
    ctx.translate(-this.cx, -(this.cy + R * 1.06));
    ctx.fillStyle = sh;
    ctx.fillRect(this.cx - R, this.cy + R * 0.2, R * 2, R * 1.8);
    ctx.restore();

    // 공 (눌림 스프링 적용)
    const sq = this.squash.x;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.cx + this.nudge.x * R, this.cy + this.nudge.y * R);
    ctx.scale(R * (1 - 0.05 * sq), R * (1 - 0.07 * sq));
    this.drawBall(ctx);
    this.drawShell(ctx);

    // 떨어지는 조각, 부스러기
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.cx, this.cy);
    ctx.scale(R, R);
    this.pieces.forEach(pc => { if (pc.fall && pc.fall.alpha > 0) this.drawPiece(ctx, pc); });
    this.chips.forEach(ch => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ch.life * 2);
      ctx.translate(ch.x, ch.y);
      ctx.rotate(ch.r);
      ctx.fillStyle = ch.col;
      ctx.beginPath();
      ctx.moveTo(-ch.s, -ch.s * 0.6);
      ctx.lineTo(ch.s, -ch.s * 0.2);
      ctx.lineTo(-ch.s * 0.2, ch.s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  },

  blobPath(ctx) {
    const b = this.blob;
    const n = b.n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const d = 0.975 + b.d[i];
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    ctx.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const s = mid(pts[n - 1], pts[0]);
    ctx.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i], pts[(i + 1) % n]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    ctx.closePath();
  },

  // 속 말랑이
  drawBall(ctx) {
    const gr = ctx.createRadialGradient(-0.3, -0.35, 0.05, 0, 0, 1.05);
    gr.addColorStop(0, '#fffdf3');
    gr.addColorStop(0.45, '#ffe9b0');
    gr.addColorStop(0.8, '#ffc98a');
    gr.addColorStop(1, '#f5a76c');
    this.blobPath(ctx);
    ctx.fillStyle = gr;
    ctx.fill();

    ctx.save();
    ctx.clip();
    if (this.mode === 'mallang') {
      const pr = this.press;
      const d = pr ? { x: pr.x, y: pr.y, depth: pr.depth } : this.dent;
      if (d.depth > 0.01) this.drawDent(ctx, d.x, d.y, d.depth);
    }
    ctx.save();
    ctx.translate(-0.36, -0.44);
    ctx.rotate(-0.6);
    ctx.scale(1, 0.55);
    const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.36);
    hl.addColorStop(0, 'rgba(255,255,255,.85)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(0, 0, 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 가장자리 음영 + 아래쪽 반사광
    const edge = ctx.createRadialGradient(0, 0, 0.6, 0, 0, 1.15);
    edge.addColorStop(0, 'rgba(210,110,50,0)');
    edge.addColorStop(1, 'rgba(210,110,50,.22)');
    ctx.fillStyle = edge;
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
    const rim = ctx.createRadialGradient(0.15, 0.95, 0, 0.15, 0.95, 0.45);
    rim.addColorStop(0, 'rgba(255,240,220,.45)');
    rim.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
    ctx.restore();
  },

  // 손가락으로 누른 자국
  drawDent(ctx, x, y, depth) {
    const r = 0.2 + 0.12 * depth;
    let gr = ctx.createRadialGradient(x - 0.04, y - 0.05, 0, x, y, r);
    gr.addColorStop(0, `rgba(190,95,40,${0.32 * depth})`);
    gr.addColorStop(1, 'rgba(190,95,40,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    gr = ctx.createRadialGradient(x + 0.06, y + 0.08, 0, x + 0.06, y + 0.08, r * 0.55);
    gr.addColorStop(0, `rgba(255,255,255,${0.5 * depth})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x + 0.06, y + 0.08, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // 눌린 자리 둘레가 살짝 부풀어 오른 테두리
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, Math.PI * 0.9, Math.PI * 1.75);
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * depth})`;
    ctx.lineWidth = 0.025;
    ctx.lineCap = 'round';
    ctx.stroke();
  },

  polyPath(ctx, poly, skipRim) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + poly.length - 1) % poly.length];
      // 공 바깥 테두리 부분은 선을 안 그림 (skipRim)
      const rim = skipRim && Math.hypot(p[0], p[1]) > 0.99 && Math.hypot(q[0], q[1]) > 0.99;
      if (i === 0 || rim) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    if (!skipRim) ctx.closePath();
    else {
      const p = poly[0];
      const q = poly[poly.length - 1];
      if (!(Math.hypot(p[0], p[1]) > 0.99 && Math.hypot(q[0], q[1]) > 0.99)) ctx.lineTo(p[0], p[1]);
    }
  },

  // 남아 있는 껍질 (조각들을 한 번에 클립해서 이음새 없이 그림)
  drawShell(ctx) {
    const alive = this.pieces.filter(pc => pc.on);
    if (!alive.length) return;
    ctx.save();
    ctx.beginPath();
    alive.forEach(pc => this.polyPath(ctx, pc.poly, false));
    ctx.shadowColor = 'rgba(80,30,70,.35)';
    ctx.shadowBlur = 10 * this.dpr;
    ctx.shadowOffsetY = 2 * this.dpr;
    ctx.fillStyle = '#e4b0e0';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.drawImage(this.shellImg, -1.05, -1.05, 2.1, 2.1);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 깨져 나간 자리 단면 (왁스 두께)
    this.pieces.forEach(pc => {
      if (pc.on) return;
      ctx.beginPath();
      this.polyPath(ctx, pc.poly, false);
      ctx.strokeStyle = 'rgba(255,240,250,.85)';
      ctx.lineWidth = 0.034;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(130,70,150,.4)';
      ctx.lineWidth = 0.008;
      ctx.stroke();
    });
    // 금 간 조각 테두리
    alive.forEach(pc => {
      // 충격이 어느 정도 쌓인 조각만 테두리 금이 드러남
      const a = commonCode.clamp((pc.dmg / pc.hp - 0.3) / 0.6, 0, 1);
      if (a <= 0) return;
      ctx.beginPath();
      this.polyPath(ctx, pc.poly, true);
      ctx.strokeStyle = `rgba(90,40,100,${0.7 * a})`;
      ctx.lineWidth = 0.008;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * a})`;
      ctx.lineWidth = 0.004;
      ctx.translate(0.004, 0.005);
      ctx.stroke();
      ctx.translate(-0.004, -0.005);
    });
    // 금
    this.cracks.forEach(cr => {
      ctx.beginPath();
      cr.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = 'rgba(80,30,90,.55)';
      ctx.lineWidth = cr.w;
      ctx.stroke();
      ctx.translate(0.004, 0.005);
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = cr.w * 0.55;
      ctx.stroke();
      ctx.translate(-0.004, -0.005);
    });
    ctx.restore();
  },

  // 떨어지는 껍질 조각 (두께 + 텍스처)
  drawPiece(ctx, pc) {
    const f = pc.fall;
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.alpha);
    ctx.translate(pc.c.x + f.x, pc.c.y + f.y);
    ctx.rotate(f.r);
    ctx.translate(-pc.c.x, -pc.c.y);
    ctx.save();
    ctx.translate(0.012, 0.022);
    ctx.beginPath();
    this.polyPath(ctx, pc.poly, false);
    ctx.fillStyle = '#9a7bd6';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    this.polyPath(ctx, pc.poly, false);
    ctx.save();
    ctx.clip();
    ctx.drawImage(this.shellImg, -1.05, -1.05, 2.1, 2.1);
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 0.008;
    ctx.stroke();
    ctx.restore();
  },

  // ===== 유틸 =====
  inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  },

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
};

document.addEventListener('DOMContentLoaded', () => { wakpuCode.init(); });
