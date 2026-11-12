import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStationInterior } from '../world/stationInterior.js';
import { createEarth, createMoon } from '../world/earth.js';
import { createStarfield, createSkyDome, createSun } from '../world/space.js';
import { createAstronaut, speechBubble } from '../world/astronaut.js';
import { consumeLook, input, moveIntent } from '../core/input.js';
import { h, I, project, coinsChip } from '../ui/dom.js';
import { BODIES } from '../data/planets.js';

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
    if (n.say) {
      const b = speechBubble(n.say);
      b.position.set(0, 2.05, 0);
      a.root.add(b);
    }
    return { a, n };
  });

  const cam = { yaw: 0.0, pitch: 0.12, dist: 6.0 };
  const target = new THREE.Vector3();
  let hud, labels = [], prompt, nearKey = null, toastTimer;
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
      <div class="bl pc-only">
        <div class="glass chat">
          <div class="msg sys"><b>안내</b>전망창 앞 초록 원에 서면 지구를 관측할 수 있어요.</div>
          <div class="msg"><b>별헤는밤</b>지구 진짜 크다…!</div>
          <div class="msg"><b>루나</b>같이 유영 갈래? 에어록 앞에서 만나</div>
          <div class="msg me"><b>${ctx.profile.name}</b>좋아! 금방 갈게</div>
          <div class="input">${I.chat}<span>Enter로 채팅 · 비회원은 빠른 채팅만</span></div>
        </div>
      </div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">W</i><i class="kbd">A</i><i class="kbd">S</i><i class="kbd">D</i> 걷기</span>
        <span><i class="kbd">Shift</i> 달리기</span><span>마우스 드래그 시점</span><span><i class="kbd">E</i> 상호작용</span>
      </div></div>
      <div class="joy mobile-only"><div class="joy-knob"></div></div>
      <div class="act mobile-only">
        <button class="round" data-k="chat">${I.chat}</button>
        <button class="round big" data-k="act">${I.hand}<span class="sub">관측</span></button>
      </div>
      <div class="br pc-only"><div class="glass prompt" style="display:none"></div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    prompt = hud.querySelector('.prompt');
    ctx.mountJoystick(hud.querySelector('.joy'));
    hud.querySelector('[data-k="act"]').addEventListener('click', () => interact());
    hud.querySelector('.icon-btn[title="미션"]').addEventListener('click', () => ctx.go('mission'));
    hud.querySelector('.icon-btn[title="탐험 도감"]').addEventListener('click', () => toast(foundText()));
    labels = spots.map((s) => {
      const el = h(`<div class="pill-label ${s.cls}"><i></i>${s.label}</div>`);
      ctx.labels.appendChild(el);
      return el;
    });
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

  // 우주선 탑승장: 목적지 고르기 (달 착륙지 · 우주 탐험)
  function openShipMenu() {
    ctx.hud.querySelector('.ship-menu')?.remove();
    const el = h(`<div class="modal-wrap ship-menu"><div class="modal">
      <div class="kicker">우주선 탑승장 · 어디로 갈까요?</div>
      <h3>우주선 타고 출발</h3>
      <div class="dest">
        <button data-k="moon"><b>🌙 달 착륙지</b><span>친구들이 모인 달 언덕 · 라운지 · 월면차</span></button>
        <button data-k="space"><b>🔭 우주 탐험</b><span>직접 우주선을 몰고 날아가 행성을 발견해요</span></button>
      </div>
      <div class="row-btn"><button class="btn ghost" data-k="close" style="color:#141b3d;background:#f2f3fb">정거장에 더 있을래요</button></div>
    </div></div>`);
    ctx.hud.appendChild(el);
    el.querySelector('[data-k="moon"]').addEventListener('click', () => ctx.go('moon', { id: 'free' }));
    el.querySelector('[data-k="space"]').addEventListener('click', () => ctx.go('space'));
    el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
  }

  function interact() {
    const k = nearKey || 'window';
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
    near: () => nearKey,
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
    enter() {
      me.setPreset(ctx.profile.preset);
      buildHud();
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
      me.update(dt, t);
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

      // 상호작용 지점 라벨 + 근접 안내
      const { w, hgt } = ctx.size();
      nearKey = null;
      let best = 1e9;
      spots.forEach((s, i) => {
        const pr = project(s.pos, camera, w, hgt);
        const el = labels[i];
        const dist = s.pos.distanceTo(me.root.position.clone().setY(s.pos.y));
        el.style.display = pr.behind || pr.x < -50 || pr.x > w + 50 ? 'none' : 'flex';
        el.style.left = `${pr.x}px`;
        el.style.top = `${pr.y}px`;
        el.style.opacity = dist < 16 ? '1' : '0.75';
        if (dist < s.r && dist < best) {
          best = dist;
          nearKey = s.key;
        }
      });
      if (prompt) {
        const s = spots.find((x) => x.key === nearKey);
        prompt.style.display = s ? 'block' : 'none';
        if (s) prompt.innerHTML = `<i class="kbd">E</i> ${s.act}`;
      }
      const sub = hud?.querySelector('[data-k="act"] .sub');
      if (sub) sub.textContent = nearKey ? spots.find((x) => x.key === nearKey).act.split(' ')[0] : '관측';
      if (input.pressed.has('e') && nearKey) interact();
    },
  };
}
