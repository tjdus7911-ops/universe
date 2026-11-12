import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAstronaut, speechBubble, SUIT_PRESETS } from '../world/astronaut.js';
import { createShip } from '../world/ship.js';
import { signBoard } from '../world/moonSurface.js';
import { canvasTexture, FONT, roundRect } from '../core/renderer.js';
import { consumeLook, input, moveIntent } from '../core/input.js';
import { h, I, project, coinsChip } from '../ui/dom.js';
import { byId, GRAVITY, JUMP_V0 } from '../data/planets.js';
import { mountEmotes, emoteFromKeys, EMOTES } from '../ui/emotes.js';

// 장면 — 달 기지 라운지 (실내): 상점 · 탐험 도감 벽 · 우주선 꾸미기 코너 · 창가 소파
const G = GRAVITY.find((x) => x.id === 'moon').g;
const R = 9.5; // 방 반지름
const WALL_H = 3.0;
const ORDER = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const COLORS = { sun: '#ffb547', mercury: '#b9b4ae', venus: '#e8cf96', earth: '#5aa7ff', moon: '#c9c6c0', mars: '#e08a55', jupiter: '#d9b38c', saturn: '#efdcb1', uranus: '#a9e3e6', neptune: '#5c86f0' };
const at = (az, r) => new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(az)) * r, 0, -Math.cos(THREE.MathUtils.degToRad(az)) * r);

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1 });
}
function mesh(geo, m, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(...pos);
  o.rotation.set(...rot);
  o.scale.set(...scale);
  o.castShadow = o.receiveShadow = true;
  return o;
}

export function createLoungeScene(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0f1f');
  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 200);
  const room = new THREE.Group();
  scene.add(room);

  // 바닥: 밝은 타일 + 가운데 둥근 러그 + 문으로 이어지는 길
  const floorTex = canvasTexture(1024, 1024, (c, w) => {
    c.fillStyle = '#d9d2c7';
    c.fillRect(0, 0, w, w);
    const cx = w / 2;
    for (let i = 12; i >= 1; i--) {
      c.fillStyle = i % 2 ? '#ddd6cb' : '#d4ccc0';
      c.beginPath(); c.arc(cx, cx, (i / 12) * (w / 2), 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(120,108,96,0.25)';
    c.lineWidth = 2;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 110, cx + Math.sin(a) * 110); c.lineTo(cx + Math.cos(a) * w / 2, cx + Math.sin(a) * w / 2); c.stroke();
    }
    // 러그
    c.fillStyle = '#b9a6ff';
    c.beginPath(); c.arc(cx, cx, 170, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6ff0d2';
    c.lineWidth = 14;
    c.beginPath(); c.arc(cx, cx, 150, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff6ea';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.beginPath(); c.arc(cx + Math.cos(a) * 95, cx + Math.sin(a) * 95, 12, 0, Math.PI * 2); c.fill();
    }
    // 문까지 길 (아래쪽 = 남쪽 = 문)
    c.fillStyle = 'rgba(111,240,210,0.35)';
    c.fillRect(cx - 40, cx + 175, 80, w / 2 - 175);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  // 벽: 아래 띠 + 창 띠(바깥 달 풍경) + 위 띠, 그리고 둥근 천장
  const wallMat = new THREE.MeshStandardMaterial({ color: '#efe9e1', roughness: 0.7, side: THREE.BackSide });
  room.add(mesh(new THREE.CylinderGeometry(R, R, 1.0, 96, 1, true), wallMat, [0, 0.5, 0]));
  room.add(mesh(new THREE.CylinderGeometry(R, R, 0.4, 96, 1, true), wallMat, [0, 2.8, 0]));
  const pano = canvasTexture(2048, 256, (c, w, hh) => {
    c.fillStyle = '#020309';
    c.fillRect(0, 0, w, hh);
    for (let i = 0; i < 900; i++) {
      const b = Math.random();
      c.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7})`;
      c.fillRect(Math.random() * w, Math.random() * hh * 0.75, b > 0.95 ? 2 : 1, b > 0.95 ? 2 : 1);
    }
    // 작은 지구 (북쪽 = 텍스처 가운데 근처)
    const ex = w * 0.5, ey = hh * 0.42;
    const g = c.createRadialGradient(ex - 6, ey - 6, 2, ex, ey, 24);
    g.addColorStop(0, '#bfe3ff');
    g.addColorStop(0.5, '#3f86d8');
    g.addColorStop(1, '#0d2950');
    c.fillStyle = g;
    c.beginPath(); c.arc(ex, ey, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(ex - 6, ey - 4, 10, 4, 0.4, 0, Math.PI * 2); c.fill();
    // 달 언덕 실루엣
    c.fillStyle = '#5d5952';
    c.beginPath();
    c.moveTo(0, hh);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, hh * 0.72 - Math.sin(x * 0.006) * 14 - Math.sin(x * 0.021 + 1) * 7 - Math.max(0, Math.sin(x * 0.0031 + 2)) * 22);
    c.lineTo(w, hh);
    c.fill();
    c.fillStyle = '#3f3c37';
    c.fillRect(0, hh * 0.9, w, hh * 0.1);
  });
  pano.wrapS = THREE.RepeatWrapping;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.6, 96, 1, true), new THREE.MeshBasicMaterial({ map: pano, side: THREE.BackSide }));
  band.position.y = 1.8;
  band.rotation.y = Math.PI / 2;
  room.add(band);
  const frameMat = mat('#cfd3e0', { r: 0.3, m: 0.5 });
  for (const y of [1.0, 2.6]) room.add(mesh(new THREE.TorusGeometry(R - 0.04, 0.06, 8, 96), frameMat, [0, y, 0], [Math.PI / 2, 0, 0]));
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    room.add(mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), frameMat, [Math.cos(a) * (R - 0.05), 1.8, Math.sin(a) * (R - 0.05)]));
  }
  const domeTex = canvasTexture(1024, 512, (c, w, hh) => {
    c.fillStyle = '#f2ede6';
    c.fillRect(0, 0, w, hh);
    c.strokeStyle = 'rgba(150,140,170,0.35)';
    c.lineWidth = 3;
    for (let i = 0; i <= 24; i++) { c.beginPath(); c.moveTo((i / 24) * w, 0); c.lineTo((i / 24) * w, hh); c.stroke(); }
    for (let j = 1; j < 6; j++) { c.beginPath(); c.moveTo(0, (j / 6) * hh); c.lineTo(w, (j / 6) * hh); c.stroke(); }
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.8, side: THREE.BackSide }));
  dome.position.y = WALL_H;
  dome.scale.y = 0.5;
  room.add(dome);
  const ceilRing = mesh(new THREE.TorusGeometry(2.4, 0.12, 12, 64), mat('#fff3df', { e: '#fff1d6', ei: 2.2 }), [0, WALL_H + R * 0.5 - 0.6, 0], [Math.PI / 2, 0, 0]);
  room.add(ceilRing);

  // 조명: 따뜻한 실내
  scene.add(new THREE.HemisphereLight('#fff4e6', '#8a7f74', 0.85));
  const key = new THREE.PointLight('#ffe7c8', 40, 30, 1.6);
  key.position.set(0, 6.5, 0);
  key.castShadow = ctx.renderer.quality.shadows > 0;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const colliders = [];
  const spots = [];

  // 출구 (남쪽)
  const door = new THREE.Group();
  door.position.copy(at(180, R - 0.08));
  door.rotation.y = Math.PI;
  room.add(door);
  door.add(mesh(new THREE.TorusGeometry(1.25, 0.12, 10, 40, Math.PI), mat('#5fe0c3', { r: 0.4 }), [0, 0, 0]));
  door.add(mesh(new THREE.CircleGeometry(1.15, 40, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#13203f', emissive: '#6ff0d2', emissiveIntensity: 0.4, roughness: 0.2 }), [0, 0, -0.01]));
  const exitSign = signBoard(['나가기', '달 착륙지로'], { w: 1.4, h: 0.42, y: 2.35, post: false, accent: '#6ff0d2' });
  exitSign.position.copy(at(180, R - 0.25));
  exitSign.rotation.y = Math.PI;
  room.add(exitSign);
  spots.push({ key: 'exit', pos: at(180, R - 1.2).setY(1.7), label: '나가기 · 달 착륙지', act: '라운지에서 나가기', cls: 'orange', r: 2.2 });

  // 상점 (북동쪽): 카운터 + 로봇 점원 '삐뽀' + 우주복 마네킹
  const shopC = at(45, 6.6);
  const counter = mesh(new RoundedBoxGeometry(3.2, 1.0, 0.8, 3, 0.12), mat('#ffffff', { r: 0.4 }), [shopC.x, 0.5, shopC.z]);
  counter.lookAt(0, 0.5, 0);
  room.add(counter);
  const top = mesh(new RoundedBoxGeometry(3.3, 0.08, 0.9, 2, 0.03), mat('#ff8f7a', { r: 0.4 }), [shopC.x, 1.03, shopC.z]);
  top.quaternion.copy(counter.quaternion);
  room.add(top);
  colliders.push({ x: shopC.x, z: shopC.z, r: 1.7 });
  const robot = new THREE.Group();
  const rp = at(45, 7.9);
  robot.position.set(rp.x, 0, rp.z);
  robot.lookAt(0, 0, 0);
  room.add(robot);
  robot.add(mesh(new THREE.CapsuleGeometry(0.42, 0.5, 8, 20), mat('#f4f6fb', { r: 0.35 }), [0, 0.9, 0]));
  const rHead = new THREE.Group();
  rHead.position.y = 1.75;
  robot.add(rHead);
  rHead.add(mesh(new RoundedBoxGeometry(0.8, 0.58, 0.6, 3, 0.18), mat('#f4f6fb', { r: 0.35 }), [0, 0, 0]));
  const faceTex = canvasTexture(256, 160, (c, w, hh) => {
    roundRect(c, 4, 4, w - 8, hh - 8, 30);
    c.fillStyle = '#10172f';
    c.fill();
    c.fillStyle = '#6ff0d2';
    c.beginPath(); c.ellipse(80, 72, 16, 22, 0, 0, Math.PI * 2); c.ellipse(176, 72, 16, 22, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6ff0d2';
    c.lineWidth = 8;
    c.beginPath(); c.arc(128, 100, 26, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  });
  rHead.add(mesh(new THREE.PlaneGeometry(0.66, 0.42), new THREE.MeshStandardMaterial({ map: faceTex, emissive: '#ffffff', emissiveMap: faceTex, emissiveIntensity: 0.9 }), [0, 0, 0.305]));
  rHead.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat('#c8ccd8'), [0, 0.42, 0]));
  rHead.add(mesh(new THREE.SphereGeometry(0.06, 12, 8), mat('#ff8f7a', { e: '#ff8f7a', ei: 2 }), [0, 0.6, 0]));
  for (const s of [-1, 1]) robot.add(mesh(new THREE.CapsuleGeometry(0.1, 0.36, 6, 12), mat('#c8ccd8', { r: 0.3, m: 0.5 }), [0.55 * s, 1.05, 0.05], [0, 0, 0.3 * s]));
  colliders.push({ x: rp.x, z: rp.z, r: 0.7 });
  const robotBubble = speechBubble('어서 오세요! 삐뽀');
  robotBubble.position.set(0, 2.55, 0);
  robot.add(robotBubble);
  const shopSign = signBoard(['우주복 상점', '색상 · 장식 · 추진기 효과'], { w: 2.4, h: 0.62, y: 2.55, post: false, accent: '#ff8f7a' });
  const ss = at(45, 9.1);
  shopSign.position.set(ss.x, 0, ss.z);
  shopSign.lookAt(0, 0, 0);
  room.add(shopSign);
  const manis = ['lavender', 'coral', 'sky'].map((pr, i) => {
    const p = at(22 + i * 23, 8.3);
    const a = createAstronaut({ preset: pr });
    a.setHelmet(true);
    a.root.position.set(p.x, 0.3, p.z);
    a.root.lookAt(0, 0.3, 0);
    room.add(a.root);
    room.add(mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.3, 28), mat('#f4f1ec', { r: 0.45 }), [p.x, 0.15, p.z]));
    colliders.push({ x: p.x, z: p.z, r: 0.6 });
    return a;
  });
  spots.push({ key: 'shop', pos: new THREE.Vector3(shopC.x, 2.1, shopC.z), label: '우주복 상점', act: '상점 둘러보기', cls: 'coral', r: 2.8 });

  // 탐험 도감 벽 (북서쪽)
  const bookC = at(-45, R - 0.45);
  const bookCanvas = document.createElement('canvas');
  bookCanvas.width = 1024;
  bookCanvas.height = 512;
  const bookTex = new THREE.CanvasTexture(bookCanvas);
  bookTex.colorSpace = THREE.SRGBColorSpace;
  function drawBook() {
    const c = bookCanvas.getContext('2d');
    const w = 1024, hh = 512;
    c.clearRect(0, 0, w, hh);
    roundRect(c, 6, 6, w - 12, hh - 12, 36);
    c.fillStyle = '#121a3d';
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = '#b9a6ff';
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = `800 46px ${FONT}`;
    c.fillText('탐험 도감', 48, 82);
    const found = ORDER.filter((id) => ctx.progress.discovered.has(id)).length;
    c.font = `700 30px ${FONT}`;
    c.fillStyle = '#ffd166';
    c.fillText(`발견 ${found} / ${ORDER.length}`, 290, 80);
    ORDER.forEach((id, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      const x = 120 + col * 196, y = 190 + row * 180;
      const ok = ctx.progress.discovered.has(id);
      c.beginPath();
      c.arc(x, y, 52, 0, Math.PI * 2);
      if (ok) {
        const g = c.createRadialGradient(x - 16, y - 16, 6, x, y, 54);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, COLORS[id]);
        g.addColorStop(1, '#1b2244');
        c.fillStyle = g;
      } else c.fillStyle = '#2a3156';
      c.fill();
      c.fillStyle = ok ? '#ffffff' : '#8d93b8';
      c.textAlign = 'center';
      c.font = `800 ${ok ? 28 : 48}px ${FONT}`;
      c.fillText(ok ? byId[id].ko : '?', x, ok ? y + 92 : y + 16);
      if (!ok) {
        c.font = `600 24px ${FONT}`;
        c.fillText('미발견', x, y + 92);
      }
      c.textAlign = 'left';
    });
    bookTex.needsUpdate = true;
  }
  drawBook();
  const board = mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshStandardMaterial({ map: bookTex, emissive: '#ffffff', emissiveMap: bookTex, emissiveIntensity: 0.55, roughness: 0.6 }), [bookC.x, 1.85, bookC.z]);
  board.lookAt(0, 1.85, 0);
  room.add(board);
  spots.push({ key: 'book', pos: at(-45, 7.6).setY(2.9), label: '탐험 도감 벽', act: '도감 보기', cls: 'lav', r: 2.8 });

  // 우주선 꾸미기 코너 (남서쪽)
  const shipC = at(-125, 6.4);
  room.add(mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.36, 40), mat('#f4f1ec', { r: 0.45 }), [shipC.x, 0.18, shipC.z]));
  room.add(mesh(new THREE.TorusGeometry(1.52, 0.05, 8, 48), mat('#6ff0d2', { e: '#6ff0d2', ei: 1.8 }), [shipC.x, 0.37, shipC.z], [Math.PI / 2, 0, 0]));
  const model = createShip(ctx.profile);
  model.group.scale.setScalar(0.48);
  model.group.position.set(shipC.x, 1.25, shipC.z);
  room.add(model.group);
  colliders.push({ x: shipC.x, z: shipC.z, r: 1.7 });
  const shipSign = signBoard(['우주선 꾸미기', '가구 배치 · 벽 장식 · 기념품'], { w: 2.3, h: 0.6, y: 2.75, post: false, accent: '#6ff0d2' });
  const sgp = at(-125, 9.0);
  shipSign.position.set(sgp.x, 0, sgp.z);
  shipSign.lookAt(0, 0, 0);
  room.add(shipSign);
  spots.push({ key: 'ship', pos: new THREE.Vector3(shipC.x, 2.4, shipC.z), label: '우주선 꾸미기', act: '내 우주선 꾸미기', cls: '', r: 2.8 });

  // 창가 소파 (남동쪽): 창밖 달 풍경을 바라봄
  const sofaAz = 120;
  const sofa = new THREE.Group();
  room.add(sofa);
  const cushion = mat('#b9a6ff', { r: 0.8 });
  for (let k = -1; k <= 1; k++) {
    const p = at(sofaAz + k * 11, 7.6);
    const seat = mesh(new RoundedBoxGeometry(1.5, 0.42, 0.9, 3, 0.16), cushion, [p.x, 0.32, p.z]);
    seat.lookAt(p.x * 2, 0.32, p.z * 2);
    sofa.add(seat);
    const back = mesh(new RoundedBoxGeometry(1.5, 0.75, 0.28, 3, 0.12), cushion, [0, 0, 0]);
    const bp = at(sofaAz + k * 11, 7.0);
    back.position.set(bp.x, 0.75, bp.z);
    back.lookAt(bp.x * 2, 0.75, bp.z * 2);
    sofa.add(back);
    colliders.push({ x: p.x, z: p.z, r: 0.85 });
  }
  const tableP = at(sofaAz + 22, 6.2);
  room.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 28), mat('#ffffff', { r: 0.3 }), [tableP.x, 0.55, tableP.z]));
  room.add(mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.55, 12), mat('#cfd3e0', { m: 0.5, r: 0.3 }), [tableP.x, 0.27, tableP.z]));
  room.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 12), mat('#ff8f7a'), [tableP.x + 0.15, 0.64, tableP.z]));
  colliders.push({ x: tableP.x, z: tableP.z, r: 0.6 });
  const seatSpot = at(sofaAz - 11, 7.55);
  spots.push({ key: 'sofa', pos: at(sofaAz, 7.3).setY(1.7), label: '창가 소파', act: '소파에 앉아 창밖 보기', cls: '', r: 2.6 });

  // 화분
  for (const az of [-80, 80, 150, -160]) {
    const p = at(az, 8.7);
    room.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 20), mat('#ffffff', { r: 0.4 }), [p.x, 0.25, p.z]));
    for (let k = 0; k < 5; k++) room.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), mat(k % 2 ? '#6fcf97' : '#4fb37f', { r: 0.7 }), [p.x + Math.cos(k * 1.3) * 0.18, 0.75 + (k % 3) * 0.16, p.z + Math.sin(k * 1.3) * 0.18], [0, 0, 0], [1, 1.2, 1]));
    colliders.push({ x: p.x, z: p.z, r: 0.5 });
  }

  // 나 + 친구 둘
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name });
  scene.add(me.root);
  const P = { pos: new THREE.Vector3(0, 0, 7.4), vel: new THREE.Vector3(), vy: 0, ground: true, heading: Math.PI, emote: null, emoteT: 0, flip: 0, flipping: false, airT: 0, airDur: 1, squash: 0 };
  const dancer = createAstronaut({ preset: 'coral', skin: '#e3ad86', hair: '#d9a05b', name: '코스모' });
  dancer.root.position.set(0.6, 0, -0.4);
  scene.add(dancer.root);
  const dBubble = speechBubble('라운지 음악 좋다~');
  dBubble.position.set(0, 1.95, 0);
  dancer.root.add(dBubble);
  const sitter = createAstronaut({ preset: 'lavender', skin: '#f6cba8', hair: '#2a2633', name: '별헤는밤' });
  const sp2 = at(sofaAz + 11, 7.55);
  sitter.root.position.set(sp2.x, 0.12, sp2.z);
  sitter.root.lookAt(sp2.x * 2, 0.12, sp2.z * 2);
  sitter.state.mode = 'sit';
  scene.add(sitter.root);
  colliders.push({ x: 0.6, z: -0.4, r: 0.5 });

  // HUD
  let hud = null, labels = [], prompt = null, nearKey = null, toastTimer = 0, jumpQueued = false, sitting = false;
  function toast(html, ms = 3400) {
    ctx.hud.querySelector('.toast')?.remove();
    const t = h(`<div class="toast glass">${html}</div>`);
    ctx.hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }
  function buildHud() {
    hud = h(`<div>
      <div class="tl">
        <div class="glass chip"><span class="dot"></span>달 기지 라운지 · 실내 <small>채널 1 · 9명</small></div>
        <div class="glass chip"><span class="avatar-dot">나</span>${ctx.profile.name}${coinsChip(1240)}</div>
      </div>
      <div class="tr">
        <button class="icon-btn" title="미션">${I.mission}<span class="badge">3</span></button>
        <button class="icon-btn" title="친구">${I.friends}<span class="badge">2</span></button>
        <button class="icon-btn pc-only" title="설정">${I.gear}</button>
        <button class="icon-btn mobile-only" title="더보기">${I.more}</button>
      </div>
      <div class="mr"><button class="btn ghost side-btn" data-k="exit">${I.home}달 착륙지로 나가기</button></div>
      <div class="bl pc-only"><div class="glass chat">
        <div class="msg sys"><b>안내</b>라운지에서는 상점·탐험 도감·우주선 꾸미기를 할 수 있어요.</div>
        <div class="msg"><b>코스모</b>여기 음악 좋다~ 💃</div>
        <div class="msg"><b>별헤는밤</b>창가 소파에서 지구 보여!</div>
        <div class="input">${I.chat}<span>Enter로 채팅 · 비회원은 빠른 채팅만</span></div>
      </div></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">W</i><i class="kbd">A</i><i class="kbd">S</i><i class="kbd">D</i> 걷기</span><span><i class="kbd">Space</i> 점프</span><span><i class="kbd">E</i> 상호작용</span><span><i class="kbd">1</i>~<i class="kbd">7</i> 감정 표현</span><span>드래그 시점</span>
      </div></div>
      <div class="br pc-only"><div class="glass prompt" style="display:none"></div></div>
      <div class="joy mobile-only"><div class="joy-knob"></div></div>
      <div class="act mobile-only">
        <button class="round" data-k="act">${I.hand}<span class="sub">살펴보기</span></button>
        <button class="round big" data-k="jump">${I.jump}<span class="sub">점프</span></button>
      </div>
    </div>`);
    ctx.hud.appendChild(hud);
    prompt = hud.querySelector('.prompt');
    ctx.mountJoystick(hud.querySelector('.joy'));
    hud.querySelector('[data-k="act"]').addEventListener('click', () => interact());
    hud.querySelector('[data-k="jump"]').addEventListener('pointerdown', () => { jumpQueued = true; });
    hud.querySelector('[data-k="exit"]').addEventListener('click', () => ctx.go('moon', { id: 'hub' }));
    hud.querySelector('.icon-btn[title="미션"]').addEventListener('click', () => ctx.go('mission'));
    mountEmotes(hud.querySelector('.mr'), (k) => pickEmote(k));
    labels = spots.map((s) => {
      const el = h(`<div class="pill-label ${s.cls}"><i></i>${s.label}</div>`);
      ctx.labels.appendChild(el);
      return el;
    });
  }

  function openShop() {
    ctx.hud.querySelector('.modal-wrap')?.remove();
    const owned = Object.keys(SUIT_PRESETS);
    const names = { mint: '민트', lavender: '라벤더', coral: '코랄', sky: '스카이' };
    const el = h(`<div class="modal-wrap"><div class="modal shop">
      <div class="kicker">삐뽀의 우주복 상점 · ⭐ 1,240</div>
      <h3>무엇을 입어 볼까요?</h3>
      <div class="sec2">우주복 색상 (보유 · 바로 갈아입기)</div>
      <div class="items">${owned.map((k) => `<button data-suit="${k}" class="${k === ctx.profile.preset ? 'on' : ''}"><i style="background:linear-gradient(160deg, ${SUIT_PRESETS[k].suit} 55%, ${SUIT_PRESETS[k].accent} 56%)"></i>${names[k]}<small>보유</small></button>`).join('')}</div>
      <div class="sec2">새 아이템 (구매는 서버 확인 후 지급 · PHASE 3)</div>
      <div class="items">
        <button disabled><i style="background:linear-gradient(160deg,#fff4ec 55%,#ff9d5c 56%)"></i>선셋 우주복<small>⭐ 300</small></button>
        <button disabled><i style="background:linear-gradient(160deg,#f2fbff 55%,#7ce0ff 56%)"></i>오로라 우주복<small>⭐ 450</small></button>
        <button disabled><i style="background:radial-gradient(circle,#ffd166 30%,#fff 32%)"></i>별 스티커 헬멧<small>⭐ 120</small></button>
        <button disabled><i style="background:linear-gradient(180deg,#ffb4c2,#fff)"></i>토끼 귀 안테나<small>⭐ 200</small></button>
        <button disabled><i style="background:linear-gradient(90deg,#ff5d6c,#ffd166,#6ff0d2,#6fb4ff,#b9a6ff)"></i>무지개 추진기<small>⭐ 500</small></button>
      </div>
      <div class="note" style="color:#5a6190">시안에서는 실제 구매·코인 차감이 없어요. 운영에서는 서버가 잔액·중복 구매를 확인한 뒤 거래 1건으로 처리해요.</div>
      <div class="row-btn"><button class="btn" data-k="close">닫기</button></div>
    </div></div>`);
    ctx.hud.appendChild(el);
    el.querySelectorAll('[data-suit]').forEach((b) => b.addEventListener('click', () => {
      ctx.profile.preset = b.dataset.suit;
      me.setPreset(b.dataset.suit);
      el.querySelectorAll('[data-suit]').forEach((x) => x.classList.toggle('on', x === b));
      toast(`${names[b.dataset.suit]} 우주복으로 갈아입었어요`);
    }));
    el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
  }
  function openBook() {
    ctx.hud.querySelector('.found-panel')?.remove();
    const cnt = ORDER.filter((id) => ctx.progress.discovered.has(id)).length;
    const el = h(`<div class="glass found-panel">
      <div class="t">탐험 도감 · 발견 ${cnt}/${ORDER.length}</div>
      <div class="grid">${ORDER.map((id) => {
        const ok = ctx.progress.discovered.has(id);
        return `<button data-id="${id}" ${ok ? '' : 'disabled'}><i class="${ok ? '' : 'q'}">${ok ? '' : '?'}</i>${ok ? byId[id].ko : '미발견'}</button>`;
      }).join('')}</div>
      <div class="note">비어 있는 칸은 우주선을 타고 '우주 탐험'에서 가까이 날아가면 채워져요.</div>
      <button class="btn ghost" data-k="close">닫기</button>
    </div>`);
    ctx.hud.appendChild(el);
    el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => ctx.go('planet', { id: b.dataset.id, from: 'lounge' })));
    el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
  }
  function openShipDeco() {
    ctx.hud.querySelector('.modal-wrap')?.remove();
    const el = h(`<div class="modal-wrap"><div class="modal">
      <div class="kicker">내 우주선 · 달마중호 (소형)</div>
      <h3>꾸미기 모드 미리보기</h3>
      <div class="note" style="color:#5a6190">가구를 고르고 바닥 격자에 놓은 뒤 회전·교체해요. 저장하면 서버가 소유 여부·개수·좌표를 확인해요. 실제 배치 화면은 PHASE 5에서 만들어요.</div>
      <div class="items" style="margin-top:12px">
        <button disabled><i style="background:#b9a6ff"></i>구름 소파<small>보유</small></button>
        <button disabled><i style="background:#ffd166"></i>별 조명<small>보유</small></button>
        <button disabled><i style="background:#6fb4ff"></i>지구 사진 액자<small>보유</small></button>
        <button disabled><i style="background:#c9c6c0"></i>월석 기념품<small>미션 보상</small></button>
      </div>
      <div class="row-btn"><button class="btn" data-k="close">닫기</button></div>
    </div></div>`);
    ctx.hud.appendChild(el);
    el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
  }
  function sitOnSofa() {
    sitting = true;
    P.pos.set(seatSpot.x, 0.12, seatSpot.z);
    P.heading = Math.atan2(seatSpot.x, seatSpot.z);
    P.emote = 'sit';
    P.emoteT = 0;
    cam.yaw = P.heading + Math.PI;
    cam.pitch = 0.18;
    toast('창밖으로 달 언덕과 작은 지구가 보여요 · 움직이면 일어나요');
  }
  function interact() {
    if (!nearKey) return toast('가까이 가면 할 수 있는 일이 나타나요');
    if (nearKey === 'exit') ctx.go('moon', { id: 'hub' });
    else if (nearKey === 'shop') openShop();
    else if (nearKey === 'book') openBook();
    else if (nearKey === 'ship') openShipDeco();
    else if (nearKey === 'sofa') sitOnSofa();
  }
  function pickEmote(k) {
    const e = EMOTES.find((x) => x.k === k);
    if (!e) return;
    if (k === 'flip') {
      if (P.ground) {
        P.ground = false;
        P.vy = JUMP_V0;
        P.airT = 0;
        P.airDur = (2 * JUMP_V0) / G;
        P.flipping = true;
        P.emote = null;
      }
      return;
    }
    if (!P.ground) return;
    P.vel.set(0, 0, 0);
    P.emote = k;
    P.emoteT = e.dur || 0;
  }

  const cam = { yaw: -0.35, pitch: 0.42, dist: 4.6 };
  const tgt = new THREE.Vector3();
  function collide(p) {
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + 0.3;
      if (d < m && d > 1e-4) {
        p.x = c.x + (dx / d) * m;
        p.z = c.z + (dz / d) * m;
      }
    }
    const r = Math.hypot(p.x, p.z), lim = R - 0.75;
    if (r > lim) { p.x *= lim / r; p.z *= lim / r; }
  }

  return {
    id: 'lounge',
    scene,
    camera,
    renderOpts: { exposure: 0.95, bloomStrength: 0.3, bloomThreshold: 1.0, bloomRadius: 0.4 },
    enter() {
      me.setPreset(ctx.profile.preset);
      P.pos.set(0.4, 0, 5.4);
      P.vel.set(0, 0, 0);
      P.heading = Math.PI;
      P.emote = null;
      sitting = false;
      cam.yaw = -0.35;
      cam.pitch = 0.42;
      cam.dist = 4.6;
      drawBook();
      buildHud();
      toast('달 기지 라운지에 들어왔어요 — 상점·탐험 도감·우주선 꾸미기·창가 소파');
      window.__lounge = { interact: (k) => { nearKey = k; interact(); }, emote: (k) => pickEmote(k), cam: (y, p, d) => { cam.yaw = y; cam.pitch = p; if (d) cam.dist = d; }, place: (x, z, hd) => { P.pos.set(x, 0, z); if (hd != null) P.heading = hd; } };
    },
    exit() {
      clearTimeout(toastTimer);
    },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 66 : 56;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      // 이동 (달 중력 그대로 · 실내라서 걷기 위주)
      const mi = moveIntent();
      const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const want = new THREE.Vector3().addScaledVector(fwd, mi.y).addScaledVector(right, mi.x);
      const wl = want.length();
      if (wl > 0.1 && P.emote) { P.emote = null; if (sitting) { sitting = false; P.pos.y = 0; } }
      want.multiplyScalar(mi.boost ? 3.0 : 1.8);
      P.vel.lerp(want, 1 - Math.exp(-dt * (P.ground ? 6 : 0.6)));
      if ((input.pressed.has(' ') || jumpQueued) && P.ground) {
        P.ground = false;
        P.vy = JUMP_V0;
        P.airT = 0;
        P.airDur = (2 * JUMP_V0) / G;
        P.emote = null;
        sitting = false;
      }
      jumpQueued = false;
      const picked = emoteFromKeys(input.pressed);
      if (picked) pickEmote(picked);
      if (!sitting) {
        P.pos.x += P.vel.x * dt;
        P.pos.z += P.vel.z * dt;
        collide(P.pos);
      }
      if (!P.ground) {
        P.vy -= G * dt;
        P.pos.y += P.vy * dt;
        P.airT += dt;
        if (P.flipping) P.flip = Math.min(1, P.airT / (P.airDur * 0.92)) * Math.PI * 2;
        if (P.pos.y <= 0 && P.vy < 0) {
          P.pos.y = 0;
          P.vy = 0;
          P.ground = true;
          P.flipping = false;
          P.flip = 0;
          P.squash = 0.6;
        }
      } else if (!sitting) P.pos.y = 0;
      const sp = Math.hypot(P.vel.x, P.vel.z);
      if (sp > 0.15 && !sitting) {
        let d = Math.atan2(P.vel.x, P.vel.z) - P.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        P.heading += d * Math.min(1, dt * 10);
      }
      P.squash = Math.max(0, P.squash - dt * 3);
      me.root.position.copy(P.pos);
      me.root.rotation.y = P.heading;
      me.state.squash = P.squash;
      me.state.flip = P.flip;
      if (!P.ground) {
        me.state.mode = 'air';
        me.state.air = P.vy / JUMP_V0;
      } else if (P.emote) {
        me.state.mode = P.emote;
        if (P.emoteT > 0 && (P.emoteT -= dt) <= 0) P.emote = null;
      } else {
        me.state.mode = sp > 0.15 ? 'walk' : 'idle';
        me.state.speed = sp * 0.6;
      }
      me.update(dt, t);
      dancer.state.mode = 'dance';
      dancer.update(dt, t);
      sitter.update(dt, t);
      manis.forEach((a) => { a.state.mode = 'idle'; a.update(dt, t * 0.3); });
      model.group.rotation.y += dt * 0.35;
      model.update(dt, t);
      rHead.rotation.y = Math.sin(t * 0.8) * 0.35;
      rHead.rotation.z = Math.sin(t * 1.7) * 0.05;
      // 카메라 (방 안에 머물게)
      const look = consumeLook();
      cam.yaw -= look.dx * 0.005;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + look.dy * 0.004, -0.1, 0.9);
      cam.dist = THREE.MathUtils.clamp(cam.dist + look.zoom * 0.5, 2.6, 8);
      tgt.set(P.pos.x, P.pos.y * 0.6 + 1.3, P.pos.z);
      const d = cam.dist * (ctx.isMobile() ? 1.15 : 1);
      camera.position.set(tgt.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, tgt.y + Math.sin(cam.pitch) * d + 0.3, tgt.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * d);
      const cr = Math.hypot(camera.position.x, camera.position.z);
      if (cr > R - 0.5) { camera.position.x *= (R - 0.5) / cr; camera.position.z *= (R - 0.5) / cr; }
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.6, 6.2);
      camera.lookAt(tgt.x - Math.sin(cam.yaw) * 2.5, tgt.y + 0.3, tgt.z - Math.cos(cam.yaw) * 2.5);
      // 이름표 · 상호작용 안내
      const { w, hgt } = ctx.size();
      nearKey = null;
      let best = 1e9;
      spots.forEach((s, i) => {
        const el = labels[i];
        if (!el) return;
        const pr = project(s.pos, camera, w, hgt);
        const dist = Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z);
        const vis = !pr.behind && pr.x > -40 && pr.x < w + 40 && pr.y > 50;
        el.style.display = vis ? 'flex' : 'none';
        el.style.left = `${pr.x}px`;
        el.style.top = `${pr.y}px`;
        el.style.opacity = dist < 6 ? '1' : '0.75';
        if (dist < s.r && dist < best) { best = dist; nearKey = s.key; }
      });
      if (prompt) {
        const s = spots.find((x) => x.key === nearKey);
        prompt.style.display = s ? 'block' : 'none';
        if (s) prompt.innerHTML = `<i class="kbd">E</i> ${s.act}`;
      }
      const sub = hud?.querySelector('[data-k="act"] .sub');
      if (sub) sub.textContent = nearKey ? spots.find((x) => x.key === nearKey).act.split(' ')[0] : '살펴보기';
      if (input.pressed.has('e')) interact();
      void wl;
    },
  };
}
