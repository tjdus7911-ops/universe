import * as THREE from 'three';
import { createEarth } from '../world/earth.js';
import { createSkyDome, createStarfield, createSun } from '../world/space.js';
import { createAstronaut, HAIRS, makeSpaceEnv, SKINS, SUIT_PRESETS } from '../world/astronaut.js';
import { consumeLook } from '../core/input.js';
import { h, I } from '../ui/dom.js';

// 장면 0 — 시작 화면 → 아바타·우주복 선택 → 탑승 (지구 우주항)
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

  // 아바타 받침대 (출발 게이트의 착용대)
  const stand = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.22, 64), new THREE.MeshStandardMaterial({ color: '#eef0fa', roughness: 0.3, metalness: 0.2 }));
  base.position.y = -0.11;
  stand.add(base);
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 8, 96), new THREE.MeshStandardMaterial({ color: '#6ff0d2', emissive: '#6ff0d2', emissiveIntensity: 3 }));
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.01;
  stand.add(glowRing);
  const me = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair });
  stand.add(me.root);
  stand.position.set(-0.9, -0.2, 0);
  scene.add(stand);

  let step = 'title', hud, yaw = 0.5, helmetOn = false;
  const presetKeys = Object.keys(SUIT_PRESETS);

  function setStep(s) {
    step = s;
    ctx.hud.innerHTML = '';
    hud = s === 'title' ? titleHud() : avatarHud();
    ctx.hud.appendChild(hud);
  }

  function titleHud() {
    const el = h(`<div>
      <div class="title-wrap">
        <div class="logo">우주마을</div>
        <div class="logo-sub">SPACE VILLAGE · 가칭</div>
        <div class="note" style="margin-top:14px;font-size:14px">친구들과 달 기지에서 만나고, 깡충 뛰고 유영하며 과학을 배워요</div>
      </div>
      <div class="start-btns">
        <button class="btn" data-k="join">회원가입 / 로그인</button>
        <button class="btn ghost" data-k="guest">${I.eye}둘러보기 (비회원)</button>
        <div class="note" style="text-align:center">비회원: 달 기지·정거장 구경·유영·행성 정보 이용 가능 · 도감·코인·친구 저장은 회원 전용</div>
      </div>
      <div class="tr"><button class="icon-btn" title="설정">${I.gear}</button></div>
    </div>`);
    el.querySelector('[data-k="guest"]').addEventListener('click', () => setStep('avatar'));
    el.querySelector('[data-k="join"]').addEventListener('click', () => setStep('avatar'));
    return el;
  }

  function avatarHud() {
    const el = h(`<div>
      <div class="tl"><button class="btn ghost" data-k="back">${I.back}처음으로</button></div>
      <div class="tc"><div class="glass chip steps">1 시작 · <b>2 아바타</b> · 3 우주복 · 4 탑승</div></div>
      <div class="glass picker">
        <h3>나의 우주 탐험가</h3>
        <div class="note">아바타 4종 + 우주복 색상. 꾸미기 아이템은 스타코인으로 추가돼요.</div>
        <div class="presets">${SKINS.map((c, i) => `<div class="pre ${i === 0 ? 'on' : ''}" data-skin="${i}"><div class="face" style="background:${c};box-shadow:inset 0 10px 0 ${HAIRS[i]}"></div>${['단발', '포니', '숏컷', '곱슬'][i]}</div>`).join('')}</div>
        <div style="font-weight:800;font-size:13px">우주복 색상</div>
        <div class="swatches">${presetKeys.map((k) => `<div class="sw ${k === ctx.profile.preset ? 'on' : ''}" data-suit="${k}" style="background:linear-gradient(160deg, ${SUIT_PRESETS[k].suit} 55%, ${SUIT_PRESETS[k].accent} 56%)">${{ mint: '민트', lavender: '라벤더', coral: '코랄', sky: '스카이' }[k]}</div>`).join('')}</div>
        <button class="btn ghost" data-k="helmet">${I.globe}헬멧 써 보기</button>
        <button class="btn" data-k="go">${I.rocket}우주선 탑승하기</button>
        <div class="note">첫 방문은 달 착륙 연출(약 10초)을 보여 주고, 다시 올 때는 건너뛸 수 있어요.</div>
      </div>
    </div>`);
    el.querySelector('[data-k="back"]').addEventListener('click', () => setStep('title'));
    el.querySelectorAll('[data-suit]').forEach((b) => b.addEventListener('click', () => {
      ctx.profile.preset = b.dataset.suit;
      me.setPreset(b.dataset.suit);
      el.querySelectorAll('[data-suit]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-skin]').forEach((x) => x.classList.toggle('on', x === b));
      ctx.profile.skin = SKINS[+b.dataset.skin];
      ctx.profile.hair = HAIRS[+b.dataset.skin];
      me.parts.suitM.needsUpdate = true;
      rebuild();
    }));
    el.querySelector('[data-k="helmet"]').addEventListener('click', () => { helmetOn = !helmetOn; me.setHelmet(helmetOn); });
    el.querySelector('[data-k="go"]').addEventListener('click', () => ctx.go('moon'));
    return el;
  }

  let avatar = me;
  function rebuild() {
    stand.remove(avatar.root);
    avatar = createAstronaut({ preset: ctx.profile.preset, skin: ctx.profile.skin, hair: ctx.profile.hair });
    avatar.setHelmet(helmetOn);
    stand.add(avatar.root);
  }

  return {
    id: 'start',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.6, bloomThreshold: 0.95 },
    enter() { setStep(ctx.params.step || (ctx.params.id === 'avatar' ? 'avatar' : 'title')); },
    exit() {},
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 62 : 45;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const look = consumeLook();
      yaw += look.dx * 0.01;
      const mobile = ctx.isMobile();
      const av = step === 'avatar';
      stand.visible = av;
      if (av) {
        yaw += dt * 0.25;
        avatar.root.rotation.y = yaw;
        avatar.state.mode = 'idle';
        avatar.update(dt, t);
        stand.position.set(mobile ? 0 : -0.9, mobile ? 0.2 : -0.2, 0);
      }
      const camT = av ? new THREE.Vector3(mobile ? 0 : 0.35, mobile ? 1.0 : 0.75, mobile ? 6.4 : 4.6) : new THREE.Vector3(0, 0.6, 6);
      camera.position.lerp(camT, 1 - Math.exp(-dt * 4));
      camera.lookAt(av ? (mobile ? 0 : 0.25) : 0, av ? (mobile ? 0.3 : 0.55) : 0.15 - Math.sin(t * 0.1) * 0.05, 0);
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      sun.position.copy(camera.position).addScaledVector(L, 9000);
      earth.update(dt);
      earth.mesh.rotation.y += dt * 0.003;
    },
  };
}
