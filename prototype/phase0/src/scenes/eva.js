import * as THREE from 'three';
import { createEarth, createMoon } from '../world/earth.js';
import { createLensflare, createSkyDome, createStarfield, createSun } from '../world/space.js';
import { createAstronaut, makeSpaceEnv } from '../world/astronaut.js';
import { addHighlight, createDebris, createSatellite, createStationExterior, DEBRIS_KINDS } from '../world/stationExterior.js';
import { consumeLook, input, moveIntent } from '../core/input.js';
import { h, I, project } from '../ui/dom.js';
import { createZeroG } from '../core/zeroG.js';
import { mountSceneUi } from '../ui/sceneUi.js';
import { createCrowd } from '../net/crowd.js';

// 장면 2 — 우주 유영 (자유 유영) / 장면 3 — 우주 쓰레기 수거 미션 (같은 우주 공간, 모드만 다름)
let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
const P = { max: 3.0, boostMax: 6.0, acc: 4.0, boostAcc: 8.0, damp: 0.6, soft: 60, hard: 80, reach: 3.0, hold: 1.2, band: 22 };

export function createEvaScene(ctx, opts = {}) {
  const mission = !!opts.mission;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20000);
  const L = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
  scene.environment = makeSpaceEnv(ctx.renderer.renderer, L);
  scene.environmentIntensity = 0.5;

  const sky = createSkyDome(12000, 1.1);
  const stars = createStarfield(ctx.renderer.quality.stars, 11500, 9);
  scene.add(sky, stars);
  const sun = createSun(420);
  sun.add(createLensflare());
  scene.add(sun);

  // 지구: 반지름 3000, 정거장 바로 아래 (고도 ≈ 반지름의 11%) — 어느 쪽을 봐도 아래쪽에 둥근 지평선이 보임
  const earth = createEarth(3000, { segments: 256, nightBoost: 2.0, atmStrength: 1.3, atmIn: 0.35 });
  earth.group.position.set(0, -3330, 0);
  earth.face(122, 26, 0, 0);
  earth.group.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  earth.setSun(L);
  scene.add(earth.group);
  const moon = createMoon(90);
  moon.position.set(-2600, 1500, -5200);
  scene.add(moon);

  const sunLight = new THREE.DirectionalLight('#fff4e6', 2.6);
  sunLight.position.copy(L).multiplyScalar(50);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight('#1b2650', '#3d78c9', 0.55));

  const station = createStationExterior();
  scene.add(station.group);
  const sats = [createSatellite(1), createSatellite(2)];
  sats[0].position.set(-34, 14, -12);
  sats[1].position.set(46, -9, 36);
  sats[1].scale.setScalar(0.8);
  scene.add(...sats);
  // 멀리 떠다니는 장식용 쓰레기 (수거 대상 아님)
  const decor = [];
  [['scrap', -40, 8, 30], ['fragment', 35, 12, -20], ['rocket', -28, -14, 48], ['equipment', 52, 6, 8], ['scrap', 18, -18, 60], ['fragment', -60, 20, 10]].forEach(([k, x, y, z], i) => {
    const d = createDebris(k, i + 7);
    d.position.set(x, y, z);
    d.userData.spin = new THREE.Vector3(0.1 + i * 0.03, 0.2, 0.05);
    decor.push(d);
    scene.add(d);
  });

  // 미션 목표물 5개
  const targets = [];
  if (mission) {
    [['fragment', -6.5, 4.0, 18.0], ['rocket', 4.0, -4.0, 22.0], ['scrap', -4.0, -2.5, 10.0], ['equipment', 9.0, 5.5, 18.0], ['fragment', -1.0, 7.5, 26.0]].forEach(([k, x, y, z], i) => {
      const d = createDebris(k, i + 1);
      d.position.set(x, y, z);
      d.userData.spin = new THREE.Vector3(0.15, 0.25 + i * 0.05, 0.08);
      addHighlight(d);
      const glowSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#6ff0d2', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      glowSp.scale.setScalar(3.2);
      d.add(glowSp);
      scene.add(d);
      targets.push({ obj: d, kind: k, done: false, collecting: 0, el: null });
    });
  }

  // 플레이어
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair, name: ctx.profile.name, helmet: true });
  me.setHelmet(true);
  me.state.mode = 'float';
  const crowd = createCrowd(scene, { helmet: true, teleport: 10 });
  const start = mission ? new THREE.Vector3(5.0, 4.5, 25.5) : new THREE.Vector3(13.0, 5.0, 21.0);
  me.root.position.copy(start);
  scene.add(me.root);

  // 추진기 입자
  const N = 260;
  const pPos = new Float32Array(N * 3), pVel = new Float32Array(N * 3), pLife = new Float32Array(N);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('life', new THREE.BufferAttribute(pLife, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { pr: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: 'attribute float life; varying float vL; uniform float pr; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (40.0 * life + 6.0) * pr / -mv.z; }',
    fragmentShader: 'varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vL; gl_FragColor = vec4(mix(vec3(0.45,0.95,0.85), vec3(1.0), vL) * a * 2.2, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  scene.add(particles);
  let pIdx = 0;

  // 안전 경계 표시 (60 m부터)
  const fence = new THREE.Mesh(new THREE.SphereGeometry(P.soft, 48, 24), new THREE.MeshBasicMaterial({ color: '#ffa64d', wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
  fence.position.copy(station.airlockPos);
  scene.add(fence);

  // 무중력 조작: 누르면 상승 · 놓으면 그 높이에 떠 있기 · 높이 제한 · 360° 회전 (core/zeroG.js)
  const zg = createZeroG({ speed: P.max, boostMul: P.boostMax / P.max, rise: 2.2, accel: 0.45, damp: 0.55, minY: station.airlockPos.y - P.band, maxY: station.airlockPos.y + P.band, soft: 3, camDist: 4.4 });
  const faceYaw = (from) => Math.atan2(station.airlockPos.x - from.x, station.airlockPos.z - from.z);
  zg.place(start, faceYaw(start));
  const vel = zg.s.vel;
  const st = { boost: 1, boostCool: 0, leaving: false, offscreen: 0, collected: 0, time: 300, done: false, hold: 0, active: null, guide: true, capWarn: 0 };
  let hud, toastTimer, ui = null;
  // 정거장 복귀: 중간 비행 없이 바로 에어록 안 안전 지점으로 (중복 클릭 방지)
  function goBack() {
    if (st.leaving) return;
    st.leaving = true;
    hud?.querySelector('[data-k="ret"]')?.setAttribute('disabled', '');
    ctx.go('station', { id: 'airlock' });
  }

  function buildHud() {
    hud = h(`<div>
      <div class="tl">
        ${mission ? `<div class="glass mission">
            <div class="t">미션 · 궤도 청소 작전</div>
            <div class="h">인공위성 파편 수거 <span data-k="cnt">0</span>/5</div>
            <div class="prog">${'<i></i>'.repeat(5)}</div>
            <div class="meta"><span>남은 시간 <b data-k="time">05:00</b></span><span>보상 ⭐30 · 서버 확인 후 지급</span></div>
          </div>` : `<div class="glass chip"><span class="dot" style="background:var(--orange);box-shadow:0 0 10px var(--orange)"></span>정거장 외부 · 우주 유영 구역 <small data-k="online">혼자 모드</small></div>`}
        <div class="glass stat-col">
          <div class="r"><span>추진제(부스트)</span><div class="meter"><i data-k="boost" style="width:100%"></i></div></div>
          <div class="r"><span>정거장까지</span><b data-k="dist">0 m</b></div>
          <div class="r"><span>속도</span><b data-k="spd">0.0 m/s</b></div>
        </div>
      </div>
      <div class="tr">
        <button class="btn return" data-k="ret">${I.home}<b>정거장 복귀</b><span class="pc-only" style="opacity:.6;font-weight:600">R</span></button>
      </div>
      <div class="glass toast" data-k="guide">관성 보조 켜짐 — 실제 우주에서는 손을 놓아도 저절로 멈추지 않아요 <span style="opacity:.6">(게임 연출)</span></div>
      <div class="bc pc-only"><div class="glass hint">
        <span><i class="kbd">W</i><i class="kbd">A</i><i class="kbd">S</i><i class="kbd">D</i> 이동</span>
        <span><i class="kbd">Space</i> 상승 (놓으면 그 높이에 떠 있음) · <i class="kbd">C</i> 하강</span>
        <span>드래그 · <i class="kbd">←</i><i class="kbd">↑</i><i class="kbd">↓</i><i class="kbd">→</i> 360° 회전</span><span><i class="kbd">X</i> 수평</span>
        <span><i class="kbd">Shift</i> 부스트</span><span><i class="kbd">R</i> 정거장 복귀</span>${mission ? '<span><i class="kbd">F</i> 길게 눌러 수거</span>' : ''}
      </div></div>
      ${mission ? `<div class="br pc-only collect"><div class="glass prompt" data-k="prompt">가장 가까운 목표물로 이동하세요</div></div>` : ''}
      <div class="alt-gauge" data-k="alt"><b>최대</b><i></i><span>최저</span></div>
    </div>`);
    ctx.hud.appendChild(hud);
    ui = mountSceneUi(ctx, hud, {
      here: mission ? 'mission' : 'eva',
      room: 'eva',
      chatTitle: '우주 유영 구역',
      seed: [{ who: '안내', text: '유영 중에도 채팅할 수 있어요. 정거장 복귀는 오른쪽 위 버튼(R)', kind: 'sys' }],
      npcs: ['루나'],
      main: { k: 'up', icon: I.up, label: '상승', hold: 'up' },
      extra: [
        { k: 'down', icon: I.down, label: '하강', hold: 'down' },
        { k: 'boostb', icon: I.boost, label: '부스트', hold: 'boost' },
        mission ? { k: 'collect', icon: I.hand, label: '수거', hold: 'act', disabled: true } : { k: 'level', icon: I.level, label: '수평', onTap: () => zg.level() },
      ],
      aux: mission ? [{ k: 'level', icon: I.level, label: '수평', onTap: () => zg.level() }] : [],
      speaker: (m) => (m.kind === 'me' ? { root: me.root, y: 1.98 } : m.peer ? { root: crowd.anchorOf(m.peer), y: 1.98 } : null),
    });
    hud.querySelector('[data-k="ret"]').addEventListener('click', goBack);
    setTimeout(() => hud.querySelector('[data-k="guide"]')?.remove(), 9000);
    for (const tg of targets) {
      tg.el = h(`<div class="target"><span></span></div>`);
      ctx.labels.appendChild(tg.el);
    }
    hud._arrow = h('<div class="arrow-edge" style="display:none"></div>');
    ctx.labels.appendChild(hud._arrow);
  }

  function toast(html, ms = 2800) {
    hud.querySelector('.toast')?.remove();
    const t = h(`<div class="glass toast">${html}</div>`);
    hud.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }

  function showResult() {
    const used = 300 - st.time;
    const m = h(`<div class="modal-wrap"><div class="modal">
      <div class="kicker">미션 완료 · 서버 확인 완료 (시안에서는 가상 처리)</div>
      <h3>궤도 청소 작전 성공!</h3>
      <div class="note" style="color:#5a6190">수거 기록 5건을 서버가 거리·시간·중복 여부로 확인한 뒤 보상 1건을 지급하는 구조입니다.</div>
      <div class="stats"><div>수거<b>5 / 5</b></div><div>걸린 시간<b>${Math.floor(used / 60)}분 ${Math.round(used % 60)}초</b></div><div>보상<b>⭐ +30</b></div></div>
      <div style="font-weight:800;font-size:14px;margin-top:6px">과학 카드 — 우주 쓰레기, 게임과 실제는 이렇게 달라요</div>
      <div class="vs">
        <div class="g"><b>게임 속</b>두 손으로 붙잡아 등 뒤 수거함에 넣어요. 몇 분이면 5개를 모을 수 있어요.</div>
        <div class="r"><b>실제</b>쓰레기는 초속 약 7 km 안팎으로 돌아서 사람이 직접 줍지 않아요. 대부분 지상에서 추적만 하고, 로봇팔·그물·자석 도킹 같은 제거 기술은 아직 시험·개발 단계예요.</div>
      </div>
      <div class="row-btn"><button class="btn ghost" data-k="close" style="color:#141b3d;background:#f2f3fb">계속 유영하기</button><button class="btn" data-k="book">${I.book}도감에 기록</button></div>
    </div></div>`);
    hud.appendChild(m);
    m.querySelector('[data-k="close"]').addEventListener('click', () => m.remove());
    m.querySelector('[data-k="book"]').addEventListener('click', () => { m.remove(); toast('탐험 도감에 "우주 쓰레기" 카드가 기록됐어요 (시안)'); });
  }

  const acc = new THREE.Vector3(), tmp = new THREE.Vector3();
  function physics(dt, look) {
    const s = zg.update(dt, look, { boostOk: st.boost > 0.02 });
    const boosting = s.boosting;
    if (boosting) {
      st.boost = Math.max(0, st.boost - dt / 3);
      st.boostCool = 2;
    } else {
      st.boostCool -= dt;
      if (st.boostCool <= 0) st.boost = Math.min(1, st.boost + dt * 0.5);
    }
    const p = s.pos;
    // 정거장 충돌 (단순 구·캡슐)
    for (const c of station.colliders) {
      tmp.copy(p).sub(c.c);
      if (c.axis === 'x') tmp.x = Math.max(0, Math.abs(tmp.x) - c.half) * Math.sign(tmp.x);
      if (c.axis === 'z') tmp.z = Math.max(0, Math.abs(tmp.z) - c.half) * Math.sign(tmp.z);
      const d = tmp.length(), lim = c.r + 0.6;
      if (d < lim && d > 0.0001) {
        const n = tmp.divideScalar(d);
        p.addScaledVector(n, lim - d);
        const vn = vel.dot(n);
        if (vn < 0) vel.addScaledVector(n, -vn * 1.3);
      }
    }
    // 거주 링 (토러스) 충돌
    {
      const px = p.x + 2.5, rr = Math.hypot(p.y, p.z) || 1e-4;
      const q = new THREE.Vector3(px, (p.y / rr) * (rr - 15), (p.z / rr) * (rr - 15));
      const d = q.length(), lim = 1.6 + 0.6;
      if (d < lim) {
        const n = q.divideScalar(d);
        p.addScaledVector(n, lim - d);
        const vn = vel.dot(n);
        if (vn < 0) vel.addScaledVector(n, -vn * 1.3);
      }
    }
    // 이동 반경 제한: 60 m부터 반발, 80 m에서 정지
    const off = tmp.copy(p).sub(station.airlockPos);
    const dist = off.length();
    if (dist > P.soft) {
      vel.addScaledVector(off.normalize(), -(dist - P.soft) * 0.6 * dt);
      if (dist > P.hard) p.copy(station.airlockPos).addScaledVector(off, P.hard);
    }
    fence.material.opacity = THREE.MathUtils.clamp((dist - P.soft + 15) / 15, 0, 1) * 0.25;
    me.root.position.copy(p);
    me.root.quaternion.copy(s.view);
    me.state.thrust = s.thrust;
    acc.copy(s.want);
    if (acc.lengthSq() > 1e-4) acc.normalize();
    // 추진기 입자 방출
    if (me.state.thrust > 0.05) {
      const n = Math.ceil(me.state.thrust * 6);
      for (let k = 0; k < n; k++) {
        const e = me.nozzles[(pIdx + k) % 2];
        e.getWorldPosition(tmp);
        const i = pIdx % N;
        pPos.set([tmp.x, tmp.y, tmp.z], i * 3);
        const dir = acc.clone().negate().multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.6 - Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
        pVel.set([dir.x + vel.x * 0.5, dir.y + vel.y * 0.5, dir.z + vel.z * 0.5], i * 3);
        pLife[i] = 1;
        pIdx++;
      }
    }
    for (let i = 0; i < N; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] = Math.max(0, pLife[i] - dt * 1.6);
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.life.needsUpdate = true;
    return { dist, sp: vel.length(), boosting };
  }

  function missionUpdate(dt) {
    if (!mission || st.done) return;
    st.time = Math.max(0, st.time - dt);
    let best = null, bd = 1e9;
    for (const tg of targets) {
      if (tg.done) continue;
      const d = tg.obj.position.distanceTo(me.root.position);
      if (d < bd) { bd = d; best = tg; }
    }
    st.active = best && bd <= P.reach ? best : null;
    const holding = input.keys.has('f') || input.hold.act;
    if (st.active && holding) st.hold += dt;
    else st.hold = Math.max(0, st.hold - dt * 2);
    ui?.mc.setLabel('collect', st.active && st.hold > 0 ? `${Math.round((st.hold / P.hold) * 100)}%` : '수거');
    const cb = hud.querySelector('[data-k="collect"]');
    if (cb) cb.disabled = !st.active;
    const pr = hud.querySelector('[data-k="prompt"]');
    if (pr) pr.innerHTML = st.active ? `<i class="kbd">F</i> 길게 눌러 수거 · ${DEBRIS_KINDS[st.active.kind].name} <span style="color:var(--mint)">${Math.round((st.hold / P.hold) * 100)}%</span>` : best ? `가장 가까운 목표물까지 ${bd.toFixed(1)} m — 3 m 안으로 접근` : '';
    if (st.active && st.hold >= P.hold) {
      const tg = st.active;
      tg.done = true;
      tg.collecting = 0.001;
      st.hold = 0;
      st.collected++;
      hud.querySelectorAll('.prog i').forEach((el, i) => el.classList.toggle('on', i < st.collected));
      hud.querySelector('[data-k="cnt"]').textContent = st.collected;
      toast(`<b>${DEBRIS_KINDS[tg.kind].name}</b> 수거 — ${DEBRIS_KINDS[tg.kind].note}`);
      if (st.collected === targets.length) {
        st.done = true;
        setTimeout(showResult, 1100);
      }
    }
    for (const tg of targets) {
      if (tg.collecting > 0 && tg.collecting < 1) {
        tg.collecting = Math.min(1, tg.collecting + dt / 0.8);
        tg.obj.position.lerp(me.root.position, tg.collecting * 0.25);
        tg.obj.scale.setScalar(Math.max(0.001, 1 - tg.collecting));
        if (tg.collecting >= 1) tg.obj.visible = false;
      }
    }
    const tEl = hud.querySelector('[data-k="time"]');
    if (tEl) tEl.textContent = `${String(Math.floor(st.time / 60)).padStart(2, '0')}:${String(Math.floor(st.time % 60)).padStart(2, '0')}`;
  }

  return {
    id: mission ? 'mission' : 'eva',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.5, bloomThreshold: 1.0, bloomRadius: 0.55 },
    enter() {
      me.applyProfile(ctx.profile);
      st.leaving = false;
      // 에어록을 나서는 위치에서 새로 시작 (정거장 쪽을 보고)
      zg.place(start, faceYaw(start));
      me.root.position.copy(start);
      buildHud();
      window.__eva = {
        state: () => ({ pos: zg.s.pos.toArray().map((v) => +v.toFixed(2)), vy: +zg.s.vel.y.toFixed(2), capped: zg.s.capped, q: zg.s.quat.toArray().map((v) => +v.toFixed(3)) }),
        y: (v) => { zg.s.pos.y = v; },
        rot: (yaw, pitch) => { zg.s.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))); },
      };
    },
    exit() { st.leaving = false; crowd.clear(); },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 66 : 55;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const look = consumeLook();
      if (input.pressed.has('r')) goBack();
      const ph = physics(dt, look);
      me.state.mode = 'float';
      me.update(dt, t);
      // 실시간: 같은 유영 구역의 다른 사람
      ctx.multi.tick({ p: me.root.position.toArray(), h: 0, q: me.root.quaternion.toArray(), m: 'float' });
      crowd.sync(ctx.multi.list(), dt, t);
      station.update(t);
      earth.update(dt);
      earth.mesh.rotation.y += dt * 0.0005;
      for (const s of sats) s.rotation.y += dt * 0.08;
      for (const d of [...decor, ...targets.map((x) => x.obj)]) {
        const s = d.userData.spin;
        d.rotation.x += s.x * dt;
        d.rotation.y += s.y * dt;
        if (d.userData.highlight) d.userData.highlight.mat.opacity = 0.55 + Math.sin(t * 4) * 0.3;
      }
      missionUpdate(dt);
      // 3인칭 추적 카메라: 아바타 자세를 따라 부드럽게 돌아 뒤집히지 않음
      zg.camera(camera, dt, { height: 1.1, lookUp: 0.75, zoom: look.zoom, min: 2.5, max: 12 });
      const isM = ctx.isMobile();
      void isM;
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      sun.position.copy(camera.position).addScaledVector(L, 9000);
      // HUD 갱신
      const { w, hgt } = ctx.size();
      if (hud) {
        hud.querySelector('[data-k="boost"]').style.width = `${Math.round(st.boost * 100)}%`;
        hud.querySelector('[data-k="dist"]').textContent = `${Math.round(ph.dist)} m${ph.dist > P.soft ? ' · 경계' : ''}`;
        hud.querySelector('[data-k="spd"]').textContent = `${ph.sp.toFixed(1)} m/s`;
        const g = hud.querySelector('[data-k="alt"]');
        if (g) {
          const f = (zg.s.pos.y - zg.P.minY) / (zg.P.maxY - zg.P.minY);
          g.querySelector('i').style.bottom = `${(f * 100).toFixed(1)}%`;
          g.classList.toggle('max', zg.s.capped !== 0);
        }
        if (zg.s.capped && t - st.capWarn > 4) {
          st.capWarn = t;
          toast(zg.s.capped > 0 ? '최대 높이예요 — 더 올라갈 수 없어요' : '가장 낮은 높이예요 — 더 내려갈 수 없어요');
        }
        // 길 잃음 방지: 정거장이 8초 이상 화면 밖이면 방향 화살표
        const sp = project(station.airlockPos, camera, w, hgt);
        const off = sp.behind || sp.x < 0 || sp.x > w || sp.y < 0 || sp.y > hgt;
        st.offscreen = off ? st.offscreen + dt : 0;
        const ar = hud._arrow;
        if (st.offscreen > 8) {
          let vx = sp.x - w / 2, vy = sp.y - hgt / 2;
          if (sp.behind) { vx = -vx; vy = -vy; }
          const k = Math.min((w / 2 - 40) / Math.abs(vx || 1), (hgt / 2 - 40) / Math.abs(vy || 1));
          ar.style.display = 'block';
          ar.style.left = `${w / 2 + vx * k}px`;
          ar.style.top = `${hgt / 2 + vy * k}px`;
          ar.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(vy, vx) + Math.PI / 2}rad)`;
          hud.querySelector('[data-k="ret"]').style.boxShadow = `0 0 0 ${3 + Math.sin(t * 6) * 3}px rgba(255,166,77,.7)`;
        } else {
          ar.style.display = 'none';
          hud.querySelector('[data-k="ret"]').style.boxShadow = '';
        }
        for (const tg of targets) {
          if (!tg.el) continue;
          const p = project(tg.obj.position, camera, w, hgt);
          const dd = tg.obj.position.distanceTo(me.root.position);
          const inside = !p.behind && p.x > 70 && p.x < w - 70 && p.y > 60 && p.y < hgt - 60;
          let x = p.x, y = p.y;
          if (!inside) {
            let vx = p.x - w / 2, vy = p.y - hgt / 2;
            if (p.behind) { vx = -vx; vy = -vy; }
            const k = Math.min((w / 2 - 78) / Math.abs(vx || 1), (hgt / 2 - 90) / Math.abs(vy || 1));
            x = w / 2 + vx * k;
            y = hgt / 2 + vy * k;
          }
          tg.el.style.left = `${x}px`;
          tg.el.style.top = `${y}px`;
          tg.el.classList.toggle('edge', !inside);
          tg.el.classList.toggle('near', tg === st.active);
          tg.el.classList.toggle('done', tg.done);
          tg.el.style.display = tg.done && tg.collecting >= 1 ? 'none' : 'block';
          tg.el.querySelector('span').textContent = tg.done ? '수거됨' : `${DEBRIS_KINDS[tg.kind].name} · ${dd.toFixed(0)} m`;
        }
      }
    },
  };
}
