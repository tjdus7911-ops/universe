import * as THREE from 'three';
import './ui/hud.css';
import { createRenderer, detectQuality } from './core/renderer.js';
import { endFrame, input, installInput, mountHold, mountJoystick } from './core/input.js';
import { textureManager } from './world/earth.js';
import { HAIRS, SKINS } from './world/astronaut.js';
import { account } from './core/account.js';
import { openTravel } from './ui/travel.js';
import { initBubbles, updateBubbles, clearBubbles, bubbleCount } from './ui/bubbles.js';
import { createMulti } from './net/multi.js';

// 시안 내비게이터: 장면 목록 (순서 = 검토 순서)
const SCENES = [
  { id: 'start', label: '시작 · 아바타', load: () => import('./scenes/start.js').then((m) => m.createStartScene) },
  { id: 'moon', label: '달 기지 · 도착', load: () => import('./scenes/moon.js').then((m) => m.createMoonScene) },
  { id: 'station', label: '정거장 · 지구 전망', load: () => import('./scenes/station.js').then((m) => m.createStationScene) },
  { id: 'lounge', label: '달 기지 라운지', load: () => import('./scenes/lounge.js').then((m) => m.createLoungeScene) },
  { id: 'space', label: '우주 탐험 · 아바타 비행', load: () => import('./scenes/space.js').then((m) => m.createSpaceScene) },
  { id: 'climb', label: '우주 엘리베이터 · 협동', load: () => import('./scenes/climb.js').then((m) => m.createClimbScene) },
  { id: 'planet', label: '행성 정보', load: () => import('./scenes/planet.js').then((m) => m.createPlanetScene) },
];

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
app.innerHTML = `
  <div id="review">
    <span class="tag">PHASE 0 시안</span>
    <span class="title">우주마을 · 절차적 임시 모델 (운영 코드 아님)</span>
    <div class="tabs">${SCENES.map((s) => `<button data-s="${s.id}">${s.label}</button>`).join('')}</div>
    <span class="sp"></span>
    <div class="seg" id="dev"><button data-d="pc">PC</button><button data-d="mobile">모바일</button></div>
    <div class="seg" id="q"><button data-q="low">저</button><button data-q="medium">중</button><button data-q="high">고</button></div>
    <button id="hudt">HUD 숨기기</button>
  </div>
  <div id="viewport"><div id="stage">
    <canvas id="gl"></canvas><div id="labels"></div><div id="bubbles"></div><div id="hud"></div><div id="fade"></div>
    <div id="loading">우주마을 시안을 불러오는 중…</div>
  </div></div>`;

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const coarse = window.matchMedia('(pointer: coarse)').matches;
let device = params.get('device') || (coarse && Math.min(innerWidth, innerHeight) < 700 ? 'mobile-native' : 'pc');
let qualityKey = params.get('q') || detectQuality();
const R = createRenderer(canvas, qualityKey);
installInput(canvas);
initBubbles(document.getElementById('bubbles'));

const profile = { name: '우주탐험가', preset: params.get('suit') || 'mint', skin: SKINS[0], hair: HAIRS[0] };
// 진행 상태: 발견한 천체, 달 착륙 연출을 본 적 있는지 — 회원은 이 브라우저에 저장된다
const progress = { discovered: new Set(['earth', 'moon']), seenIntro: false };
function applySaved(data) {
  if (!data) return;
  const pf = data.profile || {};
  if (pf.preset) profile.preset = pf.preset;
  if (pf.skin) profile.skin = pf.skin;
  if (pf.hair) profile.hair = pf.hair;
  const pg = data.progress || {};
  if (Array.isArray(pg.discovered)) pg.discovered.forEach((x) => progress.discovered.add(x));
  if (pg.seenIntro) progress.seenIntro = true;
}
// 회원가입·로그인 화면은 숨겼다. 예전에 만든 로컬 계정이 있으면 그대로 이어 쓰고,
// 없으면 닉네임·아바타·진행 상태를 이 브라우저(localStorage)에 저장한다.
const LOCAL = 'sv.local.v1';
const restored = account.restore();
if (restored) {
  profile.name = restored.user.name;
  applySaved(restored.data);
} else {
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL) || 'null');
    if (d) {
      if (typeof d.profile?.name === 'string' && d.profile.name.length >= 2) profile.name = d.profile.name.slice(0, 12);
      applySaved(d);
    }
  } catch { /* 저장소를 못 쓰는 환경 */ }
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = {
      profile: { name: profile.name, preset: profile.preset, skin: profile.skin, hair: profile.hair },
      progress: { discovered: [...progress.discovered], seenIntro: progress.seenIntro },
    };
    if (account.isMember()) account.save(data);
    else { try { localStorage.setItem(LOCAL, JSON.stringify(data)); } catch { /* 무시 */ } }
  }, 250);
}
const ctx = {
  renderer: R,
  hud: document.getElementById('hud'),
  labels: document.getElementById('labels'),
  stage,
  profile,
  isMobile: () => device !== 'pc',
  size: () => ({ w: stage.clientWidth, hgt: stage.clientHeight }),
  mountJoystick: (el) => el && mountJoystick(el),
  mountHold: (el, k) => el && mountHold(el, k),
  go: (id, p) => go(id, p),
  params: {},
  // 장면끼리 나누는 진행 상태 (회원: 저장 · 비회원: 새로고침하면 초기화)
  progress,
  account,
  persist,
  applySaved,
  travel: (here, opts) => openTravel(ctx, here, opts),
  resetGuest() {
    profile.name = '우주탐험가';
    progress.discovered = new Set(['earth', 'moon']);
    progress.seenIntro = false;
  },
};

// 멀티플레이: 아티팩트 실시간 방(초대받은 사람끼리) 또는 ?server= 우주마을 서버 — 없으면 혼자 모드
ctx.multi = createMulti(ctx);

const cache = new Map();
let current = null;
let switching = false;

async function getScene(id) {
  if (!cache.has(id)) {
    const def = SCENES.find((s) => s.id === id);
    const factory = await def.load();
    cache.set(id, factory(ctx));
  }
  return cache.get(id);
}

async function go(id, p = {}) {
  // 이동 중 중복 클릭 방지: 장면 전환이 끝날 때까지 다른 이동 요청은 무시
  if (switching || !SCENES.some((x) => x.id === id)) return;
  switching = true;
  const fade = document.getElementById('fade');
  let next;
  try {
    next = await getScene(id);
  } catch (err) {
    // 장면 파일을 못 불러오면 지금 화면을 그대로 두고 알린다
    console.error(err);
    switching = false;
    ctx.hud.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast glass';
    t.textContent = '이동하지 못했어요. 잠시 뒤 다시 시도해 주세요';
    ctx.hud.appendChild(t);
    setTimeout(() => t.remove(), 3000);
    return;
  }
  if (current) {
    fade.classList.add('on');
    await new Promise((r) => setTimeout(r, current === next ? 120 : 260));
    current.exit?.();
  }
  ctx.hud.innerHTML = '';
  ctx.labels.innerHTML = '';
  clearBubbles();
  ctx.params = p;
  current = next;
  applyDevice();
  ctx.multi.setScene(id); // 같은 존 사람들끼리만 보이고 들리게
  next.enter?.(p);
  resize();
  document.querySelectorAll('#review [data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === id));
  // 공유 가능한 주소는 해시(#station, #planet-mars …)로만 표시
  try { history.replaceState(null, '', `#${id}${p.id ? `-${p.id}` : ''}`); } catch { /* 샌드박스 환경 */ }
  setTimeout(() => fade.classList.remove('on'), 60);
  switching = false;
}

function applyDevice() {
  stage.classList.toggle('device-mobile', device === 'mobile');
  stage.classList.toggle('is-mobile', device !== 'pc');
  stage.classList.toggle('is-pc', device === 'pc');
  document.querySelectorAll('#dev button').forEach((b) => b.classList.toggle('on', b.dataset.d === device || (device === 'mobile-native' && b.dataset.d === 'mobile')));
  document.querySelectorAll('#q button').forEach((b) => b.classList.toggle('on', b.dataset.q === qualityKey));
}

function resize() {
  const vp = document.getElementById('viewport');
  if (device === 'mobile') {
    const s = Math.min(1, (vp.clientHeight - 24) / 844, (vp.clientWidth - 24) / 390);
    stage.style.transform = `scale(${s})`;
  } else stage.style.transform = '';
  const w = stage.clientWidth, h = stage.clientHeight;
  R.setSize(w, h);
  current?.resize?.(w, h);
}
window.addEventListener('resize', resize);

document.querySelectorAll('#review [data-s]').forEach((b) => b.addEventListener('click', () => go(b.dataset.s, b.dataset.s === 'planet' ? { id: 'mars' } : {})));
document.querySelectorAll('#dev button').forEach((b) => b.addEventListener('click', async () => {
  device = b.dataset.d;
  const id = current?.id;
  applyDevice();
  if (current) {
    // HUD를 기기 레이아웃으로 다시 그림
    ctx.hud.innerHTML = '';
    ctx.labels.innerHTML = '';
    clearBubbles();
    current.exit?.();
    current.enter?.(ctx.params);
  }
  resize();
  void id;
}));
document.querySelectorAll('#q button').forEach((b) => b.addEventListener('click', () => {
  qualityKey = b.dataset.q;
  R.setQuality(qualityKey);
  applyDevice();
}));
document.getElementById('hudt').addEventListener('click', (e) => {
  stage.classList.toggle('hide-hud');
  e.target.textContent = stage.classList.contains('hide-hud') ? 'HUD 보이기' : 'HUD 숨기기';
});
if (params.get('hud') === '0') stage.classList.add('hide-hud');
if (params.get('chrome') === '0') document.getElementById('review').style.display = 'none';

// 렌더 루프
const clock = new THREE.Clock();
let t = 0;
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (current) {
    // M: 어디서나 '이동' 메뉴 (시작·행성 정보 화면 제외)
    if (input.pressed.has('m') && !['start', 'planet'].includes(current.id) && !ctx.hud.querySelector('.travel-menu')) ctx.travel(current.id);
    current.update(dt, t);
    updateBubbles(current.camera, stage.clientWidth, stage.clientHeight);
    R.render(current.scene, current.camera, current.renderOpts);
    frames++;
    if (frames === 8) window.__ready = true;
  }
  endFrame();
}

let busy = false;
textureManager.onStart = () => { busy = true; };
textureManager.onLoad = () => { busy = false; };
(async () => {
  const [hs, hid] = (location.hash.slice(1) || '').split('-');
  const known = SCENES.some((x) => x.id === hs);
  const qs = params.get('scene');
  // 지운 장면(우주 유영·쓰레기 수거 미션)이나 모르는 주소로 오면 시작 화면으로
  const sid = qs && SCENES.some((x) => x.id === qs) ? qs : known ? hs : 'start';
  const pid = params.get('id') || (known ? hid : undefined);
  await go(sid, pid ? { id: pid } : {});
  const t0 = performance.now();
  await new Promise((r) => {
    const tick = () => (!busy || performance.now() - t0 > 15000 ? r() : setTimeout(tick, 100));
    setTimeout(tick, 50);
  });
  document.getElementById('loading').classList.add('done');
  loop();
})();
window.__go = go;
window.__frames = () => frames;
window.__bubbles = () => bubbleCount();
window.__multi = () => ({ mode: ctx.multi.mode, zone: ctx.multi.zone, connected: ctx.multi.connected(), peers: ctx.multi.list().map((p) => ({ id: p.id, name: p.name, m: p.st.m, p: p.st.p, rv: p.st.rv || null })), status: ctx.multi.statusText() });
