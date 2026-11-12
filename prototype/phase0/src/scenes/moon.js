import * as THREE from 'three';
import { createEarth } from '../world/earth.js';
import { createSkyDome, createStarfield, createSun } from '../world/space.js';
import { createAstronaut, speechBubble } from '../world/astronaut.js';
import { MOON_LAYOUT as LAY, createMoonTerrain, createMoonBase, createLander, createFootprints, createDust, makeMoonEnv, textSprite } from '../world/moonSurface.js';
import { consumeLook, input, moveIntent } from '../core/input.js';
import { h, I, project, coinsChip } from '../ui/dom.js';
import { GRAVITY, JUMP_V0, SOURCES, EARTH_FROM_MOON_DEG, EARTH_GAME_SCALE } from '../data/planets.js';
import { emoteFromKeys, EMOTES } from '../ui/emotes.js';
import { mountSceneUi } from '../ui/sceneUi.js';
import { mountSpots } from '../ui/spots.js';
import { createDrink } from '../world/water.js';

// 장면 — 달 착륙지: 우주선에서 내리면 모두가 처음 만나는 울퉁불퉁한 달 언덕
const G = GRAVITY.find((x) => x.id === 'moon').g; // 1.62 m/s²
const G_E = GRAVITY.find((x) => x.id === 'earth').g;
const HOP_V0 = 1.25; // 깡충 달리기 한 번 도약 (높이 약 0.48 m)
const WALK = 1.8, HOP_RUN = 3.3;
const BOUND = 50; // 이번 시안의 탐험 구역 반경 (m)
// 연속 점프: 착지 순간에 다시 뛰면 단계마다 더 높이 (게임 규칙 — 실제 물리는 같은 힘이면 같은 높이)
const COMBO = [1, 1.15, 1.32, 1.52];
const COMBO_WINDOW = 0.3;

const dirAzEl = (az, el) => {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOut3 = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function createMoonScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 16000);
  const Ls = dirAzEl(100, 14); // 해: 동쪽 낮은 하늘 → 언덕마다 그림자가 길게
  const Ed = dirAzEl(12, 5); // 지구: 북쪽 지평선 가까이 5°
  scene.environment = makeMoonEnv(ctx.renderer.renderer, Ls);
  scene.environmentIntensity = 0.45;

  const sky = createSkyDome(9500, 0.16);
  const stars = createStarfield(Math.round(ctx.renderer.quality.stars * 2.2), 9000, 9);
  const sun = createSun(260);
  scene.add(sky, stars, sun);

  // 지구 (실제 크기로 만들고 연출 배율만큼 키움)
  const EARTH_D = 5200;
  const EARTH_R = EARTH_D * Math.tan(THREE.MathUtils.degToRad(EARTH_FROM_MOON_DEG / 2));
  const earth = createEarth(EARTH_R, { segments: 160, nightBoost: 2.2, atmStrength: 1.5, atmIn: 0.5, dayBoost: 1.08 });
  earth.face(108, 22, -0.32);
  earth.setSun(Ls);
  const earthPivot = new THREE.Group();
  earthPivot.add(earth.group);
  earthPivot.position.copy(Ed).multiplyScalar(EARTH_D);
  earthPivot.lookAt(0, 0, 0);
  scene.add(earthPivot);
  const atmU = earth.group.children[1].material.uniforms;
  let earthScale = EARTH_GAME_SCALE, earthTarget = EARTH_GAME_SCALE;
  const applyEarthScale = (s) => {
    earthPivot.scale.setScalar(s);
    atmU.R.value = EARTH_R * s;
    atmU.Rs.value = EARTH_R * 1.045 * s;
  };
  applyEarthScale(earthScale);

  // 빛: 강한 햇빛 + 땅에서 되비치는 빛 + 희미한 지구빛
  const sunLight = new THREE.DirectionalLight('#fff3e4', 3.7);
  const SQ = ctx.renderer.quality.shadows;
  sunLight.castShadow = SQ > 0;
  sunLight.shadow.mapSize.set(SQ || 1024, SQ || 1024);
  Object.assign(sunLight.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 170 });
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.035;
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight('#0b0f1c', '#5a554e', 0.3));
  const earthshine = new THREE.DirectionalLight('#9cc4ff', 0.14);
  earthshine.position.copy(Ed).multiplyScalar(60);
  scene.add(earthshine);

  // 지형·기지·우주선
  const terrain = createMoonTerrain();
  scene.add(terrain.group);
  const H = terrain.heightAt;
  const base = createMoonBase({ heightAt: H, normalAt: terrain.normalAt, sunDir: Ls, earthDir: Ed, boulders: terrain.boulders });
  scene.add(base.group);
  const lander = createLander();
  const padY = H(LAY.lander.x, LAY.lander.z) + 0.02;
  const dP = new THREE.Vector2(0, -1); // 해치·경사로 = 북쪽(지구 방향)
  lander.group.position.set(LAY.lander.x, padY, LAY.lander.z);
  lander.group.rotation.y = Math.atan2(-dP.y, dP.x);
  scene.add(lander.group);
  lander.group.updateMatrixWorld(true);
  const rampTopW = lander.group.localToWorld(lander.rampTop.clone());
  const rampFootW = lander.group.localToWorld(lander.rampFoot.clone());
  const hatchInW = lander.group.localToWorld(new THREE.Vector3(0.9, 1.33, 0));
  const colliders = [...base.colliders, { x: LAY.lander.x, z: LAY.lander.z, r: 2.7 }];
  const spots = base.hotspots;
  spots.find((s) => s.key === 'lander').pos = rampFootW.clone().add(new THREE.Vector3(0, 2.6, 0));

  const footprints = createFootprints(1100);
  scene.add(footprints.mesh);
  const dust = createDust(2600, 0.055);
  const blast = createDust(1800, 0.11, '#b7b0a4');
  scene.add(dust.points, blast.points);

  // 나 + 다른 이용자 4명
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name });
  me.setHelmet(true);
  scene.add(me.root);
  const P = mkBody(me);
  const perp = new THREE.Vector2(-dP.y, dP.x);
  const greetSpot = new THREE.Vector3(rampFootW.x + dP.x * 2.6 - perp.x * 3.0, 0, rampFootW.z + dP.y * 2.6 - perp.y * 3.0);
  const greetIntro = new THREE.Vector3(rampFootW.x + dP.x * 1.7 + perp.x * 1.9, 0, rampFootW.z + dP.y * 1.7 + perp.y * 1.9);
  greetIntro.y = H(greetIntro.x, greetIntro.z);
  const npcDefs = [
    { o: { preset: 'lavender', skin: '#f6cba8', hair: '#2a2633', name: '별헤는밤' }, role: 'greeter', home: greetSpot, say: '어서 와! 달은 처음이지?' },
    { o: { preset: 'coral', skin: '#e3ad86', hair: '#d9a05b', name: '코스모' }, role: 'hopper', home: new THREE.Vector3(1.5, 0, -15), say: '깡충 뛰면 더 빨라!' },
    { o: { preset: 'sky', skin: '#ffdcc6', hair: '#c47a8a', name: '루나' }, role: 'jumper', home: new THREE.Vector3(LAY.pole.x + 1.15, 0, LAY.pole.z + 0.35), say: '방금 1.8 m 뛰었어!' },
    { o: { preset: 'mint', skin: '#b57c58', hair: '#3a2a22', name: '토끼발' }, role: 'scientist', home: new THREE.Vector3(LAY.stand.x - 1.3, 0, LAY.stand.z + 0.6), say: '망치랑 깃털, 뭐가 먼저 떨어질까?' },
  ];
  const npcs = npcDefs.map((d, i) => {
    const a = createAstronaut(d.o);
    a.setHelmet(true);
    scene.add(a.root);
    const b = mkBody(a);
    b.role = d.role;
    b.home = d.home.clone();
    b.home.y = H(b.home.x, b.home.z);
    b.pos.copy(b.home);
    b.timer = i * 1.3;
    b.ang = 0;
    b.bubble = speechBubble(d.say);
    b.bubble.position.set(0, 2.2, 0);
    a.root.add(b.bubble);
    b.name = d.o.name;
    b.chatT = 0;
    return b;
  });
  // 물 마시기 (달 표면은 헬멧을 쓰고 있으니 우주복 안 음료 주머니의 빨대로)
  const drink = createDrink(scene, me, { quality: ctx.renderer.quality.msaa >= 4 ? 'high' : 'medium' });
  const npc = (role) => npcs.find((n) => n.role === role);
  npc('hopper').bubble.visible = false;

  function mkBody(av) {
    return { av, pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, ground: true, heading: 0, stride: 0, foot: 1, takeoffY: 0, peak: 0, airT: 0, airDur: 1, kind: '', squash: 0, script: null, combo: 0, sinceLand: 9, buffer: 0, flipping: false, flip: 0, emote: null, emoteT: 0 };
  }

  // ---------- 착지·발자국·먼지 ----------
  function puff(x, y, z, n, spd, up, inherit) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * (0.35 + Math.random() * 0.65);
      dust.emit(x + Math.cos(a) * 0.12, y + 0.03, z + Math.sin(a) * 0.12, Math.cos(a) * s + (inherit?.x || 0) * 0.35, up * (0.4 + Math.random() * 0.6), Math.sin(a) * s + (inherit?.z || 0) * 0.35, G, H);
    }
  }
  function takeoff(b, v0, kind, opt = {}) {
    b.ground = false;
    b.vy = v0;
    b.takeoffY = b.pos.y;
    b.peak = 0;
    b.airT = 0;
    b.airDur = (2 * v0) / G;
    b.kind = kind;
    b.flipping = !!opt.flip;
    b.flip = 0;
    b.emote = null;
    if (opt.combo) {
      // 연속 점프 도약: 발밑에 먼지 고리
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        dust.emit(b.pos.x + Math.cos(a) * 0.3, b.pos.y + 0.05, b.pos.z + Math.sin(a) * 0.3, Math.cos(a) * 1.6, 0.25, Math.sin(a) * 1.6, G, H);
      }
    }
    if (kind === 'jump') {
      footprints.add(b.pos.x, b.pos.z, b.heading, -1, terrain);
      footprints.add(b.pos.x, b.pos.z, b.heading, 1, terrain);
      puff(b.pos.x, b.pos.y, b.pos.z, 10, 0.5, 0.6, b.vel);
    }
  }
  function land(b, gy) {
    const impact = Math.abs(b.vy);
    b.pos.y = gy;
    b.vy = 0;
    b.ground = true;
    b.flipping = false;
    b.flip = 0;
    b.sinceLand = 0;
    b.squash = Math.min(1, 0.35 + impact * 0.3);
    footprints.add(b.pos.x, b.pos.z, b.heading, -1, terrain);
    footprints.add(b.pos.x, b.pos.z, b.heading, 1, terrain);
    puff(b.pos.x, gy, b.pos.z, Math.round(10 + impact * 14), 0.5 + impact * 0.35, 0.5 + impact * 0.45, b.vel);
  }
  function stepBody(b, dt) {
    if (!b.ground) {
      b.vy -= G * dt;
      b.pos.y += b.vy * dt;
      b.airT += dt;
      b.peak = Math.max(b.peak, b.pos.y - b.takeoffY);
      if (b.flipping) b.flip = Math.min(1, b.airT / (b.airDur * 0.92)) * Math.PI * 2;
      const gy = H(b.pos.x, b.pos.z);
      if (b.vy < 0 && b.pos.y <= gy) {
        land(b, gy);
        return true;
      }
    } else {
      b.pos.y = H(b.pos.x, b.pos.z);
    }
    return false;
  }
  function walkPrints(b, dt) {
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (!b.ground || sp < 0.2) return;
    b.stride += sp * dt;
    if (b.stride > 0.62) {
      b.stride = 0;
      b.foot *= -1;
      footprints.add(b.pos.x, b.pos.z, b.heading, b.foot, terrain);
      if (Math.random() < 0.7) puff(b.pos.x, b.pos.y, b.pos.z, 3, 0.25, 0.3, b.vel);
    }
  }
  function collide(p) {
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz), m = c.r + 0.32;
      if (d < m && d > 1e-4) {
        p.x = c.x + (dx / d) * m;
        p.z = c.z + (dz / d) * m;
      }
    }
  }
  function poseBody(b, dt) {
    const av = b.av;
    av.root.position.copy(b.pos);
    av.root.rotation.y = b.heading;
    b.squash = Math.max(0, b.squash - dt * 3.2);
    av.state.squash = b.squash;
    av.state.flip = b.flip;
    if (!b.ground) {
      av.state.mode = 'air';
      av.state.air = b.vy / JUMP_V0;
    }
  }
  function turnTo(b, ang, dt, rate = 10) {
    let d = ang - b.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    b.heading += d * Math.min(1, dt * rate);
  }

  // ---------- 카메라 ----------
  const cam = { yaw: 0, pitch: 0.1, dist: 6.4 };
  // 카메라가 우주선 몸통 안으로 들어가지 않게 밀어냄
  function pushFromLander(v) {
    const dx = v.x - LAY.lander.x, dz = v.z - LAY.lander.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && v.y < padY + 5.2) {
      const k = 3.4 / Math.max(d, 1e-3);
      v.x = LAY.lander.x + dx * k;
      v.z = LAY.lander.z + dz * k;
    }
  }
  const camTarget = new THREE.Vector3();
  let shake = 0;
  let camOverride = null; // 연출 중 카메라

  // ---------- HUD ----------
  let mode = 'play'; // intro | play | photo
  let hud = null, spotUi = null, prompt = null, nearKey = null, toastTimer = 0, jumpChipTimer = 0;
  let ui = null;
  let introEl = null, firstLabel = null, firstLabelT = 0;
  let jumpQueued = false;
  let bestJump = 0;
  let boundWarned = false;

  function clearHud() {
    ctx.hud.innerHTML = '';
    ctx.labels.innerHTML = '';
    hud = null;
    spotUi = null;
    prompt = null;
  }
  function toast(html, ms = 3600) {
    ctx.hud.querySelector('.toast')?.remove();
    const t = h(`<div class="toast glass">${html}</div>`);
    ctx.hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }

  function buildIntroHud() {
    clearHud();
    introEl = h(`<div class="letterbox"><div class="cap" data-k="cap">달마중호 · 달 착륙 중…<small data-k="sub">고도 34 m</small></div><button class="btn ghost skip" data-k="skip">건너뛰기 ▶</button></div>`);
    ctx.hud.appendChild(introEl);
    introEl.querySelector('[data-k="skip"]').addEventListener('click', () => endIntro(true));
  }

  function buildHud() {
    clearHud();
    const sizeLabel = () => (earthTarget > 1.5 ? `${I.globe}지구 크기 · 연출 ${EARTH_GAME_SCALE}배` : `${I.globe}지구 크기 · 실제`);
    hud = h(`<div>
      <div class="tl">
        <div class="glass chip"><span class="dot"></span>달 · 첫 착륙지 <small>채널 1 · 12/30명</small></div>
        <div class="glass chip"><span class="avatar-dot">나</span>${ctx.profile.name}${coinsChip(1240)}</div>
        <div class="glass chip grav"><b>달 중력 1/6</b><small>1.62 m/s²</small></div>
      </div>
      <div class="tr">
        <button class="icon-btn" title="미션">${I.mission}<span class="badge">3</span></button>
        <button class="icon-btn" title="친구">${I.friends}<span class="badge">2</span></button>
        <button class="icon-btn pc-only" title="설정">${I.gear}</button>
        <button class="icon-btn mobile-only" title="더보기">${I.more}</button>
      </div>
      <div class="mr">
        <button class="btn ghost side-btn" data-k="earth">${sizeLabel()}</button>
        <div class="glass earth-cap" data-k="ecap" style="display:none"></div>
      </div>
      <div class="glass combo-pop" data-k="combo" style="display:none"></div>
      <div class="tc"><div class="glass jump-chip" data-k="jc" style="display:none"></div></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">W</i><i class="kbd">A</i><i class="kbd">S</i><i class="kbd">D</i> 걷기</span>
        <span><i class="kbd">Shift</i> 깡충 달리기</span><span><i class="kbd">Space</i> 점프</span><span>풍선 클릭 · <i class="kbd">E</i> 바로 가기·실행</span><span><i class="kbd">1</i>~<i class="kbd">8</i> 감정 표현</span><span><i class="kbd">M</i> 이동</span><span><i class="kbd">Enter</i> 채팅</span><span>드래그 시점</span>
      </div></div>
      <div class="br pc-only"><div class="glass prompt" style="display:none"></div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    prompt = hud.querySelector('.prompt');
    hud.querySelector('.icon-btn[title="미션"]').addEventListener('click', () => ctx.go('mission'));
    const eb = hud.querySelector('[data-k="earth"]');
    const toggleEarth = () => {
      earthTarget = earthTarget > 1.5 ? 1 : EARTH_GAME_SCALE;
      eb.innerHTML = sizeLabel();
      updateEarthCap(true);
      if (ctx.isMobile()) toast(capText(), 4200);
    };
    eb.addEventListener('click', toggleEarth);
    ui = mountSceneUi(ctx, hud, {
      here: 'moon',
      room: 'moon',
      chatTitle: '달 착륙지 · 채널 1',
      seed: [
        { who: '안내', text: '달에서는 같은 힘으로 뛰어도 약 6배 높이 올라가요. Space로 점프!', kind: 'sys' },
        { who: '별헤는밤', text: '어서 와! 달은 처음이지?' },
        { who: '코스모', text: 'Shift 누르고 깡충깡충 뛰면 훨씬 빨라 ㅋㅋ' },
        { who: '루나', text: '단체 사진 찍을 사람~ 언덕 위 노란 원으로 모여!' },
      ],
      npcs: ['별헤는밤', '코스모', '루나', '토끼발'],
      main: { k: 'jump', icon: I.jump, label: '점프', hold: 'jump', onDown: () => { jumpQueued = true; } },
      aux: [{ k: 'earth', icon: I.globe, label: '지구', onTap: toggleEarth }],
      emote: (k) => pickEmote(k),
      canDrink: true,
      speaker: (m) => speakerOf(m),
    });
    updateEarthCap();
    // 위치 풍선: 누르면 그 앞으로 바로 이동해서 실행 (PC 클릭 · 모바일 탭)
    spotUi = mountSpots(ctx, spots, (s) => goSpot(s));
    if (mode === 'drive') { hud.classList.add('driving'); showDriveBar(); }
  }
  // 채팅 말풍선을 띄울 아바타: 나 또는 같은 이름의 NPC
  function speakerOf(m) {
    if (m.kind === 'me') return me.root;
    const b = npcs.find((x) => x.name === m.who);
    if (!b) return null;
    b.chatT = Math.min(9, 4.2 + m.text.length * 0.09);
    return b.av.root;
  }
  let capTimer = 0;
  const capText = () => (earthTarget > 1.5
    ? `<b>게임 연출</b> 지구를 실제보다 ${EARTH_GAME_SCALE}배 크게 보여 줘요`
    : `<b>실제 크기</b> 지름 약 ${EARTH_FROM_MOON_DEG.toFixed(1)}° · 보름달의 약 3.7배`);
  function updateEarthCap(show) {
    const el = hud?.querySelector('[data-k="ecap"]');
    if (!el) return;
    if (show) {
      el.style.display = 'block';
      clearTimeout(capTimer);
      capTimer = setTimeout(() => (el.style.display = 'none'), 6000);
    }
    el.innerHTML = capText();
  }

  function showJumpChip(b) {
    const el = hud?.querySelector('[data-k="jc"]');
    if (!el) return;
    const hE = (JUMP_V0 * JUMP_V0) / (2 * G_E), tE = (2 * JUMP_V0) / G_E;
    if (b.combo > 0) el.innerHTML = `<div>연속 점프 <b>${b.combo + 1}단</b> · <b>${b.peak.toFixed(2)} m</b> · 체공 ${b.airT.toFixed(1)}초</div><div class="e g">게임 보너스 ×${COMBO[b.combo].toFixed(2)} — 실제로는 같은 힘이면 높이가 같아요</div>`;
    else el.innerHTML = `<div>이번 점프 <b>${b.peak.toFixed(2)} m</b> · 체공 <b>${b.airT.toFixed(1)}초</b></div><div class="e">같은 힘으로 지구에서라면 ${hE.toFixed(2)} m · ${tE.toFixed(1)}초 (계산) · 착지 순간 다시 뛰면 연속 점프!</div>`;
    el.style.display = 'grid';
    jumpChipTimer = 5;
  }

  // ---------- 상호작용 ----------
  function interact(key) {
    if (mode === 'drive') { stopDrive(); return; }
    if (mode === 'scope') { stopScope(); return; }
    if (mode !== 'play') return;
    const k = key || nearKey;
    if (!k) {
      toast('가고 싶은 곳의 풍선을 누르면 바로 가서 실행돼요 · 언덕 위 노란 원은 단체 사진 자리');
      return;
    }
    if (k.startsWith('rover')) { startDrive(+k.slice(5)); return; }
    if (k === 'lander') openShipMenu();
    else if (k === 'hub') ctx.go('lounge');
    else if (k === 'photo') startPhoto();
    else if (k === 'hammer') startHammer();
    else if (k === 'pole') toast(`기둥 옆에서 점프하면 높이가 표시돼요 · 오늘 최고 <b>${bestJump.toFixed(2)} m</b> (같은 힘이면 지구에서는 약 ${((JUMP_V0 * JUMP_V0) / (2 * G_E)).toFixed(2)} m)`, 4600);
    else if (k === 'scope') startScope();
    else if (k === 'statue') toast('한국·중국·일본의 옛이야기에서는 달의 어두운 무늬를 방아 찧는 토끼로 보았어요 <span style="opacity:.6">(옛이야기)</span>');
  }

  // 망치·깃털 실험
  const exp = { state: 'idle', t: 0, card: null };
  const hm = base.hammer, ft = base.feather, HANG = base.HANG;
  function resetHammer() {
    hm.position.y = HANG;
    hm.rotation.set(0, 0, 0);
    ft.position.y = HANG - 0.1; // 망치 머리와 깃털 끝 높이를 맞춰 동시에 놓음
    ft.rotation.set(0, 0, 0);
    exp.state = 'idle';
    exp.card?.remove();
    exp.card = null;
  }
  resetHammer();
  function startHammer() {
    if (exp.state !== 'idle') return;
    exp.state = 'fall';
    exp.t = 0;
    const s = npc('scientist');
    s.bubble.visible = false;
    toast('하나, 둘, 셋 — 동시에 놓았어요!', 1800);
  }
  function hammerLanded() {
    exp.state = 'done';
    const wp = new THREE.Vector3();
    hm.getWorldPosition(wp);
    puff(wp.x, H(wp.x, wp.z), wp.z, 18, 0.5, 0.6);
    ft.getWorldPosition(wp);
    puff(wp.x, H(wp.x, wp.z), wp.z, 8, 0.3, 0.4);
    const drop = 1.34;
    const tm = Math.sqrt((2 * drop) / G), te = Math.sqrt((2 * drop) / G_E);
    exp.card = h(`<div class="glass exp-card">
      <div class="t"><b>동시에 착지!</b> 공기가 없으니 무게와 상관없이 똑같이 떨어져요</div>
      <div class="row2">
        <div><b>달 · ${tm.toFixed(2)}초</b>망치와 깃털이 같이 '톡' (1.34 m에서, 계산값)</div>
        <div><b>지구라면</b>망치 ${te.toFixed(2)}초 · 깃털은 공기 저항 때문에 훨씬 늦게 팔랑팔랑</div>
      </div>
      <div class="note">실제 기록: 아폴로 15호 데이비드 스콧이 마지막 월면 활동 끝에 TV 카메라 앞에서 직접 해 봤어요 · <a href="${SOURCES.feather.url}" target="_blank" rel="noopener" style="color:var(--mint)">NASA 기록</a></div>
      <div class="row-btn"><button class="btn ghost" data-k="again">다시 해 보기</button><button class="btn" data-k="ok">좋아요</button></div>
    </div>`);
    ctx.hud.appendChild(exp.card);
    exp.card.querySelector('[data-k="again"]').addEventListener('click', () => { resetHammer(); startHammer(); });
    exp.card.querySelector('[data-k="ok"]').addEventListener('click', () => resetHammer());
  }
  function updateHammer(dt) {
    if (exp.state !== 'fall') return;
    exp.t += dt;
    const dy = 0.5 * G * exp.t * exp.t;
    const drop = 1.34;
    if (dy >= drop) {
      hm.position.y = HANG - drop - 0.03;
      ft.position.y = HANG - 0.1 - drop - 0.02;
      hm.rotation.z = Math.PI / 2 - 0.15;
      hm.position.y = 0.06;
      ft.rotation.z = Math.PI / 2;
      ft.position.y = 0.03;
      hammerLanded();
      return;
    }
    hm.position.y = HANG - dy;
    ft.position.y = HANG - 0.1 - dy;
  }

  // 단체 사진
  const photo = { state: 'idle', t: 0, from: [], el: null, shot: false };
  // 단체 사진 카메라: 언덕 아래에서 일행(왼쪽)과 지구(오른쪽)를 한 장에
  const photoCam = new THREE.Vector3(LAY.photo.x + 1.15, 0, LAY.photo.z + 6.4);
  photoCam.y = H(photoCam.x, photoCam.z) + 1.7;
  const photoAim = photoCam.clone().addScaledVector(dirAzEl(-5, 3.5), 20);
  function startPhoto() {
    if (photo.state !== 'idle') return;
    mode = 'photo';
    photo.state = 'gather';
    photo.t = 0;
    photo.shot = false;
    const crew = [P, npc('greeter'), npc('hopper'), npc('jumper')];
    const xs = [-0.55, 0.55, -1.65, 1.65];
    photo.from = crew.map((b, i) => {
      b.script = 'photo';
      b.vel.set(0, 0, 0);
      b.bubble && (b.bubble.visible = false);
      const to = new THREE.Vector3(LAY.photo.x + xs[i], 0, LAY.photo.z + (i > 1 ? -0.5 : 0));
      to.y = H(to.x, to.z);
      return { b, from: b.pos.clone(), to, h0: b.heading };
    });
    hud && (hud.style.display = 'none');
    ctx.labels.style.display = 'none';
  }
  function updatePhoto(dt) {
    photo.t += dt;
    const T = photo.t;
    // 1) 깡충 뛰어 모이기 (1.5초)
    const k = clamp01(T / 1.5);
    for (const f of photo.from) {
      if (T <= 1.5) {
        f.b.pos.lerpVectors(f.from, f.to, ease(k));
        f.b.pos.y = THREE.MathUtils.lerp(f.from.y, f.to.y, k) + Math.sin(k * Math.PI) * 1.1;
        f.b.ground = false;
        f.b.vy = Math.cos(k * Math.PI) * 2;
        f.b.heading = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
      } else if (f.b.script === 'photo') {
        if (!f.b.ground && f.b !== npc('jumper')) land(f.b, f.to.y);
        f.b.pos.x = f.to.x;
        f.b.pos.z = f.to.z;
        turnTo(f.b, 0, dt, 6);
      }
    }
    if (T > 1.5 && !photo.landed) {
      photo.landed = true;
      for (const f of photo.from) { f.b.ground = true; f.b.pos.y = f.to.y; f.b.vy = 0; }
    }
    // 2) 포즈 + 카운트다운
    if (T > 1.6) {
      P.av.state.mode = 'cheer';
      npc('greeter').av.state.mode = 'wave';
      npc('hopper').av.state.mode = 'cheer';
    }
    const j = npc('jumper');
    if (T > 2.1 && T < 2.2 && j.ground) takeoff(j, JUMP_V0, 'photo');
    const left = 3.6 - T;
    const cnt = ctx.hud.querySelector('.count');
    if (left > 0 && T > 1.8) {
      const n = Math.ceil(left / 0.6);
      if (!cnt) ctx.hud.appendChild(h(`<div class="count">${n}</div>`));
      else cnt.textContent = n;
    } else cnt?.remove();
    // 3) 찰칵: 화면을 그대로 한 장 저장
    if (T >= 3.6 && !photo.shot) {
      photo.shot = true;
      ctx.renderer.render(scene, camera, api.renderOpts);
      let url = '';
      try { url = ctx.renderer.renderer.domElement.toDataURL('image/jpeg', 0.88); } catch { url = ''; }
      const fl = h('<div class="flash on"></div>');
      ctx.hud.appendChild(fl);
      requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove('on')));
      setTimeout(() => fl.remove(), 700);
      setTimeout(() => showPolaroid(url), 450);
    }
  }
  function showPolaroid(url) {
    photo.state = 'result';
    const d = new Date();
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    photo.el = h(`<div class="modal-wrap"><div class="polaroid">
      ${url ? `<img src="${url}" alt="달 언덕 단체 사진">` : '<div style="aspect-ratio:16/10;background:#222"></div>'}
      <div class="cap">달 언덕 위에서 · 지구를 배경으로 찰칵</div>
      <div class="sub">${date} · ${ctx.profile.name}, 별헤는밤, 코스모, 루나 · 사진 속 지구는 실제보다 크게 연출됨</div>
      <div class="row-btn"><button class="btn ghost" data-k="again">다시 찍기</button><button class="btn lav" data-k="save">앨범에 저장 (회원)</button><button class="btn" data-k="close">닫기</button></div>
    </div></div>`);
    ctx.hud.appendChild(photo.el);
    photo.el.querySelector('[data-k="close"]').addEventListener('click', () => endPhoto());
    photo.el.querySelector('[data-k="save"]').addEventListener('click', () => toast('시안에서는 저장하지 않아요 · 회원 앨범 저장은 PHASE 2 기능', 2600));
    photo.el.querySelector('[data-k="again"]').addEventListener('click', () => { endPhoto(); startPhoto(); });
  }
  function endPhoto() {
    photo.el?.remove();
    photo.el = null;
    photo.state = 'idle';
    photo.landed = false;
    for (const f of photo.from) {
      f.b.script = null;
      if (f.b !== P) {
        f.b.pos.copy(f.b.home);
        f.b.ground = true;
        f.b.vy = 0;
      }
      f.b.bubble && f.b.role !== 'hopper' && (f.b.bubble.visible = true);
      f.b.av.state.mode = 'idle';
    }
    mode = 'play';
    hud && (hud.style.display = '');
    ctx.labels.style.display = '';
  }

  // ---------- 도착 연출 ----------
  const intro = { t: 0, on: false, touched: false, dustAcc: 0 };
  const INTRO_END = 9.6;
  function startIntro() {
    mode = 'intro';
    intro.t = 0;
    intro.on = true;
    intro.touched = false;
    me.root.visible = false;
    lander.set({ ramp: 0, hatch: 0, thrust: 1 });
    npc('greeter').pos.copy(greetIntro);
    intro.lastPrint = null;
    buildIntroHud();
    applyIntro(0, 0);
  }
  function applyIntro(t, dt) {
    // 0~4.4초 하강 → 4.4초 착지 → 5.0~6.4초 해치·경사로 → 6.6~8.8초 첫발 → 9.6초 조작 시작
    const u = clamp01(t / 4.4);
    const alt = 34 * (1 - easeOut3(u));
    lander.group.position.y = padY + alt;
    const thrust = t < 4.4 ? 1 - u * 0.35 : Math.max(0, 0.65 - (t - 4.4) * 2.2);
    lander.set({ thrust, hatch: clamp01((t - 5.0) / 0.8), ramp: clamp01((t - 5.4) / 1.0) });
    // 엔진 바람에 날리는 먼지 (낮을수록 많이)
    if (dt > 0 && thrust > 0.05 && alt < 15) {
      intro.dustAcc += dt * 900 * thrust * (1 - alt / 15);
      while (intro.dustAcc > 1) {
        intro.dustAcc -= 1;
        const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 3;
        const x = LAY.lander.x + Math.cos(a) * r, z = LAY.lander.z + Math.sin(a) * r;
        const s = 6 + Math.random() * 10;
        blast.emit(x, H(x, z) + 0.05, z, Math.cos(a) * s, 0.3 + Math.random() * 1.6, Math.sin(a) * s, G, H);
      }
    }
    if (t >= 4.4 && !intro.touched) {
      intro.touched = true;
      shake = 0.5;
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9;
        const x = LAY.lander.x + Math.cos(a) * 2.2, z = LAY.lander.z + Math.sin(a) * 2.2;
        blast.emit(x, H(x, z) + 0.05, z, Math.cos(a) * s, 0.4 + Math.random() * 1.8, Math.sin(a) * s, G, H);
      }
    }
    // 첫발: 해치 안 → 경사로 위 → 바닥
    if (t >= 5.7) {
      me.root.visible = true;
      const w = clamp01((t - 6.6) / 2.2);
      const a = new THREE.Vector3().lerpVectors(hatchInW, rampTopW, clamp01((t - 5.7) / 0.9));
      if (t < 6.6) P.pos.copy(a);
      else {
        P.pos.lerpVectors(rampTopW, rampFootW, ease(w));
        if (w >= 1) {
          const k = clamp01((t - 8.8) / 0.8);
          P.pos.set(rampFootW.x + dP.x * 2.4 * k, 0, rampFootW.z + dP.y * 2.4 * k);
          P.pos.y = H(P.pos.x, P.pos.z);
          if (dt > 0 && (!intro.lastPrint || intro.lastPrint.distanceTo(P.pos) > 0.6)) {
            const first = !intro.lastPrint;
            intro.lastPrint = P.pos.clone();
            P.foot *= -1;
            footprints.add(P.pos.x, P.pos.z, Math.atan2(dP.x, dP.y), P.foot, terrain);
            puff(P.pos.x, P.pos.y, P.pos.z, 4, 0.25, 0.3);
            if (first) markFirstStep(P.pos.clone());
          }
        }
      }
      if (t >= 5.7 && t < 6.6) P.pos.copy(a);
      P.heading = Math.atan2(dP.x, dP.y);
      P.vel.set(0, 0, 0);
      me.root.position.copy(P.pos);
      me.root.rotation.y = P.heading;
      me.state.mode = t > 5.9 && t < 9.4 ? 'walk' : 'idle';
      me.state.speed = 0.6;
    }
    // 마중 나온 친구
    const gr = npc('greeter');
    gr.av.state.mode = t > 5.2 ? 'wave' : 'idle';
    turnTo(gr, Math.atan2(rampFootW.x - gr.pos.x, rampFootW.z - gr.pos.z), 1, 1);
    // 자막
    if (introEl) {
      const cap = introEl.querySelector('[data-k="cap"]');
      if (t < 4.4) cap.innerHTML = `달마중호 · 달 착륙 중…<small>고도 ${Math.max(0, alt).toFixed(0)} m · 엔진 바람에 먼지가 날려요</small>`;
      else if (t < 6.6) cap.innerHTML = '착륙 성공! 해치를 여는 중<small>달 중력은 지구의 약 1/6</small>';
      else cap.innerHTML = '달에 첫발 — 바람이 없어 이 발자국은 아주 오래 남아요<small>먼저 온 친구들이 마중 나왔어요</small>';
    }
    // 카메라: 하강 장면(넓게) → 해치 앞(가깝게) → 등 뒤 3인칭
    const A = new THREE.Vector3(-9, H(-9, 9) + 1.7, 9);
    const aimA0 = new THREE.Vector3(LAY.lander.x, padY + 28, LAY.lander.z);
    const aimA1 = A.clone().addScaledVector(dirAzEl(34, 4), 20);
    const B = new THREE.Vector3(3.4, H(3.4, -9.4) + 1.75, -9.4);
    const aimB = new THREE.Vector3().lerpVectors(rampTopW, rampFootW, 0.45).add(new THREE.Vector3(0, 1.2, 0));
    if (t < 5.0) {
      camOverride = { pos: A.clone().add(new THREE.Vector3(0.6, 0, 1.4).multiplyScalar(1 - ease(clamp01(t / 5)))), aim: new THREE.Vector3().lerpVectors(aimA0, aimA1, ease(clamp01(t / 4.6))), fov: 50 };
    } else if (t < 8.6) {
      const k = ease(clamp01((t - 5.0) / 1.2));
      const pos = new THREE.Vector3().lerpVectors(A, B, k);
      const aim = new THREE.Vector3().lerpVectors(aimA1, aimB, k);
      if (t > 6.6) aim.lerp(P.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), clamp01((t - 6.6) / 1.4) * 0.6);
      camOverride = { pos, aim, fov: 48 };
    } else {
      const k = ease(clamp01((t - 8.6) / 1.0));
      const yaw = -0.3;
      cam.yaw = yaw;
      const tgt = P.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
      const pos = tgt.clone().add(new THREE.Vector3(Math.sin(yaw) * 6.2, 0.9, Math.cos(yaw) * 6.2));
      const aim = tgt.clone().add(new THREE.Vector3(-Math.sin(yaw) * 3, 0.55, -Math.cos(yaw) * 3));
      const cpos = new THREE.Vector3().lerpVectors(B, pos, k);
      pushFromLander(cpos);
      camOverride = { pos: cpos, aim: new THREE.Vector3().lerpVectors(aimB, aim, k), fov: 48 + k * 4 };
    }
    if (t >= INTRO_END) endIntro(false);
  }
  function endIntro(skipped) {
    if (!intro.on) return;
    intro.on = false;
    camOverride = null;
    lander.group.position.y = padY;
    lander.set({ ramp: 1, hatch: 1, thrust: 0 });
    me.root.visible = true;
    if (skipped || P.pos.distanceTo(rampFootW) > 3) {
      P.pos.set(rampFootW.x + dP.x * 2.4, 0, rampFootW.z + dP.y * 2.4);
      P.pos.y = H(P.pos.x, P.pos.z);
    }
    P.heading = Math.atan2(dP.x, dP.y);
    cam.yaw = -0.3;
    cam.pitch = 0.1;
    mode = 'play';
    ctx.progress.seenIntro = true;
    ctx.persist();
    npc('greeter').pos.copy(npc('greeter').home);
    buildHud();
    if (!firstLabel) markFirstStep(rampFootW.clone().add(new THREE.Vector3(dP.x * 0.4, 0, dP.y * 0.4)));
    toast('달에 도착! 달 중력은 지구의 약 1/6 — <b>Space</b>로 점프해 보세요');
  }

  function markFirstStep(p) {
    if (firstLabel) scene.remove(firstLabel);
    footprints.add(p.x, p.z, Math.atan2(dP.x, dP.y), -1, terrain);
    footprints.add(p.x + dP.x * 0.35, p.z + dP.y * 0.35, Math.atan2(dP.x, dP.y), 1, terrain);
    firstLabel = textSprite('나의 첫 발자국', { size: 40, color: '#ffd166' });
    firstLabel.scale.set(0.62, 0.23, 1);
    firstLabel.position.set(p.x, H(p.x, p.z) + 0.32, p.z);
    scene.add(firstLabel);
    firstLabelT = 12;
  }

  function placeFree() {
    lander.group.position.y = padY;
    lander.set({ ramp: 1, hatch: 1, thrust: 0 });
    me.root.visible = true;
    P.pos.set(1.4, 0, -11.2);
    P.pos.y = H(P.pos.x, P.pos.z);
    P.heading = Math.PI;
    P.ground = true;
    cam.yaw = 0;
    cam.pitch = 0.1;
    mode = 'play';
    buildHud();
  }

  // ---------- 다른 이용자 움직임 ----------
  const seatW = new THREE.Vector3();
  // 친구가 돌아갈 자리 (깡충 도는 친구는 원 위의 지금 자리)
  const homeOf = (b) => (b.role === 'hopper' ? seatW.set(b.home.x + Math.cos(b.ang) * 4.0, 0, b.home.z + Math.sin(b.ang) * 4.0) : seatW.set(b.home.x, 0, b.home.z));
  function updateNpcs(dt, t) {
    for (const b of npcs) {
      b.near = camera.position.distanceTo(b.pos) < 5.5;
      b.chatT = Math.max(0, b.chatT - dt);
      if (b.script === 'board' || b.script === 'ride') {
        // 월면차 타기: 달 중력으로 깡충 뛰어 빈자리에 앉고, 달리는 동안 좌석에 붙어 있음
        const rv = RV.cur;
        if (!rv || b.seat < 0) { b.script = 'return'; continue; }
        rv.group.localToWorld(seatW.copy(rv.seats[b.seat]));
        const root = b.av.root;
        if (b.script === 'board') {
          b.boardT += dt;
          const k = Math.min(1, b.boardT / 1.15);
          root.position.lerpVectors(b.boardFrom, seatW, k);
          root.position.y += Math.sin(k * Math.PI) * 1.5;
          root.rotation.set(0, Math.atan2(seatW.x - b.boardFrom.x, seatW.z - b.boardFrom.z), 0);
          b.av.state.mode = 'air';
          b.av.state.air = 1 - 2 * k;
          if (k >= 1) b.script = 'ride';
        } else {
          root.position.copy(seatW);
          root.quaternion.copy(rv.group.quaternion).multiply(SEAT_Q);
          b.av.state.mode = 'sit';
        }
        b.av.state.flip = 0;
        b.av.state.squash = 0;
        b.pos.copy(root.position);
        b.heading = RV.yaw + Math.PI / 2;
        b.bubble.visible = false;
        b.av.update(dt, t);
        continue;
      }
      if (b.script === 'return') {
        // 내린 뒤 원래 자리로 깡충깡충
        const to = homeOf(b);
        const dx = to.x - b.pos.x, dz = to.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.35 && b.ground) {
          b.script = null;
          b.vel.set(0, 0, 0);
        } else {
          const sp = Math.min(HOP_RUN, d * 2.5);
          b.vel.set((dx / d) * sp, 0, (dz / d) * sp);
          b.pos.x += b.vel.x * dt;
          b.pos.z += b.vel.z * dt;
          if (b.ground && d > 0.8) takeoff(b, HOP_V0, 'hop');
          turnTo(b, Math.atan2(dx, dz), dt, 8);
        }
        stepBody(b, dt);
        if (b.ground) b.av.state.mode = b.script ? 'walk' : 'idle';
        b.av.state.speed = 1;
        b.bubble.visible = false;
        poseBody(b, dt);
        b.av.update(dt, t);
        continue;
      }
      if (b.script === 'photo') {
        stepBody(b, dt);
        poseBody(b, dt);
        if (b.ground && b.av.state.mode === 'air') b.av.state.mode = 'cheer';
        b.av.update(dt, t);
        continue;
      }
      if (b.role === 'hopper' && (b.danceT > 0 || ((b.breakT = (b.breakT ?? 8) - dt) <= 0 && b.ground))) {
        // 깡충 뛰다가 가끔 멈춰서 춤
        if (!(b.danceT > 0)) { b.danceT = 4.5; b.breakT = 11 + Math.random() * 5; }
        b.danceT -= dt;
        stepBody(b, dt);
        b.av.state.lean = 0;
        turnTo(b, Math.atan2(camera.position.x - b.pos.x, camera.position.z - b.pos.z), dt, 3);
        if (b.ground) b.av.state.mode = 'dance';
      } else if (b.role === 'hopper') {
        // 언덕 둘레를 깡충깡충 (공기가 없어 착지마다 먼지가 포물선으로)
        const R = 4.0, c = b.home;
        if (b.ground) {
          b.timer -= dt;
          if (b.timer <= 0) {
            takeoff(b, HOP_V0, 'hop');
            b.timer = 0.12;
          }
        }
        b.ang += (2.5 / R) * dt * (b.ground ? 0.15 : 1);
        const nx = c.x + Math.cos(b.ang) * R, nz = c.z + Math.sin(b.ang) * R;
        b.vel.set((nx - b.pos.x) / Math.max(dt, 1e-3), 0, (nz - b.pos.z) / Math.max(dt, 1e-3));
        b.pos.x = nx;
        b.pos.z = nz;
        turnTo(b, Math.atan2(-Math.sin(b.ang), Math.cos(b.ang)), dt, 8);
        stepBody(b, dt);
        b.av.state.lean = 0.12;
        if (b.ground) b.av.state.mode = 'idle';
      } else if (b.role === 'jumper') {
        b.timer -= dt;
        if (b.ground && b.timer <= 0) {
          // 두 번에 한 번은 연속 점프 + 공중제비 시범
          b.count = (b.count || 0) + 1;
          const showOff = b.count % 2 === 0;
          takeoff(b, JUMP_V0 * (showOff ? COMBO[2] : 1), 'jump', { combo: showOff, flip: showOff });
          b.timer = showOff ? 5.4 : 4.2;
          b.bubble.visible = false;
        }
        if (stepBody(b, dt)) b.bubble.visible = true;
        turnTo(b, Math.atan2(camera.position.x - b.pos.x, camera.position.z - b.pos.z), dt, 2);
        if (b.ground) b.av.state.mode = 'idle';
      } else if (b.role === 'greeter') {
        stepBody(b, dt);
        const d = P.pos.distanceTo(b.pos);
        turnTo(b, Math.atan2(P.pos.x - b.pos.x, P.pos.z - b.pos.z), dt, 3);
        b.reactT = Math.max(0, (b.reactT || 0) - dt);
        b.av.state.mode = b.reactT > 0 ? 'clap' : d < 7 || mode === 'intro' ? 'wave' : 'idle';
        b.bubble.visible = d < 12 && !(b.reactT > 0);
      } else if (b.role === 'scientist') {
        stepBody(b, dt);
        turnTo(b, Math.atan2(LAY.stand.x - b.pos.x, LAY.stand.z - b.pos.z), dt, 3);
        b.av.state.mode = exp.state === 'done' ? 'cheer' : 'idle';
        b.bubble.visible = exp.state === 'idle';
      }
      if (b.near || b.chatT > 0) b.bubble.visible = false;
      poseBody(b, dt);
      b.av.update(dt, t);
    }
  }

  // ---------- 내 움직임 ----------
  function updatePlayer(dt) {
    const mi = moveIntent();
    const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const joyFull = input.joy.active && Math.hypot(input.joy.x, input.joy.y) > 0.92;
    const hopping = mi.boost || joyFull;
    const want = new THREE.Vector3().addScaledVector(fwd, mi.y).addScaledVector(right, mi.x);
    const wl = want.length();
    want.multiplyScalar(hopping ? HOP_RUN : WALK);
    if (wl > 0.1 && P.emote && P.ground) P.emote = null;
    // 땅에서는 미끄러지듯(달은 마찰이 약한 느낌), 공중에서는 거의 조절 불가
    P.vel.lerp(want, 1 - Math.exp(-dt * (P.ground ? 4.5 : 0.5)));
    const jumpNow = input.pressed.has(' ') || jumpQueued;
    const jumpHeld = input.keys.has(' ') || input.hold.jump;
    jumpQueued = false;
    if (!P.ground && jumpNow) P.buffer = 0.25;
    P.buffer = Math.max(0, P.buffer - dt);
    P.sinceLand += dt;
    if (P.ground && P.sinceLand > COMBO_WINDOW && P.combo > 0) P.combo = 0;
    const picked = emoteFromKeys(input.pressed);
    if (picked) pickEmote(picked);
    if (P.ground && jumpNow) comboJump();
    else if (P.ground && hopping && wl > 0.2) takeoff(P, HOP_V0, 'hop');
    P.pos.x += P.vel.x * dt;
    P.pos.z += P.vel.z * dt;
    collide(P.pos);
    const r = Math.hypot(P.pos.x, P.pos.z);
    if (r > BOUND) {
      P.pos.x *= BOUND / r;
      P.pos.z *= BOUND / r;
      if (!boundWarned) {
        boundWarned = true;
        toast('이번 시안의 탐험 구역은 착륙 지점 반경 50 m까지예요');
      }
    }
    const wasAir = !P.ground;
    const kindBefore = P.kind;
    const landed = stepBody(P, dt);
    if (landed && wasAir && kindBefore === 'jump') {
      showJumpChip(P);
      if (P.peak > bestJump) {
        bestJump = P.peak;
        const { bestRing, bestLab } = base.pole;
        bestRing.visible = bestLab.visible = true;
        bestRing.position.y = Math.min(4, 0.12 + bestJump);
        bestLab.position.set(-0.6, Math.min(4, 0.12 + bestJump) + 0.06, 0);
      }
      if (P.combo >= 2) {
        const gr = npc('greeter');
        if (gr.pos.distanceTo(P.pos) < 16) gr.reactT = 2.6;
      }
      // 착지 순간 점프를 누르고 있었거나 직전에 눌렀으면 바로 다음 단계로
      if (P.buffer > 0 || jumpHeld) comboJump(true);
    }
    walkPrints(P, dt);
    const sp = Math.hypot(P.vel.x, P.vel.z);
    if (sp > 0.15) turnTo(P, Math.atan2(P.vel.x, P.vel.z), dt, P.ground ? 10 : 2);
    poseBody(P, dt);
    if (P.ground) {
      me.state.mode = sp > 0.15 ? 'walk' : 'idle';
      me.state.speed = sp * 0.55;
      if (P.emote && sp < 0.3) {
        me.state.mode = P.emote;
        if (P.emoteT > 0) {
          P.emoteT -= dt;
          if (P.emoteT <= 0) P.emote = null;
        }
      }
    }
    me.state.lean = hopping && wl > 0.2 ? 0.14 : 0;
  }
  function comboJump(chained) {
    const inWindow = P.kind === 'jump' && P.sinceLand <= COMBO_WINDOW;
    P.combo = chained || inWindow ? Math.min(P.combo + 1, COMBO.length - 1) : 0;
    P.buffer = 0;
    takeoff(P, JUMP_V0 * COMBO[P.combo], 'jump', { combo: P.combo > 0, flip: P.combo >= 2 });
    if (P.combo > 0) showCombo(P.combo);
  }
  function showCombo(c) {
    const el = hud?.querySelector('[data-k="combo"]');
    if (!el) return;
    el.innerHTML = `${c + 1}단 점프!${c >= 2 ? ' 🤸 공중제비' : ''}<small>게임 보너스</small>`;
    el.style.display = 'grid';
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(showCombo.t);
    showCombo.t = setTimeout(() => (el.style.display = 'none'), 1300);
  }
  function pickEmote(k) {
    if (mode !== 'play') return;
    const e = EMOTES.find((x) => x.k === k);
    if (!e) return;
    if (k === 'drink') {
      if (!P.ground) return;
      P.vel.set(0, 0, 0);
      P.emote = 'sip';
      P.emoteT = e.dur;
      drink.start({ g: G, suit: true });
      toast('💧 헬멧은 그대로! 우주복 안 음료 주머니의 빨대로 마셔요 — 아폴로 달 탐사 우주복에도 헬멧 목 고리 안쪽에 빨대가 있었어요 · 흘린 물방울은 1/6 중력으로 천천히 떨어져요', 5200);
      return;
    }
    if (k === 'flip') {
      if (P.ground) takeoff(P, JUMP_V0, 'jump', { flip: true });
      return;
    }
    if (!P.ground) return;
    P.vel.set(0, 0, 0);
    P.emote = k;
    P.emoteT = e.dur || 0;
  }

  // ---------- 우주선 목적지 고르기 ----------
  function openShipMenu() {
    ctx.travel('moon', { kicker: '달마중호 · 어디로 갈까요?', title: '우주선 타고 출발', stay: '달에 더 있을래요', only: ['station', 'space'] });
  }


  // ---------- 관측 망원경: 지구 가까이 보기 ----------
  const scopeCam = { el: null };
  function startScope() {
    mode = 'scope';
    hud && (hud.style.display = 'none');
    ctx.labels.style.display = 'none';
    scopeCam.el = h(`<div class="scope-view"><div class="scope-cap"><b>망원경 · 지구</b>달에서 본 지구는 실제로 지름 약 ${EARTH_FROM_MOON_DEG.toFixed(1)}° — 망원경 배율로 크게 봐요<div class="row-btn"><button class="btn ghost" data-k="close">돌아가기 (E)</button><button class="btn lav" data-k="space">🔭 우주 탐험 떠나기</button></div></div></div>`);
    ctx.hud.appendChild(scopeCam.el);
    scopeCam.el.querySelector('[data-k="close"]').addEventListener('click', () => stopScope());
    scopeCam.el.querySelector('[data-k="space"]').addEventListener('click', () => ctx.go('space'));
  }
  function stopScope() {
    scopeCam.el?.remove();
    scopeCam.el = null;
    mode = 'play';
    hud && (hud.style.display = '');
    ctx.labels.style.display = '';
  }

  // ---------- 월면차 운전 (여러 대 · 4인승: 운전석 + 친구 3명) ----------
  // 운영(PHASE 4)에서는 서버가 좌석을 배정한다: 빈자리가 없거나 너무 멀면 거절 (클라이언트가 보낸 좌석·위치를 그대로 믿지 않음)
  const RV = { cur: null, speed: 0, yaw: 0, steer: 0, force: null, riders: [], bar: null };
  const SEAT_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const RIDE_LINES = ['', '나도 탈래! 옆자리~', '뒷자리 내 거 🚙', '출발하자! 꽉 잡아'];
  function startDrive(i = 0) {
    const rv = base.rovers[i];
    if (!rv) return;
    if (mode === 'drive') stopDrive();
    RV.cur = rv;
    RV.speed = 0;
    RV.steer = 0;
    RV.yaw = rv.group.userData.yaw;
    RV.force = null;
    RV.riders = [P, null, null, null];
    mode = 'drive';
    P.emote = null;
    drink.cancel();
    ctx.labels.style.display = 'none';
    cam.dist = 9.5;
    hud?.classList.add('driving');
    showDriveBar();
    toast(ctx.isMobile()
      ? '월면차 출발! 조이스틱으로 운전 · 위쪽 막대에서 <b>친구 태우기</b>(최대 4명)·<b>내리기</b>'
      : '월면차 운전! <b>W/S</b> 가속·후진 · <b>A/D</b> 방향 · <b>F</b> 친구 태우기(최대 4명) · <b>E</b> 내리기', 5200);
    const pr = hud?.querySelector('.prompt');
    if (pr) { pr.style.display = 'block'; pr.innerHTML = '<i class="kbd">F</i> 친구 태우기 · <i class="kbd">E</i> 월면차에서 내리기'; }
  }
  function showDriveBar() {
    RV.bar?.remove();
    if (!hud) return;
    RV.bar = h(`<div class="drive-bar glass"><span>🚙 월면차</span><span class="seats" data-k="seats"></span><button class="btn ghost" data-k="board">친구 태우기</button><button class="btn" data-k="off">내리기</button></div>`);
    hud.appendChild(RV.bar);
    RV.bar.querySelector('[data-k="board"]').addEventListener('click', () => boardFriend());
    RV.bar.querySelector('[data-k="off"]').addEventListener('click', () => stopDrive());
    updateSeats();
  }
  function updateSeats() {
    const el = RV.bar?.querySelector('[data-k="seats"]');
    if (!el) return;
    const n = RV.riders.filter(Boolean).length;
    el.innerHTML = `${RV.riders.map((r) => `<i class="${r ? 'on' : ''}"></i>`).join('')}&nbsp;${n}/4`;
    const b = RV.bar.querySelector('[data-k="board"]');
    b.disabled = n >= 4;
    b.textContent = n >= 4 ? '만석' : '친구 태우기';
  }
  // 가까운 친구(24 m 안)가 달 중력으로 깡충 뛰어 빈자리에 탄다
  function boardFriend() {
    if (mode !== 'drive' || !RV.cur) return;
    const seat = RV.riders.indexOf(null);
    if (seat < 0) {
      toast('월면차는 최대 4명까지 탈 수 있어요 (운전석 포함)');
      return;
    }
    const p = RV.cur.group.position;
    const cand = npcs.filter((b) => !b.script).map((b) => ({ b, d: Math.hypot(b.pos.x - p.x, b.pos.z - p.z) })).sort((a, b) => a.d - b.d)[0];
    if (!cand || cand.d > 24) {
      toast('근처(24 m 안)에 태울 친구가 없어요 · 친구들 가까이로 몰고 가 보세요');
      return;
    }
    const b = cand.b;
    b.script = 'board';
    b.seat = seat;
    b.boardT = 0;
    b.boardFrom = b.av.root.position.clone();
    b.danceT = 0;
    b.vel.set(0, 0, 0);
    b.vy = 0;
    b.flipping = false;
    b.flip = 0;
    b.emote = null;
    b.bubble.visible = false;
    RV.riders[seat] = b;
    puff(b.pos.x, b.pos.y, b.pos.z, 12, 0.5, 0.6);
    ui?.chat.npcSay(b.name, RIDE_LINES[seat]);
    updateSeats();
  }
  // 내리기: 나는 운전석 옆, 친구들은 자기 자리 옆으로 내려서 원래 자리로 깡충깡충 돌아감
  const offV = new THREE.Vector3();
  function getOffAt(g, seat, out) {
    g.localToWorld(out.set(seat.x, 0, Math.sign(seat.z || 1) * 1.75));
    out.y = 0;
    collide(out);
    out.y = H(out.x, out.z);
    return out;
  }
  function stopDrive() {
    const rv = RV.cur;
    mode = 'play';
    hud?.classList.remove('driving');
    RV.bar?.remove();
    RV.bar = null;
    ctx.labels.style.display = '';
    cam.dist = 6.4;
    if (!rv) return;
    const g = rv.group;
    getOffAt(g, rv.seats[0], P.pos);
    P.ground = true;
    P.vy = 0;
    P.vel.set(0, 0, 0);
    P.heading = RV.yaw + Math.PI / 2;
    me.root.rotation.set(0, P.heading, 0);
    RV.riders.forEach((b, k) => {
      if (!b || b === P) return;
      getOffAt(g, rv.seats[k], b.pos);
      b.av.root.rotation.set(0, b.heading, 0);
      b.ground = true;
      b.vy = 0;
      b.script = 'return';
      b.seat = -1;
    });
    RV.riders = [];
    RV.force = null;
    rv.sync();
    const sp = spots.find((x) => x.key === `rover${rv.i}`);
    if (sp) sp.pos.set(g.position.x, H(g.position.x, g.position.z) + 2.5, g.position.z);
    RV.cur = null;
    const pr = hud?.querySelector('.prompt');
    if (pr) pr.style.display = 'none';
  }
  const tmpV = new THREE.Vector3();
  function updateDrive(dt) {
    const rv = RV.cur;
    if (!rv) return;
    const RG = rv.group;
    const mi = moveIntent();
    const throttle = RV.force ? RV.force.t : mi.y, steer = RV.force ? RV.force.s : -mi.x;
    RV.speed += (throttle * (throttle > 0 ? 5.2 : 2.2) - RV.speed) * (1 - Math.exp(-dt * (Math.abs(throttle) > 0.05 ? 1.1 : 0.7)));
    RV.steer += (steer - RV.steer) * (1 - Math.exp(-dt * 6));
    RV.yaw += RV.steer * dt * 1.25 * Math.min(1, Math.abs(RV.speed) / 1.5) * Math.sign(RV.speed || 1);
    const fx = Math.cos(RV.yaw), fz = -Math.sin(RV.yaw);
    const p = RG.position;
    p.x += fx * RV.speed * dt;
    p.z += fz * RV.speed * dt;
    // 다른 물체·다른 월면차와 부딪힘 (지금 타고 있는 월면차의 충돌 원은 제외)
    for (const c of colliders) {
      if (c.rv === rv.i) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + 1.35;
      if (d < m && d > 1e-4) {
        p.x = c.x + (dx / d) * m;
        p.z = c.z + (dz / d) * m;
        RV.speed *= 0.5;
      }
    }
    const rr = Math.hypot(p.x, p.z);
    if (rr > BOUND) { p.x *= BOUND / rr; p.z *= BOUND / rr; RV.speed *= 0.5; }
    p.y = H(p.x, p.z);
    RG.userData.yaw = RV.yaw;
    base.tiltTo(RG, p.x, p.z, RV.yaw);
    rv.sync();
    for (const w of rv.wheels) {
      w.axle.rotation.z -= (RV.speed * dt) / 0.42;
      if (w.front) w.axle.rotation.y = RV.steer * 0.4;
    }
    // 뒷바퀴 흙먼지: 공기가 없으니 연기처럼 퍼지지 않고 포물선으로 '툭'
    const sp = Math.abs(RV.speed);
    if (sp > 0.6) {
      for (const w of rv.wheels) {
        if (w.front) continue;
        w.axle.getWorldPosition(tmpV);
        const n = Math.random() < sp / 6 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          dust.emit(tmpV.x, tmpV.y - 0.3, tmpV.z, -fx * RV.speed * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * sp * 0.55, -fz * RV.speed * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.8, G, H);
        }
      }
    }
    // 운전석에 앉은 나
    const seat = tmpV.copy(rv.seats[0]);
    RG.localToWorld(seat);
    me.root.position.copy(seat);
    me.root.quaternion.copy(RG.quaternion).multiply(SEAT_Q);
    me.state.mode = 'sit';
    me.state.flip = 0;
    P.pos.copy(seat);
    // 카메라는 월면차 뒤를 천천히 따라감
    const yc = RV.yaw - Math.PI / 2;
    let dy = yc - cam.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * (1 - Math.exp(-dt * 2.2));
  }

  function updateCamera(dt) {
    const isM = ctx.isMobile();
    if (camOverride) {
      camera.position.copy(camOverride.pos);
      camera.lookAt(camOverride.aim);
      if (camOverride.fov && Math.abs(camera.fov - (isM ? camOverride.fov + 12 : camOverride.fov)) > 0.01) {
        camera.fov = isM ? camOverride.fov + 12 : camOverride.fov;
        camera.updateProjectionMatrix();
      }
    } else if (mode === 'scope') {
      const eye = new THREE.Vector3(LAY.scope.x, H(LAY.scope.x, LAY.scope.z) + 1.55, LAY.scope.z);
      camera.position.copy(eye);
      camera.lookAt(earthPivot.position);
      const f = isM ? 11 : 7.5;
      if (camera.fov !== f) {
        camera.fov = f;
        camera.updateProjectionMatrix();
      }
    } else if (mode === 'photo') {
      const k = ease(clamp01((photo.t - 0.6) / 1.2));
      const tgt = P.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
      const play = tgt.clone().add(new THREE.Vector3(Math.sin(cam.yaw) * cam.dist, 0.9, Math.cos(cam.yaw) * cam.dist));
      camera.position.lerpVectors(play, photoCam, k);
      camera.lookAt(new THREE.Vector3().lerpVectors(tgt, photoAim, k));
      const f = isM ? 50 : 32;
      camera.fov = THREE.MathUtils.lerp(isM ? 64 : 52, f, k);
      camera.updateProjectionMatrix();
    } else {
      const look = consumeLook();
      cam.yaw -= look.dx * 0.005;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + look.dy * 0.004, -0.2, 0.85);
      cam.dist = THREE.MathUtils.clamp(cam.dist + look.zoom * 0.6, 3.2, 12);
      const gy = H(P.pos.x, P.pos.z);
      const followY = gy + 1.35 + (P.pos.y - gy) * 0.55;
      camTarget.set(P.pos.x, THREE.MathUtils.lerp(camTarget.y || followY, followY, 1 - Math.exp(-dt * 6)), P.pos.z);
      const d = cam.dist * (isM ? 1.2 : 1);
      camera.position.set(
        camTarget.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * d,
        camTarget.y + Math.sin(cam.pitch) * d + 0.35,
        camTarget.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * d,
      );
      pushFromLander(camera.position);
      const floor = H(camera.position.x, camera.position.z) + 0.45;
      if (camera.position.y < floor) camera.position.y = floor;
      camera.lookAt(camTarget.x - Math.sin(cam.yaw) * 3, camTarget.y + 0.55, camTarget.z - Math.cos(cam.yaw) * 3);
      const fov = isM ? 64 : 52;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake * 0.15;
      camera.position.y += (Math.random() - 0.5) * shake * 0.15;
    }
  }

  // ---------- 위치 풍선: 누르면 그 앞으로 바로 이동해서 바로 실행 ----------
  // 운영(PHASE 4)에서는 '어느 풍선으로 갈지'만 서버에 보내고, 서버가 같은 구역의 정해진 도착 지점으로 옮겨 준다 (좌표를 그대로 믿지 않음)
  function goSpot(s) {
    if (intro.on || photo.state !== 'idle') return;
    if (mode === 'drive') stopDrive();
    else if (mode === 'scope') stopScope();
    if (mode !== 'play') return;
    const tx = s.pos.x, tz = s.pos.z;
    let dx = P.pos.x - tx, dz = P.pos.z - tz;
    let d = Math.hypot(dx, dz);
    if (d < 0.05) { dx = Math.sin(cam.yaw); dz = Math.cos(cam.yaw); d = 1; }
    const stand = Math.min(d, Math.max(1.4, s.r * 0.55));
    const moved = d - stand > 0.3;
    P.pos.set(tx + (dx / d) * stand, 0, tz + (dz / d) * stand);
    collide(P.pos);
    collide(P.pos);
    const r = Math.hypot(P.pos.x, P.pos.z);
    if (r > BOUND) { P.pos.x *= BOUND / r; P.pos.z *= BOUND / r; }
    P.pos.y = H(P.pos.x, P.pos.z);
    P.vel.set(0, 0, 0);
    P.vy = 0;
    P.ground = true;
    P.emote = null;
    P.combo = 0;
    P.flipping = false;
    P.flip = 0;
    drink.cancel();
    P.heading = Math.atan2(tx - P.pos.x, tz - P.pos.z);
    me.root.rotation.set(0, P.heading, 0);
    poseBody(P, 0);
    if (moved) {
      cam.yaw = Math.atan2(P.pos.x - tx, P.pos.z - tz);
      puff(P.pos.x, P.pos.y, P.pos.z, 16, 0.7, 0.55);
    }
    nearKey = s.key;
    interact(s.key);
  }
  const spotAct = (s) => (s.rover != null ? '월면차 타기 (최대 4명)' : s.act);
  function updateLabels() {
    if (mode !== 'play' || !spotUi) return;
    nearKey = spotUi.layout(camera, P.pos, { max: ctx.isMobile() ? 60 : 80, minY: 56 });
    if (prompt) {
      const s = spots.find((x) => x.key === nearKey);
      prompt.style.display = s ? 'block' : 'none';
      if (s) prompt.innerHTML = `<i class="kbd">E</i> ${spotAct(s)} <span style="opacity:.55;font-weight:600">· 풍선을 눌러도 돼요</span>`;
    }
  }

  const api = {
    id: 'moon',
    scene,
    camera,
    renderOpts: { exposure: 0.9, bloomStrength: 0.3, bloomThreshold: 1.05, bloomRadius: 0.42 },
    enter(p = {}) {
      me.applyProfile(ctx.profile);
      endPhotoQuiet();
      resetHammer();
      const id = p.id || '';
      ctx.labels.style.display = '';
      scopeCam.el = null;
      RV.force = null;
      if (id === 'free' || id === 'photo' || id === 'hammer' || id === 'hub' || id === 'drive' || id === 'scope' || (ctx.progress.seenIntro && id !== 'intro')) {
        placeFree();
        if (id === 'hub') {
          // 라운지에서 나오면 기지 문 앞
          const door = spots.find((x) => x.key === 'hub').pos;
          const dx = door.x - LAY.hub.x, dz = door.z - LAY.hub.z, dl = Math.hypot(dx, dz);
          P.pos.set(door.x + (dx / dl) * 1.4, 0, door.z + (dz / dl) * 1.4);
          P.pos.y = H(P.pos.x, P.pos.z);
          P.heading = Math.atan2(dx, dz);
          cam.yaw = Math.atan2(-dx, -dz);
          toast('달 기지 라운지에서 나왔어요');
        }
        if (id === 'drive') {
          P.pos.set(LAY.rover.x + 1.5, 0, LAY.rover.z + 1.2);
          startDrive(0);
          RV.force = { t: 1, s: 0.22 };
        }
        if (id === 'scope') startScope();
        if (id === 'photo') startPhoto();
        if (id === 'hammer') {
          P.pos.set(LAY.stand.x - 1.9, 0, LAY.stand.z + 3.6);
          P.pos.y = H(P.pos.x, P.pos.z);
          P.heading = Math.atan2(LAY.stand.x - P.pos.x, LAY.stand.z - P.pos.z);
          cam.yaw = -0.46;
          cam.pitch = 0.32;
          cam.dist = 5.2;
          startHammer();
        }
      } else startIntro();
      window.__moon = {
        seek: (s) => { if (intro.on) { intro.t = s; applyIntro(s, 0); } },
        jump: () => { if (P.ground) takeoff(P, JUMP_V0, 'jump'); },
        cam: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist) cam.dist = dist; },
        place: (x, z, hd) => { P.pos.set(x, H(x, z), z); if (hd != null) P.heading = hd; },
        earth: () => hud?.querySelector('[data-k="earth"]')?.click(),
        photo: () => startPhoto(),
        hammer: () => startHammer(),
        drive: (tq, st, i) => { if (mode !== 'drive') startDrive(i || 0); RV.force = tq == null ? null : { t: tq, s: st || 0 }; },
        board: () => boardFriend(),
        stopDrive: () => stopDrive(),
        riders: () => RV.riders.map((r) => (r === P ? 'me' : r ? r.name : null)),
        rovers: () => base.rovers.map((r) => [+r.group.position.x.toFixed(1), +r.group.position.z.toFixed(1)]),
        goSpot: (key) => { const sp = spots.find((x) => x.key === key); if (sp) goSpot(sp); },
        near: () => nearKey,
        drinkState: () => ({ active: drink.active, drops: drink.count, mode: me.state.mode }),
        combo: () => { if (P.ground) comboJump(true); },
        comboAt: (n) => { P.combo = n - 1; P.kind = 'jump'; P.ground = true; comboJump(true); },
        emotePanel: () => hud?.querySelector('[data-k="emote"]')?.click(),
        emote: (k) => pickEmote(k),
        state: () => ({ mode, t: intro.t, pos: P.pos.toArray().map((v) => +v.toFixed(2)), heading: +P.heading.toFixed(2), prints: footprints.count }),
      };
    },
    exit() {
      endPhotoQuiet();
      if (mode === 'scope') stopScope();
      if (mode === 'drive') stopDrive();
      drink.stop();
      clearTimeout(toastTimer);
      firstLabel && scene.remove(firstLabel);
      firstLabel = null;
    },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 64 : 52;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      if (intro.on) {
        intro.t += dt;
        applyIntro(intro.t, dt);
        me.update(dt, t);
      } else if (mode === 'photo') {
        updatePhoto(dt);
        stepBody(P, dt);
        poseBody(P, dt);
        if (P.ground && me.state.mode === 'air') me.state.mode = 'cheer';
        me.update(dt, t);
      } else if (mode === 'drive') {
        updateDrive(dt);
        me.update(dt, t);
        if (input.pressed.has('f')) boardFriend();
        if (input.pressed.has('e')) interact();
      } else if (mode === 'scope') {
        me.update(dt, t);
        if (input.pressed.has('e') || input.pressed.has('escape')) stopScope();
      } else {
        updatePlayer(dt);
        if (drink.active && P.emote !== 'sip') drink.cancel();
        me.update(dt, t);
        if (input.pressed.has('e')) interact();
      }
      drink.update(dt, t);
      updateNpcs(dt, t);
      updateHammer(dt);
      dust.update(dt, G);
      blast.update(dt, G);
      lander.update(t);
      base.update(t);
      // 지구 크기 전환 (연출 ↔ 실제)
      if (Math.abs(earthScale - earthTarget) > 0.001) {
        earthScale += (earthTarget - earthScale) * (1 - Math.exp(-dt * 3));
        applyEarthScale(earthScale);
      }
      earth.update(dt);
      if (firstLabel) {
        firstLabelT -= dt;
        firstLabel.material.opacity = Math.min(1, firstLabelT);
        if (firstLabelT <= 0) {
          scene.remove(firstLabel);
          firstLabel = null;
        }
      }
      if (jumpChipTimer > 0) {
        jumpChipTimer -= dt;
        if (jumpChipTimer <= 0) {
          const el = hud?.querySelector('[data-k="jc"]');
          if (el) el.style.display = 'none';
        }
      }
      updateCamera(dt);
      // 하늘·해·그림자 카메라는 나를 따라다닌다
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      sun.position.copy(camera.position).addScaledVector(Ls, 7000);
      const focus = mode === 'intro' && camOverride ? camOverride.aim : P.pos;
      sunLight.target.position.set(focus.x, 0, focus.z);
      sunLight.position.copy(sunLight.target.position).addScaledVector(Ls, 80);
      updateLabels();
    },
  };
  function endPhotoQuiet() {
    if (photo.state !== 'idle') {
      photo.el?.remove();
      photo.el = null;
      photo.state = 'idle';
      photo.landed = false;
      for (const f of photo.from) f.b.script = null;
      for (const b of npcs) { b.pos.copy(b.home); b.ground = true; b.vy = 0; }
      mode = 'play';
      ctx.labels.style.display = '';
    }
  }
  return api;
}
