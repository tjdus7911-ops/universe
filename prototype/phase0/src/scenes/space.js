import * as THREE from 'three';
import { createSkyDome, createStarfield } from '../world/space.js';
import { createPlanet } from '../world/planets.js';
import { createAstronaut } from '../world/astronaut.js';
import { consumeLook, input } from '../core/input.js';
import { createZeroG, createJetTrail } from '../core/zeroG.js';
import { mountSceneUi } from '../ui/sceneUi.js';
import { createCrowd } from '../net/crowd.js';
import { h, I, project } from '../ui/dom.js';
import { byId } from '../data/planets.js';

// 장면 — 우주 탐험: 내 아바타(우주복)로 날아다니다가 가까이 가면 천체를 '발견'하고, 누르면 정보를 본다.
// 이동은 게임형 무중력(core/zeroG.js): Space 상승·놓으면 그 높이에 떠 있기·C 하강·높이 제한·360° 회전
// 교육용 축척: 크기와 거리를 크게 줄였다 (화면에 항상 표시)
const SYSTEM = [
  { id: 'sun', r: 70, d: 0, a: 0, y: 0 },
  { id: 'mercury', r: 5, d: 250, a: 20, y: 8 },
  { id: 'venus', r: 9, d: 370, a: 128, y: -12 },
  { id: 'earth', r: 10, d: 510, a: 222, y: 0 },
  { id: 'mars', r: 6.5, d: 660, a: 288, y: 14 },
  { id: 'jupiter', r: 42, d: 1020, a: 348, y: -20 },
  { id: 'saturn', r: 35, d: 1380, a: 62, y: 16 },
  { id: 'uranus', r: 22, d: 1680, a: 158, y: -10 },
  { id: 'neptune', r: 21, d: 1980, a: 252, y: 12 },
];
const CRUISE = 45, BOOST = 170, BAND = 220, SCALE = 2.4;

export function createSpaceScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 30000);
  const sky = createSkyDome(9000, 0.9);
  const stars = createStarfield(Math.round(ctx.renderer.quality.stars * 1.4), 8500, 41);
  scene.add(sky, stars);
  scene.add(new THREE.AmbientLight('#8090c0', 0.3));
  // 카메라 쪽에서 비추는 약한 보조광 (그늘진 우주선이 새까맣게 보이지 않게)
  const fill = new THREE.DirectionalLight('#c9d6ff', 0.7);
  scene.add(fill, fill.target);
  const sunLight = new THREE.PointLight('#fff1dc', 3.2, 0, 0);
  scene.add(sunLight);
  const progress = ctx.progress;

  // 천체 배치
  const bodies = SYSTEM.map((s) => {
    const p = createPlanet(s.id, s.r, { spin: s.id === 'sun' ? 0.02 : 0.08, segments: s.r > 20 ? 96 : 64 });
    const a = THREE.MathUtils.degToRad(s.a);
    p.group.position.set(Math.cos(a) * s.d, s.y, Math.sin(a) * s.d);
    scene.add(p.group);
    return { ...s, p, pos: p.group.position };
  });
  const sunB = bodies[0];
  // 태양 코로나
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(2.2, 1.5, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,220,150,0.9)');
    gr.addColorStop(0.35, 'rgba(255,170,80,0.25)');
    gr.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })() }));
  corona.scale.setScalar(360);
  scene.add(corona);
  // 달: 지구 곁
  const earthB = bodies.find((b) => b.id === 'earth');
  const moon = createPlanet('moon', 3, { spin: 0.05, segments: 40 });
  moon.group.position.copy(earthB.pos).add(new THREE.Vector3(30, 4, -12));
  scene.add(moon.group);
  const all = [...bodies, { id: 'moon', r: 3, p: moon, pos: moon.group.position }];
  // 궤도선 (희미하게, 길 찾기용)
  for (const b of bodies.slice(1)) {
    const pts = Array.from({ length: 220 }, (_, k) => new THREE.Vector3(Math.cos((k / 220) * Math.PI * 2) * b.d, b.y * 0.5, Math.sin((k / 220) * Math.PI * 2) * b.d));
    scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#b9a6ff', transparent: true, opacity: 0.12 })));
  }
  // 소행성대
  {
    const n = 3200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 800 + Math.random() * 90;
      pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 30, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#a69d92', size: 1.4, transparent: true, opacity: 0.85 })));
  }

  // 내 아바타 (우주복 + 헬멧) — 교육용 축척에 맞춰 크게 보이게 키움
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name, helmet: true });
  me.setHelmet(true);
  me.root.scale.setScalar(SCALE);
  me.state.mode = 'float';
  // 실시간 접속자 (같은 우주 탐험 구역)
  const crowd = createCrowd(scene, { helmet: true, scale: SCALE, teleport: 60 });
  scene.add(me.root);
  const jets = createJetTrail(scene, { n: 220, size: 120, life: 1.4 });
  const zg = createZeroG({ speed: CRUISE, boostMul: BOOST / CRUISE, rise: 28, accel: 0.55, damp: 0.6, minY: -BAND, maxY: BAND, soft: 30, lean: 0.35, camDist: 12, zoomStep: 1.4 });
  const S = zg.s;
  function placeStart() {
    const p = earthB.pos.clone().add(new THREE.Vector3(-26, 8, 46));
    zg.place(p, Math.atan2(earthB.pos.x - p.x, earthB.pos.z - p.z));
  }
  placeStart();

  // HUD
  let hud = null, labels = [], arrow = null, toastTimer = 0, beltWarned = false, hotWarned = false, nearOpen = null;
  const clickRay = new THREE.Raycaster();
  function toast(html, ms = 3600) {
    ctx.hud.querySelector('.toast')?.remove();
    const t = h(`<div class="toast glass">${html}</div>`);
    ctx.hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }
  const countText = () => `발견 ${all.filter((b) => progress.discovered.has(b.id)).length}/${all.length}`;
  function buildHud() {
    hud = h(`<div>
      <div class="tl">
        <div class="glass chip"><span class="dot" style="background:var(--lavender);box-shadow:0 0 10px var(--lavender)"></span>우주 탐험 · ${ctx.profile.name} <small data-k="online">혼자 모드</small></div>
        <button class="glass chip found" data-k="found">${I.book}<b data-k="cnt">${countText()}</b></button>
      </div>
      <div class="tc"><div class="scale-badge">교육용 축척 — 실제 거리·크기와 많이 달라요</div></div>
      <div class="tr">
        <button class="btn return" data-k="station">${I.home}<b>정거장 복귀</b></button>
        <button class="btn return pc-only" data-k="moon"><b>🌙 달</b></button>
      </div>
      <div class="br pc-only"><div class="glass stat-col">
        <div class="r"><span>속도</span><b data-k="spd">0</b></div>
        <div class="r"><span>가장 가까운 천체</span><b data-k="near">-</b></div>
        <div class="r"><span>높이</span><b data-k="alt-t">0</b></div>
      </div></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">W</i><i class="kbd">A</i><i class="kbd">S</i><i class="kbd">D</i> 이동</span>
        <span><i class="kbd">Space</i> 상승 (놓으면 그 높이에 떠 있음) · <i class="kbd">C</i> 하강</span>
        <span>드래그 · <i class="kbd">←</i><i class="kbd">↑</i><i class="kbd">↓</i><i class="kbd">→</i> 360° 회전</span><span><i class="kbd">X</i> 수평</span><span><i class="kbd">Shift</i> 부스트</span><span>발견한 천체 클릭 · <i class="kbd">E</i> 정보</span>
      </div></div>
      <div class="alt-gauge" data-k="alt"><b>최대 높이</b><i></i><span>최저</span></div>
    </div>`);
    ctx.hud.appendChild(hud);
    mountSceneUi(ctx, hud, {
      here: 'space',
      room: 'space',
      chatTitle: '우주 탐험',
      seed: [{ who: '안내', text: '가까이 날아가면 천체가 발견돼요. 화면 가장자리 화살표가 미확인 신호!', kind: 'sys' }],
      npcs: [],
      main: { k: 'up', icon: I.up, label: '상승', hold: 'up' },
      extra: [
        { k: 'down', icon: I.down, label: '하강', hold: 'down' },
        { k: 'boostb', icon: I.boost, label: '부스트', hold: 'boost' },
        { k: 'level', icon: I.level, label: '수평', onTap: () => zg.level() },
      ],
      aux: [{ k: 'found', icon: I.book, label: '도감', onTap: () => openFound() }],
      speaker: (m) => (m.kind === 'me' ? { root: me.root, y: 1.98 } : m.peer ? { root: crowd.anchorOf(m.peer), y: 1.98 } : null),
    });
    const back = hud.querySelector('[data-k="station"]');
    back.addEventListener('click', () => {
      // 정거장 복귀: 중간 화면 없이 바로, 두 번 눌러도 한 번만
      if (back.disabled) return;
      back.disabled = true;
      ctx.go('station', { id: 'safe' });
    });
    hud.querySelector('[data-k="moon"]').addEventListener('click', () => ctx.go('moon', { id: 'free' }));
    hud.querySelector('[data-k="found"]').addEventListener('click', () => openFound());
    arrow = h('<div class="signal-edge" style="display:none"><i></i><span>미확인 신호</span></div>');
    ctx.hud.appendChild(arrow);
    labels = all.map((b) => {
      const el = h(`<div class="pill-label planet-pill" style="display:none;pointer-events:auto;cursor:pointer"><i></i>${byId[b.id].ko}</div>`);
      el.addEventListener('click', () => openInfo(b.id));
      ctx.labels.appendChild(el);
      return el;
    });
  }
  function openInfo(id) {
    if (!progress.discovered.has(id)) return;
    ctx.go('planet', { id, from: 'space' });
  }
  function openFound() {
    ctx.hud.querySelector('.found-panel')?.remove();
    const el = h(`<div class="glass found-panel">
      <div class="t">탐험 도감 · ${countText()}</div>
      <div class="grid">${all.map((b) => {
        const ok = progress.discovered.has(b.id);
        return `<button data-id="${b.id}" ${ok ? '' : 'disabled'}><i class="${ok ? '' : 'q'}">${ok ? '' : '?'}</i>${ok ? byId[b.id].ko : '미발견'}</button>`;
      }).join('')}</div>
      <div class="note">가까이 날아가면 발견돼요. 발견한 천체를 누르면 정보 카드가 열려요.</div>
      <button class="btn ghost" data-k="close">닫기</button>
    </div>`);
    ctx.hud.appendChild(el);
    el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => openInfo(b.dataset.id)));
    el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
  }
  function discover(b) {
    progress.discovered.add(b.id);
    ctx.persist();
    const cnt = hud?.querySelector('[data-k="cnt"]');
    if (cnt) cnt.textContent = countText();
    toast(`🔭 새 천체 발견! <b>${byId[b.id].ko}</b> — 눌러서 정보 보기`, 4200);
  }
  // 클릭(드래그 아님)으로 행성 선택
  let downAt = null;
  ctx.renderer.renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  ctx.renderer.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!active || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    const r = e.target.getBoundingClientRect();
    clickRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = clickRay.intersectObjects(all.map((b) => b.p.group), true)[0];
    if (!hit) return;
    const b = all.find((x) => { let o = hit.object; while (o) { if (o === x.p.group) return true; o = o.parent; } return false; });
    if (b && progress.discovered.has(b.id)) openInfo(b.id);
    else if (b) toast('아직 발견하지 못한 천체예요 — 더 가까이 날아가 보세요');
  });
  let active = false;

  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const api = {
    id: 'space',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.55, bloomThreshold: 0.9, bloomRadius: 0.5 },
    enter(p = {}) {
      active = true;
      me.applyProfile(ctx.profile);
      if (p.near && all.some((x) => x.id === p.near)) {
        S.started = true;
        const b = all.find((x) => x.id === p.near);
        const q = b.pos.clone().add(new THREE.Vector3(b.r * 1.6 + 18, b.r * 0.5 + 4, b.r * 1.6 + 18));
        zg.place(q, Math.atan2(b.pos.x - q.x, b.pos.z - q.z) - 0.35);
      } else if (p.id === 'start' || !S.started) {
        S.started = true;
        placeStart();
      }
      buildHud();
      window.__space = {
        near: (bid) => { const b = all.find((x) => x.id === bid); const q = b.pos.clone().add(new THREE.Vector3(b.r * 1.6 + 18, b.r * 0.5 + 4, b.r * 1.6 + 18)); zg.place(q, Math.atan2(b.pos.x - q.x, b.pos.z - q.z) - 0.35); },
        state: () => ({ pos: S.pos.toArray().map((v) => +v.toFixed(2)), vel: +S.vel.length().toFixed(2), capped: S.capped, q: S.quat.toArray().map((v) => +v.toFixed(3)) }),
        rot: (yaw, pitch) => { zg.s.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))); },
        found: () => openFound(),
        fly: (x, z) => { S.vel.set(x, 0, z); },
        y: (v) => { S.pos.y = v; },
      };
      toast(S.welcomed ? '탐험을 계속해요 · 화면 가장자리 화살표가 미확인 신호예요' : '지구 곁에서 출발! 화면 가장자리의 <b>신호 화살표</b>를 따라가면 새 천체를 발견할 수 있어요', 4800);
      S.welcomed = true;
    },
    exit() {
      active = false;
      clearTimeout(toastTimer);
      crowd.clear();
    },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 68 : 55;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const look = consumeLook();
      zg.update(dt, look);
      // 천체와 부딪히지 않기 + 태양 너무 가까이 가지 않기
      let nearest = null, nd = 1e9;
      for (const b of all) {
        const d = S.pos.distanceTo(b.pos);
        const minD = b.id === 'sun' ? b.r * 1.9 : b.r * 1.35 + 3;
        if (d < minD) {
          S.pos.copy(b.pos).addScaledVector(tmp.copy(S.pos).sub(b.pos).normalize(), minD);
          if (b.id === 'sun' && !hotWarned) {
            hotWarned = true;
            toast('앗 뜨거워! 태양 표면은 약 5,500 °C예요 — 더 가까이 갈 수 없어요');
          }
        }
        const surf = d - b.r;
        if (surf < nd) { nd = surf; nearest = b; }
        if (!progress.discovered.has(b.id) && surf < b.r * 3 + 45) discover(b);
      }
      const rr = Math.hypot(S.pos.x, S.pos.z);
      if (rr > 790 && rr < 900 && Math.abs(S.pos.y) < 30 && !beltWarned) {
        beltWarned = true;
        toast('소행성대 통과 중! 실제 소행성대는 소행성 사이가 아주 멀어서 이렇게 빽빽하지 않아요 <span style="opacity:.6">(게임 연출)</span>', 5200);
      }
      if (rr > 2300) { S.pos.x *= 2300 / rr; S.pos.z *= 2300 / rr; }
      const sp = S.vel.length();
      me.root.position.copy(S.pos);
      me.root.quaternion.copy(S.view);
      me.state.mode = 'float';
      me.state.thrust = S.thrust;
      me.update(dt, t);
      ctx.multi.tick({ p: S.pos.toArray(), h: 0, q: me.root.quaternion.toArray(), m: 'float' });
      crowd.sync(ctx.multi.list(), dt, t);
      if (S.thrust > 0.05) jets.emit(me.nozzles, tmp.copy(S.want).normalize(), S.vel, S.thrust, SCALE * 2.2);
      jets.update(dt);
      // 3인칭 추적 카메라 (아바타를 따라 회전, 뒤집혀도 튀지 않음)
      zg.camera(camera, dt, { height: 2.6, lookUp: 1.9, zoom: look.zoom, min: 7, max: 40 });
      fill.position.copy(camera.position);
      fill.target.position.copy(S.pos);
      // 높이 게이지 + 최대 높이 안내
      const g = hud?.querySelector('[data-k="alt"]');
      if (g) {
        g.querySelector('i').style.bottom = `${(((S.pos.y + BAND) / (2 * BAND)) * 100).toFixed(1)}%`;
        g.classList.toggle('max', S.capped !== 0);
      }
      const at = hud?.querySelector('[data-k="alt-t"]');
      if (at) at.textContent = `${S.pos.y.toFixed(0)} / ±${BAND}`;
      if (S.capped && t - (S.capWarn || 0) > 4) {
        S.capWarn = t;
        toast(S.capped > 0 ? '최대 높이예요 — 더 올라갈 수 없어요 (교육용 탐험 구역)' : '가장 낮은 높이예요 — 더 내려갈 수 없어요');
      }
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      for (const b of all) b.p.update(dt, t, sunB.pos);
      // HUD: 이름표(발견한 것만) · 신호 화살표(가장 가까운 미발견)
      const { w, hgt } = ctx.size();
      nearOpen = null;
      all.forEach((b, i) => {
        const el = labels[i];
        if (!el) return;
        const ok = progress.discovered.has(b.id);
        const pr = project(tmp.copy(b.pos).add(new THREE.Vector3(0, b.r * 1.15 + 2, 0)), camera, w, hgt);
        const dist = S.pos.distanceTo(b.pos) - b.r;
        const vis = ok && !pr.behind && pr.x > -40 && pr.x < w + 40 && pr.y > 40 && pr.y < hgt + 40 && dist < 1400;
        el.style.display = vis ? 'flex' : 'none';
        if (vis) {
          el.style.left = `${pr.x}px`;
          el.style.top = `${pr.y}px`;
          el.style.opacity = dist < 400 ? '1' : '0.7';
        }
        if (ok && dist < b.r * 2 + 40 && (!nearOpen || dist < nearOpen.dist)) nearOpen = { id: b.id, dist };
      });
      if (nearOpen && input.pressed.has('e')) openInfo(nearOpen.id);
      let target = null, td = 1e9;
      for (const b of all) {
        if (progress.discovered.has(b.id)) continue;
        const dd = S.pos.distanceTo(b.pos);
        if (dd < td) { td = dd; target = b; }
      }
      if (arrow) {
        if (target) {
          const v = tmp.copy(target.pos).project(camera);
          const behind = v.z > 1;
          let x = v.x, y = v.y;
          if (behind) { x = -x; y = -y; }
          const onScreen = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.8;
          const ang = Math.atan2(-y, x);
          const k = Math.min(0.86 / Math.max(Math.abs(Math.cos(ang)), 1e-3), 0.8 / Math.max(Math.abs(Math.sin(ang)), 1e-3));
          const ex = onScreen ? x : Math.cos(ang) * k, ey = onScreen ? -y : Math.sin(ang) * k;
          arrow.style.display = 'flex';
          arrow.style.left = `${(ex * 0.5 + 0.5) * w}px`;
          arrow.style.top = `${(ey * 0.5 + 0.5) * hgt}px`;
          arrow.querySelector('i').style.transform = `rotate(${onScreen ? 90 : (ang * 180) / Math.PI + 90}deg)`;
          const bars = td < 300 ? '▂▄▆█' : td < 700 ? '▂▄▆' : td < 1200 ? '▂▄' : '▂';
          arrow.querySelector('span').textContent = `미확인 신호 ${bars}`;
        } else {
          arrow.style.display = 'flex';
          arrow.style.left = `${w / 2}px`;
          arrow.style.top = `${hgt * 0.2}px`;
          arrow.querySelector('span').textContent = '모든 천체를 발견했어요!';
        }
      }
      const spd = hud?.querySelector('[data-k="spd"]');
      if (spd) spd.textContent = `${sp.toFixed(0)} (교육용 단위)`;
      const ne = hud?.querySelector('[data-k="near"]');
      if (ne && nearest) ne.textContent = progress.discovered.has(nearest.id) ? byId[nearest.id].ko : '미확인 천체';
    },
  };
  return api;
}
