import * as THREE from 'three';
import { createEarth } from '../world/earth.js';
import { createSkyDome, createStarfield, createSun } from '../world/space.js';
import { createAstronaut, HAIRS, makeSpaceEnv, SKINS, SUIT_PRESETS } from '../world/astronaut.js';
import { consumeLook } from '../core/input.js';
import { h, I } from '../ui/dom.js';

// 장면 0 — 시작 화면 → (회원가입·로그인 또는 둘러보기) → 아바타·우주복 선택 → 탑승
// 모바일: 위쪽 = 아바타 미리보기(전신이 보이게 카메라 자동 맞춤), 아래쪽 = 설정 패널(스크롤) — 서로 겹치지 않음
export function createStartScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
  const L = new THREE.Vector3(-0.8, 0.35, 0.45).normalize();
  scene.environment = makeSpaceEnv(ctx.renderer.renderer, L);
  scene.environmentIntensity = 0.6;
  const sky = createSkyDome(12000, 1.15);
  const stars = createStarfield(ctx.renderer.quality.stars, 11500, 5);
  scene.add(sky, stars);
  const sun = createSun(500);
  scene.add(sun);
  const earth = createEarth(2600, { segments: 220, nightBoost: 2.2, atmStrength: 1.6, atmIn: 0.5 });
  earth.group.position.set(0, -3050, -2400);
  earth.face(127, 36, -0.15, -0.75);
  earth.setSun(L);
  scene.add(earth.group);
  scene.add(new THREE.HemisphereLight('#2a3a78', '#3e6fbf', 0.5));
  const key = new THREE.DirectionalLight('#fff3e6', 2.4);
  key.position.copy(L).multiplyScalar(30);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fe9ff', 1.6);
  rim.position.set(4, 3, -6);
  scene.add(rim);

  // 아바타 받침대
  const stand = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.22, 64), new THREE.MeshStandardMaterial({ color: '#eef0fa', roughness: 0.3, metalness: 0.2 }));
  base.position.y = -0.11;
  stand.add(base);
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 8, 96), new THREE.MeshStandardMaterial({ color: '#6ff0d2', emissive: '#6ff0d2', emissiveIntensity: 3 }));
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.01;
  stand.add(glowRing);
  scene.add(stand);

  const acct = ctx.account;
  let step = 'title', hud, helmetOn = false;
  let yaw = 0.5, yawT = 0.5, autoRot = true;
  const presetKeys = Object.keys(SUIT_PRESETS);
  const skinIdx = () => Math.max(0, SKINS.indexOf(ctx.profile.skin));

  let avatar = null;
  function rebuild() {
    if (avatar) stand.remove(avatar.root);
    avatar = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair });
    avatar.setHelmet(helmetOn);
    stand.add(avatar.root);
  }
  rebuild();

  function toast(html, ms = 3200) {
    ctx.hud.querySelector('.toast')?.remove();
    const t = h(`<div class="toast glass">${html}</div>`);
    ctx.hud.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function setStep(s) {
    step = s;
    ctx.hud.innerHTML = '';
    hud = s === 'title' ? titleHud() : avatarHud();
    ctx.hud.appendChild(hud);
  }

  function titleHud() {
    const u = acct.user;
    const el = h(`<div>
      <div class="title-wrap">
        <div class="logo">우주마을</div>
        <div class="logo-sub">SPACE VILLAGE · 가칭</div>
        <div class="note" style="margin-top:14px;font-size:14px">친구들과 달 기지에서 만나고, 깡충 뛰고 유영하며 과학을 배워요</div>
      </div>
      <div class="start-btns">
        ${u ? `
          <div class="glass chip acct" style="justify-self:center">${I.user}<b>${esc(u.name)}</b>님, 다시 오신 걸 환영해요</div>
          <button class="btn" data-k="continue">${I.rocket}이어서 탐험하기</button>
          <button class="btn ghost" data-k="avatar">${I.user}아바타 바꾸기</button>
          <button class="btn ghost" data-k="logout">로그아웃</button>
          <div class="note" style="text-align:center">아바타와 발견한 천체가 이 브라우저에 저장돼 있어요</div>` : `
          <button class="btn" data-k="signup">회원가입</button>
          <button class="btn ghost" data-k="login">로그인</button>
          <button class="btn ghost" data-k="guest">${I.eye}둘러보기 (비회원)</button>
          <div class="note" style="text-align:center">비회원: 달 기지·정거장 구경·유영·행성 정보 이용 가능 · 아바타·도감 저장과 직접 채팅은 회원 전용</div>`}
      </div>
      <div class="tr"><button class="icon-btn" title="설정">${I.gear}</button></div>
    </div>`);
    el.querySelector('[data-k="guest"]')?.addEventListener('click', () => setStep('avatar'));
    el.querySelector('[data-k="signup"]')?.addEventListener('click', () => openAuth('signup'));
    el.querySelector('[data-k="login"]')?.addEventListener('click', () => openAuth('login'));
    el.querySelector('[data-k="avatar"]')?.addEventListener('click', () => setStep('avatar'));
    el.querySelector('[data-k="continue"]')?.addEventListener('click', () => ctx.go('moon'));
    el.querySelector('[data-k="logout"]')?.addEventListener('click', () => {
      acct.logout();
      ctx.resetGuest();
      Object.assign(ctx.profile, { preset: 'mint', skin: SKINS[0], hair: HAIRS[0] });
      rebuild();
      setStep('title');
      toast('로그아웃했어요');
    });
    return el;
  }

  // 회원가입·로그인 (시안: 이 브라우저에만 저장되는 로컬 계정 — core/account.js)
  function openAuth(mode) {
    ctx.hud.querySelector('.auth-wrap')?.remove();
    const el = h(`<div class="modal-wrap auth-wrap"><div class="modal auth">
      <div class="kicker">우주마을 계정</div>
      <div class="tabs2"><button data-m="signup">회원가입</button><button data-m="login">로그인</button></div>
      <form novalidate>
        <label data-f="name">닉네임 (2~12자)<input name="name" autocomplete="nickname" maxlength="12" placeholder="예: 별헤는밤"></label>
        <label>이메일<input name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"></label>
        <label>비밀번호 (8자 이상, 영문+숫자)<input name="password" type="password" autocomplete="current-password"></label>
        <label data-f="password2">비밀번호 확인<input name="password2" type="password" autocomplete="new-password"></label>
        <div class="err" data-k="err"></div>
        <button class="btn" type="submit" data-k="submit">가입하기</button>
      </form>
      <div class="fine">시안용 로컬 계정이에요. 이 브라우저에만 저장되고, 비밀번호는 원문 대신 해시(PBKDF2)로만 남겨요. 다른 기기와의 동기화는 서버를 연결하는 PHASE 4에서 지원해요.</div>
      <div class="row-btn"><button class="btn ghost" data-k="close" style="color:#141b3d;background:#f2f3fb">닫기</button></div>
    </div></div>`);
    ctx.hud.appendChild(el);
    const form = el.querySelector('form');
    const f = (n) => form.querySelector(`[name="${n}"]`);
    const errEl = el.querySelector('[data-k="err"]');
    const setMode = (m) => {
      mode = m;
      el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      el.querySelector('[data-f="name"]').style.display = m === 'signup' ? '' : 'none';
      el.querySelector('[data-f="password2"]').style.display = m === 'signup' ? '' : 'none';
      el.querySelector('[data-k="submit"]').textContent = m === 'signup' ? '가입하고 아바타 정하기' : '로그인';
      f('password').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
      errEl.textContent = '';
    };
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
    el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
    setMode(mode);
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      errEl.textContent = '';
      const btn = el.querySelector('[data-k="submit"]');
      btn.disabled = true;
      const v = { name: f('name').value, email: f('email').value, password: f('password').value, password2: f('password2').value };
      const r = mode === 'signup' ? await acct.signup(v) : await acct.login(v);
      busy = false;
      btn.disabled = false;
      if (!r.ok) {
        errEl.textContent = r.error;
        return;
      }
      el.remove();
      ctx.profile.name = r.user.name;
      if (mode === 'login') {
        ctx.applySaved(r.data);
        rebuild();
        setStep('avatar');
        toast(`${esc(r.user.name)}님, 저장된 아바타와 진행 상태를 불러왔어요`);
      } else {
        ctx.persist();
        setStep('avatar');
        toast('가입 완료! 이제 나의 우주 탐험가를 정해요');
      }
    });
    setTimeout(() => f(mode === 'signup' ? 'name' : 'email').focus(), 50);
  }

  function avatarHud() {
    const member = acct.isMember();
    const back = ctx.progress.seenIntro && member;
    const el = h(`<div>
      <div class="tl"><button class="btn ghost" data-k="back">${I.back}처음으로</button></div>
      <div class="tc"><div class="glass chip steps">1 시작 · <b>2 아바타</b> · 3 우주복 · 4 탑승</div></div>
      <div class="rot-ctl">
        <button data-k="rl" aria-label="왼쪽으로 돌리기">${I.rotL}</button>
        <button data-k="auto" class="${autoRot ? 'on' : ''}" aria-label="자동 회전">${I.globe}</button>
        <button data-k="rr" aria-label="오른쪽으로 돌리기">${I.rotR}</button>
        <span class="rlbl pc-only">드래그로 돌려 보기</span>
      </div>
      <div class="glass picker">
        <h3>나의 우주 탐험가${member ? ` · ${esc(ctx.profile.name)}` : ''}</h3>
        <div class="note long">아바타 4종 + 우주복 색상. 꾸미기 아이템은 스타코인으로 추가돼요.</div>
        <div class="presets">${SKINS.map((c, i) => `<div class="pre ${i === skinIdx() ? 'on' : ''}" data-skin="${i}"><div class="face" style="background:${c};box-shadow:inset 0 10px 0 ${HAIRS[i]}"></div>${['단발', '포니', '숏컷', '곱슬'][i]}</div>`).join('')}</div>
        <div style="font-weight:800;font-size:13px">우주복 색상</div>
        <div class="swatches">${presetKeys.map((k) => `<div class="sw ${k === ctx.profile.preset ? 'on' : ''}" data-suit="${k}" style="background:linear-gradient(160deg, ${SUIT_PRESETS[k].suit} 55%, ${SUIT_PRESETS[k].accent} 56%)">${{ mint: '민트', lavender: '라벤더', coral: '코랄', sky: '스카이' }[k]}</div>`).join('')}</div>
        <button class="btn ghost" data-k="helmet">${I.globe}${helmetOn ? '헬멧 벗기' : '헬멧 써 보기'}</button>
        <button class="btn" data-k="go">${I.rocket}${back ? '이어서 탐험하기' : '우주선 탑승하기'}</button>
        <div class="note">${member ? '바꾼 아바타는 계정에 저장돼요.' : '비회원은 새로고침하면 처음 상태로 돌아가요.'} ${ctx.progress.seenIntro ? '' : '첫 방문은 달 착륙 연출(약 10초)을 보여 줘요.'}</div>
      </div>
    </div>`);
    el.querySelector('[data-k="back"]').addEventListener('click', () => setStep('title'));
    el.querySelectorAll('[data-suit]').forEach((b) => b.addEventListener('click', () => {
      ctx.profile.preset = b.dataset.suit;
      avatar.setPreset(b.dataset.suit);
      el.querySelectorAll('[data-suit]').forEach((x) => x.classList.toggle('on', x === b));
      ctx.persist();
    }));
    el.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-skin]').forEach((x) => x.classList.toggle('on', x === b));
      ctx.profile.skin = SKINS[+b.dataset.skin];
      ctx.profile.hair = HAIRS[+b.dataset.skin];
      rebuild();
      ctx.persist();
    }));
    const hb = el.querySelector('[data-k="helmet"]');
    hb.addEventListener('click', () => {
      helmetOn = !helmetOn;
      avatar.setHelmet(helmetOn);
      hb.innerHTML = `${I.globe}${helmetOn ? '헬멧 벗기' : '헬멧 써 보기'}`;
    });
    el.querySelector('[data-k="go"]').addEventListener('click', () => {
      ctx.persist();
      ctx.go('moon');
    });
    el.querySelector('[data-k="rl"]').addEventListener('click', () => { autoRot = false; yawT -= Math.PI / 4; syncAuto(); });
    el.querySelector('[data-k="rr"]').addEventListener('click', () => { autoRot = false; yawT += Math.PI / 4; syncAuto(); });
    el.querySelector('[data-k="auto"]').addEventListener('click', () => { autoRot = !autoRot; syncAuto(); });
    function syncAuto() { el.querySelector('[data-k="auto"]').classList.toggle('on', autoRot); }
    return el;
  }

  const look0 = new THREE.Vector3();
  return {
    id: 'start',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.6, bloomThreshold: 0.95 },
    enter() { setStep(ctx.params.step || (ctx.params.id === 'avatar' ? 'avatar' : 'title')); },
    exit() { camera.clearViewOffset(); },
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 40 : 45;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const look = consumeLook();
      const av = step === 'avatar';
      if (look.dx) { autoRot = false; yawT += look.dx * 0.01; hud?.querySelector('[data-k="auto"]')?.classList.remove('on'); }
      const mobile = ctx.isMobile();
      stand.visible = av;
      if (av) {
        if (autoRot) yawT += dt * 0.35;
        yaw += (yawT - yaw) * (1 - Math.exp(-dt * 8));
        avatar.root.rotation.y = yaw;
        avatar.state.mode = 'idle';
        avatar.update(dt, t);
      }
      const { w, hgt } = ctx.size();
      if (av && mobile) {
        // 모바일: 패널 위쪽 빈 영역 한가운데에 아바타 전신이 들어오게 카메라 거리·화면 위치를 맞춘다
        stand.position.set(0, 0, 0);
        const tc = hud?.querySelector('.tc');
        const pk = hud?.querySelector('.picker');
        const top = tc ? tc.offsetTop + tc.offsetHeight + 10 : 110;
        const bottom = pk ? pk.offsetTop - 64 : hgt * 0.5; // 64 = 회전 버튼 줄
        const free = Math.max(120, bottom - top);
        const yc = top + free / 2;
        const rc = hud?.querySelector('.rot-ctl');
        if (rc) rc.style.top = `${bottom + 10}px`;
        const fovR = THREE.MathUtils.degToRad(camera.fov);
        const D = THREE.MathUtils.clamp((2.0 * hgt) / (0.97 * free * 2 * Math.tan(fovR / 2)), 3.2, 16);
        look0.set(0, 1.0, 0);
        camera.position.lerp(new THREE.Vector3(0, 1.05, D), 1 - Math.exp(-dt * 6));
        camera.lookAt(look0);
        camera.setViewOffset(w, hgt, 0, hgt / 2 - yc, w, hgt);
      } else {
        if (camera.view && camera.view.enabled) camera.clearViewOffset();
        if (av) stand.position.set(-0.9, -0.2, 0);
        const camT = av ? new THREE.Vector3(0.35, 0.75, 4.6) : new THREE.Vector3(0, 0.6, 6);
        camera.position.lerp(camT, 1 - Math.exp(-dt * 4));
        camera.lookAt(av ? 0.25 : 0, av ? 0.55 : 0.15 - Math.sin(t * 0.1) * 0.05, 0);
      }
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      sun.position.copy(camera.position).addScaledVector(L, 9000);
      earth.update(dt);
      earth.mesh.rotation.y += dt * 0.003;
    },
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
