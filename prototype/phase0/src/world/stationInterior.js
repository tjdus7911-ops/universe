import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, FONT, roundRect } from '../core/renderer.js';

// 우주 정거장 중앙 광장 + 거대한 지구 전망창 (시안용 절차적 실내)
// 단위: m. 전망창은 -Z 방향, 광장 중심이 원점.
const R = 12; // 광장 반지름
const SPAN = 2.6; // 전망창 각도(rad)

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: o.m ?? 0.05, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, envMapIntensity: o.env ?? 0.8, side: o.side ?? THREE.FrontSide, map: o.map ?? null });
}

function floorTexture() {
  return canvasTexture(2048, 2048, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#dfe2ee';
    ctx.fillRect(0, 0, w, w);
    // 부드러운 타일 명암
    for (let ring = 0; ring < 14; ring++) {
      for (let a = 0; a < 48; a++) {
        const r0 = ring * 80, r1 = r0 + 80;
        ctx.beginPath();
        ctx.arc(c, c, r1, (a / 48) * Math.PI * 2, ((a + 1) / 48) * Math.PI * 2);
        ctx.arc(c, c, r0, ((a + 1) / 48) * Math.PI * 2, (a / 48) * Math.PI * 2, true);
        ctx.closePath();
        const v = 220 + ((ring * 7 + a * 13) % 9) - 4;
        ctx.fillStyle = `rgb(${v - 2},${v},${v + 8})`;
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(150,140,200,0.28)';
    ctx.lineWidth = 3;
    for (let r = 80; r < c; r += 80) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let a = 0; a < 48; a++) {
      const th = (a / 48) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(th) * 80, c + Math.sin(th) * 80);
      ctx.lineTo(c + Math.cos(th) * c, c + Math.sin(th) * c);
      ctx.stroke();
    }
    // 중앙 엠블럼 (별 + 궤도)
    ctx.fillStyle = '#d8d3f3';
    ctx.beginPath();
    ctx.arc(c, c, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a99bf0';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(c, c, 150, 60, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7fe3cf';
    ctx.beginPath();
    ctx.arc(c, c, 52, 0, Math.PI * 2);
    ctx.fill();
    // 바깥 띠
    ctx.strokeStyle = 'rgba(169,155,240,0.55)';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(c, c, 980, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function wallTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e8eaf3';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,120,160,0.22)';
    ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (const y of [150, 330]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,196,236,0.45)';
    for (let x = 0; x < w; x += 128) {
      roundRect(ctx, x + 18, 180, 92, 120, 18);
      ctx.fill();
    }
  }, { repeat: [10, 1] });
}

function signTexture(lines, opts = {}) {
  return canvasTexture(opts.w || 1024, opts.h || 256, (ctx, w, h) => {
    roundRect(ctx, 6, 6, w - 12, h - 12, 48);
    ctx.fillStyle = opts.bg || 'rgba(16,24,54,0.94)';
    ctx.fill();
    if (opts.hazard) {
      ctx.save();
      ctx.clip();
      for (let x = -h; x < w + h; x += 64) {
        ctx.fillStyle = '#ffa64d';
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + 32, h);
        ctx.lineTo(x + 32 + 24, h - 24);
        ctx.lineTo(x + 24, h - 24);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = opts.ring || '#6ff0d2';
    roundRect(ctx, 6, 6, w - 12, h - 12, 48);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${opts.size || 84}px ${FONT}`;
    ctx.fillText(lines[0], w / 2, lines[1] ? h * 0.4 : h / 2);
    if (lines[1]) {
      ctx.font = `600 ${Math.round((opts.size || 84) * 0.48)}px ${FONT}`;
      ctx.fillStyle = opts.sub || '#9cc8ff';
      ctx.fillText(lines[1], w / 2, h * 0.72);
    }
  });
}

function missionBoardTexture() {
  return canvasTexture(1024, 1400, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#16224e');
    g.addColorStop(1, '#0c1330');
    roundRect(ctx, 8, 8, w - 16, h - 16, 60);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#6ff0d2';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 86px ${FONT}`;
    ctx.fillText('미션 게시판', 70, 150);
    ctx.font = `600 38px ${FONT}`;
    ctx.fillStyle = '#9cc8ff';
    ctx.fillText('오늘의 미션 · 한국 시간 0시 갱신', 72, 215);
    const items = [
      ['궤도 청소 작전', '인공위성 파편 5개 수거', '+30', '#6ff0d2'],
      ['지구 관측', '전망창에서 지구 살펴보기', '+10', '#9cc8ff'],
      ['행성 탐험', '화성 정보 카드 읽기', '+15', '#ff8f7a'],
      ['첫 우주 유영', '정거장 밖으로 나가 보기', '배지', '#b9a6ff'],
    ];
    items.forEach(([t, s, r, c], i) => {
      const y = 290 + i * 262;
      roundRect(ctx, 56, y, w - 112, 220, 40);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(140, y + 110, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c1330';
      ctx.font = `800 44px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 140, y + 126);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText(t, 216, y + 96);
      ctx.fillStyle = 'rgba(220,230,255,0.82)';
      ctx.font = `500 38px ${FONT}`;
      ctx.fillText(s, 218, y + 158);
      roundRect(ctx, w - 250, y + 74, 150, 72, 36);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.fillStyle = '#0c1330';
      ctx.font = `800 40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(r, w - 175, y + 124);
      ctx.textAlign = 'left';
    });
  });
}

function billboardTexture() {
  return canvasTexture(1600, 900, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1b1f52');
    g.addColorStop(1, '#2b1a4a');
    roundRect(ctx, 8, 8, w - 16, h - 16, 60);
    ctx.fillStyle = g;
    ctx.fill();
    // 일반 콘텐츠 라벨
    roundRect(ctx, 70, 64, 330, 76, 38);
    ctx.fillStyle = '#b9a6ff';
    ctx.fill();
    ctx.fillStyle = '#16123a';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText('오늘의 우주 상식', 100, 116);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 82px ${FONT}`;
    ctx.fillText('달의 중력은 지구의 0.165배', 70, 270);
    ctx.font = `500 46px ${FONT}`;
    ctx.fillStyle = 'rgba(230,236,255,0.9)';
    ctx.fillText('같은 힘으로 뛰면 약 6배 높이, 약 6배 오래 떠 있어요.', 72, 352);
    ctx.font = `500 32px ${FONT}`;
    ctx.fillStyle = 'rgba(156,200,255,0.9)';
    ctx.fillText('출처: NASA Moon Fact Sheet · 검증일 2026-11-12', 72, 412);
    // 광고 구역 (시각적으로 분리 + '광고' 표시)
    roundRect(ctx, 70, 480, w - 140, 340, 44);
    ctx.fillStyle = 'rgba(255,143,122,0.12)';
    ctx.fill();
    ctx.setLineDash([18, 14]);
    ctx.strokeStyle = '#ff8f7a';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.setLineDash([]);
    roundRect(ctx, 110, 520, 130, 64, 32);
    ctx.fillStyle = '#ff8f7a';
    ctx.fill();
    ctx.fillStyle = '#2a0f0a';
    ctx.font = `800 38px ${FONT}`;
    ctx.fillText('광고', 135, 565);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 56px ${FONT}`;
    ctx.fillText('제휴 콘텐츠 자리 (예시)', 110, 680);
    ctx.font = `500 36px ${FONT}`;
    ctx.fillStyle = 'rgba(255,220,210,0.9)';
    ctx.fillText('운영자 승인을 받은 광고만 이 구역에 노출됩니다', 112, 750);
  });
}

function plant(group, x, z, y, s = 1, seed = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.24 * s, 0.42 * s, 24), std('#ffffff', { r: 0.35 }));
  pot.position.set(x, y + 0.21 * s, z);
  pot.castShadow = true;
  group.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32 * s, 0.03 * s, 8, 24), std('#a99bf0', { r: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y + 0.42 * s, z);
  group.add(rim);
  const greens = ['#5fbf7f', '#4aa86b', '#7cd39a', '#3f9a66'];
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 16, 12), std(greens[i % 4], { r: 0.6 }));
    const a = rnd() * Math.PI * 2, d = rnd() * 0.18 * s;
    leaf.position.set(x + Math.cos(a) * d, y + (0.55 + rnd() * 0.45) * s, z + Math.sin(a) * d);
    leaf.scale.set(1, 0.75 + rnd() * 0.5, 1);
    leaf.castShadow = true;
    group.add(leaf);
  }
}

// 광장 중심과 같은 원 위에 놓인 곡선 소파 (창을 바라보고 앉도록 등받이는 안쪽)
function sofa(group, thetaC, radius, arc, color) {
  const g = new THREE.Group();
  const rotZ = thetaC - Math.PI / 2 - arc / 2;
  const mk = (r, tube, m, y, sz) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 16, 64, arc), m);
    mesh.rotation.set(-Math.PI / 2, 0, rotZ);
    mesh.scale.set(1, 1, sz);
    mesh.position.y = y;
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  mk(radius, 0.36, std('#ffffff', { r: 0.4 }), 0.22, 0.6);
  mk(radius + 0.02, 0.31, std(color, { r: 0.78 }), 0.44, 0.45);
  mk(radius - 0.34, 0.15, std(color, { r: 0.78 }), 0.78, 2.4);
  group.add(g);
  return g;
}

export function createStationInterior() {
  const group = new THREE.Group();
  const hotspots = {};

  // 바닥
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 128), std('#ffffff', { r: 0.42, m: 0.04, map: floorTexture(), env: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const ringMat = std('#6ff0d2', { e: '#6ff0d2', ei: 2.6 });
  for (const [r, m] of [[4.3, ringMat], [8.9, std('#b9a6ff', { e: '#b9a6ff', ei: 1.6 })]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 8, 160), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    group.add(ring);
  }

  // 전망창 유리 + 창틀
  const t0 = Math.PI - SPAN / 2;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 7.2, 96, 1, true, t0, SPAN),
    new THREE.MeshPhysicalMaterial({ color: '#cfe9ff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false, envMapIntensity: 0.9 }),
  );
  glass.position.y = 0.6 + 3.6;
  glass.renderOrder = 2;
  group.add(glass);
  const frameMat = std('#f6f7fc', { r: 0.32, m: 0.1 });
  const sill = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.6, 96, 1, true, t0, SPAN), std('#eef0f8', { r: 0.4, side: THREE.BackSide }));
  sill.position.y = 0.3;
  group.add(sill);
  const ledge = new THREE.Mesh(new THREE.RingGeometry(R - 1.3, R, 96, 1, Math.PI / 2 - SPAN / 2, SPAN), std('#ffffff', { r: 0.35, side: THREE.DoubleSide }));
  ledge.rotation.x = -Math.PI / 2;
  ledge.position.y = 0.6;
  ledge.receiveShadow = true;
  group.add(ledge);
  const ledgeFront = new THREE.Mesh(new THREE.CylinderGeometry(R - 1.3, R - 1.3, 0.6, 96, 1, true, t0, SPAN), std('#e4e6f2', { r: 0.4 }));
  ledgeFront.position.y = 0.3;
  group.add(ledgeFront);
  const ledgeGlow = new THREE.Mesh(new THREE.TorusGeometry(R - 1.32, 0.02, 6, 120, SPAN), std('#6ff0d2', { e: '#6ff0d2', ei: 2.2 }));
  ledgeGlow.rotation.x = Math.PI / 2;
  ledgeGlow.rotation.z = Math.PI / 2 - SPAN / 2 + Math.PI;
  ledgeGlow.position.y = 0.58;
  group.add(ledgeGlow);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.7, 96, 1, true, t0, SPAN), frameMat);
  top.material.side = THREE.BackSide;
  top.position.y = 0.6 + 7.2 + 0.35;
  group.add(top);
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const th = t0 + (SPAN * i) / n;
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.22, 7.4, 0.36, 2, 0.08), frameMat);
    m.position.set(Math.sin(th) * (R - 0.05), 0.6 + 3.6, Math.cos(th) * (R - 0.05));
    m.rotation.y = th;
    m.castShadow = true;
    group.add(m);
  }
  const midBar = new THREE.Mesh(new THREE.TorusGeometry(R - 0.08, 0.07, 8, 120, SPAN), frameMat);
  midBar.rotation.x = Math.PI / 2;
  midBar.rotation.z = Math.PI / 2 - SPAN / 2 + Math.PI;
  midBar.position.y = 5.4;
  group.add(midBar);

  // 나머지 벽 (안쪽 면)
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 8.6, 96, 1, true, t0 + SPAN, Math.PI * 2 - SPAN), std('#ffffff', { r: 0.55, map: wallTexture(), side: THREE.BackSide }));
  wall.position.y = 4.3;
  wall.receiveShadow = true;
  group.add(wall);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.22, 96, 1, true, t0 + SPAN, Math.PI * 2 - SPAN), std('#a99bf0', { r: 0.45, side: THREE.BackSide }));
  band.position.y = 1.1;
  group.add(band);
  const cove = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.12, 96, 1, true, t0 + SPAN, Math.PI * 2 - SPAN), std('#ffe2bf', { e: '#ffd7a8', ei: 2.4, side: THREE.BackSide }));
  cove.position.y = 7.6;
  group.add(cove);
  // 천장
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R, 96), std('#f1f2f9', { r: 0.6, side: THREE.BackSide }));
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = 8.6;
  group.add(ceil);
  const lightDisc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), std('#fff4e4', { e: '#fff0dc', ei: 1.1 }));
  lightDisc.rotation.x = Math.PI / 2;
  lightDisc.position.y = 8.58;
  group.add(lightDisc);

  // 소파·화분
  sofa(group, Math.PI + 0.42, 6.6, 0.5, '#ff9f8c');
  sofa(group, Math.PI - 0.42, 6.6, 0.5, '#79dcc6');
  for (let i = 0; i < 6; i++) {
    const th = t0 + 0.18 + i * ((SPAN - 0.36) / 5);
    if (i === 2 || i === 3) continue;
    plant(group, Math.sin(th) * (R - 0.75), Math.cos(th) * (R - 0.75), 0.6, 0.85, i + 3);
  }
  plant(group, -8.6, 4.8, 0, 1.25, 11);
  plant(group, 8.8, 4.2, 0, 1.25, 17);

  // 미션 게시판 (왼쪽 앞)
  const board = new THREE.Group();
  const bth = t0 + SPAN + 0.32;
  board.position.set(Math.sin(bth) * (R - 0.9), 0, Math.cos(bth) * (R - 0.9));
  board.lookAt(0, 0, 0);
  const post = new THREE.Mesh(new RoundedBoxGeometry(2.3, 3.5, 0.26, 3, 0.1), std('#ffffff', { r: 0.4 }));
  post.position.y = 2.15;
  post.castShadow = true;
  board.add(post);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.73), new THREE.MeshBasicMaterial({ map: missionBoardTexture(), toneMapped: false }));
  screen.position.set(0, 2.2, 0.14);
  board.add(screen);
  group.add(board);
  hotspots.board = new THREE.Vector3(board.position.x, 4.2, board.position.z);

  // 광고 전광판 (오른쪽 앞)
  const bb = new THREE.Group();
  const ath = t0 - 0.36;
  bb.position.set(Math.sin(ath) * (R - 0.6), 0, Math.cos(ath) * (R - 0.6));
  bb.lookAt(0, 0, 0);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(4.4, 2.6, 0.24, 3, 0.12), std('#ffffff', { r: 0.4 }));
  frame.position.y = 3.3;
  bb.add(frame);
  const bscreen = new THREE.Mesh(new THREE.PlaneGeometry(4.16, 2.34), new THREE.MeshBasicMaterial({ map: billboardTexture(), toneMapped: false }));
  bscreen.position.set(0, 3.3, 0.13);
  bb.add(bscreen);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 12), std('#d9dcec', { r: 0.3, m: 0.4 }));
    leg.position.set(1.4 * s, 1.0, 0);
    bb.add(leg);
  }
  group.add(bb);
  hotspots.billboard = new THREE.Vector3(bb.position.x, 4.9, bb.position.z);

  // 우주 유영 출입구 (왼쪽 벽, 에어록)
  const air = new THREE.Group();
  const eth = t0 + SPAN + 0.95;
  air.position.set(Math.sin(eth) * (R - 0.05), 0, Math.cos(eth) * (R - 0.05));
  air.lookAt(0, 0, 0);
  const ringDoor = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.22, 20, 64), std('#e9ebf6', { r: 0.3, m: 0.3 }));
  ringDoor.position.set(0, 1.9, 0.05);
  air.add(ringDoor);
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(1.42, 64), std('#58607e', { r: 0.35, m: 0.5 }));
  hatch.position.set(0, 1.9, 0.02);
  air.add(hatch);
  const hz = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 48), std('#ffa64d', { e: '#ff9a3c', ei: 1.4 }));
  hz.position.set(0, 1.9, 0.06);
  air.add(hz);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 32), std('#d9dcec', { r: 0.3, m: 0.6 }));
  wheel.position.set(0, 1.9, 0.12);
  air.add(wheel);
  const airSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: signTexture(['우주 유영 출입구', 'EVA · 우주복 착용 필수'], { hazard: true, ring: '#ffa64d' }), transparent: true, toneMapped: false }));
  airSign.position.set(0, 3.95, 0.08);
  air.add(airSign);
  group.add(air);
  hotspots.airlock = new THREE.Vector3(air.position.x, 4.6, air.position.z);

  // 행성 관측실 · 우주선 탑승장 표지
  const obs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(['행성 관측실 →', '우주 탐험 출발'], { ring: '#b9a6ff' }), transparent: true, toneMapped: false }));
  const oth = t0 - 1.05;
  obs.position.set(Math.sin(oth) * (R - 0.08), 3.4, Math.cos(oth) * (R - 0.08));
  obs.lookAt(0, 3.4, 0);
  group.add(obs);
  hotspots.observatory = new THREE.Vector3(obs.position.x, 4.1, obs.position.z);
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(['우주선 탑승장', '달 · 우주 탐험 출발'], { ring: '#ff8f7a' }), transparent: true, toneMapped: false }));
  gate.position.set(0, 3.6, R - 0.08);
  gate.lookAt(0, 3.6, 0);
  group.add(gate);
  hotspots.gate = new THREE.Vector3(gate.position.x, 4.3, gate.position.z);

  // 관측 포인트 (바닥 표시)
  const spot = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 48), std('#6ff0d2', { e: '#6ff0d2', ei: 2.2, side: THREE.DoubleSide }));
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.015, -8.3);
  group.add(spot);
  hotspots.window = new THREE.Vector3(0, 1.4, -8.3);

  // 조명
  const lights = new THREE.Group();
  const hemi = new THREE.HemisphereLight('#e4e8ff', '#f3dccb', 0.32);
  lights.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e2', 1.5);
  sun.position.set(16, 12, -14);
  sun.castShadow = true;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  lights.add(sun);
  const earthshine = new THREE.DirectionalLight('#7fb6ff', 0.45);
  earthshine.position.set(0, -6, -12);
  lights.add(earthshine);
  for (const [x, z] of [[-9, 3], [9, 3], [0, 9]]) {
    const p = new THREE.PointLight('#ffd9b0', 3.2, 16, 2);
    p.position.set(x, 6.5, z);
    lights.add(p);
  }
  group.add(lights);

  return { group, hotspots, sunLight: sun, radius: R };
}
