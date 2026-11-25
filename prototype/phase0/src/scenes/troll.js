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
import { LEVELS } from './trollLevels.js';

// 장면 — 「깜빡 속았지! 달 대시」 (가칭): 옆으로 달리는 함정 플랫포머, 판 3개 (trollLevels.js)
// 판을 깨면 다음 판(다른 장소)으로 · 실패하면 그 판의 시작점으로 · 장소를 나갔다 들어오면 1판부터.
// 조작감 우선의 게임 물리(실제 달 중력 아님): 빠른 가속, 누르는 길이에 따라 달라지는 점프, 2단 점프(공중제비),
// 발판 끝 여유(코요테 타임), 점프 미리 누르기. 함정은 사람마다 따로 움직이고, 같은 판 사람의 아바타·채팅이 실시간으로 보인다.
const RUN = 7.6, ACC = 70, AIR_ACC = 42, FRICTION = 60, ICE_ACC = 14, ICE_FRICTION = 5;
const GRAV = 34, JUMP_V = 13.2, DJ_V = 11.5, CUT = 0.45, MAX_FALL = 22;
const COYOTE = 0.1, BUFFER = 0.13, FLIP_T = 0.42;
const PW = 0.7, PH = 1.6; // 내 몸 상자 (발 위치 기준)
const LINES = ['속았지?', '또?', '원점으로~', '아깝다!', '그럴 줄 알았어', '다시 해 봐요!', '함정이 하나 더 있어요'];
// 운석: 떨어지기 시작할 때 '전속력으로 계속 달리면 닿을 자리'에 빛기둥으로 미리 표시 → 멈추거나 속도를 줄이면 피함
const M_Y0 = 16, M_V0 = -6, M_G = 40;
const M_FALL = (-Math.abs(M_V0) + Math.sqrt(M_V0 * M_V0 + 2 * M_G * (M_Y0 - 0.75))) / M_G; // 땅에 닿기까지(초) ≈ 0.74

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.8, metalness: o.m ?? 0, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat });
}
const overlap = (a, b) => a.x0 < b.x1 - 1e-4 && a.x1 > b.x0 + 1e-4 && a.y0 < b.y1 - 1e-4 && a.y1 > b.y0 + 1e-4;

export function createTrollScene(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04060f');
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 12000);
  const sky = createSkyDome(9500, 0.14);
  scene.add(sky, createStarfield(Math.round(ctx.renderer.quality.stars * 1.5), 9000, 31));
  const sunDir = new THREE.Vector3(-0.4, 0.75, 0.55).normalize();
  const sun = new THREE.DirectionalLight('#fff4e2', 2.5);
  sun.castShadow = ctx.renderer.quality.shadows > 0;
  sun.shadow.mapSize.set(ctx.renderer.quality.shadows || 512, ctx.renderer.quality.shadows || 512);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 14, bottom: -10, near: 1, far: 80 });
  const hemi = new THREE.HemisphereLight('#c4ceff', '#3a3530', 0.6);
  scene.add(sun, sun.target, hemi);
  const earth = createEarth(380, { segments: 80, nightBoost: 2.0, atmStrength: 1.4 });
  earth.group.position.set(-1600, 1150, -4200);
  earth.setSun(sunDir);
  scene.add(earth.group);
  // 별빛 언덕의 하늘에 뜬 고리 행성 (지구 대신)
  const ringed = new THREE.Group();
  {
    const pl = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 32), std('#c9a7ff', { r: 0.7, e: '#3b2470', ei: 0.4 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(330, 470, 64), new THREE.MeshBasicMaterial({ color: '#ffd9a8', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = 1.25;
    ringed.add(pl, ring);
    ringed.position.set(1400, 900, -4200);
    scene.add(ringed);
  }

  // ---------- 재질 ----------
  const reg = regolithTextures();
  const groundTex = reg?.map ? reg.map.clone() : null;
  if (groundTex) { groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(0.35, 0.35); groundTex.needsUpdate = true; }
  const crateTex = canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#ffcc3d'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#b57a00'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, w - 10);
    g.fillStyle = '#ffffff'; g.font = `900 78px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', w / 2, w / 2 + 4);
  });
  const brickTex = canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#8a5a3c'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#5a3624'; g.lineWidth = 6;
    for (const y of [2, 44, 86, 126]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (const [x, y0] of [[64, 2], [32, 44], [96, 44], [64, 86]]) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 42); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, 10);
  });
  const crateM = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.5, emissive: '#ffb400', emissiveIntensity: 0.18 });
  const brickM = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8 });
  const usedM = std('#8d877f', { r: 0.7 });
  const spikeM = std('#d7dbe6', { r: 0.25, m: 0.75 });
  const alienM = std('#7be36b', { r: 0.45, e: '#2e8a22', ei: 0.25 });
  const alien2M = std('#c28cff', { r: 0.45, e: '#6b2bd6', ei: 0.3 });
  const eyeW = std('#ffffff', { r: 0.3 });
  const eyeB = std('#1d1830', { r: 0.3 });
  const hotM = std('#ff9a4a', { e: '#ff5a1a', ei: 1.6 });
  const coinM = std('#ffd34a', { r: 0.3, m: 0.7, e: '#ffb000', ei: 0.45 });
  const stoneM = std('#8b8f9c', { r: 0.75 });
  const iceM = new THREE.MeshStandardMaterial({ color: '#bfe7ff', roughness: 0.08, metalness: 0.1, emissive: '#5ab8ff', emissiveIntensity: 0.18 });
  const springM = std('#ff6b4a', { r: 0.4 });
  const coilM = std('#d7dbe6', { r: 0.25, m: 0.8 });
  const thwompM = std('#6c7186', { r: 0.6, flat: true });

  // ---------- 모양 만들기 ----------
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
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat);
      foot.position.set(s * 0.2, 0.06, 0.05);
      foot.scale.set(1.2, 0.6, 1.4);
      g.add(ew, eb, ant, tip, foot);
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
  const box = (w, hh, d, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.castShadow = b.receiveShadow = true; return b; };

  // ---------- 판 (지형 · 함정) ----------
  let L = null; // 지금 판의 데이터 + 만든 물체
  let LV = 0;
  const trollTag = { sp: null, t: 0 };
  function setTrollTag(text, x, y) {
    if (trollTag.sp) L.group.remove(trollTag.sp);
    const sp = textSprite(text, { size: 40, color: '#ffe066', bg: 'rgba(40,20,70,0.85)' });
    sp.scale.set(2.4, 0.9, 1);
    sp.position.set(x, y, 0.5);
    L.group.add(sp);
    trollTag.sp = sp;
    trollTag.t = 2.2;
  }

  function buildLevel(i) {
    if (L) { scene.remove(L.group); L.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const D = LEVELS[i];
    const th = D.theme;
    const groundTop = (x) => {
      let best = -99;
      for (const [x0, x1, top = 0] of D.grounds) if (x >= x0 && x <= x1) best = Math.max(best, top);
      return best === -99 ? 0 : best;
    };
    const group = new THREE.Group();
    scene.add(group);
    scene.background.set(th.bg);
    earth.group.visible = !!th.earth;
    ringed.visible = !th.earth;
    hemi.groundColor.set(th.side);
    const topM = new THREE.MeshStandardMaterial({ color: th.top, roughness: th.ice ? 0.5 : 0.95, map: th.ice ? null : groundTex });
    const sideM = std(th.side, { r: 0.95 });
    const rockM = std(th.rock, { flat: true, r: 0.95 });
    const lineM = std('#6c707c');
    const groundBlock = (x0, x1, top = 0, kind) => {
      const g = new THREE.Group();
      const depth = top + 9;
      const tm = kind === 'stone' ? stoneM : kind === 'ice' ? iceM : topM;
      const sm = kind === 'stone' ? stoneM : sideM;
      const body = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, depth, 3.2), [sm, sm, tm, sm, sm, sm]);
      body.position.set((x0 + x1) / 2, top - depth / 2, 0);
      body.castShadow = body.receiveShadow = true;
      g.add(body);
      if (kind === 'stone') for (let y = top - 1; y > -2; y -= 1) { const ln = box(x1 - x0 + 0.02, 0.05, 3.22, lineM); ln.position.set((x0 + x1) / 2, y, 0); g.add(ln); }
      return g;
    };
    const Lx = { D, group, solidsStatic: [], fakes: [], collapse: [], sinkers: [], hidden: [], crates: [], coins: [], springs: [], plats: [], spikes: [], thwomps: [], fakeFlag: null, meteors: [], walkers: [], pulled: [], poppers: [], stars: [] };
    for (const [x0, x1, top = 0, kind] of D.grounds) {
      group.add(groundBlock(x0, x1, top, kind));
      Lx.solidsStatic.push({ x0, x1, y0: -12, y1: top, kind: kind === 'ice' ? 'ice' : 'ground' });
    }
    for (const [x0, x1] of D.fakes || []) { const m = groundBlock(x0, x1); group.add(m); Lx.fakes.push({ x0, x1, mesh: m }); }
    for (const [a, b] of D.collapse || []) for (let x = a; x < b; x += 1) { const m = groundBlock(x, x + 1); group.add(m); Lx.collapse.push({ x0: x, x1: x + 1, mesh: m }); }
    for (const s of D.sinkers || []) { const m = groundBlock(s.x0, s.x1, s.top, 'stone'); group.add(m); Lx.sinkers.push({ ...s, mesh: m }); }
    for (const d of D.hidden || []) { const m = box(1, 1, 1, usedM); m.position.set(d.x + 0.5, d.y + 0.5, 0); m.visible = false; group.add(m); Lx.hidden.push({ ...d, mesh: m }); }
    for (const b of D.bricks || []) for (let k = 0; k < b.n; k++) {
      const m = box(1, 1, 1, brickM); m.position.set(b.x + k + 0.5, b.y + 0.5, 0); group.add(m);
      Lx.solidsStatic.push({ x0: b.x + k, x1: b.x + k + 1, y0: b.y, y1: b.y + 1, kind: 'brick' });
    }
    for (const d of D.crates || []) { const m = box(1, 1, 1, crateM); m.position.set(d.x + 0.5, d.y + 0.5, 0); group.add(m); Lx.crates.push({ ...d, mesh: m }); }
    for (const [x, y] of D.coins || []) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), coinM);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, 0);
      group.add(m);
      Lx.coins.push({ x, y, mesh: m });
    }
    for (const s of D.springs || []) {
      const g = new THREE.Group();
      const base = box(1.1, 0.16, 1.1, coilM); base.position.y = 0.08;
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 24), coilM); coil.rotation.x = Math.PI / 2;
      const coil2 = coil.clone();
      const pad = box(1.1, 0.18, 1.1, springM);
      g.add(base, coil, coil2, pad);
      g.position.set(s.x, groundTop(s.x), 0);
      group.add(g);
      Lx.springs.push({ ...s, gy: groundTop(s.x), mesh: g, coil, coil2, pad, k: 0 });
    }
    for (const p of D.plats || []) {
      const m = box(p.x1 - p.x0, 0.4, 2.2, std(p.move ? '#7fd6ff' : '#c6cbdb', { r: 0.4, m: 0.5 }));
      group.add(m);
      Lx.plats.push({ ...p, mesh: m, ox: 0, oy: 0, dy: 0, mx: 0, my: 0 });
    }
    for (const s of D.spikes || []) {
      const g = new THREE.Group();
      for (let x = s.x0 + 0.25; x < s.x1; x += 0.5) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), spikeM);
        c.position.set(x, 0.45, 0);
        c.castShadow = true;
        g.add(c);
      }
      const base = groundTop((s.x0 + s.x1) / 2);
      g.position.y = base - 1;
      group.add(g);
      Lx.spikes.push({ ...s, mesh: g, base });
    }
    for (const t of D.thwomps || []) {
      const g = new THREE.Group();
      g.add(box(1.3, 1.3, 1.3, thwompM));
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std('#ffe066', { e: '#ffb000', ei: 1.2 }));
        e.position.set(sx * 0.28, 0.15, 0.66);
        g.add(e);
      }
      group.add(g);
      Lx.thwomps.push({ ...t, mesh: g });
    }
    if (D.fakeFlag) { const f = flagMesh(th.flag, '골인'); group.add(f.g); Lx.fakeFlag = { ...D.fakeFlag, ...f }; }
    for (const md of D.meteors || []) {
      const g = new THREE.Group();
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), rockM);
      r.castShadow = true;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), hotM);
      glow.position.y = 0.45;
      g.add(r, glow);
      group.add(g);
      // 떨어질 자리 표시: 바닥 원 + 하늘까지 빨간 빛기둥 + '!' (옆에서 보는 카메라에서도 잘 보이게)
      const sh = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), new THREE.MeshBasicMaterial({ color: '#ff4a2a', transparent: true, opacity: 0.5, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      const beamM = new THREE.MeshBasicMaterial({ color: '#ff5a3a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 16, 20, 1, true), beamM);
      beam.position.y = 8;
      const warn = textSprite('!', { size: 70, color: '#ffffff', bg: 'rgba(230,60,40,0.92)' });
      warn.scale.set(1.0, 0.38, 1);
      warn.position.y = 2.6;
      sh.add(disc, beam, warn);
      group.add(sh);
      Lx.meteors.push({ ...md, mesh: g, shadow: sh, disc, beamM });
    }
    for (const w of D.walkers || []) { const m = alienMesh(alienM); group.add(m); Lx.walkers.push({ ...w, mesh: m }); }
    for (const q of D.poppers || []) {
      const m = alienMesh(alien2M);
      group.add(m);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.08, 20), std('#2a2622', { r: 1 }));
      hole.position.set(q.x, groundTop(q.x) + 0.02, 0);
      group.add(hole);
      Lx.poppers.push({ ...q, mesh: m, base: groundTop(q.x) });
    }
    // 배경 바위 · 판 이름 · 골인 깃발
    for (let k = 0; k < 40; k++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + (k % 5) * 0.45, 0), rockM);
      r.position.set(-10 + k * 5.6 + (k % 3), -0.4 + (k % 4) * 0.2, -4 - (k % 6) * 2.2);
      r.rotation.set(k, k * 2, k * 3);
      group.add(r);
    }
    const startTag = textSprite(`${i + 1}판 · ${D.name}`, { size: 40, color: '#7ff3c8' });
    startTag.position.set(D.start + 1.5, 3.4, 0);
    startTag.scale.set(3.2, 1.2, 1);
    group.add(startTag);
    const goal = flagMesh('#3ad49b', i === LEVELS.length - 1 ? '골인' : '다음 판');
    goal.g.position.set(D.goal, groundTop(D.goal), -0.4);
    group.add(goal.g);
    Lx.goalFlag = goal;
    trollTag.sp = null;
    return Lx;
  }

  function groundAt(x) {
    let best = -99;
    for (const s of L.solidsStatic) if (s.kind !== 'brick' && x >= s.x0 && x <= s.x1) best = Math.max(best, s.y1);
    return best === -99 ? null : best;
  }
  // 시도할 때마다 모든 함정을 처음 상태로
  function resetTraps() {
    L.fakes.forEach((o) => Object.assign(o, { state: 'idle', t: 0, dy: 0, vy: 0 }));
    L.collapse.forEach((o) => Object.assign(o, { state: 'idle', t: 0, dy: 0, vy: 0 }));
    L.sinkers.forEach((o) => Object.assign(o, { state: 'idle', dy: 0 }));
    L.hidden.forEach((d) => { d.shown = false; d.mesh.visible = false; d.bump = 0; });
    L.crates.forEach((d) => { d.used = false; d.mesh.material = crateM; d.bump = 0; });
    L.coins.forEach((c) => { c.got = false; c.mesh.visible = true; });
    L.stars.forEach((s) => L.group.remove(s.mesh));
    L.stars.length = 0;
    L.springs.forEach((s) => { s.k = 0; });
    L.plats.forEach((p) => Object.assign(p, { state: 'idle', t: 0, dy: 0, vy: 0 }));
    L.spikes.forEach((s) => { s.up = s.always ? 1 : 0; s.on = !!s.always; });
    L.thwomps.forEach((t) => Object.assign(t, { state: 'idle', t: 0, yy: t.y + 0.65, vy: 0 }));
    if (L.fakeFlag) { Object.assign(L.fakeFlag, { state: 'idle', t: 0 }); L.fakeFlag.g.position.set(L.fakeFlag.x, groundAt(L.fakeFlag.x) ?? 0, -0.4); L.fakeFlag.g.rotation.set(0, 0, 0); }
    L.meteors.forEach((m) => { m.state = 'idle'; m.mesh.visible = false; m.shadow.visible = false; });
    L.walkers.forEach((w) => { Object.assign(w, { x: w.min + (w.max - w.min) * 0.6, dir: -1, alive: true, squish: 0 }); w.mesh.visible = true; w.mesh.scale.set(1, 1, 1); });
    L.pulled.forEach((a) => L.group.remove(a.mesh));
    L.pulled.length = 0;
    L.poppers.forEach((q) => { Object.assign(q, { y: q.base - 1.2, vy: 0, state: 'idle', alive: true }); q.mesh.visible = true; q.mesh.scale.set(1, 1, 1); });
    if (trollTag.sp) { L.group.remove(trollTag.sp); trollTag.sp = null; }
  }

  // 지금 단단한 것들 (x0, x1, y0, y1)
  function solids() {
    const out = [...L.solidsStatic];
    for (const o of L.fakes) if (o.state !== 'gone') out.push({ x0: o.x0, x1: o.x1, y0: -12 + o.dy, y1: o.dy, ref: o, kind: 'fake' });
    for (const o of L.collapse) if (o.state !== 'gone') out.push({ x0: o.x0, x1: o.x1, y0: -12 + o.dy, y1: o.dy, ref: o, kind: 'collapse' });
    for (const o of L.sinkers) out.push({ x0: o.x0, x1: o.x1, y0: -12 + o.dy, y1: o.top + o.dy, ref: o, kind: 'sinker' });
    for (const d of L.hidden) if (d.shown) out.push({ x0: d.x, x1: d.x + 1, y0: d.y, y1: d.y + 1 });
    for (const d of L.crates) out.push({ x0: d.x, x1: d.x + 1, y0: d.y, y1: d.y + 1, ref: d, kind: 'crate' });
    for (const p of L.plats) out.push({ x0: p.x0 + p.ox, x1: p.x1 + p.ox, y0: p.y - 0.4 + p.oy + p.dy, y1: p.y + p.oy + p.dy, ref: p, kind: 'plat' });
    for (const s of L.springs) out.push({ x0: s.x - 0.55, x1: s.x + 0.55, y0: s.gy, y1: s.gy + 0.34, ref: s, kind: 'spring' });
    for (const t of L.thwomps) if (t.state === 'landed') out.push({ x0: t.x - 0.65, x1: t.x + 0.65, y0: t.yy - 0.65, y1: t.yy + 0.65 });
    return out;
  }

  // ---------- 나 ----------
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name });
  me.setHelmet(true);
  scene.add(me.root);
  const crowd = createCrowd(scene, { helmet: true, teleport: 6 });
  const P = { x: 1.5, y: 0, z: 0, vx: 0, vy: 0, ground: false, coyote: 0, buffer: 0, face: 1, dead: 0, deadVy: 0, spin: 0, cleared: false, stand: null, squash: 0, emote: null, emoteT: 0, lastJumpHeld: false, djUsed: false, flip: 0 };
  const R = { deaths: 0, total: 0, coins: 0, startAt: 0, lastTime: 0, best: {}, times: [] };
  let jumpQueued = false;
  const cam = { x: 5, y: 1.2 };

  // ---------- HUD ----------
  let hud = null, toastTimer = 0, clearEl = null, chat = null, nextTimer = 0;
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
        <span class="lv" data-k="lv">1판</span><span>💥 <b data-k="deaths">0</b></span><span>⏱ <b data-k="time">0.0</b></span><span>🪙 <b data-k="coins">0</b></span><span data-k="prog" class="prog"><i></i></span>
      </div></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">A</i><i class="kbd">D</i> 달리기</span><span><i class="kbd">Space</i> 점프 · 공중에서 한 번 더 = <b>2단 점프</b></span><span>외계인은 위에서 밟기</span><span><i class="kbd">R</i> 이 판 처음부터</span><span><i class="kbd">Enter</i> 채팅</span>
      </div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    mountPlaceMenu(ctx, hud.querySelector('.tr'), 'troll');
    ({ chat } = mountSceneUi(ctx, hud, {
      here: 'troll',
      room: 'troll',
      chatTitle: '깜빡 속았지! 달 대시',
      seed: [
        { who: '안내', text: '판 끝의 깃발까지 달려요. 실패하면 그 판의 처음으로 돌아가요.', kind: 'sys' },
        { who: '안내', text: '공중에서 점프를 한 번 더 누르면 2단 점프(공중제비)!', kind: 'sys' },
      ],
      npcs: [],
      main: { k: 'jump', icon: I.jump, label: '점프', hold: 'up', onDown: () => { jumpQueued = true; } },
      aux: [{ k: 'retry', icon: I.rotL, label: '다시', onTap: () => (P.cleared ? null : die('이 판 처음부터!', true)) }],
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
    if (k === 'flip') { P.vy = JUMP_V; P.ground = false; P.flip = FLIP_T; }
  }
  function updateHud(now) {
    if (!hud) return;
    const set = (k, v) => { const el = hud.querySelector(`[data-k="${k}"]`); if (el && el.textContent !== v) el.textContent = v; };
    set('lv', `${LV + 1}판 · ${L.D.name}`);
    set('deaths', String(R.deaths));
    set('time', (P.cleared ? R.lastTime : now - R.startAt).toFixed(1));
    set('coins', String(R.coins));
    const prog = hud.querySelector('[data-k="prog"] i');
    if (prog) prog.style.width = `${Math.max(0, Math.min(100, ((P.x - L.D.start) / (L.D.goal - L.D.start)) * 100)).toFixed(1)}%`;
  }

  // ---------- 판 시작 · 실패 · 골인 ----------
  function loadLevel(i, now) {
    LV = i;
    L = buildLevel(i);
    // 같은 판에 있는 사람끼리만 보이게 (판마다 실시간 방이 따로)
    ctx.multi.setScene(i === 0 ? 'troll' : `troll${i + 1}`);
    R.deaths = 0;
    respawn(now);
  }
  function die(msg, manual = false) {
    if (P.dead || P.cleared) return;
    P.dead = 1.05;
    P.deadVy = manual ? 0 : 11;
    P.vx = 0;
    if (!manual) { R.deaths++; R.total++; }
    toast(`💥 ${msg || LINES[R.deaths % LINES.length]} <span style="opacity:.7">· 이 판 실패 ${R.deaths}회</span>`, 1500);
  }
  function respawn(now) {
    ctx.multi.warp();
    resetTraps();
    Object.assign(P, { x: L.D.start, y: groundAt(L.D.start) ?? 0, vx: 0, vy: 0, ground: true, dead: 0, spin: 0, stand: null, emote: null, coyote: 0, buffer: 0, djUsed: false, flip: 0 });
    R.startAt = now;
    R.coins = 0;
    cam.x = L.D.start + 4;
  }
  function clearLevel(now) {
    if (P.cleared) return;
    P.cleared = true;
    P.vx = 0;
    R.lastTime = now - R.startAt;
    const last = LV === LEVELS.length - 1;
    const prev = R.best[LV];
    const best = prev == null || R.lastTime < prev;
    if (best) R.best[LV] = R.lastTime;
    R.times[LV] = R.lastTime;
    P.emote = 'cheer';
    P.emoteT = 99;
    clearEl?.remove();
    const total = R.times.reduce((a, b) => a + (b || 0), 0);
    clearEl = h(`<div class="modal-wrap troll-clear"><div class="modal">
      <div class="kicker">${LV + 1}판 · ${L.D.name} 클리어${last ? ' · 모든 판 완료!' : ''}</div>
      <h3>${last ? '🏆 달 대시 완주!' : `🎉 ${LV + 1}판 클리어!`}</h3>
      <div class="troll-stats"><div><b>${R.lastTime.toFixed(1)}초</b><span>기록${best ? ' · 최고!' : ''}</span></div><div><b>${R.deaths}회</b><span>이 판 실패</span></div><div><b>${R.coins}</b><span>코인</span></div></div>
      ${last ? `<p class="note">전체 실패 ${R.total}회 · 판 기록 합계 ${total.toFixed(1)}초</p>` : `<p class="note">다음은 <b>${LEVELS[LV + 1].name}</b> — <span data-k="cd">5</span>초 뒤 자동으로 넘어가요.</p>`}
      <div class="row-btn"><button class="btn ghost" data-k="brag" style="color:#141b3d;background:#f2f3fb">${I.chat}채팅에 자랑하기</button><button class="btn" data-k="next">${last ? `${I.rotL}1판부터 다시` : '다음 판 →'}</button></div>
    </div></div>`);
    ctx.hud.appendChild(clearEl);
    const go = () => { clearInterval(nextTimer); clearEl?.remove(); clearEl = null; P.cleared = false; if (last) { R.total = 0; R.times = []; } loadLevel(last ? 0 : LV + 1, performance.now() / 1000); };
    clearEl.querySelector('[data-k="next"]').addEventListener('click', go);
    const brag = clearEl.querySelector('[data-k="brag"]');
    brag.addEventListener('click', () => {
      chat?.send?.(last ? `🏆 달 대시 완주! 전체 실패 ${R.total}회` : `🏁 ${LV + 1}판 클리어! ${R.lastTime.toFixed(1)}초 · 실패 ${R.deaths}회`);
      brag.disabled = true;
      brag.textContent = '채팅에 보냈어요';
    });
    clearInterval(nextTimer);
    if (!last) {
      let n = 5;
      nextTimer = setInterval(() => { n--; const el = clearEl?.querySelector('[data-k="cd"]'); if (el) el.textContent = String(n); if (n <= 0) go(); }, 1000);
    }
  }

  // ---------- 함정 움직임 ----------
  function updateTraps(dt, t) {
    const px = P.x;
    const fall = (o) => {
      if (o.state === 'shake') { o.t -= dt; if (o.t <= 0) o.state = 'fall'; }
      if (o.state === 'fall') { o.vy -= 30 * dt; o.dy += o.vy * dt; if (o.dy < -16) o.state = 'gone'; }
      o.mesh.position.y = o.dy + (o.state === 'shake' ? Math.sin(t * 90) * 0.04 : 0);
      o.mesh.visible = o.state !== 'gone';
    };
    L.fakes.forEach(fall);
    L.collapse.forEach(fall);
    for (const o of L.sinkers) {
      if (o.state === 'sink') o.dy = Math.max(-14, o.dy - dt * 3.2);
      o.mesh.position.y = o.dy;
    }
    for (const d of [...L.hidden, ...L.crates]) {
      d.bump = Math.max(0, (d.bump || 0) - dt * 4);
      d.mesh.position.y = d.y + 0.5 + Math.sin(d.bump * Math.PI) * 0.25;
    }
    // 코인 · 상자에서 나온 별
    for (const c of L.coins) {
      if (c.got) continue;
      c.mesh.rotation.z = t * 3;
      if (Math.abs(P.x - c.x) < 0.65 && P.y < c.y + 0.35 && P.y + PH > c.y - 0.35) { c.got = true; c.mesh.visible = false; R.coins++; }
    }
    for (const s of L.stars) {
      s.vy -= 18 * dt; s.y += s.vy * dt; s.mesh.position.set(s.x, s.y, 0); s.mesh.rotation.y += dt * 8;
      if (!s.got && Math.abs(P.x - s.x) < 0.8 && P.y < s.y && P.y + PH > s.y - 0.3) { s.got = true; R.coins += s.value; L.group.remove(s.mesh); toast(s.value > 1 ? '★ 별 = 코인 5개!' : '🪙 코인', 900); }
      if (s.y < -10) s.got = true;
    }
    for (const s of L.springs) {
      s.k = Math.max(0, s.k - dt * 5);
      const c = 1 - s.k * 0.6;
      s.coil.position.y = 0.2 * c; s.coil2.position.y = 0.32 * c; s.pad.position.y = 0.42 * c;
    }
    // 발판: 왕복 · 밟으면 빠짐 (mx·my = 이번에 움직인 양 → 위에 선 사람도 같이 움직임)
    for (const p of L.plats) {
      const ox0 = p.ox, oy0 = p.oy;
      if (p.move) {
        const ph = Math.sin((t / p.move.period) * Math.PI * 2);
        p.ox = p.move.ax * ph; p.oy = p.move.ay * ph;
      }
      p.mx = p.ox - ox0; p.my = p.oy - oy0;
      if (p.state === 'armed') { p.t -= dt; if (p.t <= 0) p.state = 'drop'; }
      if (p.state === 'drop') { p.vy -= 24 * dt; p.dy += p.vy * dt; }
      p.mesh.position.set((p.x0 + p.x1) / 2 + p.ox, p.y - 0.2 + p.oy + p.dy + (p.state === 'armed' ? Math.sin(t * 80) * 0.03 : 0), 0);
    }
    // 가시
    for (const s of L.spikes) {
      if (!s.on && px > s.trig[0] && px < s.trig[1] && P.ground) s.on = true;
      s.up = Math.min(1, s.up + (s.on ? dt * 14 : 0));
      s.mesh.position.y = s.base - 1 + s.up;
    }
    // 떨어지는 돌 블록: 바로 아래를 지나가면 0.35초 흔들린 뒤 쿵 (떨어진 뒤엔 밟고 올라설 수 있음)
    for (const tw of L.thwomps) {
      if (tw.state === 'idle' && Math.abs(px - tw.x) < 1.3 && P.y < tw.y) { tw.state = 'shake'; tw.t = 0.35; }
      if (tw.state === 'shake') { tw.t -= dt; if (tw.t <= 0) { tw.state = 'fall'; tw.vy = 0; } }
      if (tw.state === 'fall') {
        tw.vy -= 60 * dt; tw.yy += tw.vy * dt;
        const floor = (groundAt(tw.x) ?? -20) + 0.65;
        if (tw.yy <= floor) { tw.yy = floor; tw.state = 'landed'; }
        if (Math.abs(P.x - tw.x) < 0.95 && P.y < tw.yy + 0.6 && P.y + PH > tw.yy - 0.65) die('돌 블록에 깔렸어요');
      }
      tw.mesh.position.set(tw.x + (tw.state === 'shake' ? Math.sin(t * 70) * 0.06 : 0), tw.yy, 0);
    }
    // 가짜 골인 깃발: 다가가면 날아가고, 뒤따라 운석
    const F = L.fakeFlag;
    if (F) {
      if (F.state === 'idle' && px > F.x - 2.4 && px < F.x + 4) {
        F.state = 'fly'; F.t = 0;
        setTrollTag('가짜지롱~ 😜', F.x, (groundAt(F.x) ?? 0) + 6.4);
        const m = L.meteors.find((q) => q.after === 'flag');
        if (m && m.state === 'idle') { m.state = 'wait'; m.wait = 0.55; }
      }
      if (F.state === 'fly') {
        F.t += dt;
        F.g.position.y = (groundAt(F.x) ?? 0) + F.t * F.t * 14;
        F.g.position.x = F.x + F.t * 5;
        F.g.rotation.z = -F.t * 2;
        if (F.t > 3) F.state = 'gone';
      }
      F.g.visible = F.state !== 'gone';
      if (F.state === 'idle') F.flag.rotation.y = Math.sin(t * 2.2 + 1) * 0.15;
    }
    for (const m of L.meteors) {
      if (m.state === 'idle' && !m.after && px > m.trig && px < m.trig + 4) { m.state = 'wait'; m.wait = 0.05; } // 그 자리를 지나갈 때만
      if (m.state === 'wait') { m.wait -= dt; if (m.wait <= 0) { m.state = 'fall'; m.x = P.x + RUN * M_FALL; m.y = M_Y0; m.vy = M_V0; m.floor = (groundAt(m.x) ?? -8) + 0.75; } }
      if (m.state === 'fall') {
        m.vy -= M_G * dt; m.y += m.vy * dt;
        if (m.y <= m.floor) { m.y = m.floor; m.state = 'land'; m.t = 0.9; }
        if (Math.abs(P.x - m.x) < 0.8 && P.y < m.y + 0.5 && P.y + PH > m.y - 0.6) die('운석 조심! 빛기둥을 봐요');
      }
      if (m.state === 'land') { m.t -= dt; if (m.t <= 0) m.state = 'gone'; }
      m.mesh.visible = m.state === 'fall' || m.state === 'land';
      m.shadow.visible = m.state === 'fall';
      if (m.state === 'fall') {
        const k = 1 - Math.max(0, Math.min(1, (m.y - m.floor) / M_Y0));
        m.shadow.position.set(m.x, m.floor - 0.72, 0);
        m.disc.scale.setScalar(0.5 + k * 0.8);
        m.disc.material.opacity = 0.35 + k * 0.45;
        m.beamM.opacity = 0.1 + k * 0.14 + Math.sin(t * 30) * 0.04;
      }
      m.mesh.position.set(m.x, m.y, 0);
      m.mesh.rotation.x += dt * 6;
    }
    // 걷는 외계인 (상자에서 나온 외계인 포함)
    for (const w of [...L.walkers, ...L.pulled]) {
      if (!w.alive) {
        w.squish += dt; w.mesh.scale.set(1.3, Math.max(0.15, 1 - w.squish * 6), 1.3);
        if (w.squish > 0.6) w.mesh.visible = false;
        continue;
      }
      const gy = groundAt(w.x);
      if (w.vy != null) {
        w.vy -= 30 * dt; w.y += w.vy * dt;
        if (gy != null && w.y <= gy && w.vy < 0) { w.y = gy; w.vy = 0; }
        if (w.y < -10) { w.alive = false; w.mesh.visible = false; continue; }
      } else w.y = gy ?? 0;
      w.x += w.dir * (w.speed || 1.6) * dt;
      if (w.x < w.min) { w.x = w.min; w.dir = 1; }
      if (w.x > w.max) { w.x = w.max; w.dir = -1; }
      w.mesh.position.set(w.x, w.y + Math.abs(Math.sin(t * 9 + w.x)) * 0.08, 0);
      w.mesh.rotation.y = w.dir * 0.6;
      hitAlien(w, 0.95);
    }
    // 구멍 외계인: 가까이 가면 위로 튀어나옴
    for (const q of L.poppers) {
      if (q.alive) {
        if (q.state === 'idle' && Math.abs(px - q.x) < q.trig) { q.state = 'pop'; q.vy = 15; }
        if (q.state === 'pop') { q.vy -= 30 * dt; q.y += q.vy * dt; if (q.y <= q.base - 1.2 && q.vy < 0) { q.y = q.base - 1.2; q.state = 'rest'; q.t = 1.6; } }
        if (q.state === 'rest') { q.t -= dt; if (q.t <= 0 && Math.abs(px - q.x) < q.trig + 1.5) { q.state = 'pop'; q.vy = 13; } }
        q.mesh.position.set(q.x, q.y, 0);
        if (q.y > q.base - 0.6) hitAlien(q, 0.95);
      } else { q.mesh.scale.y = Math.max(0.1, q.mesh.scale.y - dt * 4); if (q.mesh.scale.y <= 0.12) q.mesh.visible = false; }
    }
    if (trollTag.sp) { trollTag.t -= dt; trollTag.sp.position.y += dt * 0.6; if (trollTag.t <= 0) { L.group.remove(trollTag.sp); trollTag.sp = null; } }
  }
  // 외계인과 닿았을 때: 위에서 떨어지며 밟으면 물리침, 그 밖에는 실패
  function hitAlien(w, size) {
    if (P.dead || P.cleared || !w.alive) return;
    const wy = w.y || 0;
    if (Math.abs(P.x - w.x) > (PW + size) / 2 - 0.05) return;
    if (P.y > wy + size || P.y + PH < wy + 0.05) return;
    if (P.vy < -0.5 && P.y > wy + size * 0.45) {
      w.alive = false;
      w.squish = 0;
      P.vy = 11.5;
      P.ground = false;
      P.djUsed = false; // 밟으면 2단 점프 다시 가능
      R.coins++;
      toast('👟 밟았다! +1', 700);
    } else die('외계인한테 닿았어요');
  }

  // ---------- 물리 ----------
  let keyFresh = true;
  let OV = null; // 시험용 가상 입력 { x, jump, fresh }
  function step(dt, now) {
    const mi = OV ? { x: OV.x } : moveIntent();
    const held = OV ? OV.jump : input.keys.has(' ') || input.keys.has('w') || input.keys.has('arrowup') || input.hold.up;
    // 키 '눌림'은 한 프레임 동안 남아 있으므로 첫 번째 나눔 계산에서만 쓴다 (안 그러면 점프 한 번이 곧바로 2단 점프가 됨)
    const pressed = OV ? OV.fresh : (keyFresh && (input.pressed.has(' ') || input.pressed.has('w') || input.pressed.has('arrowup'))) || jumpQueued;
    if (OV) OV.fresh = false;
    keyFresh = false;
    jumpQueued = false;
    if (!OV && input.pressed.has('r') && !P.cleared) die('이 판 처음부터!', true);
    if (P.dead || P.cleared) { P.buffer = 0; return; }
    if (pressed) P.buffer = BUFFER;
    const ax = Math.abs(mi.x) > 0.15 ? Math.sign(mi.x) * Math.min(1, Math.abs(mi.x) * 1.3) : 0;
    if (ax) { P.face = Math.sign(ax); P.emote = null; }
    // 가로: 빠른 가속, 땅에서는 손 떼면 금방 멈춤 (얼음 위에서는 잘 안 멈춤)
    const onIce = P.ground && P.stand?.kind === 'ice';
    const target = ax * RUN;
    const acc = P.ground ? (onIce ? (ax ? ICE_ACC : ICE_FRICTION) : ax ? ACC : FRICTION) : AIR_ACC;
    if (P.vx < target) P.vx = Math.min(target, P.vx + acc * dt);
    else if (P.vx > target) P.vx = Math.max(target, P.vx - acc * dt);
    // 점프 · 2단 점프(공중제비)
    P.coyote = P.ground ? COYOTE : Math.max(0, P.coyote - dt);
    P.buffer = Math.max(0, P.buffer - dt);
    if (P.ground) P.djUsed = false;
    if (P.buffer > 0 && P.coyote > 0) {
      P.vy = JUMP_V; P.ground = false; P.coyote = 0; P.buffer = 0; P.stand = null; P.emote = null; P.squash = 0; P.lastJumpHeld = true;
    } else if (pressed && !P.ground && P.coyote <= 0 && !P.djUsed) {
      P.vy = DJ_V; P.djUsed = true; P.buffer = 0; P.flip = FLIP_T; P.lastJumpHeld = true;
    }
    // 손을 일찍 떼면 낮게 (올라가는 중에만)
    if (!held && P.vy > 0 && P.lastJumpHeld) P.vy *= CUT;
    P.lastJumpHeld = held && P.vy > 0;
    P.vy = Math.max(-MAX_FALL, P.vy - GRAV * dt);
    P.flip = Math.max(0, P.flip - dt);

    const S = solids();
    // 움직이는 발판 위에 서 있으면 같이 움직임
    if (P.ground && P.stand?.kind === 'plat') P.x += P.stand.ref.mx || 0;
    P.x += P.vx * dt;
    let bx = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y + 0.02, y1: P.y + PH };
    for (const s of S) {
      if (!overlap(bx, s)) continue;
      if (s.y1 - P.y < 0.35 && P.vy <= 0) continue; // 발밑 살짝 높은 턱은 위(y)에서 처리
      if ((s.x0 + s.x1) / 2 > P.x) P.x = s.x0 - PW / 2; else P.x = s.x1 + PW / 2;
      P.vx = 0;
      bx = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y + 0.02, y1: P.y + PH };
    }
    if (P.x < L.D.start - 7) { P.x = L.D.start - 7; P.vx = 0; }
    const prevY = P.y;
    P.y += P.vy * dt;
    bx = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y, y1: P.y + PH };
    if (P.vy > 0) {
      for (const d of L.hidden) {
        if (d.shown) continue;
        const r = { x0: d.x, x1: d.x + 1, y0: d.y, y1: d.y + 1 };
        if (overlap(bx, r) && prevY + PH <= d.y + 0.05) { // 머리가 블록 아랫면을 이번에 지나갈 때만
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
      if (!overlap(bx, s)) continue;
      if (P.vy <= 0 && prevY >= s.y1 - 0.35) {
        P.y = s.y1; P.vy = 0; P.ground = true; P.stand = s;
        if (!wasGround) P.squash = 0.45;
      } else if (P.vy > 0 && prevY + PH <= s.y0 + 0.3) {
        P.y = s.y0 - PH; P.vy = 0;
        if (s.kind === 'crate') hitCrate(s.ref);
      }
      bx = { x0: P.x - PW / 2, x1: P.x + PW / 2, y0: P.y, y1: P.y + PH };
    }
    // 밟은 것에 따라
    const st = P.stand?.ref;
    const kind = P.stand?.kind;
    if (st && kind === 'fake' && st.state === 'idle') { st.state = 'shake'; st.t = 0.12; setTrollTag('여긴 가짜 바닥~', (st.x0 + st.x1) / 2, 3); }
    if (st && kind === 'collapse' && st.state === 'idle') { st.state = 'shake'; st.t = 0.3; } // 계속 달리면 반드시 건너고, 멈추면 떨어짐
    if (st && kind === 'sinker' && st.state === 'idle') { st.state = 'sink'; setTrollTag('가라앉는다~', (st.x0 + st.x1) / 2, st.top + 3); }
    if (st && kind === 'sinker') P.y = st.top + st.dy;
    if (st && kind === 'plat' && st.drop && st.state === 'idle') { st.state = 'armed'; st.t = 0.22; }
    if (st && kind === 'plat') P.y = st.y + st.oy + st.dy;
    if (st && kind === 'spring') { P.vy = st.v; P.ground = false; P.stand = null; P.djUsed = false; st.k = 1; P.lastJumpHeld = false; }
    // 가시 (판정은 눈에 보이는 것보다 조금 작게)
    for (const s of L.spikes) if (s.up > 0.4 && P.x + PW / 2 - 0.12 > s.x0 && P.x - PW / 2 + 0.12 < s.x1 && P.y < s.base + s.up * 0.75) die('가시에 찔렸어요!');
    // 구덩이 · 골인
    if (P.y < -7) die('구덩이에 빠졌어요');
    if (P.x > L.D.goal - 0.5 && Math.abs(P.y - (groundAt(L.D.goal) ?? 0)) < 5.5) clearLevel(now);
  }
  function hitCrate(d) {
    if (d.used) { d.bump = 1; return; }
    d.used = true; d.bump = 1; d.mesh.material = usedM;
    if (d.kind === 'alien') {
      const m = alienMesh(alienM);
      L.group.add(m);
      L.pulled.push({ mesh: m, x: d.x + 0.5, y: d.y + 1, vy: 8, min: d.x - 6, max: d.x + 6, dir: -1, alive: true, squish: 0, speed: 2.4 });
      setTrollTag('별인 줄 알았지?', d.x + 0.5, d.y + 2.6);
    } else {
      const star = d.kind === 'star';
      const m = star ? new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), std('#ffe066', { e: '#ffb000', ei: 1.4 })) : new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18), coinM);
      if (!star) m.rotation.x = Math.PI / 2;
      L.group.add(m);
      L.stars.push({ mesh: m, x: d.x + 0.5, y: d.y + 1.2, vy: 9, got: false, value: star ? 5 : 1 });
    }
  }
  function tick(d, now, t) {
    // 두 번 나눠 계산해서 빠르게 달려도 벽·바닥을 뚫지 않게
    keyFresh = true;
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
      P.cleared = false;
      clearEl?.remove(); clearEl = null;
      R.total = 0; R.times = [];
      loadLevel(0, performance.now() / 1000); // 들어올 때는 늘 1판부터
      buildHud();
      toast('🏃 판 끝 깃발까지 달려요! 보이는 게 다가 아니에요…', 3200);
      window.__troll = {
        state: () => ({ lv: LV + 1, x: +P.x.toFixed(2), y: +P.y.toFixed(2), vx: +P.vx.toFixed(2), vy: +P.vy.toFixed(2), ground: P.ground, dead: P.dead > 0, cleared: P.cleared, deaths: R.deaths, total: R.total, coins: R.coins, dj: P.djUsed, zone: ctx.multi.zone }),
        // 시험용: 화면과 상관없이 정해진 입력으로 sec초만큼 게임 시간을 진행 (x: -1~1, jumpFor: 점프를 누르고 있는 시간)
        //  presses: 공중에서 점프를 다시 누를 시각들(초) → 2단 점프 시험 (누른 뒤 0.3초 동안 누르고 있음)
        sim: (x, sec, jumpFor = 0, presses = []) => {
          const n = Math.round(sec * 120);
          let tt = performance.now() / 1000;
          const pi = presses.map((p) => Math.round(p * 120));
          for (let i = 0; i < n; i++) {
            const pr = pi.find((k) => i >= k && i < k + 36);
            OV = { x, jump: i / 120 < jumpFor || pr != null, fresh: (i === 0 && jumpFor > 0) || pi.includes(i) };
            tick(1 / 120, tt, tt);
            tt += 1 / 120;
          }
          OV = null;
          return window.__troll.state();
        },
        level: (i) => { P.cleared = false; clearEl?.remove(); clearEl = null; clearInterval(nextTimer); loadLevel(i - 1, performance.now() / 1000); },
        restart: () => { P.cleared = false; respawn(performance.now() / 1000); },
        place: (x, y) => { ctx.multi.warp(); P.x = x; P.y = y ?? groundAt(x) ?? 0; P.vx = 0; P.vy = 0; },
        traps: () => ({ fakes: L.fakes.map((o) => o.state), hidden: L.hidden.map((d) => !!d.shown), spikes: L.spikes.map((s) => s.on), flag: L.fakeFlag?.state, meteors: L.meteors.map((m) => m.state), plat: L.plats.map((p) => p.state || 'idle'), poppers: L.poppers.map((q) => q.state), walkers: L.walkers.map((w) => [+w.x.toFixed(2), w.alive]), thwomps: L.thwomps.map((q) => q.state), sinkers: L.sinkers.map((q) => q.state), collapse: L.collapse.filter((c) => c.state !== 'idle').length }),
      };
    },
    exit() {
      clearTimeout(toastTimer);
      clearInterval(nextTimer);
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
      ringed.rotation.y += dt * 0.02;
      L.goalFlag.flag.rotation.y = Math.sin(t * 2.2) * 0.15;

      // 내 아바타 (2단 점프 때 앞으로 한 바퀴)
      P.squash = Math.max(0, P.squash - dt * 3);
      const st = selfState();
      me.root.position.set(P.x, P.y, P.z);
      me.root.rotation.set(0, st.h, P.dead ? P.spin : 0);
      me.state.mode = st.m;
      me.state.speed = Math.min(3, Math.abs(P.vx) * 0.42);
      me.state.air = Math.max(-1, Math.min(1, P.vy / JUMP_V));
      me.state.squash = P.squash;
      me.state.flip = P.flip > 0 ? (1 - P.flip / FLIP_T) * Math.PI * 2 : 0;
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
      camera.position.set(cam.x, cam.y + 0.5, dist);
      camera.lookAt(cam.x, cam.y + 0.2, 0);
      sun.position.set(cam.x - 8, 20, 14);
      sun.target.position.set(cam.x, 0, 0);
      updateHud(now);
    },
  };
}
