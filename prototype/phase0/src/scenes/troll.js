import * as THREE from 'three';
import { createAstronaut } from '../world/astronaut.js';
import { createEarth } from '../world/earth.js';
import { createStarfield, createSkyDome } from '../world/space.js';
import { regolithTextures, textSprite } from '../world/moonSurface.js';
import { canvasTexture, FONT } from '../core/renderer.js';
import { input, moveIntent } from '../core/input.js';
import { h, I } from '../ui/dom.js';
import { mountSceneUi } from '../ui/sceneUi.js';
import { mountPlaceMenu } from '../ui/placeMenu.js';
import { EMOTES, emoteFromKeys } from '../ui/emotes.js';
import { createCrowd } from '../net/crowd.js';

// 장면 — 「깜빡 속았지! 달 대시」 (가칭): 옆으로 달리는 함정 플랫포머
// 숨은 블록 · 무너지는 가짜 바닥 · 튀어나오는 가시 · 가짜 골인 깃발 · 떨어지는 운석 · 미끄러지는 발판 · 튀어나오는 외계인.
// 실패하면 처음(원점)으로 돌아가고 함정도 전부 다시 숨는다. 함정은 사람마다 따로 움직이고, 다른 사람의 아바타·채팅은 실시간으로 보인다.
// 조작감 우선의 게임 물리(실제 달 중력 아님): 빠른 가속, 누르는 길이에 따라 달라지는 점프, 발판 끝 여유(코요테 타임), 점프 미리 누르기.
const RUN = 7.6, ACC = 70, AIR_ACC = 42, FRICTION = 60;
const GRAV = 34, JUMP_V = 13.2, CUT = 0.45, MAX_FALL = 22;
const COYOTE = 0.1, BUFFER = 0.13;
const PW = 0.7, PH = 1.6; // 내 몸 상자 (발 위치 기준)
const START = { x: 1.5, y: 0 };
const GOAL_X = 194;

// ---------- 코스 (x 좌표 m, y = 윗면) ----------
const GROUNDS = [[-6, 28], [30.5, 56], [60, 80], [80, 110], [124, 150], [152.5, 160], [168, 210]];
const FAKE_FLOOR = { x0: 56, x1: 60 }; // 진짜 바닥과 똑같이 생겼지만 밟으면 무너짐
const COLLAPSE = { x0: 160, x1: 168 }; // 밟는 순간 1 m씩 차례로 떨어지는 바닥 (멈추지 않으면 건넘)
const HIDDEN = [{ x: 28, y: 2.5 }, { x: 29, y: 2.5 }, { x: 150, y: 2.5 }, { x: 151, y: 2.5 }]; // 아래에서 머리로 부딪혀야 나타나는 투명 블록 (1×1, y = 아랫면)
const CRATES = [{ x: 36, y: 3.2, kind: 'star' }, { x: 38, y: 3.2, kind: 'star' }, { x: 40, y: 3.2, kind: 'alien' }];
// 가시: 바로 앞(1.4 m)에 땅을 밟고 서야 솟음 → 처음엔 속지만, 알고 나면 그보다 일찍(62~64.6 m에서) 뛰어 넘을 수 있음.
// 감지 범위가 좁아 넘어가 착지한 발밑에서는 솟지 않고, 천천히 다가가면 솟는 걸 보고 제자리에서 넘을 수 있음
const SPIKES = [{ x0: 66, x1: 67.6, trig: [64.6, 65.4] }];
const FAKE_FLAG = { x: 86 };
// 운석: 떨어지기 시작할 때 '전속력으로 계속 달리면 닿을 자리'에 그림자로 미리 표시 → 멈추거나 속도를 줄이면 피함
const METEORS = [{ trig: 95.5 }, { trig: 88.2, after: 'flag' }];
const M_Y0 = 16, M_V0 = -6, M_G = 40;
const M_FALL = (-Math.abs(M_V0) + Math.sqrt(M_V0 * M_V0 + 2 * M_G * (M_Y0 - 0.75))) / M_G; // 땅에 닿기까지(초) ≈ 0.74
const PLATFORMS = [
  { x0: 112, x1: 114.2, y: 1.6 },
  { x0: 116.6, x1: 118.8, y: 2.6, drop: true }, // 밟으면 잠깐 뒤 아래로 빠짐
  { x0: 121, x1: 123.2, y: 1.6 },
];
// 외계인은 함정을 피한 자리에 오지 않게: 첫째는 가시 착지 자리(69~72 m) 뒤, 둘째는 운석 피해 멈추는 자리(96~101 m) 뒤에서만 걸음
const WALKERS = [{ x: 76, min: 73.5, max: 79.3 }, { x: 106, min: 103.5, max: 109 }, { x: 140, min: 136, max: 148 }];
const POPPER = { x: 132.5, trig: 3.6 }; // 구멍에서 튀어나오는 외계인
const LINES = ['속았지?', '또?', '원점으로~', '아깝다!', '그럴 줄 알았어', '다시 해 봐요!', '함정이 하나 더 있어요'];

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.8, metalness: o.m ?? 0, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat, transparent: o.t != null, opacity: o.t ?? 1 });
}
const overlap = (a, b) => a.x0 < b.x1 - 1e-4 && a.x1 > b.x0 + 1e-4 && a.y0 < b.y1 - 1e-4 && a.y1 > b.y0 + 1e-4;

export function createTrollScene(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04060f');
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 12000);
  scene.add(createSkyDome(9500, 0.14), createStarfield(Math.round(ctx.renderer.quality.stars * 1.5), 9000, 31));
  const sunDir = new THREE.Vector3(-0.4, 0.75, 0.55).normalize();
  const sun = new THREE.DirectionalLight('#fff4e2', 2.5);
  sun.castShadow = ctx.renderer.quality.shadows > 0;
  sun.shadow.mapSize.set(ctx.renderer.quality.shadows || 512, ctx.renderer.quality.shadows || 512);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 14, bottom: -10, near: 1, far: 80 });
  scene.add(sun, sun.target, new THREE.HemisphereLight('#c4ceff', '#3a3530', 0.6));
  const earth = createEarth(380, { segments: 80, nightBoost: 2.0, atmStrength: 1.4 });
  earth.group.position.set(-1600, 1150, -4200);
  earth.setSun(sunDir);
  scene.add(earth.group);

  // ---------- 재질 ----------
  const reg = regolithTextures();
  const groundTex = reg?.map ? reg.map.clone() : null;
  if (groundTex) { groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(0.35, 0.35); groundTex.needsUpdate = true; }
  const groundTop = new THREE.MeshStandardMaterial({ color: '#b3ada4', roughness: 0.95, map: groundTex });
  const groundSide = std('#77716a', { r: 0.95 });
  const crateTex = canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#ffcc3d'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#b57a00'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, w - 10);
    g.fillStyle = '#ffffff'; g.font = `900 78px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', w / 2, w / 2 + 4);
  });
  const crateM = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.5, emissive: '#ffb400', emissiveIntensity: 0.18 });
  const usedM = std('#8d877f', { r: 0.7 });
  const spikeM = std('#d7dbe6', { r: 0.25, m: 0.75 });
  const alienM = std('#7be36b', { r: 0.45, e: '#2e8a22', ei: 0.25 });
  const alien2M = std('#c28cff', { r: 0.45, e: '#6b2bd6', ei: 0.3 });
  const eyeW = std('#ffffff', { r: 0.3 });
  const eyeB = std('#1d1830', { r: 0.3 });
  const rockM = std('#5d554d', { flat: true, r: 0.95 });
  const hotM = std('#ff9a4a', { e: '#ff5a1a', ei: 1.6 });

  function groundBlock(x0, x1, top = 0, depth = 9) {
    const g = new THREE.Group();
    const w = x1 - x0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, depth, 3.2), [groundSide, groundSide, groundTop, groundSide, groundSide, groundSide]);
    body.position.set((x0 + x1) / 2, top - depth / 2, 0);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    return g;
  }
  function crateMesh(m = crateM) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
    b.castShadow = b.receiveShadow = true;
    return b;
  }
  function alienMesh(mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), mat);
    body.scale.set(1, 0.85, 0.9);
    body.position.y = 0.38;
    g.add(body);
    for (const s of [-1, 1]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), eyeW);
      ew.position.set(s * 0.15, 0.5, 0.33);
      const eb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeB);
      eb.position.set(s * 0.15, 0.5, 0.43);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat);
      ant.position.set(s * 0.12, 0.86, 0);
      ant.rotation.z = -s * 0.35;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), hotM);
      tip.position.set(s * 0.18, 1.0, 0);
      g.add(ew, eb, ant, tip);
    }
    for (const s of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat);
      foot.position.set(s * 0.2, 0.06, 0.05);
      foot.scale.set(1.2, 0.6, 1.4);
      g.add(foot);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function flagMesh(color, text) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.2, 10), std('#e8ebf3', { r: 0.3, m: 0.6 }));
    pole.position.y = 2.6;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), std('#ffd04a', { e: '#ffb000', ei: 0.6 }));
    ball.position.y = 5.25;
    const flagTex = canvasTexture(256, 160, (c, w, hh) => {
      c.fillStyle = color; c.fillRect(0, 0, w, hh);
      c.fillStyle = '#ffffff'; c.font = `900 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, hh / 2 + 3);
    });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.6 }));
    flag.position.set(0.95, 4.5, 0);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 16), std('#8d93a8', { r: 0.5, m: 0.4 }));
    base.position.y = 0.15;
    g.add(pole, ball, flag, base);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { g, flag };
  }

  // ---------- 고정 지형 ----------
  for (const [x0, x1] of GROUNDS) scene.add(groundBlock(x0, x1));
  // 출발·도착 표지
  const startTag = textSprite('출발', { size: 46, color: '#7ff3c8' });
  startTag.position.set(START.x, 3.2, 0); startTag.scale.set(1.6, 0.6, 1);
  scene.add(startTag);
  const goal = flagMesh('#3ad49b', '골인');
  goal.g.position.set(GOAL_X, 0, -0.4);
  scene.add(goal.g);
  const rocket = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 4.2, 20), std('#f4f1e8', { r: 0.4, m: 0.2 }));
    body.position.y = 2.6;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 20), std('#ff6b4a', { r: 0.4 }));
    nose.position.y = 5.5;
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), std('#7fd6ff', { e: '#3ab4ff', ei: 0.8 }));
    win.position.set(0, 3.4, 0.82);
    rocket.add(body, nose, win);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.9), std('#ff6b4a', { r: 0.4 }));
      fin.position.set(Math.sin((i / 3) * Math.PI * 2) * 0.95, 0.9, Math.cos((i / 3) * Math.PI * 2) * 0.95);
      fin.rotation.y = (i / 3) * Math.PI * 2;
      rocket.add(fin);
    }
    rocket.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    rocket.position.set(GOAL_X + 6, 0, -1.2);
    scene.add(rocket);
  }
  // 배경 바위
  for (let i = 0; i < 40; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + (i % 5) * 0.45, 0), rockM);
    r.position.set(-10 + i * 5.6 + (i % 3), -0.4 + (i % 4) * 0.2, -4 - (i % 6) * 2.2);
    r.rotation.set(i, i * 2, i * 3);
    scene.add(r);
  }

  // ---------- 함정 (시도할 때마다 처음 상태로) ----------
  const T = { fake: null, collapse: [], hidden: [], crates: [], spikes: [], fakeFlag: null, meteors: [], plats: [], walkers: [], popper: null, pulled: [] };
  // 가짜 바닥 (진짜와 똑같은 모양)
  T.fake = { ...FAKE_FLOOR, mesh: groundBlock(FAKE_FLOOR.x0, FAKE_FLOOR.x1), state: 'idle', t: 0, dy: 0, vy: 0 };
  scene.add(T.fake.mesh);
  for (let x = COLLAPSE.x0; x < COLLAPSE.x1; x += 1) {
    const m = groundBlock(x, x + 1);
    scene.add(m);
    T.collapse.push({ x0: x, x1: x + 1, mesh: m, state: 'idle', t: 0, dy: 0, vy: 0 });
  }
  T.hidden = HIDDEN.map((d) => { const m = crateMesh(usedM); m.position.set(d.x + 0.5, d.y + 0.5, 0); m.visible = false; scene.add(m); return { ...d, mesh: m, shown: false, bump: 0 }; });
  T.crates = CRATES.map((d) => { const m = crateMesh(); m.position.set(d.x + 0.5, d.y + 0.5, 0); scene.add(m); return { ...d, mesh: m, used: false, bump: 0 }; });
  const stars = [];
  T.spikes = SPIKES.map((d) => {
    const g = new THREE.Group();
    for (let x = d.x0 + 0.25; x < d.x1; x += 0.5) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), spikeM);
      c.position.set(x, 0.45, 0);
      c.castShadow = true;
      g.add(c);
    }
    g.position.y = -1;
    scene.add(g);
    return { ...d, mesh: g, up: 0, on: false };
  });
  {
    const f = flagMesh('#3ad49b', '골인');
    f.g.position.set(FAKE_FLAG.x, 0, -0.4);
    scene.add(f.g);
    T.fakeFlag = { ...FAKE_FLAG, ...f, state: 'idle', t: 0 };
  }
  const meteorMeshes = METEORS.map(() => {
    const g = new THREE.Group();
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), rockM);
    r.castShadow = true;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), hotM);
    glow.position.y = 0.45;
    g.add(r, glow);
    g.visible = false;
    scene.add(g);
    return g;
  });
  const shadowM = () => new THREE.MeshBasicMaterial({ color: '#ff4a2a', transparent: true, opacity: 0.5, depthWrite: false });
  T.meteors = METEORS.map((d, i) => {
    // 떨어질 자리 표시: 바닥 원 + 하늘까지 빨간 빛기둥 + '!' (옆에서 보는 카메라에서도 잘 보이게)
    const sh = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), shadowM());
    disc.rotation.x = -Math.PI / 2;
    const beamM = new THREE.MeshBasicMaterial({ color: '#ff5a3a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 16, 20, 1, true), beamM);
    beam.position.y = 8;
    const warn = textSprite('!', { size: 70, color: '#ffffff', bg: 'rgba(230,60,40,0.92)' });
    warn.scale.set(1.0, 0.38, 1);
    warn.position.y = 2.6;
    sh.add(disc, beam, warn);
    sh.userData = { disc, beamM };
    sh.visible = false;
    scene.add(sh);
    return { ...d, mesh: meteorMeshes[i], shadow: sh, state: 'idle', x: 0, y: 0, vy: 0 };
  });
  T.plats = PLATFORMS.map((d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(d.x1 - d.x0, 0.4, 2.2), std('#c6cbdb', { r: 0.4, m: 0.5 }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return { ...d, mesh: m, dy: 0, vy: 0, state: 'idle', t: 0 };
  });
  T.walkers = WALKERS.map((d) => { const m = alienMesh(alienM); scene.add(m); return { ...d, mesh: m, x: d.x, dir: -1, alive: true, squish: 0 }; });
  {
    const m = alienMesh(alien2M);
    scene.add(m);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.08, 20), std('#2a2622', { r: 1 }));
    hole.position.set(POPPER.x, 0.02, 0);
    scene.add(hole);
    T.popper = { ...POPPER, mesh: m, y: -1.2, vy: 0, state: 'idle', alive: true };
  }
  const trollTag = textSprite('', { size: 44 });
  scene.add(trollTag);
  function setTrollTag(text, x, y) {
    scene.remove(trollTag.userData.sp || trollTag);
    const sp = textSprite(text, { size: 40, color: '#ffe066', bg: 'rgba(40,20,70,0.85)' });
    sp.scale.set(2.4, 0.9, 1);
    sp.position.set(x, y, 0.5);
    trollTag.userData.sp = sp;
    trollTag.userData.t = 2.2;
    scene.add(sp);
  }

  function resetTraps() {
    Object.assign(T.fake, { state: 'idle', t: 0, dy: 0, vy: 0 });
    T.collapse.forEach((c) => Object.assign(c, { state: 'idle', t: 0, dy: 0, vy: 0 }));
    T.hidden.forEach((d) => { d.shown = false; d.mesh.visible = false; d.bump = 0; });
    T.crates.forEach((d) => { d.used = false; d.mesh.material = crateM; d.bump = 0; });
    stars.forEach((s) => scene.remove(s.mesh));
    stars.length = 0;
    T.spikes.forEach((d) => { d.up = 0; d.on = false; });
    Object.assign(T.fakeFlag, { state: 'idle', t: 0 });
    T.fakeFlag.g.position.set(FAKE_FLAG.x, 0, -0.4);
    T.fakeFlag.g.rotation.set(0, 0, 0);
    T.meteors.forEach((m) => { m.state = 'idle'; m.mesh.visible = false; m.shadow.visible = false; });
    T.plats.forEach((p) => Object.assign(p, { dy: 0, vy: 0, state: 'idle', t: 0 }));
    T.walkers.forEach((w) => Object.assign(w, { x: w.min + (w.max - w.min) * 0.6, dir: -1, alive: true, squish: 0 }));
    T.walkers.forEach((w) => { w.mesh.visible = true; w.mesh.scale.set(1, 1, 1); });
    T.pulled.forEach((a) => scene.remove(a.mesh));
    T.pulled.length = 0;
    Object.assign(T.popper, { y: -1.2, vy: 0, state: 'idle', alive: true });
    T.popper.mesh.visible = true;
    T.popper.mesh.scale.set(1, 1, 1);
    if (trollTag.userData.sp) { scene.remove(trollTag.userData.sp); trollTag.userData.sp = null; }
  }

  // 지금 단단한 것들 (x0, x1, y0, y1)
  function solids() {
    const out = [];
    for (const [x0, x1] of GROUNDS) out.push({ x0, x1, y0: -12, y1: 0 });
    if (T.fake.state !== 'gone') out.push({ x0: T.fake.x0, x1: T.fake.x1, y0: -12 + T.fake.dy, y1: T.fake.dy, ref: T.fake, kind: 'fake' });
    for (const c of T.collapse) if (c.state !== 'gone') out.push({ x0: c.x0, x1: c.x1, y0: -12 + c.dy, y1: c.dy, ref: c, kind: 'collapse' });
    for (const d of T.hidden) if (d.shown) out.push({ x0: d.x, x1: d.x + 1, y0: d.y, y1: d.y + 1 });
    for (const d of T.crates) out.push({ x0: d.x, x1: d.x + 1, y0: d.y, y1: d.y + 1, ref: d, kind: 'crate' });
    for (const p of T.plats) out.push({ x0: p.x0, x1: p.x1, y0: p.y - 0.4 + p.dy, y1: p.y + p.dy, ref: p, kind: 'plat' });
    return out;
  }

  // ---------- 나 ----------
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name });
  me.setHelmet(true);
  scene.add(me.root);
  const crowd = createCrowd(scene, { helmet: true, teleport: 6 });
  const P = { x: START.x, y: 0, z: 0, vx: 0, vy: 0, ground: false, coyote: 0, buffer: 0, face: 1, dead: 0, deadVy: 0, spin: 0, cleared: false, stand: null, squash: 0, emote: null, emoteT: 0, lastJumpHeld: false };
  const R = { deaths: 0, best: null, startAt: 0, stars: 0, clears: 0 };
  let jumpQueued = false;
  const cam = { x: START.x + 4, y: 1.2 };

  // ---------- HUD ----------
  let hud = null, toastTimer = 0, clearEl = null, chat = null;
  function toast(html, ms = 1800) {
    ctx.hud.querySelector('.toast')?.remove();
    const t = h(`<div class="toast glass">${html}</div>`);
    ctx.hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }
  function buildHud() {
    hud = h(`<div>
      <div class="tl">
        <div class="glass chip"><span class="dot" style="background:#ffd04a;box-shadow:0 0 10px #ffd04a"></span>깜빡 속았지! 달 대시 <small data-k="online">혼자 모드</small></div>
      </div>
      <div class="tr"></div>
      <div class="tc"><div class="glass troll-bar">
        <span>💥 실패 <b data-k="deaths">0</b></span><span>⏱ <b data-k="time">0.0</b>초</span><span>★ <b data-k="stars">0</b></span><span data-k="prog" class="prog"><i></i></span>
      </div></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">A</i><i class="kbd">D</i> 달리기</span><span><i class="kbd">Space</i> 점프 (길게 = 높이)</span><span>외계인은 위에서 밟기</span><span><i class="kbd">R</i> 처음부터</span><span><i class="kbd">Enter</i> 채팅</span>
      </div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    mountPlaceMenu(ctx, hud.querySelector('.tr'), 'troll');
    ({ chat } = mountSceneUi(ctx, hud, {
      here: 'troll',
      room: 'troll',
      chatTitle: '깜빡 속았지! 달 대시',
      seed: [
        { who: '안내', text: '골인 깃발까지 달려요. 실패하면 처음으로 돌아가요.', kind: 'sys' },
        { who: '안내', text: '보이는 게 다가 아니에요… 수상하면 일단 멈춰 보기!', kind: 'sys' },
      ],
      npcs: [],
      main: { k: 'jump', icon: I.jump, label: '점프', hold: 'up', onDown: () => { jumpQueued = true; } },
      aux: [{ k: 'retry', icon: I.rotL, label: '처음부터', onTap: () => (P.cleared ? restart() : die('처음부터 다시!', true)) }],
      emote: (k) => pickEmote(k),
      canDrink: false,
      speaker: (m) => (m.kind === 'me' ? { root: me.root, y: 1.98 } : m.peer ? { root: crowd.anchorOf(m.peer), y: 1.98 } : null),
    }));
  }
  function pickEmote(k) {
    const e = EMOTES.find((x) => x.k === k);
    if (!e || k === 'drink' || !P.ground || P.dead) return;
    P.emote = k === 'flip' ? null : k;
    P.emoteT = e.dur || 3;
    if (k === 'flip') { P.vy = JUMP_V; P.ground = false; }
  }
  function updateHud(now) {
    if (!hud) return;
    const set = (k, v) => { const el = hud.querySelector(`[data-k="${k}"]`); if (el && el.textContent !== v) el.textContent = v; };
    set('deaths', String(R.deaths));
    set('time', (P.cleared ? R.lastTime : now - R.startAt).toFixed(1));
    set('stars', String(R.stars));
    const prog = hud.querySelector('[data-k="prog"] i');
    if (prog) prog.style.width = `${Math.max(0, Math.min(100, (P.x / GOAL_X) * 100)).toFixed(1)}%`;
  }

  // ---------- 죽음 · 다시 시작 · 골인 ----------
  function die(msg, manual = false) {
    if (P.dead || P.cleared) return;
    P.dead = 1.05;
    P.deadVy = manual ? 0 : 11;
    P.vx = 0;
    R.deaths += manual ? 0 : 1;
    toast(`💥 ${msg || LINES[R.deaths % LINES.length]} <span style="opacity:.7">· 실패 ${R.deaths}회</span>`, 1500);
  }
  function respawn(now) {
    ctx.multi.warp();
    resetTraps();
    Object.assign(P, { x: START.x, y: 0, vx: 0, vy: 0, ground: true, dead: 0, spin: 0, stand: null, emote: null, coyote: 0, buffer: 0 });
    R.startAt = now;
    R.stars = 0;
    cam.x = START.x + 4;
  }
  function clear(now) {
    if (P.cleared) return;
    P.cleared = true;
    P.vx = 0;
    R.lastTime = now - R.startAt;
    R.clears++;
    const best = R.best == null || R.lastTime < R.best;
    if (best) R.best = R.lastTime;
    P.emote = 'cheer';
    P.emoteT = 99;
    clearEl?.remove();
    clearEl = h(`<div class="modal-wrap troll-clear"><div class="modal">
      <div class="kicker">골인! · 진짜 깃발이었어요</div>
      <h3>🎉 달 대시 클리어!</h3>
      <div class="troll-stats"><div><b>${R.lastTime.toFixed(1)}초</b><span>기록${best ? ' · 최고!' : ''}</span></div><div><b>${R.deaths}회</b><span>실패</span></div><div><b>${R.stars}</b><span>별</span></div></div>
      <p class="note">실패 횟수와 기록을 채팅에 자랑해 보세요. 다시 하면 실패 횟수는 0부터예요.</p>
      <div class="row-btn"><button class="btn ghost" data-k="brag" style="color:#141b3d;background:#f2f3fb">${I.chat}채팅에 자랑하기</button><button class="btn" data-k="again">${I.rotL}다시 도전</button></div>
    </div></div>`);
    ctx.hud.appendChild(clearEl);
    clearEl.querySelector('[data-k="again"]').addEventListener('click', restart);
    const brag = clearEl.querySelector('[data-k="brag"]');
    brag.addEventListener('click', () => {
      const text = `🏁 골인! ${R.lastTime.toFixed(1)}초 · 실패 ${R.deaths}회`;
      chat?.send?.(text);
      brag.disabled = true;
      brag.textContent = '채팅에 보냈어요';
    });
  }

  function restart() {
    clearEl?.remove(); clearEl = null;
    P.cleared = false;
    R.deaths = 0;
    respawn(performance.now() / 1000);
  }

  // ---------- 함정 움직임 ----------
  function updateTraps(dt, t) {
    const px = P.x;
    // 가짜 바닥 · 무너지는 바닥
    const fall = (o) => {
      if (o.state === 'shake') { o.t -= dt; if (o.t <= 0) o.state = 'fall'; }
      if (o.state === 'fall') { o.vy -= 30 * dt; o.dy += o.vy * dt; if (o.dy < -16) o.state = 'gone'; }
      o.mesh.position.y = o.dy + (o.state === 'shake' ? Math.sin(t * 90) * 0.04 : 0);
      o.mesh.visible = o.state !== 'gone';
    };
    fall(T.fake);
    T.collapse.forEach(fall);
    // 숨은 블록 · 상자 튀기
    for (const d of [...T.hidden, ...T.crates]) {
      d.bump = Math.max(0, d.bump - dt * 4);
      d.mesh.position.y = d.y + 0.5 + Math.sin(d.bump * Math.PI) * 0.25;
    }
    for (const s of stars) {
      s.vy -= 18 * dt; s.y += s.vy * dt; s.mesh.position.set(s.x, s.y, 0); s.mesh.rotation.y += dt * 8;
      if (!s.got && Math.abs(P.x - s.x) < 0.8 && P.y < s.y && P.y + PH > s.y - 0.3) { s.got = true; R.stars++; scene.remove(s.mesh); toast('★ 별을 모았어요', 900); }
      if (s.y < -10) s.got = true;
    }
    // 가시: 가까이 오면 순식간에 솟음
    for (const s of T.spikes) {
      if (!s.on && px > s.trig[0] && px < s.trig[1] && P.ground) s.on = true;
      s.up = Math.min(1, s.up + (s.on ? dt * 14 : 0));
      s.mesh.position.y = -1 + s.up;
    }
    // 가짜 골인 깃발: 다가가면 날아감
    const F = T.fakeFlag;
    if (F.state === 'idle' && px > F.x - 2.4 && px < F.x + 4) {
      F.state = 'fly'; F.t = 0;
      setTrollTag('가짜지롱~ 😜', F.x, 6.4);
      const m = T.meteors.find((q) => q.after === 'flag');
      if (m && m.state === 'idle') { m.state = 'wait'; m.wait = 0.55; }
    }
    if (F.state === 'fly') {
      F.t += dt;
      F.g.position.y = F.t * F.t * 14;
      F.g.position.x = F.x + F.t * 5;
      F.g.rotation.z = -F.t * 2;
      if (F.t > 3) F.state = 'gone';
    }
    F.g.visible = F.state !== 'gone';
    // 운석: 지나가면 내 앞을 노리고 떨어짐
    for (const m of T.meteors) {
      if (m.state === 'idle' && !m.after && px > m.trig && px < m.trig + 4) { m.state = 'wait'; m.wait = 0.05; } // 그 자리를 지나갈 때만
      if (m.state === 'wait') {
        m.wait -= dt;
        if (m.wait <= 0) { m.state = 'fall'; m.x = P.x + RUN * M_FALL; m.y = M_Y0; m.vy = M_V0; }
      }
      if (m.state === 'fall') {
        m.vy -= M_G * dt; m.y += m.vy * dt;
        if (m.y <= 0.75) { m.y = 0.75; m.state = 'land'; m.t = 0.9; }
        if (Math.abs(P.x - m.x) < 0.8 && P.y < m.y + 0.5 && P.y + PH > m.y - 0.6) die('운석 조심! 그림자를 봐요');
      }
      if (m.state === 'land') { m.t -= dt; if (m.t <= 0) m.state = 'gone'; }
      m.mesh.visible = m.state === 'fall' || m.state === 'land';
      m.shadow.visible = m.state === 'fall';
      if (m.state === 'fall') {
        const k = 1 - Math.max(0, Math.min(1, (m.y - 0.75) / M_Y0));
        m.shadow.position.set(m.x, 0.03, 0);
        m.shadow.userData.disc.scale.setScalar(0.5 + k * 0.8);
        m.shadow.userData.disc.material.opacity = 0.35 + k * 0.45;
        m.shadow.userData.beamM.opacity = 0.1 + k * 0.14 + Math.sin(t * 30) * 0.04;
      }
      m.mesh.position.set(m.x, m.y, 0);
      m.mesh.rotation.x += dt * 6;
    }
    // 미끄러지는 발판
    for (const p of T.plats) {
      if (p.state === 'armed') { p.t -= dt; if (p.t <= 0) p.state = 'drop'; }
      if (p.state === 'drop') { p.vy -= 24 * dt; p.dy += p.vy * dt; }
      p.mesh.position.set((p.x0 + p.x1) / 2, p.y - 0.2 + p.dy + (p.state === 'armed' ? Math.sin(t * 80) * 0.03 : 0), 0);
    }
    // 걷는 외계인
    for (const w of [...T.walkers, ...T.pulled]) {
      if (!w.alive) {
        w.squish += dt; w.mesh.scale.set(1.3, Math.max(0.15, 1 - w.squish * 6), 1.3);
        if (w.squish > 0.6) w.mesh.visible = false;
        continue;
      }
      if (w.vy != null) { // 상자에서 나온 외계인: 떨어진 뒤 걷기
        w.vy -= 30 * dt; w.y += w.vy * dt;
        if (w.y <= 0 && onGround(w.x)) { w.y = 0; w.vy = 0; }
        if (w.y < -10) { w.alive = false; w.mesh.visible = false; continue; }
      }
      w.x += w.dir * (w.speed || 1.6) * dt;
      if (w.x < w.min) { w.x = w.min; w.dir = 1; }
      if (w.x > w.max) { w.x = w.max; w.dir = -1; }
      w.mesh.position.set(w.x, (w.y || 0) + Math.abs(Math.sin(t * 9 + w.x)) * 0.08, 0);
      w.mesh.rotation.y = w.dir * 0.6;
      hitAlien(w, 0.95);
    }
    // 구멍 외계인: 가까이 가면 위로 튀어나옴
    const Q = T.popper;
    if (Q.alive) {
      if (Q.state === 'idle' && Math.abs(px - Q.x) < Q.trig) { Q.state = 'pop'; Q.vy = 15; }
      if (Q.state === 'pop') {
        Q.vy -= 30 * dt; Q.y += Q.vy * dt;
        if (Q.y <= -1.2 && Q.vy < 0) { Q.y = -1.2; Q.state = 'rest'; Q.t = 1.6; }
      }
      if (Q.state === 'rest') { Q.t -= dt; if (Q.t <= 0 && Math.abs(px - Q.x) < Q.trig + 1.5) { Q.state = 'pop'; Q.vy = 13; } }
      Q.mesh.position.set(Q.x, Q.y, 0);
      if (Q.y > -0.6) hitAlien({ get x() { return Q.x; }, get y() { return Q.y; }, set alive(v) { Q.alive = v; }, get alive() { return Q.alive; }, mesh: Q.mesh }, 0.95);
    } else { Q.mesh.scale.y = Math.max(0.1, Q.mesh.scale.y - dt * 4); if (Q.mesh.scale.y <= 0.12) Q.mesh.visible = false; }
    // 장난 글씨
    if (trollTag.userData.sp) { trollTag.userData.t -= dt; trollTag.userData.sp.position.y += dt * 0.6; if (trollTag.userData.t <= 0) { scene.remove(trollTag.userData.sp); trollTag.userData.sp = null; } }
  }
  function onGround(x) {
    for (const [x0, x1] of GROUNDS) if (x >= x0 && x <= x1) return true;
    return false;
  }
  // 외계인과 닿았을 때: 위에서 떨어지며 밟으면 물리침, 그 밖에는 실패
  function hitAlien(w, size) {
    if (P.dead || P.cleared || !w.alive) return;
    const wy = w.y || 0;
    if (Math.abs(P.x - w.x) > (PW + size) / 2 - 0.05) return;
    if (P.y > wy + size || P.y + PH < wy + 0.05) return;
    if (P.vy < -0.5 && P.y > wy + size * 0.45) {
      w.alive = false;
      if (w.squish != null) w.squish = 0;
      P.vy = 11.5;
      P.ground = false;
      toast('👟 밟았다!', 700);
    } else die('외계인한테 닿았어요');
  }

  // ---------- 물리 ----------
  let OV = null; // 시험용 가상 입력 { x, jump, fresh }
  function step(dt, now) {
    const mi = OV ? { x: OV.x } : moveIntent();
    const held = OV ? OV.jump : input.keys.has(' ') || input.keys.has('w') || input.keys.has('arrowup') || input.hold.up;
    if (OV ? OV.fresh : input.pressed.has(' ') || input.pressed.has('w') || input.pressed.has('arrowup') || jumpQueued) P.buffer = BUFFER;
    if (OV) OV.fresh = false;
    jumpQueued = false;
    if (!OV && input.pressed.has('r')) { if (P.cleared) restart(); else die('처음부터 다시!', true); }
    if (P.dead || P.cleared) { P.buffer = 0; return; }
    const ax = Math.abs(mi.x) > 0.15 ? Math.sign(mi.x) * Math.min(1, Math.abs(mi.x) * 1.3) : 0;
    if (ax) { P.face = Math.sign(ax); P.emote = null; }
    // 가로: 빠른 가속, 땅에서는 손 떼면 금방 멈춤
    const target = ax * RUN;
    const acc = P.ground ? (ax ? ACC : FRICTION) : AIR_ACC;
    if (P.vx < target) P.vx = Math.min(target, P.vx + acc * dt);
    else if (P.vx > target) P.vx = Math.max(target, P.vx - acc * dt);
    // 점프: 코요테 타임 + 미리 누르기
    P.coyote = P.ground ? COYOTE : Math.max(0, P.coyote - dt);
    P.buffer = Math.max(0, P.buffer - dt);
    if (P.buffer > 0 && P.coyote > 0) {
      P.vy = JUMP_V; P.ground = false; P.coyote = 0; P.buffer = 0; P.stand = null; P.emote = null; P.squash = 0;
    }
    // 손을 일찍 떼면 낮게 (올라가는 중에만)
    if (!held && P.vy > 0 && P.lastJumpHeld) P.vy *= CUT;
    P.lastJumpHeld = held && P.vy > 0;
    P.vy = Math.max(-MAX_FALL, P.vy - GRAV * dt);

    const S = solids();
    // x 이동 · 충돌
    P.x += P.vx * dt;
    let box = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y + 0.02, y1: P.y + PH };
    for (const s of S) {
      if (!overlap(box, s)) continue;
      if (P.vx > 0) P.x = s.x0 - PW / 2; else if (P.vx < 0) P.x = s.x1 + PW / 2;
      P.vx = 0;
      box = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y + 0.02, y1: P.y + PH };
    }
    if (P.x < -5.5) { P.x = -5.5; P.vx = 0; }
    // y 이동 · 충돌 (숨은 블록은 아래에서 머리로 부딪힐 때만 나타남)
    const prevY = P.y;
    P.y += P.vy * dt;
    box = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y, y1: P.y + PH };
    if (P.vy > 0) {
      for (const d of T.hidden) {
        if (d.shown) continue;
        const r = { x0: d.x, x1: d.x + 1, y0: d.y, y1: d.y + 1 };
        if (overlap(box, r) && prevY + PH <= d.y + 0.05) { // 머리가 블록 아랫면을 이번에 지나갈 때만
          d.shown = true; d.mesh.visible = true; d.bump = 1;
          setTrollTag('여기 있었지롱 👀', d.x + 0.5, d.y + 2);
          S.push(r);
        }
      }
    }
    const wasGround = P.ground;
    P.ground = false;
    P.stand = null;
    for (const s of S) {
      if (!overlap(box, s)) continue;
      if (P.vy <= 0 && prevY >= s.y1 - 0.25) {
        P.y = s.y1; P.vy = 0; P.ground = true; P.stand = s;
        if (!wasGround) P.squash = 0.45;
      } else if (P.vy > 0 && prevY + PH <= s.y0 + 0.3) {
        P.y = s.y0 - PH; P.vy = 0;
        if (s.kind === 'crate') hitCrate(s.ref);
      }
      box = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y, y1: P.y + PH };
    }
    // 밟은 것에 따라: 가짜 바닥 · 무너지는 바닥 · 빠지는 발판
    const st = P.stand?.ref;
    if (st && P.stand.kind === 'fake' && st.state === 'idle') { st.state = 'shake'; st.t = 0.12; setTrollTag('여긴 가짜 바닥~', (st.x0 + st.x1) / 2, 3); }
    if (st && P.stand.kind === 'collapse' && st.state === 'idle') { st.state = 'shake'; st.t = 0.3; } // 계속 달리면 반드시 건너고, 멈추면 떨어짐
    if (st && P.stand.kind === 'plat' && st.drop && st.state === 'idle') { st.state = 'armed'; st.t = 0.22; }
    if (st && P.stand.kind === 'plat') P.y = st.y + st.dy; // 발판이 내려가면 같이
    // 가시
    // 가시 판정은 눈에 보이는 것보다 조금 작게 (발끝이 살짝 스친 정도로는 죽지 않게)
    for (const s of T.spikes) if (s.up > 0.4 && P.x + PW / 2 - 0.12 > s.x0 && P.x - PW / 2 + 0.12 < s.x1 && P.y < s.up * 0.75) die('가시가 솟았어요!');
    // 구덩이
    if (P.y < -7) die('구덩이에 빠졌어요');
    // 골인
    if (P.x > GOAL_X - 0.5 && P.y < 5.5) clear(now);
  }
  function hitCrate(d) {
    if (d.used) { d.bump = 1; return; }
    d.used = true; d.bump = 1; d.mesh.material = usedM;
    if (d.kind === 'star') {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), std('#ffe066', { e: '#ffb000', ei: 1.4 }));
      scene.add(m);
      stars.push({ mesh: m, x: d.x + 0.5, y: d.y + 1.2, vy: 9, got: false });
    } else {
      const m = alienMesh(alienM);
      scene.add(m);
      T.pulled.push({ mesh: m, x: d.x + 0.5, y: d.y + 1, vy: 8, min: 30.6, max: 55.5, dir: -1, alive: true, squish: 0, speed: 2.4 });
      setTrollTag('별인 줄 알았지?', d.x + 0.5, d.y + 2.6);
    }
  }

  function tick(d, now, t) {
    // 두 번 나눠 계산해서 빠르게 달려도 벽·바닥을 뚫지 않게
    step(d / 2, now);
    step(d / 2, now);
    if (P.dead) {
      P.dead -= d;
      P.deadVy -= GRAV * 0.7 * d;
      P.y += P.deadVy * d;
      P.spin += d * 9;
      if (P.dead <= 0) respawn(now);
    }
    updateTraps(d, t);
  }

  function selfState() {
    let m = 'idle';
    if (P.dead) m = 'lie';
    else if (!P.ground) m = 'air';
    else if (P.emote) m = P.emote;
    else if (Math.abs(P.vx) > 0.3) m = 'walk';
    return { p: [P.x, P.y, P.z], h: P.face > 0 ? 1.25 : -1.25, m };
  }

  return {
    id: 'troll',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.36, bloomThreshold: 0.95, bloomRadius: 0.4 },
    enter() {
      me.applyProfile(ctx.profile);
      P.z = Math.round((Math.random() * 1.2 - 0.6) * 100) / 100; // 여럿이 겹치지 않게 앞뒤로 조금씩
      restart();
      buildHud();
      toast('🏃 골인 깃발까지 달려요! 보이는 게 다가 아니에요…', 3200);
      window.__troll = {
        state: () => ({ x: +P.x.toFixed(2), y: +P.y.toFixed(2), vx: +P.vx.toFixed(2), vy: +P.vy.toFixed(2), ground: P.ground, dead: P.dead > 0, cleared: P.cleared, deaths: R.deaths, stars: R.stars }),
        // 시험용: 화면과 상관없이 정해진 입력으로 sec초만큼 게임 시간을 진행 (x: -1~1, jump: 누르고 있는지, jumpFor: 점프를 누르고 있는 시간)
        sim: (x, sec, jumpFor = 0) => {
          const n = Math.round(sec * 120);
          let tt = performance.now() / 1000;
          for (let i = 0; i < n; i++) {
            const j = i / 120 < jumpFor;
            OV = { x, jump: j, fresh: i === 0 && jumpFor > 0 };
            tick(1 / 120, tt, tt);
            tt += 1 / 120;
          }
          OV = null;
          return window.__troll.state();
        },
        restart: () => restart(),
        place: (x, y = 0) => { ctx.multi.warp(); P.x = x; P.y = y; P.vx = 0; P.vy = 0; },
        traps: () => ({ fake: T.fake.state, hidden: T.hidden.map((d) => d.shown), spikes: T.spikes.map((s) => s.on), flag: T.fakeFlag.state, meteors: T.meteors.map((m) => m.state), plat: T.plats.map((p) => p.state), popper: T.popper.state, walkers: T.walkers.map((w) => [+w.x.toFixed(2), w.alive]), collapse: T.collapse.filter((c) => c.state !== 'idle').length }),
      };
    },
    exit() {
      clearTimeout(toastTimer);
      clearEl?.remove(); clearEl = null;
      crowd.clear();
    },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 62 : 48;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const now = performance.now() / 1000;
      const d = Math.min(dt, 1 / 30);
      const picked = emoteFromKeys(input.pressed);
      if (picked) pickEmote(picked);
      if (P.emote && P.emoteT > 0 && (P.emoteT -= dt) <= 0) P.emote = null;
      tick(d, now, t);
      earth.update?.(dt);
      startTag.material.opacity = 0.8 + Math.sin(t * 3) * 0.2;
      goal.flag.rotation.y = Math.sin(t * 2.2) * 0.15;
      if (T.fakeFlag.state === 'idle') T.fakeFlag.flag.rotation.y = Math.sin(t * 2.2 + 1) * 0.15;

      // 내 아바타
      P.squash = Math.max(0, P.squash - dt * 3);
      const st = selfState();
      me.root.position.set(P.x, P.y, P.z);
      me.root.rotation.set(0, st.h, P.dead ? P.spin : 0);
      me.state.mode = st.m;
      me.state.speed = Math.min(3, Math.abs(P.vx) * 0.42);
      me.state.air = Math.max(-1, Math.min(1, P.vy / JUMP_V));
      me.state.squash = P.squash;
      me.update(dt, t);
      ctx.multi.tick(st);
      crowd.sync(ctx.multi.list(), dt, t);

      // 카메라: 옆에서 따라감 (가는 방향을 조금 더 보여 줌)
      const mob = ctx.isMobile();
      const ahead = P.face * (mob ? 1.5 : 3.2);
      cam.x += (P.x + ahead - cam.x) * (1 - Math.exp(-dt * 4));
      const ty = Math.max(1.2, P.y + 1.2); // 바닥이 화면 60% 높이쯤 오게
      cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 3));
      const dist = mob ? 11.5 : 13;
      camera.position.set(cam.x, cam.y + 0.5, dist); // 거의 수평으로 봐서 바닥은 얇게, 하늘과 함정은 넓게
      camera.lookAt(cam.x, cam.y + 0.2, 0);
      sun.position.set(cam.x - 8, 20, 14);
      sun.target.position.set(cam.x, 0, 0);
      updateHud(now);
    },
  };
}
