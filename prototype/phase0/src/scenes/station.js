import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStationInterior } from '../world/stationInterior.js';
import { createEarth, createMoon } from '../world/earth.js';
import { createStarfield, createSkyDome, createSun } from '../world/space.js';
import { createAstronaut, speechBubble } from '../world/astronaut.js';
import { consumeLook, input, moveIntent } from '../core/input.js';
import { h, I, project, coinsChip } from '../ui/dom.js';
import { BODIES } from '../data/planets.js';
import { mountSceneUi } from '../ui/sceneUi.js';
import { EMOTES, emoteFromKeys } from '../ui/emotes.js';
import { createDrink } from '../world/water.js';
import { mountSpots } from '../ui/spots.js';

// 장면 1 — 우주 정거장 중앙 광장: 거대한 지구 전망창
export function createStationScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 14000);
  const pm = new THREE.PMREMGenerator(ctx.renderer.renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;

  const sky = createSkyDome(9500);
  const stars = createStarfield(ctx.renderer.quality.stars, 9000, 3);
  scene.add(sky, stars);
  const L = new THREE.Vector3(1.0, 0.55, 0.06).normalize();
  const sun = createSun(320);
  scene.add(sun);

  const interior = createStationInterior();
  scene.add(interior.group);
  interior.sunLight.position.copy(L).multiplyScalar(22);
  interior.sunLight.castShadow = ctx.renderer.quality.shadows > 0;
  interior.sunLight.shadow.mapSize.set(ctx.renderer.quality.shadows || 512, ctx.renderer.quality.shadows || 512);

  // 지구: 반지름 1500, 거리 2400 (눈높이 기준 아래 30.7°) — 창 아래쪽을 둥근 지구가 가득 채우도록 배치
  const earth = createEarth(1500, { segments: 200, nightBoost: 1.9, atmStrength: 1.35 });
  const D = 2400, el = THREE.MathUtils.degToRad(30.7);
  earth.group.position.set(0, 2.3 - D * Math.sin(el), 8.5 - D * Math.cos(el));
  earth.face(124, 9, 0.05, -el);
  earth.setSun(L);
  scene.add(earth.group);
  const moon = createMoon(46);
  moon.position.set(-1700, 1250, -3200);
  scene.add(moon);
  const moonLight = new THREE.DirectionalLight('#ffffff', 0.0);
  scene.add(moonLight);

  // 아바타: 나 + 다른 이용자 3명
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name });
  me.root.position.set(0.3, 0, -1.2);
  me.root.rotation.y = Math.PI;
  scene.add(me.root);
  // 정거장 안은 궤도의 무중력 환경 — 물을 마시면 물이 공처럼 떠다닌다
  const drink = createDrink(scene, me, { quality: ctx.renderer.quality.msaa >= 4 ? 'high' : 'medium' });
  let emote = null, emoteT = 0;
  const npcs = [
    { o: { preset: 'lavender', skin: '#f6cba8', hair: '#2a2633', name: '별헤는밤' }, p: [-1.6, 0, -8.6], ry: Math.PI + 0.1, mode: 'idle', say: '지구 진짜 크다…!' },
    { o: { preset: 'coral', skin: '#e3ad86', hair: '#d9a05b', name: '코스모' }, p: [2.2, 0, -8.9], ry: Math.PI - 0.25, mode: 'idle' },
    { o: { preset: 'sky', skin: '#ffdcc6', hair: '#c47a8a', name: '루나' }, p: [-5.6, 0, 1.4], ry: -2.2, mode: 'walk', say: '같이 유영 갈래?' },
  ].map((n) => {
    const a = createAstronaut(n.o);
    a.root.position.set(...n.p);
    a.root.rotation.y = n.ry;
    a.state.mode = n.mode;
    scene.add(a.root);
    let bubble = null;
    if (n.say) {
      bubble = speechBubble(n.say);
      bubble.position.set(0, 2.05, 0);
      a.root.add(bubble);
    }
    return { a, n, bubble, chatT: 0 };
  });

  const cam = { yaw: 0.0, pitch: 0.12, dist: 6.0 };
  const target = new THREE.Vector3();
  let hud, spotUi = null, prompt, nearKey = null, toastTimer;
  const HS = interior.hotspots;
  const spots = [
    { key: 'window', pos: HS.window, label: '지구 전망창', cls: '', act: '지구 관측하기', r: 3.2 },
    { key: 'board', pos: HS.board, label: '미션 게시판', cls: 'lav', act: '미션 게시판 열기', r: 3.6 },
    { key: 'airlock', pos: HS.airlock, label: '우주 유영 출입구', cls: 'orange', act: '우주복 확인 후 유영하기', r: 3.8 },
    { key: 'observatory', pos: HS.observatory, label: '행성 관측실', cls: 'lav', act: '우주 탐험 떠나기', r: 3.8 },
    { key: 'gate', pos: HS.gate, label: '우주선 탑승장', cls: 'coral', act: '우주선 타기 (목적지 고르기)', r: 3.8 },
    { key: 'billboard', pos: HS.billboard, label: '전광판 · 공지/광고 구분', cls: 'coral', act: '전광판 자세히 보기', r: 3.6 },
  ];

  function buildHud() {
    const m = ctx.isMobile();
    hud = h(`<div>
      <div class="tl">
        <div class="glass chip"><span class="dot"></span>우주 정거장 · 중앙 광장 <small>채널 3 · 18/30명</small></div>
        <div class="glass chip"><span class="avatar-dot">나</span>${ctx.profile.name}${coinsChip(1240)}</div>
      </div>
      <div class="tr">
        <button class="icon-btn" title="미션">${I.mission}<span class="badge">3</span></button>
        <button class="icon-btn pc-only" title="탐험 도감">${I.book}</button>
        <button class="icon-btn" title="친구">${I.friends}<span class="badge">2</span></button>
        <button class="icon-btn pc-only" title="설정">${I.gear}</button>
        <button class="icon-btn mobile-only" title="더보기">${I.more}</button>
      </div>
      </div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">W</i><i class="kbd">A</i><i class="kbd">S</i><i class="kbd">D</i> 걷기</span>
        <span><i class="kbd">Shift</i> 달리기</span><span>마우스 드래그 시점</span><span>풍선 클릭 · <i class="kbd">E</i> 바로 가기·실행</span><span><i class="kbd">1</i>~<i class="kbd">8</i> 감정 표현</span><span><i class="kbd">M</i> 이동</span><span><i class="kbd">Enter</i> 채팅</span>
      </div></div>
      <div class="br pc-only"><div class="glass prompt" style="display:none"></div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    prompt = hud.querySelector('.prompt');
    mountSceneUi(ctx, hud, {
      here: 'station',
      room: 'station',
      chatTitle: '궤도 정거장 · 채널 3',
      seed: [
        { who: '안내', text: '전망창 앞 초록 원에 서면 지구를 관측할 수 있어요.', kind: 'sys' },
        { who: '별헤는밤', text: '지구 진짜 크다…!' },
        { who: '루나', text: '같이 유영 갈래? 에어록 앞에서 만나' },
      ],
      npcs: ['별헤는밤', '루나'],
      emote: (k) => pickEmote(k),
      canDrink: true,
      // 채팅 말풍선: 나 또는 같은 이름의 친구
      speaker: (m) => {
        if (m.kind === 'me') return me.root;
        const f = npcs.find((x) => x.n.o.name === m.who);
        if (!f) return null;
        f.chatT = Math.min(9, 4.2 + m.text.length * 0.09);
        return f.a.root;
      },
    });
    hud.querySelector('.icon-btn[title="미션"]').addEventListener('click', () => ctx.go('mission'));
    hud.querySelector('.icon-btn[title="탐험 도감"]').addEventListener('click', () => toast(foundText()));
    // 위치 풍선: 누르면 그 앞으로 바로 가서 실행
    spotUi = mountSpots(ctx, spots, (s) => goSpot(s));
    void m;
  }

  function toast(text) {
    const old = ctx.hud.querySelector('.toast');
    old?.remove();
    const t = h(`<div class="toast glass">${text}</div>`);
    ctx.hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3200);
  }

  function foundText() {
    const found = BODIES.filter((b) => ctx.progress?.discovered?.has(b.id));
    return `탐험 도감: ${found.map((b) => b.ko).join('·')} <b>${found.length}/${BODIES.length}</b> 발견 · 행성 관측실에서 우주 탐험을 떠나 더 찾아보세요`;
  }

  // 우주선 탑승장: 목적지 고르기 (달 착륙지 · 우주 탐험) — 공통 이동 메뉴 사용
  function openShipMenu() {
    ctx.travel('station', { kicker: '우주선 탑승장 · 어디로 갈까요?', title: '우주선 타고 출발', stay: '정거장에 더 있을래요', only: ['moon', 'space'] });
  }

  // 감정 표현 (정거장 안 = 헬멧 없음 → 물 마시기 가능, 무중력이라 물이 둥둥 뜸)
  function pickEmote(k) {
    const e = EMOTES.find((x) => x.k === k);
    if (!e) return;
    if (k === 'flip') { toast('공중제비는 달이나 라운지에서 해 보세요'); return; }
    vel.set(0, 0, 0);
    emote = k;
    emoteT = e.dur || 0;
    if (k === 'drink') {
      drink.start({ g: 0 });
      toast('💧 무중력이라 물이 표면장력으로 공처럼 뭉쳐 둥둥 떠요 · 아래로 쏟아지지 않아요');
    }
  }
  // 도착 위치: 에어록 복귀·다른 곳에서 이동해 오면 정해진 안전 지점에 서서 광장 쪽을 본다
  function placeAt(hs, inset) {
    const r = Math.hypot(hs.x, hs.z) || 1;
    const k = Math.max(0, r - inset) / r;
    me.root.position.set(hs.x * k, 0, hs.z * k);
    me.root.rotation.y = Math.atan2(-hs.x, -hs.z);
    vel.set(0, 0, 0);
    // 카메라는 아바타 뒤(벽 쪽)에 두되 방 안에 들어오도록 거리를 줄이고 살짝 위에서 내려다봄
    cam.yaw = Math.atan2(hs.x, hs.z);
    cam.pitch = 0.3;
    cam.dist = 4.4;
  }


  // 풍선을 누르면: 그 벽 앞 3 m(광장 쪽)에 서서 벽을 보고 바로 실행
  function goSpot(s) {
    const hs = s.pos;
    const p = me.root.position;
    if (Math.hypot(p.x - hs.x, p.z - hs.z) > s.r * 0.85) {
      const r = Math.hypot(hs.x, hs.z) || 1;
      const k = Math.max(0, r - 3.0) / r;
      p.set(hs.x * k, 0, hs.z * k);
      me.root.rotation.y = Math.atan2(hs.x, hs.z);
      vel.set(0, 0, 0);
      cam.yaw = Math.atan2(-hs.x, -hs.z);
      cam.pitch = 0.22;
    }
    emote = null;
    nearKey = s.key;
    interact(s.key);
  }
  function interact(key) {
    const k = key || nearKey || 'window';
    if (k === 'window') ctx.go('planet', { id: 'earth', from: 'station' });
    else if (k === 'board') ctx.go('mission');
    else if (k === 'airlock') ctx.go('eva');
    else if (k === 'observatory') ctx.go('space');
    else if (k === 'gate') openShipMenu();
    else toast('전광판: 운영 공지·우주 상식은 보라색, 승인된 광고는 점선 테두리 + "광고" 표시');
  }

  // 시안 점검용 훅 (자동 촬영 스크립트에서 사용)
  window.__station = {
    place: (x, z) => { me.root.position.set(x, me.root.position.y, z); },
    interact: () => interact(),
    goSpot: (key) => { const sp = spots.find((x) => x.key === key); if (sp) goSpot(sp); },
    near: () => nearKey,
    emote: (k) => pickEmote(k),
    cam: (y, p, d) => { cam.yaw = y; cam.pitch = p; if (d) cam.dist = d; },
    state: () => ({ pos: me.root.position.toArray().map((v) => +v.toFixed(2)), rotY: +me.root.rotation.y.toFixed(2), camYaw: +cam.yaw.toFixed(2), drops: drink.count }),
  };

  const vel = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function movePlayer(dt) {
    const mi = moveIntent();
    const sp = mi.boost ? 3.6 : 2.4;
    const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const want = tmp.set(0, 0, 0).addScaledVector(fwd, mi.y).addScaledVector(right, mi.x).multiplyScalar(sp);
    vel.lerp(want, 1 - Math.exp(-dt * 10));
    const p = me.root.position;
    p.addScaledVector(vel, dt);
    // 이동 가능 영역: 광장 원 안 + 전망창 턱 앞까지
    const r = Math.hypot(p.x, p.z);
    const th = Math.atan2(p.x, p.z);
    const inWindow = Math.abs(((th + Math.PI * 2) % (Math.PI * 2)) - Math.PI) < 1.3;
    const lim = inWindow ? interior.radius - 1.75 : interior.radius - 1.3;
    if (r > lim) p.multiplyScalar(lim / r);
    const spd = Math.hypot(vel.x, vel.z);
    if (spd > 0.15) {
      const ang = Math.atan2(vel.x, vel.z);
      let d = ang - me.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.root.rotation.y += d * Math.min(1, dt * 10);
      me.state.mode = 'walk';
      me.state.speed = spd;
    } else me.state.mode = 'idle';
  }

  return {
    id: 'station',
    scene,
    camera,
    renderOpts: { exposure: 0.92, bloomStrength: 0.32, bloomThreshold: 1.05, bloomRadius: 0.45 },
    enter(p = {}) {
      me.applyProfile(ctx.profile);
      drink.stop();
      emote = null;
      if (p.id === 'airlock') placeAt(HS.airlock, 5.6);
      else if (p.id === 'safe' || p.id === 'gate') placeAt(HS.gate, 5.6);
      buildHud();
      if (p.id === 'airlock') toast('정거장 복귀 완료 — 에어록 앞 안전 구역이에요');
      else if (p.id === 'safe' || p.id === 'gate') toast('궤도 정거장 도착 — 우주선 탑승장 앞이에요');
    },
    exit() {},
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 64 : 52;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const look = consumeLook();
      cam.yaw -= look.dx * 0.005;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + look.dy * 0.004, -0.05, 0.75);
      cam.dist = THREE.MathUtils.clamp(cam.dist + look.zoom * 0.6, 3.2, 11);
      movePlayer(dt);
      const picked = emoteFromKeys(input.pressed);
      if (picked) pickEmote(picked);
      if (emote) {
        if (vel.lengthSq() > 0.04) emote = null;
        else {
          me.state.mode = emote;
          if (emoteT > 0 && (emoteT -= dt) <= 0) emote = null;
        }
      }
      if (drink.active && emote !== 'drink') drink.cancel();
      me.update(dt, t);
      drink.update(dt, t);
      for (const { a, n } of npcs) {
        if (n.mode === 'walk') {
          const ang = t * 0.25;
          a.root.position.set(-5.2 + Math.cos(ang) * 1.6, 0, 1.0 + Math.sin(ang) * 1.6);
          a.root.rotation.y = -ang + Math.PI;
          a.state.speed = 0.4;
        }
        a.update(dt, t);
      }
      const isM = ctx.isMobile();
      target.copy(me.root.position).add(new THREE.Vector3(0, 1.45, 0));
      const d = cam.dist * (isM ? 1.25 : 1);
      camera.position.set(
        target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * d,
        target.y + Math.sin(cam.pitch) * d,
        target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * d,
      );
      camera.lookAt(target.x - Math.sin(cam.yaw) * 2, target.y + 0.9, target.z - Math.cos(cam.yaw) * 2);
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      sun.position.copy(camera.position).addScaledVector(L, 7000);
      earth.update(dt);
      earth.mesh.rotation.y += dt * 0.0004;

      // 위치 풍선 + 근접 안내
      nearKey = spotUi ? spotUi.layout(camera, me.root.position, { max: 40, minY: 50, farAt: 9 }) : null;
      if (prompt) {
        const s = spots.find((x) => x.key === nearKey);
        prompt.style.display = s ? 'block' : 'none';
        if (s) prompt.innerHTML = `<i class="kbd">E</i> ${s.act} <span style="opacity:.55;font-weight:600">· 풍선을 눌러도 돼요</span>`;
      }
      for (const f of npcs) {
        f.chatT = Math.max(0, f.chatT - dt);
        if (f.bubble) f.bubble.visible = f.chatT <= 0;
      }
      if (input.pressed.has('e') && nearKey) interact();
    },
  };
}
