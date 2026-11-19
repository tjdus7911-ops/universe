import * as THREE from 'three';
import { createAstronaut } from '../world/astronaut.js';
import { createEarth } from '../world/earth.js';
import { createStarfield, createSkyDome } from '../world/space.js';
import { regolithTextures, signBoard, textSprite } from '../world/moonSurface.js';
import { input, moveIntent } from '../core/input.js';
import { h, I, coinsChip } from '../ui/dom.js';
import { mountSceneUi } from '../ui/sceneUi.js';
import { mountPlaceMenu } from '../ui/placeMenu.js';
import { EMOTES, emoteFromKeys } from '../ui/emotes.js';
import { createCrowd } from '../net/crowd.js';
import { JUMP_V0 } from '../data/planets.js';
import {
  GIRDERS, LADDERS, PADS, PAD_V, TOP, BOSS, CRYSTAL, MOON_G, METEOR_R, HIT_COOLDOWN, WIN_PAUSE,
  bossPhase, canHit, meteorsAt, bossMaxHp, SPAWNS,
} from '../../../../packages/shared/climb.js';

// 장면 — 우주 엘리베이터 대작전 1구간 「달 기슭」 (협동)
// 옆에서 보는 2.5D 오르기: 굴러오는 운석을 넘으며 사다리·중력 패드로 꼭대기까지 → 크레이터 골렘이 지쳐 엎드리면
// 다 같이 등의 결정을 밟아 체력(모두 공유)을 깎는다. 보스 시간표·운석은 공통 시계로 정해져 모두에게 똑같이 보인다.
const WALK = 3.3;
const RUN = 4.6;
const LADDER_V = 2.6;
const WALL = 16.2;

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.7, metalness: o.m ?? 0, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat });
}
function rockGeo(r, seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 0.82 + rnd() * 0.3);
    const k = map.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export function createClimbScene(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#03050d');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 12000);
  scene.add(createSkyDome(9500, 0.14), createStarfield(Math.round(ctx.renderer.quality.stars * 1.6), 9000, 21));

  // 빛: 낮은 각도의 햇빛 + 하늘빛
  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
  const sun = new THREE.DirectionalLight('#fff6e6', 2.6);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.target.position.set(0, 12, 0);
  sun.castShadow = ctx.renderer.quality.shadows > 0;
  sun.shadow.mapSize.set(ctx.renderer.quality.shadows || 512, ctx.renderer.quality.shadows || 512);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 40, bottom: -6, near: 1, far: 160 });
  scene.add(sun, sun.target, new THREE.HemisphereLight('#b9c6ff', '#3a3530', 0.55));

  // 지구 (왼쪽 위 하늘)
  const earth = createEarth(420, { segments: 96, nightBoost: 2.0, atmStrength: 1.4 });
  earth.group.position.set(-2100, 1500, -4200);
  earth.setSun(sunDir);
  scene.add(earth.group);

  // 달 바닥
  const reg = regolithTextures();
  const groundMat = new THREE.MeshStandardMaterial({ color: '#9b968f', roughness: 0.95 });
  if (reg?.map) { groundMat.map = reg.map.clone(); groundMat.map.repeat.set(30, 30); groundMat.map.wrapS = groundMat.map.wrapT = THREE.RepeatWrapping; groundMat.map.needsUpdate = true; }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  scene.add(ground);
  const rockM = std('#8a857e', { flat: true });
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39, r = 22 + (i % 7) * 9;
    const rk = new THREE.Mesh(rockGeo(0.6 + (i % 5) * 0.5, i + 3), rockM);
    rk.position.set(Math.cos(a) * r, 0, -8 - Math.abs(Math.sin(a) * r));
    rk.castShadow = rk.receiveShadow = true;
    scene.add(rk);
  }

  // ---------- 탑: 기둥 · 발판 · 사다리 · 중력 패드 ----------
  const tower = new THREE.Group();
  scene.add(tower);
  const steel = std('#d9dce8', { r: 0.4, m: 0.55 });
  const girderM = std('#e2683c', { r: 0.5, m: 0.3 });
  const stripeM = std('#f4f1e8', { r: 0.5 });
  const topY = GIRDERS[TOP].y;
  for (const sx of [-1, 1]) {
    for (const sz of [-1.25, -2.6]) { // 기둥은 뒤쪽에만 (카메라 앞을 가리지 않게)
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.35, topY + 14, 0.35), steel);
      col.position.set(sx * 16.6, (topY + 14) / 2 - 0.2, sz);
      col.castShadow = true;
      tower.add(col);
    }
    // X자 버팀대
    for (let k = 0; k <= TOP; k++) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, Math.hypot(2.5, 4.6), 0.12), steel);
      brace.position.set(sx * 16.6, GIRDERS[k].y + 2.3, -1.9);
      brace.rotation.x = Math.atan2(2.5, 4.6) * (k % 2 ? 1 : -1);
      tower.add(brace);
    }
  }
  GIRDERS.forEach((g, i) => {
    const w = g.x1 - g.x0;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.36, 2.4), girderM);
    beam.position.set((g.x0 + g.x1) / 2, g.y - 0.18, 0);
    beam.castShadow = beam.receiveShadow = true;
    tower.add(beam);
    // 가장자리 흰 줄 · 구멍 무늬 (작은 상자)
    for (let x = g.x0 + 0.8; x < g.x1 - 0.4; x += 1.6) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.1), stripeM);
      dot.position.set(x, g.y - 0.18, 1.21);
      tower.add(dot);
    }
    // 열린 끝의 경고 표시
    if (i > 0) {
      const ex = g.open < 0 ? g.x0 : g.x1;
      const warn = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 2.5), std('#ffd04a', { e: '#ffb000', ei: 0.35 }));
      warn.position.set(ex - g.open * 0.15, g.y - 0.18, 0);
      tower.add(warn);
    }
  });
  const rungM = std('#c8ccd8', { r: 0.35, m: 0.6 });
  for (const L of LADDERS) {
    const y0 = GIRDERS[L.from].y, y1 = GIRDERS[L.from + 1].y, len = y1 - y0 + 0.4;
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), rungM);
      rail.position.set(L.x + s * 0.38, y0 + len / 2 - 0.2, -0.75);
      tower.add(rail);
    }
    for (let y = y0 + 0.35; y < y1; y += 0.42) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.76, 6), rungM);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(L.x, y, -0.75);
      tower.add(rung);
    }
  }
  const pads = PADS.map((pd) => {
    const g = GIRDERS[pd.level];
    const grp = new THREE.Group();
    grp.position.set(pd.x, g.y, 0);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.12, 28), std('#3c4260', { r: 0.4, m: 0.4 }));
    base.position.y = 0.06;
    const ringM = std('#ffe066', { e: '#ffcc33', ei: 1.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 32), ringM);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    const lbl = textSprite('중력 패드', { size: 38, color: '#ffe066' });
    lbl.position.y = 1.0;
    lbl.scale.set(1.4, 0.52, 1);
    grp.add(base, ring, lbl);
    tower.add(grp);
    return { ...pd, ring, ringM, t: 0 };
  });
  // 구간 표지
  const sign = signBoard(['1구간 · 달 기슭', '꼭대기의 크레이터 골렘을 다 같이 물리쳐요'], { w: 4.6, h: 1.0, y: 1.6, accent: '#ffd04a' });
  sign.position.set(6.5, 0, 1.6);
  scene.add(sign);
  // 위쪽: 2구간으로 이어지는 통로(닫힘) + 갇힌 달토끼 공주(가칭)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 9, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#9fb4ff', transparent: true, opacity: 0.12, side: THREE.DoubleSide, emissive: '#5c7cff', emissiveIntensity: 0.4 }));
  shaft.position.set(0, topY + 8.5, -0.6);
  scene.add(shaft);
  const hatch = signBoard(['2구간 준비 중', '공주는 더 위에 있어요'], { w: 3.4, h: 0.9, y: 0, post: false, accent: '#b9a6ff' });
  hatch.position.set(0, topY + 3.2, 0.9);
  scene.add(hatch);
  const bunny = new THREE.Group();
  {
    const w = std('#ffffff', { r: 0.5 });
    const pink = std('#ffb3c7', { r: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), w);
    body.scale.set(1, 1.1, 0.95);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), w);
    head.position.y = 0.62;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 5), std('#ffd04a', { e: '#ffb000', ei: 0.5, m: 0.5 }));
    crown.position.y = 1.0;
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), w);
      ear.position.set(s * 0.13, 1.08, 0);
      ear.rotation.z = -s * 0.18;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3, 4, 8), pink);
      inner.position.set(s * 0.13, 1.08, 0.05);
      inner.rotation.z = -s * 0.18;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), std('#26203a'));
      eye.position.set(s * 0.12, 0.68, 0.3);
      bunny.add(ear, inner, eye);
    }
    bunny.add(body, head, crown);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 8, 40), std('#9fe8ff', { e: '#58d0ff', ei: 1.3 }));
    cage.rotation.x = Math.PI / 2;
    cage.position.y = 0.4;
    bunny.add(cage);
    const help = textSprite('도와줘요!', { size: 40, color: '#ffd6e2' });
    help.position.y = 1.65;
    help.scale.set(1.4, 0.52, 1);
    bunny.add(help);
    bunny.position.set(0, topY + 6.2, 0);
    scene.add(bunny);
  }

  // ---------- 보스: 크레이터 골렘 ----------
  const golem = new THREE.Group();
  golem.position.set(BOSS.x, BOSS.y, 0);
  scene.add(golem);
  const gRock = std('#6f665c', { flat: true, r: 0.9 });
  const gRock2 = std('#7d746a', { flat: true, r: 0.9 });
  const torso = new THREE.Group();
  torso.position.y = 1.7;
  golem.add(torso);
  const chest = new THREE.Mesh(rockGeo(1.25, 11, 1), gRock);
  chest.scale.set(1.0, 1.05, 0.9);
  chest.castShadow = true;
  torso.add(chest);
  const head = new THREE.Mesh(rockGeo(0.62, 17, 1), gRock2);
  head.position.set(-0.35, 1.35, 0);
  head.castShadow = true;
  torso.add(head);
  const eyeM = std('#ffb347', { e: '#ff8a1f', ei: 2.4 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeM);
    eye.position.set(-0.8, 1.45, s * 0.22);
    torso.add(eye);
  }
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(-0.1, 0.55, s * 1.05);
    const up = new THREE.Mesh(rockGeo(0.42, 23 + s, 1), gRock2);
    up.scale.set(0.9, 1.6, 0.9);
    up.position.y = -0.55;
    const fist = new THREE.Mesh(rockGeo(0.5, 29 + s, 1), gRock);
    fist.position.y = -1.35;
    up.castShadow = fist.castShadow = true;
    sh.add(up, fist);
    torso.add(sh);
    return sh;
  });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(rockGeo(0.55, 31 + s, 1), gRock);
    leg.scale.set(1, 1.4, 1);
    leg.position.set(0.1, 0.55, s * 0.55);
    leg.castShadow = true;
    golem.add(leg);
  }
  // 등의 결정(약점): 장면 좌표로 직접 움직임
  const crystalM = new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: '#36d8ff', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), crystalM);
  crystal.scale.set(0.9, 1.35, 0.9);
  scene.add(crystal);
  const crystalTag = textSprite('밟아요!', { size: 42, color: '#7ff3ff' });
  crystalTag.scale.set(1.3, 0.48, 1);
  scene.add(crystalTag);

  // ---------- 운석 (같은 시계로 계산 → 모두에게 같은 자리) ----------
  const meteorM = std('#5b534b', { flat: true, r: 0.95 });
  const meteorGlow = std('#ff9a4a', { e: '#ff6a1a', ei: 1.2 });
  const meteorPool = Array.from({ length: 24 }, (_, i) => {
    const m = new THREE.Group();
    const rk = new THREE.Mesh(rockGeo(METEOR_R, 40 + i, 1), meteorM);
    rk.castShadow = true;
    const hot = new THREE.Mesh(new THREE.SphereGeometry(METEOR_R * 0.55, 10, 8), meteorGlow);
    hot.position.set(0, 0, METEOR_R * 0.72);
    m.add(rk, hot);
    m.visible = false;
    scene.add(m);
    return { g: m, rk };
  });
  let shownMeteors = [];

  // ---------- 나 + 다른 사람 ----------
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name });
  me.setHelmet(true);
  scene.add(me.root);
  const crowd = createCrowd(scene, { helmet: true, teleport: 8 });
  const P = { x: 12, y: 0, z: 0, vx: 0, vy: 0, ground: 0, ladder: null, stun: 0, inv: 0, face: 1, lastHit: -9, padCool: 0, emote: null, emoteT: 0, squash: 0 };
  let jumpQueued = false;
  const cam = { x: 0, y: 4 };

  // ---------- 보스 체력 (서버 모드: 서버 판정 · 실시간 방/혼자: 모두의 피해 합) ----------
  const B = { f: 1, hp: 8, max: 8, win: false, winAt: 0, since: -Infinity, myD: 0, flash: 0, serverSeen: false };
  ctx.multi.onBoss((m) => {
    if (ctx.multi.zone !== 'climb') return;
    const wasWin = B.win;
    B.serverSeen = true;
    if (m.f !== B.f) { B.myD = 0; }
    B.f = m.f; B.hp = m.hp; B.max = m.max; B.win = m.win;
    if (m.since != null) B.since = m.since;
    if (m.win && !wasWin) onWin();
    if (!m.win && wasWin) closeWin();
  });
  function localBoss(now) {
    if (ctx.multi.mode === 'server') return;
    const peers = ctx.multi.peerBossDmg();
    const fMax = Math.max(B.f, ...peers.map((d) => d[0]));
    if (fMax > B.f) { B.f = fMax; B.myD = 0; B.win = false; B.since = Math.floor(now); closeWin(); ctx.multi.setBossDmg([B.f, 0]); }
    B.max = bossMaxHp(1 + ctx.multi.count());
    const total = B.myD + peers.filter((d) => d[0] === B.f).reduce((a, d) => a + d[1], 0);
    B.hp = Math.max(0, B.max - total);
    if (B.hp === 0 && !B.win) { B.win = true; B.winAt = now; onWin(); }
    if (B.win && now - B.winAt > WIN_PAUSE) {
      B.f += 1; B.myD = 0; B.win = false; B.since = Math.floor(now);
      ctx.multi.setBossDmg([B.f, 0]);
      closeWin();
    }
  }
  function registerHit() {
    B.flash = 0.45;
    if (ctx.multi.mode === 'server') ctx.multi.bossHit(B.f);
    else { B.myD = Math.min(40, B.myD + 1); ctx.multi.setBossDmg([B.f, B.myD]); }
  }

  // ---------- HUD ----------
  let hud = null, toastTimer = 0, winEl = null;
  function toast(html, ms = 3000) {
    ctx.hud.querySelector('.toast')?.remove();
    const t = h(`<div class="toast glass">${html}</div>`);
    ctx.hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }
  function onWin() {
    closeWin();
    winEl = h(`<div class="modal-wrap climb-win"><div class="modal">
      <div class="kicker">1구간 클리어 · 함께 물리쳤어요</div>
      <h3>🎉 크레이터 골렘을 물리쳤어요!</h3>
      <div class="sci"><b>과학 카드 · 달 크레이터</b>달에는 공기가 거의 없어서 날아온 운석이 타 버리지 않고 그대로 부딪혀요. 비바람에 깎이지도 않아서 수십억 년 전 크레이터가 지금도 남아 있어요. 그래서 달 표면은 지구보다 훨씬 울퉁불퉁해요.</div>
      <p class="note">달토끼 공주는 더 위에 갇혀 있어요. 2구간(자기장 구간)은 준비 중이고, ${WIN_PAUSE}초 뒤 골렘이 다시 깨어나요.</p>
      <div class="row-btn"><button class="btn" data-k="ok">${I.star}다 같이 만세!</button></div>
    </div></div>`);
    ctx.hud.appendChild(winEl);
    winEl.querySelector('[data-k="ok"]').addEventListener('click', () => { pickEmote('cheer'); closeWin(); });
  }
  function closeWin() { winEl?.remove(); winEl = null; }
  function pickEmote(k) {
    const e = EMOTES.find((x) => x.k === k);
    if (!e || k === 'drink' || P.ground < 0 || P.ladder) return;
    P.emote = k === 'flip' ? null : k;
    P.emoteT = e.dur || 3;
    if (k === 'flip') { P.vy = JUMP_V0; P.ground = -1; }
  }
  function buildHud() {
    hud = h(`<div>
      <div class="tl">
        <div class="glass chip"><span class="dot" style="background:#ffd04a;box-shadow:0 0 10px #ffd04a"></span>우주 엘리베이터 · 1구간 <small data-k="online">혼자 모드</small></div>
        <div class="glass chip"><span class="avatar-dot">나</span>${ctx.profile.name}${coinsChip(1240)}</div>
      </div>
      <div class="tr"></div>
      <div class="tc"><div class="glass boss-bar" data-k="boss">
        <div class="bb-top"><b>🪨 크레이터 골렘</b><span data-k="hpn"></span></div>
        <div class="bb-track"><i data-k="hp"></i></div>
        <small data-k="phase">운석을 던지는 중 · 사다리와 중력 패드로 꼭대기까지!</small>
      </div></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">A</i><i class="kbd">D</i> 이동</span><span><i class="kbd">Space</i> 점프</span><span><i class="kbd">W</i><i class="kbd">S</i> 사다리</span><span>노란 원 = 중력 패드</span><span>엎드린 골렘의 <b style="color:#7ff3ff">등 결정</b> 밟기</span>
      </div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    mountPlaceMenu(ctx, hud.querySelector('.tr'), 'climb');
    mountSceneUi(ctx, hud, {
      here: 'climb',
      room: 'climb',
      chatTitle: '우주 엘리베이터 · 1구간',
      seed: [
        { who: '안내', text: '보스 체력은 모두가 함께 깎아요. 여럿이 오면 체력도 늘지만 훨씬 빨리 깨져요.', kind: 'sys' },
        { who: '안내', text: '운석에 맞으면 잠깐 넘어져요. 점프로 넘어가세요!', kind: 'sys' },
      ],
      npcs: [],
      main: { k: 'jump', icon: I.jump, label: '점프', onDown: () => { jumpQueued = true; } },
      emote: (k) => pickEmote(k),
      canDrink: false,
      speaker: (m) => (m.kind === 'me' ? { root: me.root, y: 1.98 } : m.peer ? { root: crowd.anchorOf(m.peer), y: 1.98 } : null),
    });
  }
  function updateHud(now, ph) {
    if (!hud) return;
    const pct = B.max ? (B.hp / B.max) * 100 : 0;
    const hpEl = hud.querySelector('[data-k="hp"]');
    hpEl.style.width = `${pct.toFixed(1)}%`;
    hpEl.classList.toggle('flash', B.flash > 0);
    const n = 1 + ctx.multi.count();
    hud.querySelector('[data-k="hpn"]').textContent = `${B.hp} / ${B.max} · ${n}명 협동`;
    const el = hud.querySelector('[data-k="phase"]');
    const txt = B.win ? '쓰러졌어요! 잠시 뒤 다시 깨어나요'
      : ph.phase === 'rest' ? `💤 지쳐서 엎드렸어요 · 지금 등의 결정을 밟아요! (${Math.ceil(ph.left)}초)`
        : `운석을 던지는 중 · ${Math.ceil(ph.left)}초 뒤 지쳐요`;
    if (el.textContent !== txt) el.textContent = txt;
    hud.querySelector('[data-k="boss"]').classList.toggle('rest', !B.win && ph.phase === 'rest');
  }

  // ---------- 물리 ----------
  const onSpan = (g, x, pad = 0.25) => x >= g.x0 - pad && x <= g.x1 + pad;
  function step(dt, now) {
    const mi = moveIntent();
    let ax = mi.x, ay = mi.y;
    const wantJump = input.pressed.has(' ') || jumpQueued;
    jumpQueued = false;
    if (P.stun > 0) { P.stun -= dt; ax = 0; ay = 0; }
    P.inv = Math.max(0, P.inv - dt);
    P.padCool = Math.max(0, P.padCool - dt);
    if (Math.abs(ax) > 0.1 || Math.abs(ay) > 0.5) P.emote = null;

    // 사다리 잡기
    if (!P.ladder && Math.abs(ay) > 0.5) {
      for (const L of LADDERS) {
        const y0 = GIRDERS[L.from].y, y1 = GIRDERS[L.from + 1].y;
        if (Math.abs(P.x - L.x) > 0.75) continue;
        if ((ay > 0 && P.y >= y0 - 0.15 && P.y < y1 - 0.1) || (ay < 0 && P.y > y0 + 0.1 && P.y <= y1 + 0.15)) {
          P.ladder = L; P.vx = 0; P.vy = 0; P.ground = -1; P.x = L.x;
          break;
        }
      }
    }
    if (P.ladder) {
      const L = P.ladder, y0 = GIRDERS[L.from].y, y1 = GIRDERS[L.from + 1].y;
      P.y += ay * LADDER_V * dt;
      if (P.y >= y1) { P.y = y1; P.ladder = null; P.ground = L.from + 1; }
      else if (P.y <= y0) { P.y = y0; P.ladder = null; P.ground = L.from; }
      else if (wantJump || (Math.abs(ax) > 0.6 && Math.abs(ay) < 0.2)) {
        P.ladder = null; P.vy = wantJump ? JUMP_V0 * 0.8 : 0; P.vx = Math.sign(ax) * WALK * 0.6;
      }
      if (Math.abs(ax) > 0.1) P.face = Math.sign(ax);
      return;
    }
    // 걷기 · 달리기 · 점프 (달 중력 그대로)
    const target = ax * (mi.boost ? RUN : WALK);
    const grounded = P.ground >= 0;
    P.vx += (target - P.vx) * (1 - Math.exp(-dt * (grounded ? (P.stun > 0 ? 2 : 10) : 1.6)));
    if (Math.abs(ax) > 0.1) P.face = Math.sign(ax);
    if (wantJump && grounded && P.stun <= 0) { P.vy = JUMP_V0; P.ground = -1; P.squash = 0; }
    P.x += P.vx * dt;
    if (Math.abs(P.x) > WALL) { P.x = Math.sign(P.x) * WALL; P.vx = 0; }
    if (P.ground >= 0) {
      const g = GIRDERS[P.ground];
      if (!onSpan(g, P.x)) P.ground = -1; // 발판 끝에서 떨어짐
      else P.y = g.y;
    }
    if (P.ground < 0) {
      const py = P.y;
      P.vy -= MOON_G * dt;
      P.y += P.vy * dt;
      // 결정 위에 떨어지면 밟기 (쉬는 동안)
      const cy = crystalY;
      if (!B.win && P.vy < 0 && canHit(now) && Math.abs(P.x - CRYSTAL.x) < CRYSTAL.r + 0.25 && py >= cy - 0.05 && P.y <= cy + 0.05 && now - P.lastHit > HIT_COOLDOWN) {
        P.y = cy; P.vy = 3.1; P.lastHit = now;
        registerHit();
        toast(`💥 결정을 밟았어요!${ctx.multi.mode === 'server' ? '' : ` 남은 체력 ${Math.max(0, B.hp - 1)}`}`, 1400);
      }
      // 발판은 아래에서 위로 통과, 위에서 떨어질 때만 착지
      for (let i = GIRDERS.length - 1; i >= 0; i--) {
        const g = GIRDERS[i];
        if (P.vy <= 0 && py >= g.y - 0.02 && P.y <= g.y && onSpan(g, P.x, 0.15)) {
          P.y = g.y; P.vy = 0; P.ground = i; P.squash = 0.5;
          break;
        }
      }
      if (P.y < 0) { P.y = 0; P.vy = 0; P.ground = 0; }
    }
    // 중력 패드
    if (P.ground >= 0 && P.padCool <= 0) {
      for (const pd of pads) {
        if (pd.level === P.ground && Math.abs(P.x - pd.x) < 0.8) {
          P.vy = PAD_V; P.ground = -1; P.padCool = 0.8; pd.t = 0.6;
          break;
        }
      }
    }
    // 골렘이 던지는 동안 몸에 닿으면 밀려남
    if (!B.win && bossPhase(now).phase === 'throw' && P.y >= topY - 0.1 && P.y < topY + 3.2 && P.x > BOSS.x - 1.8 && P.inv <= 0) {
      P.vx = -5; P.vy = 2.2; P.ground = -1; P.stun = 0.6; P.inv = 1.2;
      toast('골렘이 밀쳐 냈어요 — 엎드릴 때까지 기다려요', 1800);
    }
    // 운석에 맞기
    if (P.inv <= 0) {
      for (const m of shownMeteors) {
        const dx = P.x - m.x, dy = P.y + 0.8 - m.y;
        if (Math.abs(dx) < 0.72 && Math.abs(dy) < 0.95) {
          P.stun = 1.1; P.inv = 2.2; P.vx = (m.dir || Math.sign(dx) || 1) * 3.4; P.vy = 2.0; P.ground = -1; P.ladder = null; P.emote = null;
          toast('🪨 운석에 맞았어요! 점프로 넘어가요', 1600);
          break;
        }
      }
    }
  }

  // ---------- 보스 · 운석 그리기 ----------
  let crystalY = CRYSTAL.yUp, restBlend = 0, deadBlend = 0;
  function drawBoss(dt, now, ph) {
    const restTarget = !B.win && ph.phase === 'rest' ? 1 : 0;
    restBlend += (restTarget - restBlend) * (1 - Math.exp(-dt * 5));
    deadBlend += ((B.win ? 1 : 0) - deadBlend) * (1 - Math.exp(-dt * 3));
    const breathe = Math.sin(now * 2.2) * 0.04;
    golem.position.y = BOSS.y - restBlend * 0.75 - deadBlend * 0.9;
    torso.rotation.z = restBlend * 0.55 + deadBlend * 1.1;
    torso.position.y = 1.7 + breathe;
    golem.rotation.y = deadBlend * 0.3;
    // 던지기: 생성 시각 직전에 팔을 들었다가 내리침
    let swing = 0;
    if (ph.phase === 'throw' && !B.win) {
      for (const s of SPAWNS) {
        const d = ph.k - s;
        if (d > -0.6 && d < 0.3) swing = d < 0 ? (d + 0.6) / 0.6 : 1 - d / 0.3;
      }
    }
    arms[0].rotation.z = -swing * 2.3 + restBlend * 0.9;
    arms[1].rotation.z = -swing * 1.2 + restBlend * 0.9 + Math.sin(now * 1.7) * 0.05;
    eyeM.emissiveIntensity = B.win ? 0.05 : restBlend > 0.5 ? 0.6 : 2.4;
    // 결정: 던질 땐 높이(닿지 않음), 쉬면 내려와 반짝, 이기면 사라짐
    crystalY = CRYSTAL.yUp + (CRYSTAL.yRest - CRYSTAL.yUp) * restBlend;
    crystal.position.set(CRYSTAL.x + restBlend * 0.1, crystalY + 0.35, 0);
    crystal.rotation.y += dt * (1 + restBlend * 2);
    crystal.visible = deadBlend < 0.6;
    const pulse = restBlend * (0.5 + 0.5 * Math.sin(now * 8));
    crystalM.emissiveIntensity = 1.2 + pulse * 2.2 + (B.flash > 0 ? 4 : 0);
    crystal.scale.setScalar(1 + (B.flash > 0 ? 0.25 : 0)).multiply(new THREE.Vector3(0.9, 1.35, 0.9));
    crystalTag.visible = restBlend > 0.6 && !B.win;
    crystalTag.position.set(CRYSTAL.x, crystalY + 1.6, 0);
    B.flash = Math.max(0, B.flash - dt);
  }
  function drawMeteors(now) {
    const list = B.win ? [] : meteorsAt(now, B.since);
    shownMeteors = list;
    meteorPool.forEach((m, i) => {
      const it = list[i];
      m.g.visible = !!it;
      if (!it) return;
      m.g.position.set(it.x, it.y, 0);
      m.rk.rotation.z = -it.x / METEOR_R; // 굴러가는 회전
    });
  }

  // ---------- 장면 ----------
  function selfState() {
    let m = 'idle';
    if (P.stun > 0.25) m = 'lie';
    else if (P.ladder) m = 'walk';
    else if (P.ground < 0) m = 'air';
    else if (P.emote) m = P.emote;
    else if (Math.abs(P.vx) > 0.25) m = 'walk';
    return { p: [P.x, P.y, P.z], h: P.face > 0 ? 1.2 : -1.2, m };
  }
  function place(x, y) {
    ctx.multi.warp();
    P.x = x; P.y = y; P.vx = 0; P.vy = 0; P.ladder = null; P.stun = 0; P.ground = -1;
    for (let i = GIRDERS.length - 1; i >= 0; i--) if (Math.abs(GIRDERS[i].y - y) < 0.05 && onSpan(GIRDERS[i], x)) P.ground = i;
  }

  return {
    id: 'climb',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.38, bloomThreshold: 0.95, bloomRadius: 0.45 },
    enter() {
      me.applyProfile(ctx.profile);
      // 사람마다 조금씩 앞뒤로 비켜 서서 겹치지 않게
      P.z = Math.round((Math.random() * 1.4 - 0.7) * 100) / 100;
      place(11 + Math.random() * 2.5, 0); // 오른쪽 아래: 운석은 바닥 왼쪽 끝으로 빠져나가서 안전
      P.face = -1;
      B.serverSeen = false;
      closeWin();
      buildHud();
      toast('🗼 우주 엘리베이터 1구간 — 운석을 피해 꼭대기까지 올라가 골렘을 다 같이 물리쳐요!', 4200);
      window.__climb = {
        state: () => ({ x: +P.x.toFixed(2), y: +P.y.toFixed(2), ground: P.ground, ladder: P.ladder ? P.ladder.from : null, stun: +P.stun.toFixed(2), boss: { f: B.f, hp: B.hp, max: B.max, win: B.win }, phase: bossPhase(ctx.multi.nowSec()), meteors: shownMeteors.length, crystalY: +crystalY.toFixed(2) }),
        place: (x, y) => place(x, y),
        // 시험용: 결정 바로 위에서 떨어뜨리기
        dropOnCrystal: () => { place(CRYSTAL.x, crystalY + 0.04); P.vy = -1; P.inv = 2; },
      };
    },
    exit() {
      clearTimeout(toastTimer);
      closeWin();
      crowd.clear();
    },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 62 : 50;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const now = ctx.multi.nowSec();
      const ph = bossPhase(now);
      const picked = emoteFromKeys(input.pressed);
      if (picked) pickEmote(picked);
      if (P.emote && P.emoteT > 0 && (P.emoteT -= dt) <= 0) P.emote = null;
      localBoss(now);
      drawBoss(dt, now, ph);
      drawMeteors(now);
      step(Math.min(dt, 0.05), now);
      pads.forEach((pd) => { pd.t = Math.max(0, pd.t - dt); pd.ringM.emissiveIntensity = 1.2 + Math.sin(t * 4) * 0.3 + pd.t * 5; pd.ring.scale.setScalar(1 + pd.t * 0.6); });
      bunny.position.y = topY + 6.2 + Math.sin(t * 1.6) * 0.15;
      bunny.rotation.y = Math.sin(t * 0.7) * 0.4;
      earth.update?.(dt);

      // 내 아바타
      P.squash = Math.max(0, P.squash - dt * 3);
      const st = selfState();
      me.root.position.set(P.x, P.y, P.z);
      me.root.rotation.set(0, st.h, 0);
      me.state.mode = st.m;
      me.state.speed = Math.min(3, Math.abs(P.vx) * 0.6 + (P.ladder ? 1.5 : 0));
      me.state.air = Math.max(-1, Math.min(1, P.vy / JUMP_V0));
      me.state.squash = P.squash;
      me.root.visible = !(P.inv > 0 && P.stun <= 0 && Math.floor(t * 12) % 2 === 0); // 맞은 뒤 잠깐 깜빡임
      me.update(dt, t);
      ctx.multi.tick(st);
      crowd.sync(ctx.multi.list(), dt, t);

      // 카메라: 옆에서 따라감
      const mob = ctx.isMobile();
      const tx = mob ? THREE.MathUtils.clamp(P.x * 0.85, -11, 11) : THREE.MathUtils.clamp(P.x * 0.6, -7, 7); // 세로 화면은 폭이 좁아 더 가까이 따라감
      cam.x += (tx - cam.x) * (1 - Math.exp(-dt * 3));
      cam.y += (P.y + 1.6 - cam.y) * (1 - Math.exp(-dt * 3));
      const dist = mob ? 19 : 16.5;
      camera.position.set(cam.x, cam.y + 3.2, dist);
      camera.lookAt(cam.x, cam.y + 0.6, 0);
      updateHud(now, ph);
    },
  };
}
