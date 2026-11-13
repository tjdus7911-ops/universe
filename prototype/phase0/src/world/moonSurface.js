import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROVER_COUNT } from '../../../../packages/shared/protocol.js';
import { canvasTexture, FONT, roundRect } from '../core/renderer.js';
import { solarTex } from './stationExterior.js';

// 달 착륙지 (시안용 절차적 모델) — 포장 광장 없이 울퉁불퉁한 실제 달 지형 위에 사람들이 모인다
// 좌표: 우주선 착륙 지점 = 원점, -Z = 북쪽(지구가 지평선 가까이 떠 있는 방향), +X = 동쪽
// 월면차: 착륙지 곳곳에 흩어 둔 4인승 24대 (가까이 가거나 풍선을 누르면 탐)
//  처음 5대는 자리를 정해 두고, 나머지는 구조물·바위 언덕·큰 크레이터를 피해 서로 7 m 이상 떨어진 자리를 고른다 (모든 접속자가 같은 자리)
const ROVERS = (() => {
  const out = [
    { x: -9.5, z: -9.5, rot: 0.55 }, // 착륙선 옆
    { x: 12, z: -22, rot: -0.9 }, // 라운지 가는 길
    { x: 17, z: 1.5, rot: 2.3 }, // 동쪽 평지
    { x: -21, z: -7, rot: 1.25 }, // 서쪽 크레이터 너머
    { x: 4.5, z: 17.5, rot: -2.4 }, // 남쪽
  ];
  // 피할 곳 [x, z, 반경]: 착륙선·기지·안테나·태양전지판·실험대·기둥·사진 언덕·망원경 · 바위 언덕 · 손으로 둔 크레이터
  const avoid = [
    [0, 0, 9], [24, -35, 12.5], [33.5, -31, 8], [17.5, -41.5, 5], [31.5, -42, 5], [36, -38, 5],
    [6.4, -8.6, 5], [-4.8, -14.2, 5], [3.2, -20, 7.5], [4.35, -13.6, 3], [-8.2, -21.5, 5],
    [-23, -31, 10.2], [21, -17, 8.5], [-31, 5, 8], [27, 11, 9.6], [-7, 31, 11.8], [45, -8, 8], [-46, -14, 10.2], [-15, -52, 9],
    [-13.5, -2.5, 5.7], [12.5, -13, 5.1], [13, 6, 6.7], [-5, 13, 8.5], [-16, -20, 7], [9, -29, 6.1], [-36, -30, 16.5], [40, 26, 18.5],
  ];
  const R = rng(4242);
  for (let guard = 0; out.length < ROVER_COUNT && guard < 20000; guard++) {
    const a = R() * Math.PI * 2, d = 10 + Math.sqrt(R()) * 36;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    if (out.some((v) => Math.hypot(x - v.x, z - v.z) < 7)) continue;
    out.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, rot: Math.round(R() * 628) / 100 });
  }
  return out;
})();
export const MOON_LAYOUT = {
  lander: { x: 0, z: 0 },
  rover: ROVERS[0],
  rovers: ROVERS,
  stand: { x: 6.4, z: -8.6 },
  pole: { x: -4.8, z: -14.2 },
  photo: { x: 3.2, z: -20 },
  scope: { x: -8.2, z: -21.5 },
  hub: { x: 24, z: -35, r: 5.2 },
  module: { x: 33.5, z: -31, rot: 0.55 },
  dish: { x: 17.5, z: -41.5 },
  solar: [{ x: 31.5, z: -42 }, { x: 36, z: -38 }],
  // 가까운 바위 언덕 (참고 화면처럼 좌우에 거친 바위 둔덕)
  outcrops: [
    { x: -23, z: -31, s: [13, 5.2, 9.5], r: 0.4 },
    { x: 21, z: -17, s: [10, 4.2, 8], r: -0.6 },
    { x: -31, z: 5, s: [10, 4.6, 9], r: 1.1 },
    { x: 27, z: 11, s: [12, 5, 9], r: 0.2 },
    { x: -7, z: 31, s: [16, 6.4, 11], r: -0.3 },
    { x: 45, z: -8, s: [9, 3.6, 8], r: 0.9 },
    { x: -46, z: -14, s: [13, 5.4, 10], r: 0.5 },
    { x: -15, z: -52, s: [11, 4.5, 8], r: 1.4 },
  ],
};

// ---------- 난수·노이즈 ----------
export function rng(seed) {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function makeNoise2(seed) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = perm[ii + perm[jj]] & 7; t0 *= t0; n += t0 * t0 * (GX[g] * x0 + GY[g] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = perm[ii + i1 + perm[jj + j1]] & 7; t1 *= t1; n += t1 * t1 * (GX[g] * x1 + GY[g] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = perm[ii + 1 + perm[jj + 1]] & 7; t2 *= t2; n += t2 * t2 * (GX[g] * x2 + GY[g] * y2); }
    return 70 * n;
  };
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 이음매 없이 반복되는 값 노이즈 (텍스처용)
function tileNoise(size, periods, seed) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1, total = 0;
  for (const P of periods) {
    const lat = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * P, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % P;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * P, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % P;
        const a = lat[y0 * P + x0], b = lat[y0 * P + x1], c = lat[y1 * P + x0], d = lat[y1 * P + x1];
        out[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// ---------- 텍스처 ----------
let _reg = null;
export function regolithTextures() {
  if (_reg) return _reg;
  const S = 512;
  const n = tileNoise(S, [8, 16, 32, 64, 128], 21);
  const fine = tileNoise(S, [64, 128, 256], 33);
  const R = rng(5);
  const pebbles = [];
  for (let i = 0; i < 1100; i++) pebbles.push({ x: R() * S, y: R() * S, r: 0.7 + Math.pow(R(), 3.2) * 6.5, l: R(), crater: R() < 0.06 });
  const wraps = (p, fn) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const x = p.x + ox, y = p.y + oy;
      if (x > -14 && x < S + 14 && y > -14 && y < S + 14) fn(x, y);
    }
  };
  const map = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(1, 0.76 + (n[i] - 0.5) * 0.62 + (fine[i] - 0.5) * 0.26));
      img.data[i * 4] = 255 * v;
      img.data[i * 4 + 1] = 255 * v * 0.972;
      img.data[i * 4 + 2] = 255 * v * 0.93;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const p of pebbles) wraps(p, (x, y) => {
      if (p.crater) {
        g.strokeStyle = 'rgba(255,255,255,0.10)';
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(x, y, p.r * 1.6, 0, Math.PI * 2); g.stroke();
        return;
      }
      const c = Math.round(150 + p.l * 80);
      g.fillStyle = `rgba(${c},${c - 2},${c - 6},0.85)`;
      g.beginPath(); g.ellipse(x, y, p.r, p.r * 0.8, p.l * 3, 0, Math.PI * 2); g.fill();
    });
  }, { repeat: [1, 1] });
  const bump = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(255, 128 + (fine[i] - 0.5) * 150 + (n[i] - 0.5) * 60));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const p of pebbles) wraps(p, (x, y) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, p.r * (p.crater ? 1.8 : 1));
      if (p.crater) {
        gr.addColorStop(0, 'rgba(40,40,40,0.8)');
        gr.addColorStop(0.7, 'rgba(90,90,90,0.4)');
        gr.addColorStop(0.85, 'rgba(230,230,230,0.6)');
        gr.addColorStop(1, 'rgba(128,128,128,0)');
      } else {
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(1, 'rgba(160,160,160,0)');
      }
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, p.r * (p.crater ? 1.8 : 1), 0, Math.PI * 2); g.fill();
    });
  }, { srgb: false, repeat: [1, 1] });
  map.anisotropy = bump.anisotropy = 8;
  _reg = { map, bump };
  return _reg;
}

// 발자국: 위쪽 = 뒤꿈치, 아래쪽 = 앞코 (평면을 눕혔을 때 앞코가 진행 방향을 향함)
function footprintTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const sole = () => {
      g.beginPath();
      g.moveTo(w * 0.5, 14);
      g.bezierCurveTo(w * 0.86, 14, w * 0.86, 92, w * 0.8, 128);
      g.bezierCurveTo(w * 0.76, 168, w * 0.95, 200, w * 0.86, 232);
      g.bezierCurveTo(w * 0.78, 252, w * 0.22, 252, w * 0.14, 232);
      g.bezierCurveTo(w * 0.05, 200, w * 0.24, 168, w * 0.2, 128);
      g.bezierCurveTo(w * 0.14, 92, w * 0.14, 14, w * 0.5, 14);
      g.closePath();
    };
    // 눌린 흙 가장자리(밝게) → 안쪽(어둡게) → 밑창 홈(줄무늬)
    g.save();
    sole();
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(235,232,226,0.38)';
    g.stroke();
    g.fillStyle = 'rgba(52,50,48,0.62)';
    g.fill();
    g.clip();
    for (let y = 22; y < 250; y += 17) {
      g.fillStyle = 'rgba(28,27,26,0.55)';
      g.fillRect(0, y, w, 7);
      g.fillStyle = 'rgba(150,146,140,0.25)';
      g.fillRect(0, y + 7, w, 3);
    }
    g.restore();
  });
}

function dotTexture() {
  return canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

// 표지판: 남색 판 + 흰 글씨 (자체 발광으로 그늘에서도 읽힘)
export function signBoard(lines, opts = {}) {
  const W = opts.w ?? 2.2, Hh = opts.h ?? 0.7;
  const px = 220;
  const tex = canvasTexture(Math.round(W * px), Math.round(Hh * px), (g, w, h) => {
    roundRect(g, 4, 4, w - 8, h - 8, 26);
    g.fillStyle = 'rgba(14,20,48,0.94)';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = opts.accent || '#6ff0d2';
    g.stroke();
    g.fillStyle = opts.accent || '#6ff0d2';
    g.fillRect(28, 26, 10, h - 52);
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((t, i) => {
      const main = i === 0;
      g.font = `${main ? 800 : 600} ${main ? Math.round(h * (n > 1 ? 0.3 : 0.42)) : Math.round(h * 0.2)}px ${FONT}`;
      g.fillStyle = main ? '#ffffff' : 'rgba(220,228,255,0.85)';
      g.fillText(t, 58, n > 1 ? (main ? h * 0.38 : h * 0.72) : h / 2);
    });
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6, transparent: true, side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), mat);
  const g = new THREE.Group();
  board.position.y = opts.y ?? 1.25;
  g.add(board);
  if (opts.post !== false) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, board.position.y, 10), new THREE.MeshStandardMaterial({ color: '#cfd3e0', roughness: 0.4, metalness: 0.5 }));
    post.position.y = board.position.y / 2;
    post.castShadow = true;
    g.add(post);
  }
  return g;
}

export function textSprite(text, opts = {}) {
  const tex = canvasTexture(256, 96, (g, w, h) => {
    g.font = `800 ${opts.size ?? 44}px ${FONT}`;
    const tw = g.measureText(text).width + 36;
    roundRect(g, (w - tw) / 2, 14, tw, h - 28, 20);
    g.fillStyle = opts.bg || 'rgba(12,18,42,0.78)';
    g.fill();
    g.fillStyle = opts.color || '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(0.8, 0.3, 1);
  sp.renderOrder = 8;
  return sp;
}

// ---------- 지형 ----------
export function createMoonTerrain({ seed = 7 } = {}) {
  const L = MOON_LAYOUT;
  const n1 = makeNoise2(seed), n2 = makeNoise2(seed + 1), n3 = makeNoise2(seed + 2), n4 = makeNoise2(seed + 3), n5 = makeNoise2(seed + 4);
  const R = rng(seed + 11);
  // 구조물 밑만 살짝 고른다 (주변 자연 높이에 맞춰서)
  const flats = [
    { x: L.lander.x, z: L.lander.z, r: 5.8, f: 4.5 },
    { x: 27, z: -36.5, r: 12.5, f: 6 },
    ...L.rovers.map((v) => ({ x: v.x, z: v.z, r: 2.7, f: 2 })),
    { x: L.stand.x, z: L.stand.z, r: 1.4, f: 1.6 },
    { x: L.pole.x, z: L.pole.z, r: 0.9, f: 1.2 },
    { x: L.scope.x, z: L.scope.z, r: 1.0, f: 1.2 },
  ];
  const nearFlat = (x, z, pad) => flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + f.f + pad);
  const nearOutcrop = (x, z, pad) => L.outcrops.some((o) => Math.hypot(x - o.x, z - o.z) < Math.max(o.s[0], o.s[2]) * 0.55 + pad);

  // 크레이터: 손으로 둔 것 + 무작위 (작은 것이 아주 많음)
  const craters = [
    { x: -13.5, z: -2.5, r: 3.2, d: 0.85, fresh: true },
    { x: 12.5, z: -13, r: 2.6, d: 0.6 },
    { x: 13, z: 6, r: 4.2, d: 1.1 },
    { x: -5, z: 13, r: 6, d: 1.5, fresh: true },
    { x: -16, z: -20, r: 4.5, d: 1.1 },
    { x: 9, z: -29, r: 3.6, d: 0.9 },
    { x: -36, z: -30, r: 14, d: 3, fresh: true },
    { x: 40, z: 26, r: 16, d: 3.4 },
    { x: -70, z: 50, r: 26, d: 5.5 },
    { x: 120, z: -160, r: 60, d: 11 },
    { x: -180, z: -90, r: 45, d: 9 },
  ];
  for (let i = 0; i < 420; i++) {
    const a = R() * Math.PI * 2;
    const d = 5 + Math.pow(R(), 1.6) * 430;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const r = (0.35 + Math.pow(R(), 2.8) * 6) * (1 + d / 170);
    if (nearFlat(x, z, r * 1.4)) continue;
    craters.push({ x, z, r, d: r * (0.16 + R() * 0.12), fresh: R() < 0.12 });
  }
  const CELL = 40;
  const grid = new Map();
  const key = (i, j) => `${i},${j}`;
  for (const c of craters) {
    const reach = c.r * 2.6;
    for (let i = Math.floor((c.x - reach) / CELL); i <= Math.floor((c.x + reach) / CELL); i++)
      for (let j = Math.floor((c.z - reach) / CELL); j <= Math.floor((c.z + reach) / CELL); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(c);
      }
  }
  const EMPTY = [];
  const EARTH_AZ = THREE.MathUtils.degToRad(12);

  function raw(x, z) {
    const d = Math.hypot(x, z);
    // 굽이치는 땅: 큰 언덕(약 50 m) + 둔덕(약 17 m) + 울퉁불퉁(약 5 m)
    let h = n1(x * 0.02, z * 0.02) * 2.3 + n2(x * 0.06, z * 0.06) * 0.85 + n3(x * 0.2, z * 0.2) * 0.17 + n4(x * 0.55, z * 0.55) * 0.035;
    // 사진 명소: 지구를 등지고 서는 작은 언덕
    h += 1.9 * Math.exp(-((x - L.photo.x) ** 2 + (z - L.photo.z) ** 2) / (2 * 5.5 * 5.5));
    const far = smooth(200, 1500, d);
    if (far > 0) {
      // 먼 산: 지구가 뜬 북쪽은 낮게 비워 둔다
      const az = Math.atan2(x, -z);
      const gap = 1 - 0.82 * Math.exp(-Math.pow(Math.atan2(Math.sin(az - EARTH_AZ), Math.cos(az - EARTH_AZ)) / 0.62, 2));
      const ridge = 1 - Math.abs(n4(x * 0.0007, z * 0.0007));
      const hills = n1(x * 0.0011 + 2, z * 0.0011 - 5) * 0.5 + 0.5;
      h += far * gap * (Math.pow(ridge, 1.6) * 125 + hills * 75 + n1(x * 0.004 + 7, z * 0.004 - 3) * 16);
    }
    let rim = 0, inside = 0;
    for (const c of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY) {
      const q = Math.hypot(x - c.x, z - c.z) / c.r;
      if (q > 2.6) continue;
      const bowl = q < 1 ? c.d * (q * q - 1) : 0;
      const rr = c.d * 0.24 * Math.exp(-Math.pow((q - 1) / 0.22, 2));
      const ej = c.d * 0.12 * (q < 1 ? q * q : Math.exp(-(q - 1) / 0.5));
      h += bowl + rr + ej;
      if (q < 1) inside = Math.max(inside, 1 - q);
      if (c.fresh) rim = Math.max(rim, Math.exp(-Math.pow((q - 1.05) / 0.45, 2)));
    }
    return { h, rim, inside };
  }
  for (const f of flats) f.y = raw(f.x, f.z).h;
  function sample(x, z) {
    const s = raw(x, z);
    for (const f of flats) {
      const w = 1 - smooth(f.r, f.r + f.f, Math.hypot(x - f.x, z - f.z));
      if (w > 0) s.h = s.h * (1 - w) + f.y * w;
    }
    return s;
  }
  const heightAt = (x, z) => sample(x, z).h;
  const tmpN = new THREE.Vector3();
  const normalAt = (x, z, out = tmpN) => {
    const e = 0.25;
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  };

  // 극좌표 격자: 가까운 곳은 촘촘하게(0.45 m), 멀어질수록 넓게 — 지평선까지 한 덩어리
  const radii = [0];
  let r = 0;
  while (r < 3200) {
    r += Math.max(0.45, r * 0.03);
    radii.push(r);
  }
  const SEG = 288;
  const nv = radii.length * (SEG + 1);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  let v = 0;
  for (let i = 0; i < radii.length; i++) {
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      const x = Math.cos(a) * radii[i], z = Math.sin(a) * radii[i];
      const s = sample(x, z);
      pos[v * 3] = x;
      pos[v * 3 + 1] = s.h;
      pos[v * 3 + 2] = z;
      uv[v * 2] = x / 3.2;
      uv[v * 2 + 1] = z / 3.2;
      // 알베도: 어두운 회갈색 얼룩 + 길게 끌린 줄무늬 + 젊은 크레이터 테두리 밝게
      let a0 = 0.34 + n2(x * 0.045 + 11, z * 0.045) * 0.075 + n3(x * 0.14, z * 0.14) * 0.05 + n5(x * 0.4, z * 0.4) * 0.025;
      a0 += n5(x * 0.012 + 4, z * 0.07) * 0.035 + n1(x * 0.004 - 9, z * 0.004 + 2) * 0.05;
      a0 *= 1 - s.inside * 0.14;
      a0 += s.rim * 0.12;
      a0 = Math.max(0.16, a0);
      col[v * 3] = a0 * 1.0;
      col[v * 3 + 1] = a0 * 0.955;
      col[v * 3 + 2] = a0 * 0.9;
      v++;
    }
  }
  const idx = [];
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j, b = a + SEG + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tx = regolithTextures();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.map, bumpMap: tx.bump, bumpScale: 2.2, roughness: 0.98, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const rocks = createRocks(heightAt, (x, z, p) => nearFlat(x, z, p) || nearOutcrop(x, z, p * 0.3) || Math.hypot(x - L.photo.x, z - L.photo.z) < 3.4 + p, seed + 5);
  group.add(rocks.mesh);
  const outcropCols = [];
  L.outcrops.forEach((o, i) => {
    const m = createOutcrop(seed * 31 + i * 7, o.s[0], o.s[1], o.s[2]);
    m.position.set(o.x, heightAt(o.x, o.z) - o.s[1] * 0.32, o.z);
    m.rotation.y = o.r;
    group.add(m);
    outcropCols.push({ x: o.x, z: o.z, r: Math.min(o.s[0], o.s[2]) * 0.5 });
  });
  return { group, mesh, heightAt, normalAt, craters, nearFlat, boulders: [...rocks.boulders, ...outcropCols] };
}

// 바위 언덕: 울퉁불퉁한 덩어리 + 반짝이는 광물 알갱이 무늬
let _rockTex = null;
function rockTextures() {
  if (_rockTex) return _rockTex;
  const S = 512;
  const n = tileNoise(S, [6, 12, 24, 48, 96], 77);
  const R = rng(19);
  const specks = [];
  for (let i = 0; i < 5200; i++) specks.push({ x: R() * S, y: R() * S, r: 0.5 + Math.pow(R(), 4) * 2.6, b: R() });
  const map = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(1, 0.5 + (n[i] - 0.5) * 0.8));
      img.data[i * 4] = 255 * v;
      img.data[i * 4 + 1] = 255 * v * 0.96;
      img.data[i * 4 + 2] = 255 * v * 0.9;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const p of specks) {
      const c = p.b > 0.55 ? Math.round(205 + p.b * 50) : Math.round(30 + p.b * 40);
      g.fillStyle = `rgba(${c},${c - 4},${c - 12},${p.b > 0.55 ? 0.9 : 0.7})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [3, 2] });
  const bump = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(255, 128 + (n[i] - 0.5) * 230));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const p of specks) {
      g.fillStyle = p.b > 0.55 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }, { srgb: false, repeat: [3, 2] });
  _rockTex = { map, bump };
  return _rockTex;
}
function createOutcrop(seed, sx, sy, sz) {
  const nA = makeNoise2(seed), nB = makeNoise2(seed + 1);
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 4));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + nA(v.x * 1.6 + v.z * 0.7, v.y * 1.6) * 0.22 + nB(v.z * 3.4, v.x * 3.4 + v.y) * 0.09 + nA(v.y * 7 + 3, v.z * 7 - v.x) * 0.03;
    v.multiplyScalar(k);
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
    p.setXYZ(i, v.x * sx * 0.5, v.y * sy, v.z * sz * 0.5);
  }
  geo.computeVertexNormals();
  const t = rockTextures();
  const mat = new THREE.MeshStandardMaterial({ color: '#8d877e', map: t.map, bumpMap: t.bump, bumpScale: 3, roughness: 0.93 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function createRocks(heightAt, nearFlat, seed) {
  const boulders = [];
  const R = rng(seed);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // 같은 꼭짓점은 같은 값으로 흔들어야 면이 갈라지지 않는다
    const hsh = Math.abs(Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453) % 1;
    v.multiplyScalar(0.78 + hsh * 0.4);
    v.y *= 0.7;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
  const items = [];
  const place = (n, dMin, dMax, sMin, sMax, pow) => {
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, d = dMin + Math.pow(R(), 1.3) * (dMax - dMin);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const s = sMin + Math.pow(R(), pow) * (sMax - sMin);
      if (nearFlat(x, z, s + 0.8)) continue;
      items.push({ x, z, s, rot: R() * 6.28, tilt: (R() - 0.5) * 0.5, c: 0.27 + R() * 0.17 });
    }
  };
  place(900, 4, 100, 0.05, 0.45, 3.2);
  place(70, 9, 140, 0.6, 2.6, 1.9);
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pp = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.tilt, it.rot, it.tilt * 0.6);
    q.setFromEuler(e);
    s.set(it.s * (0.9 + (i % 5) * 0.06), it.s, it.s * (0.85 + (i % 3) * 0.1));
    pp.set(it.x, heightAt(it.x, it.z) - it.s * 0.22, it.z);
    m4.compose(pp, q, s);
    mesh.setMatrixAt(i, m4);
    c.setRGB(it.c, it.c * 0.985, it.c * 0.955);
    mesh.setColorAt(i, c);
    if (it.s > 0.6 && Math.hypot(it.x, it.z) < 70) boulders.push({ x: it.x, z: it.z, r: it.s * 0.95 });
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, boulders };
}

// ---------- 공용 재질 ----------
const M = {
  white: () => new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.42, metalness: 0.05 }),
  shell: () => new THREE.MeshPhysicalMaterial({ color: '#fbf8f3', roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.25 }),
  coral: () => new THREE.MeshStandardMaterial({ color: '#ff8f7a', roughness: 0.4 }),
  mint: () => new THREE.MeshStandardMaterial({ color: '#5fe0c3', roughness: 0.4 }),
  lav: () => new THREE.MeshStandardMaterial({ color: '#a98bff', roughness: 0.45 }),
  metal: () => new THREE.MeshStandardMaterial({ color: '#c8ccd8', roughness: 0.32, metalness: 0.75 }),
  dark: () => new THREE.MeshStandardMaterial({ color: '#3a3f52', roughness: 0.5, metalness: 0.3 }),
  gold: () => new THREE.MeshStandardMaterial({ color: '#d9b25c', roughness: 0.32, metalness: 0.85 }),
  regolith: () => {
    const t = regolithTextures();
    return new THREE.MeshStandardMaterial({ color: '#9a958d', map: t.map, bumpMap: t.bump, bumpScale: 1.4, roughness: 0.98 });
  },
  glow: (c, i = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: '#9fd6ff', roughness: 0.06, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.72, emissive: '#1a4b7a', emissiveIntensity: 0.6 }),
};
function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(...pos);
  o.rotation.set(...rot);
  o.scale.set(...scale);
  o.castShadow = o.receiveShadow = true;
  return o;
}
function cyl(a, b, r, mat) {
  // a→b 두 점을 잇는 원기둥
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  o.castShadow = o.receiveShadow = true;
  return o;
}

// ---------- 우주선 '달마중호' (착륙선) ----------
// 로컬 +X = 해치·경사로 방향, 원점 = 착륙 다리 바닥
export function createLander() {
  const g = new THREE.Group();
  const shell = M.shell(), coral = M.coral(), mint = M.mint(), metal = M.metal(), gold = M.gold(), dark = M.dark();
  const body = new THREE.Group();
  g.add(body);
  const prof = [[0, 1.02], [0.95, 1.06], [1.45, 1.24], [1.7, 1.6], [1.76, 2.25], [1.72, 3.0], [1.58, 3.62], [1.27, 4.1], [0.78, 4.44], [0.001, 4.58]].map(([x, y]) => new THREE.Vector2(x, y));
  body.add(mesh(new THREE.LatheGeometry(prof, 56), shell));
  body.add(mesh(new THREE.TorusGeometry(1.76, 0.085, 10, 64), coral, [0, 2.62, 0], [Math.PI / 2, 0, 0]));
  body.add(mesh(new THREE.TorusGeometry(1.7, 0.045, 8, 64), mint, [0, 3.08, 0], [Math.PI / 2, 0, 0]));
  body.add(mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 64), coral, [0, 1.3, 0], [Math.PI / 2, 0, 0]));
  // 조종석 창
  const win = mesh(new THREE.SphereGeometry(0.62, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.glass(), [1.18, 3.72, 0], [0, 0, -Math.PI / 2 + 0.52], [1, 0.55, 1]);
  body.add(win);
  const winRing = mesh(new THREE.TorusGeometry(0.62, 0.06, 10, 40), metal, [1.2, 3.74, 0]);
  winRing.lookAt(1.2 + 0.867, 3.74 + 0.497, 0);
  body.add(winRing);
  // 이름 띠
  const nameTex = canvasTexture(512, 96, (c, w, h) => {
    c.fillStyle = '#ff8f7a';
    c.font = `900 60px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('달마중호', w / 2, h / 2 + 4);
  });
  const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, transparent: true, roughness: 0.5 });
  const nameBand = new THREE.Mesh(new THREE.CylinderGeometry(1.765, 1.765, 0.42, 48, 1, true, Math.PI / 2 - 0.55, 1.1), nameMat);
  nameBand.position.y = 2.88;
  body.add(nameBand);
  // 해치 (문 + 안쪽 불빛)
  const hatchGlow = new THREE.Mesh(new RoundedBoxGeometry(0.06, 1.18, 0.98, 2, 0.04), new THREE.MeshStandardMaterial({ color: '#ffe2b8', emissive: '#ffcf8a', emissiveIntensity: 0, roughness: 0.5 }));
  hatchGlow.position.set(1.7, 1.98, 0);
  body.add(hatchGlow);
  const door = mesh(new RoundedBoxGeometry(0.1, 1.22, 1.02, 3, 0.06), M.white(), [1.79, 1.98, 0]);
  body.add(door);
  body.add(mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), metal, [1.86, 2.1, 0.3], [0, Math.PI / 2, 0]));
  // 경사로 (해치 아래 경첩)
  const ramp = new THREE.Group();
  ramp.position.set(1.78, 1.33, 0);
  const deck = mesh(new RoundedBoxGeometry(3.25, 0.08, 1.04, 2, 0.03), M.white(), [1.62, 0, 0]);
  ramp.add(deck);
  for (const s of [-1, 1]) ramp.add(mesh(new THREE.BoxGeometry(3.25, 0.12, 0.05), coral, [1.62, 0.06, 0.5 * s]));
  for (let i = 0; i < 7; i++) ramp.add(mesh(new THREE.BoxGeometry(0.07, 0.03, 0.92), M.metal(), [0.35 + i * 0.44, 0.05, 0]));
  ramp.rotation.z = Math.PI / 2;
  body.add(ramp);
  // 엔진 노즐 + 불꽃
  body.add(mesh(new THREE.CylinderGeometry(0.42, 0.74, 0.62, 32, 1, true), metal, [0, 0.74, 0]));
  const nozzleGlow = mesh(new THREE.CircleGeometry(0.4, 24), M.glow('#9fe3ff', 0), [0, 0.5, 0], [Math.PI / 2, 0, 0]);
  body.add(nozzleGlow);
  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { power: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float power, time; void main(){ float a = pow(1.0 - vUv.y, 1.7) * power; float fl = 0.85 + 0.15 * sin(time * 40.0 + vUv.y * 20.0); vec3 c = mix(vec3(0.55, 0.8, 1.0), vec3(1.0, 0.95, 0.9), pow(1.0 - vUv.y, 4.0)); gl_FragColor = vec4(c * a * fl, a); }',
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.4, 24, 1, true), flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = 0.46 - 1.7;
  body.add(flame);
  const thrustLight = new THREE.PointLight('#9fd8ff', 0, 22, 1.6);
  thrustLight.position.y = -0.4;
  body.add(thrustLight);
  // 착륙 다리 4개 (해치 사이로 비켜 45°)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    g.add(cyl([1.42 * c, 1.62, 1.42 * s], [2.58 * c, 0.12, 2.58 * s], 0.075, gold));
    g.add(cyl([1.55 * c, 2.45, 1.55 * s], [2.05 * c, 0.8, 2.05 * s], 0.045, metal));
    g.add(mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.08, 24), metal, [2.62 * c, 0.05, 2.62 * s]));
    g.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), gold, [2.58 * c, 0.14, 2.58 * s]));
  }
  // 자세 제어 추진기 + 안테나
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const q = mesh(new RoundedBoxGeometry(0.22, 0.22, 0.22, 2, 0.04), dark, [1.62 * Math.cos(a), 3.35, 1.62 * Math.sin(a)]);
    body.add(q);
  }
  body.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), metal, [-0.3, 4.9, 0.2]));
  const dishA = mesh(new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, 0.9), M.white(), [-0.3, 5.36, 0.2], [Math.PI, 0, 0]);
  dishA.material.side = THREE.DoubleSide;
  body.add(dishA);
  const beacon = mesh(new THREE.SphereGeometry(0.07, 12, 8), M.glow('#ff5d6c', 3), [0.3, 4.62, -0.3]);
  body.add(beacon);

  const state = { ramp: 0, hatch: 0, thrust: 0 };
  return {
    group: g,
    body,
    ramp,
    // 해치 위·경사로 끝 (로컬 좌표)
    rampTop: new THREE.Vector3(1.78, 1.33, 0),
    rampFoot: new THREE.Vector3(1.78 + 3.25 * Math.cos(0.42), 0, 0),
    state,
    set(o) { Object.assign(state, o); },
    update(t) {
      const open = Math.min(1, state.ramp);
      // 닫힘 = 세워서 해치를 덮음, 열림 = 끝이 바닥에 닿는 각도(약 24°)
      const down = -Math.asin(1.33 / 3.25);
      ramp.rotation.z = THREE.MathUtils.lerp(Math.PI / 2, down, easeInOut(open));
      // 닫혀 있을 때는 접혀서(짧게) 해치만 덮는다
      ramp.scale.x = THREE.MathUtils.lerp(0.37, 1, easeInOut(Math.min(1, open * 1.4)));
      door.position.y = 1.98 + easeInOut(Math.min(1, state.hatch)) * 1.24;
      door.visible = state.hatch < 0.999;
      hatchGlow.material.emissiveIntensity = state.hatch * 1.6;
      flameMat.uniforms.power.value = state.thrust;
      flameMat.uniforms.time.value = t;
      flame.scale.set(1, 0.6 + state.thrust * 0.5 + Math.sin(t * 31) * 0.04 * state.thrust, 1);
      flame.visible = state.thrust > 0.01;
      nozzleGlow.material.emissiveIntensity = state.thrust * 3;
      thrustLight.intensity = state.thrust * 26;
      beacon.material.emissiveIntensity = (Math.sin(t * 3) > 0.6 ? 4 : 0.4);
    },
    colliders: [{ x: 0, z: 0, r: 2.7 }],
  };
}
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// ---------- 월면차 (4인승) ----------
// 앞쪽 = +X. 좌석 4개: 앞줄(운전석 · 옆자리) + 뒷줄 2개. userData.seats = 앉은 아바타 root의 로컬 위치
// 24대를 그리므로 모양은 한 번만 만들어 재질별로 합친다: 몸체 2덩어리(금속·무광) + 바퀴 4개 = 월면차 1대에 그리기 6번
function buildRoverParts() {
  const g = new THREE.Group();
  const metal = M.metal(), gold = M.gold(), white = M.white(), mint = M.mint(), dark = M.dark();
  const tire = new THREE.MeshStandardMaterial({ color: '#7d7c80', roughness: 0.8, metalness: 0.4 });
  const seatM = new THREE.MeshStandardMaterial({ color: '#4a5168', roughness: 0.7 });
  const axles = [];
  g.add(mesh(new RoundedBoxGeometry(3.25, 0.2, 1.72, 2, 0.05), metal, [0, 0.66, 0]));
  // 앞 계기판(금박 상자) + 가운데 조종간
  g.add(mesh(new RoundedBoxGeometry(0.62, 0.34, 1.36, 2, 0.06), gold, [1.27, 0.88, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // 바퀴는 축 그룹에 넣어 굴러가게 한다 (바큇살 무늬가 보이도록 허브에 줄무늬)
    const axle = new THREE.Group();
    axle.position.set(1.24 * sx, 0.42, 0.98 * sz);
    axle.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 26), tire, [0, 0, 0], [Math.PI / 2, 0, 0]));
    axle.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 16), mint, [0, 0, 0], [Math.PI / 2, 0, 0]));
    for (let k = 0; k < 3; k++) axle.add(mesh(new THREE.BoxGeometry(0.06, 0.74, 0.255), dark, [0, 0, 0], [0, 0, (k * Math.PI) / 3]));
    axle.userData.front = sx > 0;
    g.add(axle);
    axles.push(axle);
    g.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 18, 1, true, Math.PI / 2, Math.PI), white, [1.24 * sx, 0.44, 0.98 * sz], [Math.PI / 2, 0, 0]));
  }
  // 좌석 4개 (뒷줄은 살짝 높여 앞이 보이게)
  const seats = [];
  for (const [sx, lift] of [[0.42, 0], [-0.6, 0.07]]) {
    for (const sz of [1, -1]) {
      g.add(mesh(new RoundedBoxGeometry(0.5, 0.08, 0.5, 2, 0.03), seatM, [sx, 0.82 + lift, 0.4 * sz]));
      g.add(mesh(new RoundedBoxGeometry(0.08, 0.5, 0.5, 2, 0.03), seatM, [sx - 0.27, 1.05 + lift, 0.4 * sz]));
      if (lift) g.add(mesh(new RoundedBoxGeometry(0.46, lift + 0.02, 0.46, 1, 0.01), metal, [sx, 0.76 + lift / 2, 0.4 * sz]));
      seats.push(new THREE.Vector3(sx - 0.05, 0.58 + lift, 0.4 * sz));
    }
  }
  g.add(cyl([0.86, 0.8, 0], [0.98, 1.3, 0], 0.03, metal));
  g.add(mesh(new RoundedBoxGeometry(0.36, 0.22, 0.5, 2, 0.04), white, [1.0, 1.38, 0], [0, 0, -0.3]));
  // 뒤쪽 통신 안테나(우산 모양) · 앞쪽 TV 카메라
  g.add(cyl([-1.5, 0.8, -0.66], [-1.5, 2.15, -0.66], 0.03, metal));
  g.add(mesh(new THREE.ConeGeometry(0.5, 0.22, 24, 1, true), gold, [-1.5, 2.23, -0.66], [Math.PI, 0, 0]));
  g.add(cyl([1.5, 0.8, 0.58], [1.5, 1.55, 0.58], 0.025, metal));
  g.add(mesh(new RoundedBoxGeometry(0.2, 0.16, 0.24, 2, 0.03), dark, [1.53, 1.6, 0.58]));
  return { g, axles, seats };
}
// 여러 도형을 한 덩어리로: 각 도형의 색을 정점 색으로 옮겨 재질 하나로 그린다
function bake(meshes, inv) {
  const m4 = new THREE.Matrix4();
  const geos = meshes.map((o) => {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos, false);
}
let ROVER_TPL = null;
function roverTemplate() {
  if (ROVER_TPL) return ROVER_TPL;
  const { g, axles, seats } = buildRoverParts();
  g.updateMatrixWorld(true);
  const inAxle = new Set();
  axles.forEach((a) => a.traverse((o) => inAxle.add(o)));
  const metal = [], matte = [];
  g.traverse((o) => { if (o.isMesh && !inAxle.has(o)) (o.material.metalness >= 0.7 ? metal : matte).push(o); });
  const a0 = axles[0];
  const wheel = [];
  a0.traverse((o) => o.isMesh && wheel.push(o));
  ROVER_TPL = {
    metal: bake(metal, new THREE.Matrix4()),
    matte: bake(matte, new THREE.Matrix4()),
    wheel: bake(wheel, new THREE.Matrix4().copy(a0.matrixWorld).invert()),
    axles: axles.map((a) => ({ pos: a.position.clone(), front: a.userData.front })),
    seats,
    mats: {
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.8, side: THREE.DoubleSide }),
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12, side: THREE.DoubleSide }),
      wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.35 }),
    },
  };
  return ROVER_TPL;
}
function createRover() {
  const T = roverTemplate();
  const g = new THREE.Group();
  for (const k of ['metal', 'matte']) {
    const m = new THREE.Mesh(T[k], T.mats[k]);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const wheels = T.axles.map((a) => {
    const axle = new THREE.Group();
    axle.position.copy(a.pos);
    const m = new THREE.Mesh(T.wheel, T.mats.wheel);
    m.castShadow = true;
    axle.add(m);
    g.add(axle);
    return { axle, front: a.front };
  });
  g.userData.wheels = wheels;
  g.userData.seats = T.seats.map((v) => v.clone());
  return g;
}

// ---------- 착륙지 소품 · 멀리 언덕 위 기지 ----------
export function createMoonBase({ heightAt, normalAt, sunDir, earthDir, boulders = [] }) {
  const L = MOON_LAYOUT;
  const g = new THREE.Group();
  const colliders = [];
  const updaters = [];
  const at = (o, x, z, yOff = 0) => {
    o.position.set(x, heightAt(x, z) + yOff, z);
    g.add(o);
    return o;
  };
  const tiltTo = (o, x, z, yaw) => {
    const n = normalAt(x, z, new THREE.Vector3());
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  };

  // 기지 돔 '달 기지 라운지' (착륙지에서 북동쪽 언덕 위, 약 40 m)
  const domeTex = canvasTexture(1024, 512, (c, w, h) => {
    c.fillStyle = '#efebe4';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(110,108,118,0.38)';
    c.lineWidth = 3;
    for (let i = 0; i <= 24; i++) { c.beginPath(); c.moveTo((i / 24) * w, 0); c.lineTo((i / 24) * w, h); c.stroke(); }
    for (let j = 1; j < 6; j++) { c.beginPath(); c.moveTo(0, (j / 6) * h); c.lineTo(w, (j / 6) * h); c.stroke(); }
    c.fillStyle = '#5fe0c3';
    c.fillRect(0, h * 0.86, w, h * 0.05);
  });
  const hub = new THREE.Group();
  at(hub, L.hub.x, L.hub.z);
  hub.add(mesh(new THREE.SphereGeometry(L.hub.r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.5 })));
  hub.add(mesh(new THREE.TorusGeometry(L.hub.r + 0.2, 1.0, 12, 64), M.regolith(), [0, 0.05, 0], [Math.PI / 2, 0, 0], [1, 1, 0.55]));
  const winMat = M.glow('#ffd9a8', 1.8);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const el = 0.42;
    const p = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(L.hub.r + 0.02);
    const w = mesh(new THREE.CircleGeometry(0.38, 24), winMat, [p.x, p.y, p.z]);
    w.lookAt(p.clone().multiplyScalar(2));
    hub.add(w);
  }
  // 입구 터널: 착륙지 쪽을 향함
  const toSite = Math.atan2(-(L.lander.z - L.hub.z), L.lander.x - L.hub.x);
  const tunnel = new THREE.Group();
  tunnel.rotation.y = toSite;
  hub.add(tunnel);
  tunnel.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.0, 40, 1, false, 0, Math.PI), M.shell(), [L.hub.r + 0.8, 0, 0], [0, 0, Math.PI / 2]));
  tunnel.add(mesh(new THREE.TorusGeometry(1.43, 0.11, 10, 40, Math.PI), M.mint(), [L.hub.r + 2.3, 0, 0], [0, Math.PI / 2, 0]));
  const doorMat = new THREE.MeshStandardMaterial({ color: '#13203f', emissive: '#6ff0d2', emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.3 });
  tunnel.add(mesh(new THREE.CircleGeometry(1.32, 40, 0, Math.PI), doorMat, [L.hub.r + 2.28, 0.01, 0], [0, Math.PI / 2, 0]));
  tunnel.add(mesh(new THREE.BoxGeometry(0.06, 1.85, 0.08), M.glow('#6ff0d2', 2), [L.hub.r + 2.32, 0.93, 0]));
  const dirX = Math.cos(-toSite), dirZ = Math.sin(-toSite);
  const hubSign = signBoard(['달 기지 라운지', '상점 · 도감 · 우주선 꾸미기'], { w: 2.5, h: 0.7, y: 1.9, accent: '#6ff0d2' });
  const sgx = L.hub.x + dirX * (L.hub.r + 3.2) + dirZ * 2.3, sgz = L.hub.z + dirZ * (L.hub.r + 3.2) - dirX * 2.3;
  at(hubSign, sgx, sgz);
  hubSign.rotation.y = toSite + Math.PI / 2;
  hub.add(cyl([0, L.hub.r - 0.1, 0], [0, L.hub.r + 1.6, 0], 0.05, M.metal()));
  const hubBeacon = mesh(new THREE.SphereGeometry(0.13, 12, 8), M.glow('#ff5d6c', 3), [0, L.hub.r + 1.7, 0]);
  hub.add(hubBeacon);
  updaters.push((t) => (hubBeacon.material.emissiveIntensity = Math.sin(t * 2.4 + 1) > 0.5 ? 4 : 0.3));
  colliders.push({ x: L.hub.x, z: L.hub.z, r: L.hub.r + 0.9 });
  for (let k = 1; k <= 3; k++) colliders.push({ x: L.hub.x + dirX * (L.hub.r + k * 0.75), z: L.hub.z + dirZ * (L.hub.r + k * 0.75), r: 1.45 });
  const hubDoor = new THREE.Vector3(L.hub.x + dirX * (L.hub.r + 3.0), 0, L.hub.z + dirZ * (L.hub.r + 3.0));

  // 거주 모듈 (레골리스를 덮어 방사선 차폐)
  {
    const md = L.module;
    const mg = new THREE.Group();
    at(mg, md.x, md.z);
    mg.rotation.y = md.rot;
    mg.add(mesh(new THREE.CylinderGeometry(1.9, 1.9, 8, 36), M.shell(), [0, 1.25, 0], [0, 0, Math.PI / 2]));
    mg.add(mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.regolith(), [0, 0, 0], [0, 0, 0], [3.7, 2.9, 2.6]));
    for (const s of [-1, 1]) {
      mg.add(mesh(new THREE.CircleGeometry(0.42, 24), winMat, [4.02 * s, 1.7, 0], [0, (Math.PI / 2) * s, 0]));
      mg.add(mesh(new THREE.TorusGeometry(1.9, 0.09, 8, 40), M.coral(), [3.95 * s, 1.25, 0], [0, Math.PI / 2, 0]));
    }
    for (let k = -1; k <= 1; k++) colliders.push({ x: md.x + Math.cos(md.rot) * k * 2.8, z: md.z - Math.sin(md.rot) * k * 2.8, r: 2.9 });
  }
  // 태양전지판: 낮은 해를 바라보도록 세움
  for (const s of L.solar) {
    const sg = new THREE.Group();
    at(sg, s.x, s.z);
    sg.add(cyl([0, 0, 0], [0, 3.2, 0], 0.09, M.metal()));
    const panel = new THREE.Group();
    panel.position.y = 3.2;
    const pm = new THREE.MeshStandardMaterial({ map: solarTex(), roughness: 0.25, metalness: 0.6, emissive: '#0b1640', emissiveIntensity: 0.35, side: THREE.DoubleSide });
    panel.add(mesh(new THREE.BoxGeometry(2.3, 3.4, 0.05), pm));
    panel.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.08), M.metal(), [0, 1.72, 0]));
    sg.add(panel);
    panel.lookAt(panel.getWorldPosition(new THREE.Vector3()).add(sunDir.clone().multiplyScalar(10)));
    colliders.push({ x: s.x, z: s.z, r: 0.6 });
  }
  // 통신 안테나: 지구를 향함 (달 앞면에서는 지구가 거의 한자리에 떠 있다)
  const dish = new THREE.Group();
  at(dish, L.dish.x, L.dish.z);
  dish.add(cyl([0, 0, 0], [0, 2.5, 0], 0.13, M.metal()));
  const dishHead = new THREE.Group();
  dishHead.position.y = 2.8;
  dish.add(dishHead);
  dishHead.add(mesh(new THREE.SphereGeometry(1.5, 40, 12, 0, Math.PI * 2, 0, 0.62), new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.4, side: THREE.DoubleSide }), [0, 0, 1.5], [-Math.PI / 2, 0, 0]));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    dishHead.add(cyl([Math.cos(a) * 0.87, Math.sin(a) * 0.87, 0.28], [0, 0, 1.18], 0.02, M.metal()));
  }
  dishHead.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 12), M.glow('#ff8f7a', 1.5), [0, 0, 1.22], [Math.PI / 2, 0, 0]));
  dishHead.lookAt(dishHead.getWorldPosition(new THREE.Vector3()).add(earthDir.clone().multiplyScalar(100)));
  colliders.push({ x: L.dish.x, z: L.dish.z, r: 0.8 });

  // 월면차 여러 대: 땅 기울기에 맞춰 세워 둠 (충돌 원 2개씩 · 움직이면 따라 옮김)
  const rovers = L.rovers.map((rv, i) => {
    const rg = createRover();
    at(rg, rv.x, rv.z);
    tiltTo(rg, rv.x, rv.z, rv.rot);
    rg.userData.yaw = rv.rot;
    const cols = [{ x: 0, z: 0, r: 1.25, rv: i }, { x: 0, z: 0, r: 1.25, rv: i }];
    colliders.push(...cols);
    const sync = () => {
      const yaw = rg.userData.yaw;
      cols[0].x = rg.position.x + Math.cos(yaw) * 0.85;
      cols[0].z = rg.position.z - Math.sin(yaw) * 0.85;
      cols[1].x = rg.position.x - Math.cos(yaw) * 0.85;
      cols[1].z = rg.position.z + Math.sin(yaw) * 0.85;
    };
    sync();
    return { i, group: rg, wheels: rg.userData.wheels, seats: rg.userData.seats, colliders: cols, sync };
  });

  // 관측 망원경
  const scope = new THREE.Group();
  at(scope, L.scope.x, L.scope.z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    scope.add(cyl([Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [0, 1.2, 0], 0.025, M.metal()));
  }
  const tubeG = new THREE.Group();
  tubeG.rotation.y = Math.PI * 0.15;
  const tube = mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 20), M.lav(), [0, 1.42, 0]);
  tube.rotation.set(-1.05, 0, 0);
  tubeG.add(tube);
  scope.add(tubeG);
  colliders.push({ x: L.scope.x, z: L.scope.z, r: 0.6 });

  // 점프 측정 기둥 (0.5 m마다 색 띠)
  const pole = new THREE.Group();
  at(pole, L.pole.x, L.pole.z);
  for (let i = 0; i < 8; i++) pole.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 14), i % 2 ? M.white() : M.mint(), [0, 0.25 + i * 0.5, 0]));
  pole.add(mesh(new THREE.SphereGeometry(0.1, 14, 10), M.glow('#ffd166', 2), [0, 4.06, 0]));
  pole.add(mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.1, 24), M.metal(), [0, 0.05, 0]));
  for (const hm of [1, 2, 3]) {
    const lab = textSprite(`${hm} m`, { size: 46 });
    lab.position.set(0.4, hm, 0);
    lab.scale.set(0.58, 0.22, 1);
    pole.add(lab);
  }
  pole.add(mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 24), M.glow('#6fb4ff', 2), [0, 0.29, 0], [Math.PI / 2, 0, 0]));
  const earthLab = textSprite('지구 0.29 m', { size: 36, color: '#9cc8ff' });
  earthLab.position.set(-0.55, 0.36, 0);
  earthLab.scale.set(0.7, 0.26, 1);
  pole.add(earthLab);
  const bestRing = mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 28), M.glow('#ffd166', 2.6), [0, 0, 0], [Math.PI / 2, 0, 0]);
  bestRing.visible = false;
  pole.add(bestRing);
  const bestLab = textSprite('내 최고', { size: 40, color: '#ffd166' });
  bestLab.scale.set(0.62, 0.23, 1);
  bestLab.visible = false;
  pole.add(bestLab);
  colliders.push({ x: L.pole.x, z: L.pole.z, r: 0.5 });

  // 망치·깃털 실험대
  const stand = new THREE.Group();
  at(stand, L.stand.x, L.stand.z);
  stand.rotation.y = -0.35;
  for (const s of [-1, 1]) stand.add(cyl([0.62 * s, 0, 0.25], [0.55 * s, 1.85, 0], 0.035, M.metal()), cyl([0.62 * s, 0, -0.25], [0.55 * s, 1.85, 0], 0.035, M.metal()));
  stand.add(cyl([-0.6, 1.85, 0], [0.6, 1.85, 0], 0.045, M.metal()));
  for (const s of [-1, 1]) stand.add(mesh(new RoundedBoxGeometry(0.12, 0.1, 0.12, 2, 0.02), M.coral(), [0.26 * s, 1.8, 0]));
  const hammer = new THREE.Group();
  hammer.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.36, 10), new THREE.MeshStandardMaterial({ color: '#2f3446', roughness: 0.5 }), [0, -0.18, 0]));
  hammer.add(mesh(new RoundedBoxGeometry(0.2, 0.065, 0.07, 2, 0.015), M.metal(), [0, -0.38, 0]));
  const featherTex = canvasTexture(64, 256, (c, w, hh) => {
    c.clearRect(0, 0, w, hh);
    c.fillStyle = '#e9e3d8';
    c.beginPath();
    c.moveTo(w / 2, 6);
    c.quadraticCurveTo(w * 0.95, hh * 0.35, w * 0.6, hh * 0.92);
    c.lineTo(w * 0.4, hh * 0.92);
    c.quadraticCurveTo(w * 0.05, hh * 0.35, w / 2, 6);
    c.fill();
    c.strokeStyle = 'rgba(120,96,70,0.55)';
    c.lineWidth = 2;
    for (let y = 30; y < hh * 0.88; y += 9) { c.beginPath(); c.moveTo(w / 2, y); c.lineTo(w * 0.15, y + 16); c.moveTo(w / 2, y); c.lineTo(w * 0.85, y + 16); c.stroke(); }
    c.fillStyle = 'rgba(130,100,72,0.7)';
    c.fillRect(w / 2 - 2, 10, 4, hh - 14);
  });
  const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.3), new THREE.MeshStandardMaterial({ map: featherTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.8 }));
  feather.castShadow = true;
  feather.position.y = -0.16;
  const featherG = new THREE.Group();
  featherG.add(feather);
  const HANG = 1.75;
  hammer.position.set(-0.26, HANG, 0);
  featherG.position.set(0.26, HANG, 0);
  stand.add(hammer, featherG);
  colliders.push({ x: L.stand.x, z: L.stand.z, r: 0.7 });

  // 사진 명소: 언덕 꼭대기 바닥 표시(땅을 따라 휘어짐) + 아래쪽 삼각대 카메라
  const photoTex = canvasTexture(512, 512, (c, w) => {
    c.clearRect(0, 0, w, w);
    c.strokeStyle = 'rgba(255,209,102,0.75)';
    c.lineWidth = 9;
    c.setLineDash([26, 22]);
    c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,209,102,0.55)';
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.ellipse(w * (0.2 + i * 0.2), w * 0.55, 20, 30, 0, 0, Math.PI * 2); c.fill();
    }
  });
  const pg = new THREE.PlaneGeometry(4.6, 4.6, 24, 24);
  pg.rotateX(-Math.PI / 2);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i) + L.photo.x, z = pp.getZ(i) + L.photo.z;
    pp.setY(i, heightAt(x, z) + 0.035);
  }
  pg.computeVertexNormals();
  const photoDecal = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: photoTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  photoDecal.position.set(L.photo.x, 0, L.photo.z);
  photoDecal.receiveShadow = true;
  g.add(photoDecal);
  const camProp = new THREE.Group();
  const cpx = L.photo.x + 0.5, cpz = L.photo.z + 7.4;
  at(camProp, cpx, cpz);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    camProp.add(cyl([Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], [0, 1.2, 0], 0.02, M.metal()));
  }
  camProp.add(mesh(new RoundedBoxGeometry(0.34, 0.24, 0.2, 2, 0.04), M.dark(), [0, 1.34, 0]));
  camProp.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 16), M.metal(), [0, 1.34, -0.15], [Math.PI / 2, 0, 0]));
  const camLed = mesh(new THREE.SphereGeometry(0.025, 8, 6), M.glow('#ff5d6c', 3), [0.12, 1.44, -0.1]);
  camProp.add(camLed);
  updaters.push((t) => (camLed.material.emissiveIntensity = Math.sin(t * 5) > 0 ? 4 : 0.5));
  colliders.push({ x: cpx, z: cpz, r: 0.45 });

  for (const b of boulders) colliders.push(b);

  const H = (x, z, y) => new THREE.Vector3(x, heightAt(x, z) + y, z);
  const hotspots = [
    { key: 'lander', label: '달마중호 · 우주로 출발', act: '우주선 타기 (목적지 고르기)', cls: 'coral', r: 3.4 },
    { key: 'hub', pos: H(hubDoor.x, hubDoor.z, 2.6), label: '달 기지 라운지', act: '라운지 들어가기', cls: '', r: 3.6 },
    { key: 'photo', pos: H(L.photo.x, L.photo.z + 1.6, 0.25), label: '지구 배경 단체 사진', act: '단체 사진 찍기', cls: 'orange', r: 2.8 },
    { key: 'hammer', pos: H(L.stand.x, L.stand.z, 2.5), label: '망치·깃털 실험', act: '망치와 깃털 동시에 놓기', cls: 'lav', r: 2.6 },
    { key: 'pole', pos: H(L.pole.x, L.pole.z, 4.5), label: '점프 측정 기둥', act: '점프 기록 보기', cls: 'orange', r: 2.4 },
    { key: 'scope', pos: H(L.scope.x, L.scope.z, 2.2), label: '관측 망원경', act: '망원경으로 지구 보기', cls: 'lav', r: 2.4 },
    // 월면차 풍선은 가까운 것(20 m 안)만 보여 화면이 어지럽지 않게
    ...L.rovers.map((rv, i) => ({ key: `rover${i}`, rover: i, pos: H(rv.x, rv.z, 2.5), label: '월면차 · 4인승', act: '타기', cls: '', r: 3.2, max: 20 })),
  ];

  return {
    group: g,
    colliders,
    hotspots,
    hammer,
    feather: featherG,
    HANG,
    stand,
    pole: { group: pole, bestRing, bestLab },
    photoCam: H(cpx, cpz, 1.45),
    rovers,
    tiltTo,
    update(t) { updaters.forEach((f) => f(t)); },
  };
}

// ---------- 발자국 (사라지지 않음) ----------
export function createFootprints(max = 900) {
  const tex = footprintTexture();
  const geo = new THREE.PlaneGeometry(0.15, 0.3);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  let next = 0, filled = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
  return {
    mesh,
    get count() { return filled; },
    add(x, z, heading, side, terrain) {
      // side: -1 왼발 · +1 오른발 (왼발은 좌우 반전)
      const ox = Math.cos(heading) * 0.11 * side, oz = -Math.sin(heading) * 0.11 * side;
      const px = x + ox, pz = z + oz;
      p.set(px, terrain.heightAt(px, pz) + 0.012, pz);
      terrain.normalAt(px, pz, nrm);
      q.setFromUnitVectors(up, nrm).multiply(qy.setFromAxisAngle(up, heading + (Math.random() - 0.5) * 0.12));
      s.set(side < 0 ? -1 : 1, 1, 1);
      m4.compose(p, q, s);
      mesh.setMatrixAt(next, m4);
      next = (next + 1) % max;
      filled = Math.min(max, filled + 1);
      mesh.count = filled;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- 먼지: 공기가 없으니 포물선으로 날아가 그대로 떨어진다 ----------
export function createDust(max = 2400, size = 0.06, color = '#c4bdb1') {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3).fill(0);
  for (let i = 0; i < max; i++) pos[i * 3 + 1] = -9999;
  const vel = new Float32Array(max * 3), ground = new Float32Array(max), alive = new Uint8Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size, color, map: dotTexture(), transparent: true, depthWrite: false, opacity: 0.95 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let cursor = 0;
  let live = 0;
  return {
    points,
    emit(x, y, z, vx, vy, vz, g, heightAt) {
      const i = cursor;
      cursor = (cursor + 1) % max;
      if (!alive[i]) live++;
      alive[i] = 1;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      // 떨어질 자리의 높이를 미리 한 번만 계산
      const tl = (vy + Math.sqrt(vy * vy + 2 * g * 0.3)) / g;
      ground[i] = heightAt(x + vx * tl, z + vz * tl) - 0.02;
    },
    update(dt, g) {
      if (!live) return;
      for (let i = 0; i < max; i++) {
        if (!alive[i]) continue;
        const k = i * 3;
        vel[k + 1] -= g * dt;
        pos[k] += vel[k] * dt;
        pos[k + 1] += vel[k + 1] * dt;
        pos[k + 2] += vel[k + 2] * dt;
        if (vel[k + 1] < 0 && pos[k + 1] < ground[i]) {
          alive[i] = 0;
          live--;
          pos[k + 1] = -9999;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// 달 표면용 반사 환경 (위는 검은 하늘, 아래는 회색 레골리스, 낮은 해)
export function makeMoonEnv(renderer, sunDir) {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 d; void main(){ float g = smoothstep(0.05, -0.25, d.y); vec3 c = mix(vec3(0.008,0.01,0.02), vec3(0.42,0.41,0.39), g); gl_FragColor = vec4(c, 1.0); }',
  }));
  s.add(sky);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(40, 38, 34) }));
  sun.position.copy(sunDir.clone().normalize().multiplyScalar(40));
  s.add(sun);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return env;
}
