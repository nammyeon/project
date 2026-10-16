// 슬라임 = 하나로 이어진 삼각형 그물(메시) + 위치 기반 물리(PBD)
// - 모든 점이 삼각형으로 서로 이어져 있어서 절대 구멍이 나거나 실처럼 갈라지지 않음
// - 삼각형마다 '면적'을 지키게 해서, 길게 늘이면 그만큼 가늘어짐 (치즈처럼 쭈우욱)
// - 변 길이의 기준값이 늘어난 만큼 같이 늘어나서(소성) 놓아도 원래대로 안 돌아감
// - 화면: GPU가 메시를 화면 해상도 그대로 그리고 → 흐림으로 두께/돔 계산 → 픽셀마다 조명
const slimeCode = {
  canvas: null,
  ctx: null,
  w: 0,
  h: 0,
  dpr: 1,
  R0: 0,
  K: 12, // 동심원 고리 수 (점 469개, 삼각형 864개)
  nv: 0,
  pos: null, // x, y
  prev: null,
  vel: null,
  orig: null,
  dent: null,
  held: null,
  hold: [],
  tris: null,
  triA0: null,
  edges: null,
  edgeL0: null,
  edgeLo: null,
  vbuf: null,
  pointer: null,
  balloons: [],
  rings: [],
  decor: [],
  gathering: 0,
  maxStretch: 1,
  lastTime: 0,
  stepAcc: 0,
  color: 'pink',
  palettes: {
    pink: { light: [255, 232, 242], base: [255, 150, 196], dark: [205, 78, 140] },
    mint: { light: [228, 252, 244], base: [126, 222, 194], dark: [40, 160, 125] },
    lavender: { light: [242, 236, 255], base: [182, 158, 245], dark: [112, 82, 205] },
    sky: { light: [230, 244, 255], base: [136, 196, 255], dark: [60, 130, 215] }
  },
  // 물리 상수
  DAMP: 0.88, // 바닥 마찰 (작을수록 금방 멈춤)
  ITER: 4,
  TENSION: 0.08,
  FRICTION: 0.3, // 바닥에 달라붙는 정도 (작을수록 몸통은 제자리, 당긴 쪽만 늘어남)
  EDGE_K: 0.4,
  AREA_K: 0.9,
  YIELD: 0.03, // 이만큼 넘게 늘면 소성 변형 시작
  PLASTIC: 0.9, // 기준 길이가 따라오는 속도
  // 렌더 상수
  SLOPE: 40,

  init() {
    this.canvas = document.querySelector('.play__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.initGL();
    this.bindEvents();
    this.resize();
    this.build();
    requestAnimationFrame(t => this.loop(t));
  },

  bindEvents() {
    commonCode.on(window, 'resize.slime', () => this.resize());
    commonCode.on(this.canvas, 'pointerdown.slime', e => this.onDown(e));
    commonCode.on(this.canvas, 'pointermove.slime', e => this.onMove(e));
    commonCode.on(this.canvas, 'pointerup.slime', e => this.onUp(e));
    commonCode.on(this.canvas, 'pointercancel.slime', e => this.onUp(e));
    commonCode.on(document.querySelector('.play__btn--reset'), 'click.slime', () => this.gather());
    document.querySelectorAll('.play__color').forEach(btn => {
      commonCode.on(btn, 'click.slime', () => this.setColor(btn.dataset.color));
    });
  },

  resize() {
    const s = commonCode.fitCanvas(this.canvas);
    this.w = s.w;
    this.h = s.h;
    this.dpr = s.dpr;
    if (this.gl) this.resizeGL();
  },

  // ===== 메시 만들기: 가운데 점 + 동심원 고리(k번째 고리에 6k개), 고리 사이를 지퍼처럼 삼각형으로 엮음 =====
  build() {
    const K = this.K;
    this.R0 = commonCode.clamp(Math.min(this.w, this.h) * 0.27, 80, 200);
    const dr = this.R0 / K;
    const cx = this.w / 2;
    const cy = this.h * 0.45;
    const pts = [[cx, cy]];
    const ring = [[0]];
    for (let k = 1; k <= K; k++) {
      const n = 6 * k;
      const idx = [];
      for (let j = 0; j < n; j++) {
        const a = j / n * Math.PI * 2;
        idx.push(pts.length);
        pts.push([cx + Math.cos(a) * k * dr, cy + Math.sin(a) * k * dr]);
      }
      ring.push(idx);
    }
    const tris = [];
    const r1 = ring[1];
    for (let j = 0; j < r1.length; j++) tris.push([0, r1[j], r1[(j + 1) % r1.length]]);
    for (let k = 1; k < K; k++) {
      const A = ring[k];
      const B = ring[k + 1];
      let i = 0;
      let j = 0;
      while (i < A.length || j < B.length) {
        if (i < A.length && (j >= B.length || (i + 1) / A.length < (j + 1) / B.length)) {
          tris.push([A[i], B[j % B.length], A[(i + 1) % A.length]]);
          i++;
        } else {
          tris.push([A[i % A.length], B[j], B[(j + 1) % B.length]]);
          j++;
        }
      }
    }

    const nv = pts.length;
    this.nv = nv;
    this.pos = new Float32Array(nv * 2);
    this.prev = new Float32Array(nv * 2);
    this.vel = new Float32Array(nv * 2);
    this.orig = new Float32Array(nv * 2);
    this.dent = new Float32Array(nv);
    this.held = new Uint8Array(nv);
    pts.forEach((p, i) => {
      this.pos[i * 2] = this.orig[i * 2] = p[0];
      this.pos[i * 2 + 1] = this.orig[i * 2 + 1] = p[1];
    });

    // 삼각형 방향을 통일하고 원래 면적 저장
    this.tris = new Uint16Array(tris.length * 3);
    this.triA0 = new Float32Array(tris.length);
    const edgeSet = new Map();
    tris.forEach((t, k) => {
      if (this.area(t[0], t[1], t[2]) < 0) t = [t[0], t[2], t[1]];
      this.tris.set(t, k * 3);
      this.triA0[k] = this.area(t[0], t[1], t[2]);
      [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(([a, b]) => {
        const key = Math.min(a, b) * 65536 + Math.max(a, b);
        if (!edgeSet.has(key)) edgeSet.set(key, [Math.min(a, b), Math.max(a, b)]);
      });
    });
    const edges = [...edgeSet.values()];
    this.edges = new Uint16Array(edges.length * 2);
    this.edgeL0 = new Float32Array(edges.length);
    this.edgeLo = new Float32Array(edges.length);
    edges.forEach((e, k) => {
      this.edges[k * 2] = e[0];
      this.edges[k * 2 + 1] = e[1];
      this.edgeL0[k] = this.edgeLo[k] = this.len(e[0], e[1]);
    });

    // 반짝이 / 공기방울은 메시 점에 붙여서 같이 움직임
    const r = commonCode.rand;
    this.decor = [];
    // 가장자리 고리 점에는 안 붙임 (밖으로 삐져나오지 않게)
    for (let i = 1; i < nv - 6 * K; i++) {
      if (Math.random() < 0.06) this.decor.push({ v: i, air: r(1.5, 3.5), dx: r(-dr * 0.4, dr * 0.4), dy: r(-dr * 0.4, dr * 0.4) });
      else if (Math.random() < 0.2) this.decor.push({ v: i, sz: r(0.8, 1.8), al: r(0.3, 0.75), dx: r(-dr * 0.5, dr * 0.5), dy: r(-dr * 0.5, dr * 0.5) });
    }
    this.vbuf = new Float32Array(nv * 3);
    if (this.gl) this.uploadIndices();
  },

  area(a, b, c) {
    const p = this.pos;
    return 0.5 * ((p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]) - (p[c * 2] - p[a * 2]) * (p[b * 2 + 1] - p[a * 2 + 1]));
  },

  len(a, b) {
    const p = this.pos;
    return Math.hypot(p[b * 2] - p[a * 2], p[b * 2 + 1] - p[a * 2 + 1]);
  },

  // ===== 입력 =====
  fingerR() {
    return this.R0 * 0.2;
  },

  // 점이 슬라임 위인지 (삼각형 안에 있는지)
  onSlime(x, y) {
    const p = this.pos;
    const t = this.tris;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 2;
      const b = t[k + 1] * 2;
      const c = t[k + 2] * 2;
      const d1 = (x - p[b]) * (p[a + 1] - p[b + 1]) - (p[a] - p[b]) * (y - p[b + 1]);
      const d2 = (x - p[c]) * (p[b + 1] - p[c + 1]) - (p[b] - p[c]) * (y - p[c + 1]);
      const d3 = (x - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (y - p[a + 1]);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) return true;
    }
    // 아주 가늘게 늘어난 가닥은 근처만 눌러도 잡히게
    return this.nearest(x, y).d < 12;
  },

  nearest(x, y) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.nv; i++) {
      const d = (this.pos[i * 2] - x) ** 2 + (this.pos[i * 2 + 1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { i: best, d: Math.sqrt(bd) };
  },

  balloonPos(b) {
    return { x: this.pos[b.v * 2] + b.ox, y: this.pos[b.v * 2 + 1] + b.oy };
  },

  balloonAt(x, y) {
    return this.balloons.find(b => {
      const p = this.balloonPos(b);
      return Math.hypot(p.x - x, p.y - y) < b.r;
    });
  },

  onDown(e) {
    if (this.pointer) return;
    const p = commonCode.pos(e, this.canvas);
    // 부풀어 있는 바풍을 누르면 팡
    const b = this.balloonAt(p.x, p.y);
    if (b && !b.inflating) {
      commonCode.hideHint();
      this.popBalloon(b);
      return;
    }
    if (!this.onSlime(p.x, p.y)) return;
    commonCode.hideHint();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointer = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: 0, mode: 'poke', depth: 0.45, moved: 0, time: performance.now(), speed: 0, balloon: null };
    this.poke(p.x, p.y, 0.45, true);
    soundCode.chew(0.85);
    commonCode.vibrate(10);
  },

  onMove(e) {
    const pt = this.pointer;
    if (!pt || e.pointerId !== pt.id) return;
    const p = commonCode.pos(e, this.canvas);
    const now = performance.now();
    const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
    const dt = Math.max(4, now - pt.time) / 1000;
    pt.speed = pt.speed * 0.5 + (dist / dt) * 0.5;
    pt.time = now;
    pt.x = p.x;
    pt.y = p.y;
    pt.moved = Math.max(pt.moved, Math.hypot(p.x - pt.sx, p.y - pt.sy));
    if (pt.mode === 'balloon' && pt.moved > 16) {
      // 부풀리다가 움직이면 거기서 멈추고 바풍은 그대로 남김
      pt.balloon.inflating = false;
      pt.mode = 'idle';
    }
    if (pt.mode === 'poke' && pt.moved > 10) this.startDrag();
  },

  onUp(e) {
    const pt = this.pointer;
    if (!pt || e.pointerId !== pt.id) return;
    this.hold.forEach(h => { this.held[h.i] = 0; });
    this.hold = [];
    soundCode.stretchStop();
    if (pt.mode === 'balloon') {
      pt.balloon.inflating = false;
      soundCode.chew(0.5);
    } else {
      soundCode.unstick(pt.mode === 'drag' ? 0.7 : 0.4 + pt.depth * 0.5);
    }
    this.pointer = null;
  },

  // 손가락 밑 점들을 잡아서 끌고 감
  startDrag() {
    const pt = this.pointer;
    pt.mode = 'drag';
    const gr = this.fingerR();
    this.hold = [];
    for (let i = 0; i < this.nv; i++) {
      const dx = this.pos[i * 2] - pt.x;
      const dy = this.pos[i * 2 + 1] - pt.y;
      const d = Math.hypot(dx, dy);
      if (d >= gr) continue;
      this.held[i] = 1;
      this.hold.push({ i, ox: dx, oy: dy });
    }
    if (!this.hold.length) {
      const nn = this.nearest(pt.x, pt.y);
      this.held[nn.i] = 1;
      this.hold.push({ i: nn.i, ox: 0, oy: 0 });
    }
    soundCode.stretchStart();
  },

  // 손가락으로 누르기: 자국 + 살짝 퍼짐
  poke(x, y, depth, push) {
    const fr = this.fingerR();
    for (let i = 0; i < this.nv; i++) {
      const dx = this.pos[i * 2] - x;
      const dy = this.pos[i * 2 + 1] - y;
      const d = Math.hypot(dx, dy);
      if (d >= fr) continue;
      const k = 1 - d / fr;
      this.dent[i] = Math.max(this.dent[i], depth * Math.pow(k, 0.8));
      if (push && d > 0.01) {
        this.pos[i * 2] += dx / d * fr * 0.08 * k;
        this.pos[i * 2 + 1] += dy / d * fr * 0.08 * k;
      }
    }
  },

  // ===== 바풍 =====
  startBalloon() {
    const pt = this.pointer;
    pt.mode = 'balloon';
    const nn = this.nearest(pt.x, pt.y);
    const b = { v: nn.i, ox: pt.x - this.pos[nn.i * 2], oy: pt.y - this.pos[nn.i * 2 + 1], r: this.fingerR() * 0.5, max: this.R0 * 0.7, inflating: true, creak: 0 };
    pt.balloon = b;
    this.balloons.push(b);
    // 공기가 들어가면 눌렸던 자국은 펴짐
    const fr = this.fingerR();
    for (let i = 0; i < this.nv; i++) {
      if (Math.hypot(this.pos[i * 2] - pt.x, this.pos[i * 2 + 1] - pt.y) < fr * 1.2) this.dent[i] = 0;
    }
    if (this.balloons.length > 4) this.popBalloon(this.balloons[0]);
  },

  popBalloon(b) {
    this.balloons = this.balloons.filter(bb => bb !== b);
    if (this.pointer && this.pointer.balloon === b) this.pointer.mode = 'idle';
    const c = this.balloonPos(b);
    const reach = b.r * 1.6;
    for (let i = 0; i < this.nv; i++) {
      const dx = this.pos[i * 2] - c.x;
      const dy = this.pos[i * 2 + 1] - c.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const k = 1 - d / reach;
      this.vel[i * 2] += dx / d * 4 * k;
      this.vel[i * 2 + 1] += dy / d * 4 * k;
      if (d < b.r) this.dent[i] = Math.max(this.dent[i], 0.9 * (1 - d / b.r * 0.5));
    }
    this.rings.push({ x: c.x, y: c.y, r: b.r, t: 0 });
    soundCode.balloonPop(b.r / b.max);
    commonCode.vibrate(30);
  },

  // ===== 기타 =====
  setColor(color) {
    if (!this.palettes[color]) return;
    this.color = color;
    document.querySelectorAll('.play__color').forEach(btn => btn.classList.toggle('is-active', btn.dataset.color === color));
    soundCode.chew(0.6);
  },

  // 다시 뭉치기: 처음 동그란 모양으로 천천히 돌아감
  gather() {
    this.gathering = 1.2;
    this.balloons.slice().forEach(b => this.popBalloon(b));
    for (let i = 0; i < 5; i++) soundCode.chew(0.6, i * 0.14 + commonCode.rand(0, 0.04));
  },

  // ===== 시뮬레이션 =====
  loop(t) {
    const dt = Math.min(0.05, (t - (this.lastTime || t)) / 1000);
    this.lastTime = t;
    this.update(dt);
    this.stepAcc += dt;
    let steps = 0;
    while (this.stepAcc >= 1 / 120 && steps < 6) {
      this.step();
      this.stepAcc -= 1 / 120;
      steps++;
    }
    this.draw();
    requestAnimationFrame(tt => this.loop(tt));
  },

  update(dt) {
    const pt = this.pointer;
    if (pt) {
      pt.t += dt;
      pt.speed *= Math.exp(-dt * 6);
      if (pt.mode === 'poke') {
        // 가만히 누르고 있으면 점점 깊게 → 오래 누르면 바풍 시작
        pt.depth = Math.min(1, pt.depth + dt * 1.3);
        this.poke(pt.x, pt.y, pt.depth, false);
        if (pt.t > 0.5) this.startBalloon();
      }
      if (pt.mode === 'drag') soundCode.stretchUpdate(pt.speed, Math.min(1, (this.maxStretch - 1) / 8));
    }

    this.balloons.forEach(b => {
      if (b.inflating) {
        b.r += dt * b.max / 2.4;
        b.creak -= dt;
        if (b.creak <= 0) {
          b.creak = commonCode.rand(0.08, 0.16);
          soundCode.creak(b.r / b.max);
        }
        if (b.r >= b.max) this.popBalloon(b);
      } else {
        // 놔두면 천천히 바람이 빠짐
        b.r -= dt * 3;
        if (b.r < this.fingerR() * 0.3) {
          this.balloons = this.balloons.filter(bb => bb !== b);
          soundCode.click();
        }
      }
    });

    const heal = this.gathering > 0 ? 1.5 : 0.05;
    for (let i = 0; i < this.nv; i++) this.dent[i] = Math.max(0, this.dent[i] - dt * heal);
    if (this.gathering > 0) {
      this.gathering -= dt;
      if (this.gathering <= 0) {
        this.edgeL0.set(this.edgeLo);
        this.pos.set(this.orig);
        this.vel.fill(0);
      }
    }
    this.rings = this.rings.filter(r => (r.t += dt) < 0.35);
  },

  step() {
    const { pos, prev, vel, held, nv } = this;
    const pt = this.pointer;

    // 1) 예측 이동 (바닥 마찰로 금방 멈춤)
    for (let i = 0; i < nv; i++) {
      const x = i * 2;
      vel[x] *= this.DAMP;
      vel[x + 1] *= this.DAMP;
      prev[x] = pos[x];
      prev[x + 1] = pos[x + 1];
      pos[x] += vel[x];
      pos[x + 1] += vel[x + 1];
      if (this.gathering > 0) {
        pos[x] += (this.orig[x] - pos[x]) * 0.1;
        pos[x + 1] += (this.orig[x + 1] - pos[x + 1]) * 0.1;
      }
    }
    if (pt && this.hold.length) {
      this.hold.forEach(h => {
        pos[h.i * 2] += (pt.x + h.ox - pos[h.i * 2]) * 0.6;
        pos[h.i * 2 + 1] += (pt.y + h.oy - pos[h.i * 2 + 1]) * 0.6;
      });
    }

    // 2) 제약 풀기: 변 길이(소성) + 삼각형 면적(보존 → 늘이면 가늘어짐)
    const E = this.edges;
    const L0 = this.edgeL0;
    const T = this.tris;
    const A0 = this.triA0;
    for (let it = 0; it < this.ITER; it++) {
      for (let k = 0; k < L0.length; k++) {
        const a = E[k * 2];
        const b = E[k * 2 + 1];
        const wa = held[a] ? 0 : 1;
        const wb = held[b] ? 0 : 1;
        const ws = wa + wb;
        if (!ws) continue;
        const dx = pos[b * 2] - pos[a * 2];
        const dy = pos[b * 2 + 1] - pos[a * 2 + 1];
        const L = Math.hypot(dx, dy);
        if (L < 0.0001) continue;
        const c = this.EDGE_K * (L - L0[k]) / (L * ws);
        pos[a * 2] += wa * c * dx;
        pos[a * 2 + 1] += wa * c * dy;
        pos[b * 2] -= wb * c * dx;
        pos[b * 2 + 1] -= wb * c * dy;
      }
      for (let k = 0; k < A0.length; k++) {
        const a = T[k * 3];
        const b = T[k * 3 + 1];
        const c = T[k * 3 + 2];
        const ax = pos[a * 2];
        const ay = pos[a * 2 + 1];
        const bx = pos[b * 2];
        const by = pos[b * 2 + 1];
        const cx = pos[c * 2];
        const cy = pos[c * 2 + 1];
        const A = 0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
        const gax = 0.5 * (by - cy);
        const gay = 0.5 * (cx - bx);
        const gbx = 0.5 * (cy - ay);
        const gby = 0.5 * (ax - cx);
        const gcx = 0.5 * (ay - by);
        const gcy = 0.5 * (bx - ax);
        const wa = held[a] ? 0 : 1;
        const wb = held[b] ? 0 : 1;
        const wc = held[c] ? 0 : 1;
        const den = wa * (gax * gax + gay * gay) + wb * (gbx * gbx + gby * gby) + wc * (gcx * gcx + gcy * gcy);
        if (den < 0.000001) continue;
        const lam = -this.AREA_K * (A - A0[k]) / den;
        pos[a * 2] += wa * lam * gax;
        pos[a * 2 + 1] += wa * lam * gay;
        pos[b * 2] += wb * lam * gbx;
        pos[b * 2 + 1] += wb * lam * gby;
        pos[c * 2] += wc * lam * gcx;
        pos[c * 2 + 1] += wc * lam * gcy;
      }
    }

    // 표면장력: 가장자리 점을 양옆 점의 가운데 쪽으로 살짝 → 각진 모서리가 둥글어짐 (곧은 가닥은 그대로)
    const b0 = nv - 6 * this.K;
    const bn = 6 * this.K;
    for (let j = 0; j < bn; j++) {
      const i = b0 + j;
      if (held[i]) continue;
      const a = b0 + (j + bn - 1) % bn;
      const c = b0 + (j + 1) % bn;
      pos[i * 2] += ((pos[a * 2] + pos[c * 2]) / 2 - pos[i * 2]) * this.TENSION;
      pos[i * 2 + 1] += ((pos[a * 2 + 1] + pos[c * 2 + 1]) / 2 - pos[i * 2 + 1]) * this.TENSION;
    }

    // 3) 소성: 늘어난/줄어든 만큼 기준 길이도 따라감 → 놓아도 그 모양 유지
    let maxS = 1;
    const Lo = this.edgeLo;
    for (let k = 0; k < L0.length; k++) {
      const L = this.len(E[k * 2], E[k * 2 + 1]);
      if (this.gathering > 0) {
        // 뭉치는 중엔 기준 길이를 처음 값으로 되돌림
        L0[k] += (Lo[k] - L0[k]) * 0.1;
        continue;
      }
      const y = this.YIELD * L0[k];
      if (L > L0[k] + y) L0[k] += this.PLASTIC * (L - L0[k] - y);
      else if (L < L0[k] - y) L0[k] = Math.max(Lo[k] * 0.25, L0[k] - this.PLASTIC * (L0[k] - y - L));
      if (L / Lo[k] > maxS) maxS = L / Lo[k];
    }
    this.maxStretch = maxS;

    // 4) 바닥 마찰 + 속도 갱신 + 화면 밖으로 못 나가게
    const m = 4;
    const fr = this.gathering > 0 ? 1 : this.FRICTION;
    for (let i = 0; i < nv; i++) {
      const x = i * 2;
      if (!held[i]) {
        pos[x] = prev[x] + (pos[x] - prev[x]) * fr;
        pos[x + 1] = prev[x + 1] + (pos[x + 1] - prev[x + 1]) * fr;
      }
      if (pos[x] < m) pos[x] = m;
      if (pos[x] > this.w - m) pos[x] = this.w - m;
      if (pos[x + 1] < m) pos[x + 1] = m;
      if (pos[x + 1] > this.h - m) pos[x + 1] = this.h - m;
      vel[x] = pos[x] - prev[x];
      vel[x + 1] = pos[x + 1] - prev[x + 1];
    }
  },

  // ===== WebGL 렌더링 =====
  // 1) 메시를 화면 해상도 마스크로 (R=슬라임, G=자국)
  // 2) 반해상도로 살짝 흐림 → 테두리 안티앨리어싱 + 모서리 둥글게
  // 3) 1/4 해상도로 크게 흐림 → 덩어리 두께(돔), 그림자
  // 4) 최종: 픽셀마다 높이→법선→조명, 바풍 돔은 수식으로 직접
  initGL() {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return;
    const half = gl.getExtension('EXT_color_buffer_float');
    this.fmt = half ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };

    const quadVS = `#version 300 es
layout(location = 0) in vec2 a;
out vec2 uv;
void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
    const meshVS = `#version 300 es
layout(location = 0) in vec3 a;
uniform vec2 uRes;
out float vDent;
void main() {
  vDent = a.z;
  vec2 p = a.xy / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;
    const meshFS = `#version 300 es
precision highp float;
in float vDent;
out vec4 o;
void main() { o = vec4(1.0, vDent, 0.0, 1.0); }`;
    // 가우시안 블러 (반경은 CSS px 단위)
    const blurFS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D tex;
uniform vec2 uStep;
uniform float uSigma;
uniform int uN;
void main() {
  vec4 sum = texture(tex, uv);
  float wsum = 1.0;
  for (int i = 1; i <= 48; i++) {
    if (i > uN) break;
    float d = float(i);
    float w = exp(-d * d / (2.0 * uSigma * uSigma));
    sum += (texture(tex, uv + uStep * d) + texture(tex, uv - uStep * d)) * w;
    wsum += 2.0 * w;
  }
  o = sum / wsum;
}`;
    const finalFS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D tSmall;
uniform sampler2D tBig;
uniform sampler2D tMid;
uniform vec2 uPx;
uniform vec2 uSize;
uniform float uSlope;
uniform vec4 uBal[4];
uniform int uBalN;
uniform vec3 cLight;
uniform vec3 cBase;
uniform vec3 cDark;

float height(vec2 p, out float film) {
  vec4 s = texture(tSmall, p);
  vec4 md = texture(tMid, p);
  vec4 b = texture(tBig, p);
  // 큰 돔 + 가닥을 둥글게(중간 흐림) + 테두리 살짝(작은 흐림) - 자국(중간 흐림으로 부드럽게)
  float h = b.r + md.r * 0.28 + s.r * 0.08 - md.g * 0.75;
  film = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uBalN) break;
    vec4 bl = uBal[i];
    float t = length((p - bl.xy) * uSize) / bl.z;
    if (t < 1.0) {
      float e = clamp((1.0 - t) / 0.25, 0.0, 1.0);
      e = e * e * (3.0 - 2.0 * e);
      h += (1.0 - t * t) * bl.z * 0.7 / uSlope * e;
      film = max(film, e);
    }
  }
  return h;
}

void main() {
  float film;
  float fx;
  float h0 = height(uv, film);
  float hl = height(uv - vec2(uPx.x, 0.0) * 2.0, fx);
  float hr = height(uv + vec2(uPx.x, 0.0) * 2.0, fx);
  float hd = height(uv - vec2(0.0, uPx.y) * 2.0, fx);
  float hu = height(uv + vec2(0.0, uPx.y) * 2.0, fx);
  // 화면 좌표(y 아래로) 기준 법선 (2px 간격 차분)
  vec3 n = normalize(vec3(-(hr - hl) * 0.25 * uSlope, (hu - hd) * 0.25 * uSlope, 1.0));

  float m = texture(tSmall, uv).r;
  float fw = max(fwidth(m), 0.02);
  float a = smoothstep(0.5 - fw, 0.5 + fw, m);
  a = max(a, 0.85 * film);

  vec3 L = normalize(vec3(-0.45, -0.55, 0.7));
  vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(n, L), 0.0);
  float sp = max(dot(n, Hv), 0.0);
  float spec = pow(sp, 110.0) * (1.0 + film * 0.6) + pow(sp, 14.0) * 0.12;
  float k = clamp(diff * 1.25 - 0.15, 0.0, 1.0) + film * 0.22;
  vec3 col = k < 0.6 ? mix(cDark, cBase, k / 0.6) : mix(cBase, cLight, min(1.0, (k - 0.6) / 0.4));
  col = min(col + spec, vec3(1.0));
  float alpha = a * (0.97 - film * 0.25 * (1.0 - min(spec, 1.0)));

  // 그림자: 위쪽 덩어리를 아래로 드리움
  float sd = texture(tBig, uv + vec2(0.0, 12.0 * uPx.y)).r;
  float shadow = smoothstep(0.08, 0.7, sd) * 0.2;
  vec4 slime = vec4(col * alpha, alpha);
  vec4 shd = vec4(vec3(0.35, 0.16, 0.27) * shadow, shadow);
  o = slime + shd * (1.0 - alpha);
}`;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const program = (vs, fs, names) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const loc = {};
      names.forEach(n => { loc[n] = gl.getUniformLocation(p, n); });
      return { p, loc };
    };
    try {
      this.pMesh = program(meshVS, meshFS, ['uRes']);
      this.pBlur = program(quadVS, blurFS, ['tex', 'uStep', 'uSigma', 'uN']);
      this.pFinal = program(quadVS, finalFS, ['tSmall', 'tBig', 'tMid', 'uPx', 'uSize', 'uSlope', 'uBal', 'uBalN', 'cLight', 'cBase', 'cDark']);

      this.quadVao = gl.createVertexArray();
      gl.bindVertexArray(this.quadVao);
      const qb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      this.meshVao = gl.createVertexArray();
      gl.bindVertexArray(this.meshVao);
      this.meshBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      this.triBuf = gl.createBuffer();
      gl.bindVertexArray(null);

      // 테두리 곡선용
      this.splineVao = gl.createVertexArray();
      gl.bindVertexArray(this.splineVao);
      this.splineBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.splineBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      this.gl = gl;
      this.glc = c;
    } catch (err) {
      this.gl = null;
    }
  },

  makeTarget(w, h, stencil) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.fmt.internal, w, h, 0, gl.RGBA, this.fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (stencil) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    return { tex, fb, rb, w, h };
  },

  resizeGL() {
    const gl = this.gl;
    const W = Math.max(1, Math.round(this.w * this.dpr));
    const H = Math.max(1, Math.round(this.h * this.dpr));
    this.glc.width = W;
    this.glc.height = H;
    [this.tFull, this.tHalfA, this.tHalfB, this.tMA, this.tMB, this.tQA, this.tQB].forEach(t => {
      if (!t) return;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
      if (t.rb) gl.deleteRenderbuffer(t.rb);
    });
    this.tFull = this.makeTarget(W, H, true);
    this.tHalfA = this.makeTarget(Math.ceil(W / 2), Math.ceil(H / 2));
    this.tHalfB = this.makeTarget(Math.ceil(W / 2), Math.ceil(H / 2));
    this.tMA = this.makeTarget(Math.ceil(W / 2), Math.ceil(H / 2));
    this.tMB = this.makeTarget(Math.ceil(W / 2), Math.ceil(H / 2));
    this.tQA = this.makeTarget(Math.ceil(W / 4), Math.ceil(H / 4));
    this.tQB = this.makeTarget(Math.ceil(W / 4), Math.ceil(H / 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },

  uploadIndices() {
    const gl = this.gl;
    gl.bindVertexArray(this.meshVao);
    // 테두리 고리에 닿지 않는 안쪽 삼각형만 (테두리 쪽은 곡선으로 따로 채움)
    const b0 = this.nv - 6 * this.K;
    const inner = [];
    for (let k = 0; k < this.tris.length; k += 3) {
      if (this.tris[k] < b0 && this.tris[k + 1] < b0 && this.tris[k + 2] < b0) inner.push(this.tris[k], this.tris[k + 1], this.tris[k + 2]);
    }
    this.innerCount = inner.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(inner), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  },

  // 테두리 점들을 매끄럽게 지나는 곡선 (centripetal Catmull-Rom: 점 간격이 들쭉날쭉해도 꼬이거나 튀지 않음)
  // 늘어나서 점 사이가 멀어진 구간일수록 더 잘게 나눠서 각이 안 보이게
  splinePoints() {
    const b0 = this.nv - 6 * this.K;
    const n = 6 * this.K;
    const P = i => {
      const v = b0 + ((i % n) + n) % n;
      return [this.pos[v * 2], this.pos[v * 2 + 1]];
    };
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      const d = (a, b) => Math.max(0.0001, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
      const t0 = 0;
      const t1 = t0 + d(p0, p1);
      const t2 = t1 + d(p1, p2);
      const t3 = t2 + d(p2, p3);
      const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const m = Math.max(1, Math.min(24, Math.ceil(seg / 3)));
      for (let j = 0; j < m; j++) {
        const t = t1 + (t2 - t1) * j / m;
        const pt = [0, 1].map(c => {
          const a1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
          const a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
          const a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
          const q1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
          const q2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
          return (t2 - t) / (t2 - t1) * q1 + (t - t1) / (t2 - t1) * q2;
        });
        out.push(pt[0], pt[1], 0);
      }
    }
    return new Float32Array(out);
  },

  // 샘플 간격은 결과 텍스처 한 칸 이하로 촘촘하게 (간격이 넓으면 계단 줄무늬가 생김)
  blurPass(src, dst, dx, dy, sigma) {
    const gl = this.gl;
    const texel = this.w / dst.w;
    let stepPx = Math.min(texel, sigma / 2);
    let n = Math.ceil(sigma * 3 / stepPx);
    if (n > 48) {
      n = 48;
      stepPx = sigma * 3 / 48;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(this.pBlur.loc.tex, 0);
    gl.uniform2f(this.pBlur.loc.uStep, dx * stepPx / this.w, dy * stepPx / this.h);
    gl.uniform1f(this.pBlur.loc.uSigma, sigma / stepPx);
    gl.uniform1i(this.pBlur.loc.uN, n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  renderGL() {
    const gl = this.gl;
    const vb = this.vbuf;
    for (let i = 0; i < this.nv; i++) {
      vb[i * 3] = this.pos[i * 2];
      vb[i * 3 + 1] = this.pos[i * 2 + 1];
      vb[i * 3 + 2] = this.dent[i];
    }

    // 1) 마스크 그리기
    //   a. 테두리 곡선 안쪽을 스텐실로 채움 (0이 아닌 감김수 → 곡선 모양 그대로, 오목한 곳도 매끈)
    //   b. 안쪽 삼각형은 자국 정보와 함께 덮어 그림 (안쪽을 잡아 끌어낸 부분도 보이게)
    //   c. 곡선을 선으로 한 번 더 → 아주 가늘어진 가닥도 1px 아래로 끊기지 않게
    const sp = this.splinePoints();
    const spN = sp.length / 3;
    gl.useProgram(this.pMesh.p);
    gl.uniform2f(this.pMesh.loc.uRes, this.w, this.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tFull.fb);
    gl.viewport(0, 0, this.tFull.w, this.tFull.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    gl.bindVertexArray(this.splineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.splineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sp, gl.DYNAMIC_DRAW);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, spN);
    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, spN);
    gl.disable(gl.STENCIL_TEST);
    gl.drawArrays(gl.LINE_LOOP, 0, spN);

    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, vb, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triBuf);
    gl.drawElements(gl.TRIANGLES, this.innerCount, gl.UNSIGNED_SHORT, 0);

    // 2) 블러들
    gl.useProgram(this.pBlur.p);
    gl.bindVertexArray(this.quadVao);
    const small = 2.2;
    const big = this.R0 * 0.22;
    this.blurPass(this.tFull, this.tHalfA, 1, 0, small);
    this.blurPass(this.tHalfA, this.tHalfB, 0, 1, small);
    this.blurPass(this.tHalfB, this.tMA, 1, 0, 6);
    this.blurPass(this.tMA, this.tMB, 0, 1, 6);
    this.blurPass(this.tHalfB, this.tQA, 1, 0, big);
    this.blurPass(this.tQA, this.tQB, 0, 1, big);

    // 3) 최종 합성
    const fp = this.pFinal;
    gl.useProgram(fp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.glc.width, this.glc.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tHalfB.tex);
    gl.uniform1i(fp.loc.tSmall, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tQB.tex);
    gl.uniform1i(fp.loc.tBig, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tMB.tex);
    gl.uniform1i(fp.loc.tMid, 2);
    gl.uniform2f(fp.loc.uPx, 1 / this.w, 1 / this.h);
    gl.uniform2f(fp.loc.uSize, this.w, this.h);
    gl.uniform1f(fp.loc.uSlope, this.SLOPE);
    const bal = new Float32Array(16);
    this.balloons.slice(0, 4).forEach((b, i) => {
      const p = this.balloonPos(b);
      bal.set([p.x / this.w, 1 - p.y / this.h, b.r, 0], i * 4);
    });
    gl.uniform4fv(fp.loc.uBal, bal);
    gl.uniform1i(fp.loc.uBalN, Math.min(4, this.balloons.length));
    const pal = this.palettes[this.color];
    gl.uniform3f(fp.loc.cLight, pal.light[0] / 255, pal.light[1] / 255, pal.light[2] / 255);
    gl.uniform3f(fp.loc.cBase, pal.base[0] / 255, pal.base[1] / 255, pal.base[2] / 255);
    gl.uniform3f(fp.loc.cDark, pal.dark[0] / 255, pal.dark[1] / 255, pal.dark[2] / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  },

  // WebGL2가 없는 브라우저용: 메시를 그대로 칠하고 그라데이션만
  renderCPU(ctx) {
    const pal = this.palettes[this.color];
    const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < this.nv; i++) {
      cx += this.pos[i * 2] / this.nv;
      cy += this.pos[i * 2 + 1] / this.nv;
    }
    const gr = ctx.createRadialGradient(cx - this.R0 * 0.35, cy - this.R0 * 0.4, 0, cx, cy, this.R0 * 1.5);
    gr.addColorStop(0, rgb(pal.light));
    gr.addColorStop(0.5, rgb(pal.base));
    gr.addColorStop(1, rgb(pal.dark));
    ctx.beginPath();
    const p = this.pos;
    const t = this.tris;
    for (let k = 0; k < t.length; k += 3) {
      ctx.moveTo(p[t[k] * 2], p[t[k] * 2 + 1]);
      ctx.lineTo(p[t[k + 1] * 2], p[t[k + 1] * 2 + 1]);
      ctx.lineTo(p[t[k + 2] * 2], p[t[k + 2] * 2 + 1]);
      ctx.closePath();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(90,40,70,.2)';
    ctx.shadowBlur = 16 * this.dpr;
    ctx.shadowOffsetY = 10 * this.dpr;
    ctx.fillStyle = gr;
    ctx.fill('nonzero');
    ctx.restore();
  },

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.gl) {
      this.renderGL();
      ctx.drawImage(this.glc, 0, 0, this.w, this.h);
    } else {
      this.renderCPU(ctx);
    }

    // 반짝이, 공기방울
    this.decor.forEach(d => {
      const x = this.pos[d.v * 2] + d.dx;
      const y = this.pos[d.v * 2 + 1] + d.dy;
      if (d.air) {
        ctx.beginPath();
        ctx.arc(x, y, d.air, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(255,255,255,${d.al})`;
        ctx.fillRect(x, y, d.sz, d.sz);
      }
    });

    // 바풍 터질 때 퍼지는 링
    this.rings.forEach(r => {
      const k = r.t / 0.35;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (1 + k * 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.stroke();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => { slimeCode.init(); });
