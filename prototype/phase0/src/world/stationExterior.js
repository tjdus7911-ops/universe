import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../core/renderer.js';

// 우주 정거장 외부 · 인공위성 · 우주 쓰레기 (시안용 절차적 모델)
const white = () => new THREE.MeshStandardMaterial({ color: '#f2f4fb', roughness: 0.42, metalness: 0.12, map: panelTex() });
const trim = (c = '#b9a6ff') => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.15 });
const metal = () => new THREE.MeshStandardMaterial({ color: '#9aa3b8', roughness: 0.35, metalness: 0.75 });
const foil = () => new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.3, metalness: 0.85, map: foilTex() });
const glow = (c, i = 2.5) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });

let _panel, _foil, _solar;
function panelTex() {
  return (_panel ||= canvasTexture(512, 512, (ctx, w) => {
    ctx.fillStyle = '#f1f3fa';
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = 'rgba(110,115,150,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, w);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 128);
      ctx.lineTo(w, i * 128);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,125,160,0.35)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.arc(i * 128 + 14, j * 128 + 14, 4, 0, 7);
      ctx.fill();
    }
  }, { repeat: [3, 2] }));
}
function foilTex() {
  return (_foil ||= canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = '#c99436';
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${255},${200 + Math.random() * 55},${90 + Math.random() * 60},${Math.random() * 0.25})`;
      ctx.beginPath();
      const x = Math.random() * w, y = Math.random() * w;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 40 - 20);
      ctx.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 40 - 20);
      ctx.fill();
    }
  }));
}
export function solarTex() {
  return (_solar ||= canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#0e1a46';
    ctx.fillRect(0, 0, w, h);
    const cw = w / 8, ch = h / 20;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 20; j++) {
      const g = ctx.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      g.addColorStop(0, '#1d3a8a');
      g.addColorStop(1, '#13286a');
      ctx.fillStyle = g;
      ctx.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
    }
    ctx.strokeStyle = 'rgba(200,220,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cw, 0);
      ctx.lineTo(i * cw, h);
      ctx.stroke();
    }
  }));
}
function solarMat() {
  return new THREE.MeshStandardMaterial({ map: solarTex(), roughness: 0.25, metalness: 0.6, emissive: '#0b1640', emissiveIntensity: 0.35, side: THREE.DoubleSide });
}

function m(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.scale.set(...scale);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function createStationExterior() {
  const g = new THREE.Group();
  const W = white(), T = trim(), T2 = trim('#6ff0d2'), M = metal(), F = foil();
  const blinkers = [];

  // 중앙 허브 (X축 원통) + 양끝 노드
  g.add(m(new THREE.CylinderGeometry(2.4, 2.4, 13, 48, 1), W, [0, 0, 0], [0, 0, Math.PI / 2]));
  for (const x of [-7.4, 7.4]) g.add(m(new THREE.SphereGeometry(2.7, 40, 28), W, [x, 0, 0]));
  for (let x = -6; x <= 6; x += 2) g.add(m(new THREE.TorusGeometry(2.42, 0.09, 8, 48), T, [x, 0, 0], [0, Math.PI / 2, 0]));
  // 거주 링 (전망 데크가 있는 곳) + 바퀴살
  const ring = new THREE.Group();
  ring.add(m(new THREE.TorusGeometry(15, 1.5, 24, 160), W, [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 0.82]));
  const winMat = glow('#ffd9a8', 1.6);
  ring.add(m(new THREE.TorusGeometry(16.44, 0.16, 8, 220), winMat, [0, 0, 0], [0, Math.PI / 2, 0]));
  for (const s of [-1, 1]) ring.add(m(new THREE.TorusGeometry(15.9, 0.1, 6, 220), trim('#b9a6ff'), [0.95 * s, 0, 0], [0, Math.PI / 2, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spoke = m(new THREE.CylinderGeometry(0.42, 0.42, 12.6, 16), W, [0, Math.cos(a) * 8.6, Math.sin(a) * 8.6], [a, 0, 0]);
    ring.add(spoke);
  }
  ring.position.x = -2.5;
  g.add(ring);
  // 트러스 + 태양전지판 (Z축)
  const truss = new THREE.Group();
  const bar = new THREE.BoxGeometry(0.16, 0.16, 46);
  for (const [y, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) truss.add(m(bar, M, [y, z, 0]));
  for (let z = -22; z <= 22; z += 2) {
    truss.add(m(new THREE.BoxGeometry(0.1, 1.5, 0.1), M, [0.7, 0, z]));
    truss.add(m(new THREE.BoxGeometry(0.1, 1.5, 0.1), M, [-0.7, 0, z]));
    truss.add(m(new THREE.BoxGeometry(1.5, 0.1, 0.1), M, [0, 0.7, z], [0, 0, 0]));
  }
  const S = solarMat();
  for (const side of [-1, 1]) {
    for (const z of [-19, -7, 7, 19]) {
      const p = m(new THREE.PlaneGeometry(4.4, 11), S, [side * 3.0, 0, z]);
      p.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
      truss.add(p);
      truss.add(m(new THREE.BoxGeometry(4.5, 0.08, 0.1), M, [side * 3.0, 0, z - 5.5]));
      truss.add(m(new THREE.BoxGeometry(4.5, 0.08, 0.1), M, [side * 3.0, 0, z + 5.5]));
    }
  }
  truss.position.set(-9.6, 0, 0);
  g.add(truss);
  // 라디에이터
  for (const s of [-1, 1]) g.add(m(new THREE.BoxGeometry(3.2, 0.06, 6), new THREE.MeshStandardMaterial({ color: '#f7f8fc', roughness: 0.6 }), [-5.0, 3.0 * s, 0], [0.1 * s, 0, 0]));
  // 에어록 모듈 (+Z 방향, 유영 출발점)
  const air = new THREE.Group();
  air.add(m(new THREE.CylinderGeometry(1.5, 1.5, 4.2, 40), W, [0, 0, 0], [Math.PI / 2, 0, 0]));
  air.add(m(new THREE.TorusGeometry(1.5, 0.16, 12, 40), new THREE.MeshStandardMaterial({ color: '#ffa64d', emissive: '#ff8a2a', emissiveIntensity: 0.6 }), [0, 0, 2.15]));
  air.add(m(new THREE.CircleGeometry(1.32, 40), glow('#ffc98a', 0.28), [0, 0, 2.12]));
  for (const s of [-1, 1]) air.add(m(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 8), new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.4 }), [1.75 * s, 0.6, 0.2], [Math.PI / 2, 0, 0]));
  air.position.set(1.5, 0, 4.4);
  g.add(air);
  const airLight = new THREE.PointLight('#ffd7a3', 2.5, 10, 2);
  airLight.position.set(1.5, 0, 7.4);
  g.add(airLight);
  // 도킹된 개인 우주선 (탑승장)
  const ship = new THREE.Group();
  ship.add(m(new THREE.CapsuleGeometry(1.1, 2.6, 12, 32), new THREE.MeshStandardMaterial({ color: '#fdf7f2', roughness: 0.35, metalness: 0.1 }), [0, 0, 0], [0, 0, Math.PI / 2]));
  ship.add(m(new THREE.SphereGeometry(0.75, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#7cc8ff', roughness: 0.05, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.85 }), [1.6, 0.35, 0], [0, 0, 0], [1, 0.75, 0.85]));
  for (const s of [-1, 1]) ship.add(m(new RoundedBoxGeometry(1.6, 0.16, 1.2, 2, 0.06), trim('#ff8f7a'), [-0.6, -0.3, 1.1 * s], [0, 0, -0.2]));
  ship.add(m(new THREE.ConeGeometry(0.55, 0.9, 24, 1, true), M, [-2.4, 0, 0], [0, 0, Math.PI / 2]));
  ship.add(m(new THREE.CircleGeometry(0.5, 24), glow('#7cf3ff', 3), [-2.86, 0, 0], [0, -Math.PI / 2, 0]));
  ship.position.set(13.4, 0, 0);
  g.add(ship);
  // 항법등 (빨강·초록·흰색 점멸)
  for (const [c, p, ph] of [['#ff4a5a', [-9.6, 0.9, 23], 0], ['#3dff9a', [-9.6, 0.9, -23], 0.5], ['#ffffff', [16.2, 0, 0], 0.25], ['#ffffff', [0, 2.5, 0], 0.75]]) {
    const b = m(new THREE.SphereGeometry(0.16, 12, 8), glow(c, 4), p);
    b.userData.phase = ph;
    blinkers.push(b);
    g.add(b);
  }
  // 금박 단열재 디테일
  g.add(m(new RoundedBoxGeometry(1.6, 1.2, 1.2, 2, 0.08), F, [3.5, 2.6, 0.5]));
  g.add(m(new RoundedBoxGeometry(1.2, 1.0, 1.6, 2, 0.08), F, [-4.6, -2.5, -0.6]));

  return {
    group: g,
    ring,
    airlockPos: new THREE.Vector3(1.5, 0, 7.2),
    colliders: [
      { c: new THREE.Vector3(0, 0, 0), r: 3.0, axis: 'x', half: 7.2 },
      { c: new THREE.Vector3(-7.4, 0, 0), r: 3.1 },
      { c: new THREE.Vector3(7.4, 0, 0), r: 3.1 },
      { c: new THREE.Vector3(1.5, 0, 4.4), r: 1.9, axis: 'z', half: 2.3 },
      { c: new THREE.Vector3(13.4, 0, 0), r: 2.0 },
      { c: new THREE.Vector3(-9.6, 0, 0), r: 1.4, axis: 'z', half: 23 },
    ],
    update(t) {
      ring.rotation.x = t * 0.04;
      for (const b of blinkers) b.visible = ((t + b.userData.phase) % 1.6) < 0.25;
    },
  };
}

export function createSatellite(seed = 1) {
  const g = new THREE.Group();
  g.add(m(new RoundedBoxGeometry(1.4, 1.4, 1.8, 2, 0.08), foil()));
  const S = solarMat();
  for (const s of [-1, 1]) {
    g.add(m(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), metal(), [1.4 * s, 0, 0], [0, 0, Math.PI / 2]));
    g.add(m(new THREE.PlaneGeometry(3.2, 1.6), S, [3.6 * s, 0, 0], [Math.PI / 2, 0, 0]));
  }
  g.add(m(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, 1.0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, side: THREE.DoubleSide }), [0, 0.2, 1.2], [Math.PI / 2, 0, 0]));
  g.userData.spin = new THREE.Vector3(0.05 * seed, 0.08, 0.03);
  return g;
}

// 우주 쓰레기 4종: 인공위성 파편, 로켓 잔해, 작은 금속 조각, 폐기된 장비
export const DEBRIS_KINDS = {
  fragment: { name: '인공위성 파편', note: '고장 나거나 부서진 위성에서 떨어져 나온 조각' },
  rocket: { name: '로켓 잔해', note: '위성을 올린 뒤 궤도에 남은 로켓 상단부 조각' },
  scrap: { name: '작은 금속 조각', note: '충돌·폭발로 생긴 작은 조각 — 크기는 작아도 매우 빠름' },
  equipment: { name: '폐기된 우주 장비', note: '임무를 마친 뒤 버려진 안테나·장비' },
};

function jitter(geo, amt, seed) {
  const p = geo.attributes.position;
  let s = seed * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + rnd() * amt, p.getY(i) + rnd() * amt, p.getZ(i) + rnd() * amt);
  geo.computeVertexNormals();
  return geo;
}

export function createDebris(kind, seed = 1) {
  const g = new THREE.Group();
  if (kind === 'fragment') {
    g.add(m(jitter(new THREE.BoxGeometry(1.4, 0.06, 0.9, 6, 1, 4), 0.08, seed), solarMat()));
    g.add(m(new THREE.BoxGeometry(1.5, 0.08, 0.08), metal(), [0, 0.04, -0.45], [0, 0, 0.2]));
    g.add(m(new THREE.BoxGeometry(0.08, 0.08, 0.7), metal(), [0.72, 0.03, -0.1], [0.3, 0, 0]));
  } else if (kind === 'rocket') {
    const shell = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
    g.add(m(jitter(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 20, 4, true, 0, 4.4), 0.05, seed), shell));
    g.add(m(new THREE.TorusGeometry(0.55, 0.05, 8, 24, 4.4), new THREE.MeshStandardMaterial({ color: '#ff8a5c', roughness: 0.5 }), [0, 0.55, 0], [Math.PI / 2, 0, 0]));
    g.add(m(new THREE.ConeGeometry(0.4, 0.5, 16, 1, true), metal(), [0, -0.95, 0], [Math.PI, 0, 0]));
  } else if (kind === 'scrap') {
    for (let i = 0; i < 4; i++) {
      g.add(m(jitter(new THREE.IcosahedronGeometry(0.22 + (i % 2) * 0.08, 0), 0.07, seed + i), metal(), [(i - 1.5) * 0.35, Math.sin(i * 2) * 0.2, Math.cos(i * 3) * 0.2], [i, i * 2, 0]));
    }
  } else {
    g.add(m(new RoundedBoxGeometry(0.8, 0.6, 0.6, 2, 0.06), foil()));
    g.add(m(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), metal(), [0.2, 0.75, 0], [0, 0, 0.3]));
    g.add(m(new THREE.SphereGeometry(0.42, 18, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, side: THREE.DoubleSide }), [-0.1, 0.1, 0.5], [Math.PI / 2.4, 0, 0]));
  }
  g.userData.kind = kind;
  return g;
}

// 수거 가능한 목표물 강조: 민트색 외곽선(뒤집은 껍데기) + 은은한 빛
export function addHighlight(obj) {
  const hl = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#6ff0d2', side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false });
  obj.traverse((c) => {
    if (c.isMesh) {
      const o = new THREE.Mesh(c.geometry, mat);
      o.position.copy(c.position);
      o.rotation.copy(c.rotation);
      o.scale.copy(c.scale).multiplyScalar(1.12);
      hl.add(o);
    }
  });
  obj.add(hl);
  obj.userData.highlight = { group: hl, mat };
  return hl;
}
