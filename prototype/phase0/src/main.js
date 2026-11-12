import * as THREE from 'three';
import './ui/hud.css';
import { createRenderer, detectQuality } from './core/renderer.js';
import { endFrame, installInput, mountHold, mountJoystick } from './core/input.js';
import { textureManager } from './world/earth.js';
import { HAIRS, SKINS } from './world/astronaut.js';

// 시안 내비게이터: 장면 목록 (순서 = 검토 순서)
const SCENES = [
  { id: 'start', label: '시작 · 아바타', load: () => import('./scenes/start.js').then((m) => m.createStartScene) },
  { id: 'moon', label: '달 기지 · 도착', load: () => import('./scenes/moon.js').then((m) => m.createMoonScene) },
  { id: 'station', label: '정거장 · 지구 전망', load: () => import('./scenes/station.js').then((m) => m.createStationScene) },
  { id: 'eva', label: '우주 유영', load: () => import('./scenes/eva.js').then((m) => m.createEvaScene) },
  { id: 'mission', label: '쓰레기 수거 미션', load: () => import('./scenes/eva.js').then((m) => (c) => m.createEvaScene(c, { mission: true })) },
  { id: 'lounge', label: '달 기지 라운지', load: () => import('./scenes/lounge.js').then((m) => m.createLoungeScene) },
  { id: 'space', label: '우주 탐험 · 행성 발견', load: () => import('./scenes/space.js').then((m) => m.createSpaceScene) },
  { id: 'planet', label: '행성 정보', load: () => import('./scenes/planet.js').then((m) => m.createPlanetScene) },
  { id: 'gravity', label: '중력 체험', load: () => import('./scenes/gravity.js').then((m) => m.createGravityScene) },
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
    <canvas id="gl"></canvas><div id="labels"></div><div id="hud"></div><div id="fade"></div>
    <div id="loading">우주마을 시안을 불러오는 중…</div>
  </div></div>`;

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const coarse = window.matchMedia('(pointer: coarse)').matches;
let device = params.get('device') || (coarse && Math.min(innerWidth, innerHeight) < 700 ? 'mobile-native' : 'pc');
let qualityKey = params.get('q') || detectQuality();
const R = createRenderer(canvas, qualityKey);
installInput(canvas);

const profile = { name: '우주탐험가', preset: params.get('suit') || 'mint', skin: SKINS[0], hair: HAIRS[0] };
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
  // 장면끼리 나누는 진행 상태 (시안: 새로고침하면 초기화)
  progress: { discovered: new Set(['earth', 'moon']) },
};

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
  if (switching) return;
  switching = true;
  const fade = document.getElementById('fade');
  if (current) {
    fade.classList.add('on');
    await new Promise((r) => setTimeout(r, 380));
    current.exit?.();
  }
  ctx.hud.innerHTML = '';
  ctx.labels.innerHTML = '';
  ctx.params = p;
  const next = await getScene(id);
  current = next;
  applyDevice();
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
    current.update(dt, t);
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
  const sid = params.get('scene') || (known ? hs : 'start');
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
