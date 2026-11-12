import * as THREE from 'three';
import { createSkyDome, createStarfield } from '../world/space.js';
import { createPlanet } from '../world/planets.js';
import { consumeLook } from '../core/input.js';
import { h, I } from '../ui/dom.js';
import { BODIES, byId, SOURCES } from '../data/planets.js';

// 장면 5 — 행성 정보 상세 (상단 3D 모델 · 중단 정보 카드 · 하단 행동 버튼)
const ORDER = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

export function createPlanetScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20000);
  const sky = createSkyDome(9000, 1.0);
  const stars = createStarfield(ctx.renderer.quality.stars, 8500, 31);
  scene.add(sky, stars);
  const sunWorld = new THREE.Vector3(-60, 18, 40);
  const light = new THREE.DirectionalLight('#fff4e0', 3.2);
  light.position.copy(sunWorld);
  scene.add(light, new THREE.AmbientLight('#8090c0', 0.08));
  const holder = new THREE.Group();
  scene.add(holder);
  let current = null, id = 'mars', hud, dragYaw = 0, from = 'space';
  // 이전·다음은 발견한 천체 안에서만 넘긴다 (우주 탐험에서 발견해야 열림)
  const pool = () => ORDER.filter((x) => x === id || ctx.progress.discovered.has(x));

  function setBody(nid) {
    id = nid;
    if (current) holder.remove(current.group);
    current = createPlanet(id, id === 'sun' ? 2.2 : 2, { spin: 0.12, segments: 128 });
    holder.add(current.group);
    if (hud) renderPanel();
  }

  function factCard(f) {
    const src = SOURCES[f.src];
    const chip = f.verified ? `<span class="vchip" title="${src.title}">검증 ${f.verified.slice(5)}</span>` : '<span class="vchip todo">검증 예정</span>';
    return `<div class="fact ${f.label === '대기' ? 'wide' : ''}"><div class="k">${f.label}${chip}</div><div class="v">${f.value}</div>${f.basis ? `<div class="b">${f.basis}</div>` : ''}</div>`;
  }

  function renderPanel() {
    const b = byId[id];
    const list = pool();
    const idx = list.indexOf(id);
    const gravityOk = ['earth', 'moon', 'mars'].includes(id);
    const cmpRow = (label, v, max) => `<div class="row"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i><u style="left:${Math.min(100, (1 / max) * 100)}%"></u></div><span>지구의 ${v >= 10 ? v.toFixed(0) : v.toFixed(v < 1 ? 2 : 1)}배</span></div>`;
    const maxD = Math.max(b.cmp.diameter, 1) * 1.15, maxG = Math.max(b.cmp.gravity, 1) * 1.15;
    const srcs = [...new Set(b.facts.map((f) => f.src))].map((k) => `<a href="${SOURCES[k].url}" target="_blank" rel="noopener">${SOURCES[k].title}</a>`).join(' · ');
    hud.querySelector('.info').innerHTML = `
      <div class="scroll">
        <div class="head"><h2>${b.ko}</h2><span class="en">${b.en}</span></div>
        <span class="cat ${b.landing === 'orbit' ? 'orbit' : ''}">${b.cat}${b.landing === 'orbit' ? ' · 궤도 관측 전용 (단단한 지표면 없음)' : ''}</span>
        <p class="intro">${b.intro}</p>
        <div class="facts">${b.facts.map(factCard).join('')}</div>
        <div class="sec">지구와 비교 (세로선 = 지구)</div>
        <div class="cmp">${cmpRow('지름', b.cmp.diameter, maxD)}${cmpRow('중력', b.cmp.gravity, maxG)}</div>
        <div class="sec">흥미로운 사실</div>
        <ul class="fun">${b.fun.map((f) => `<li>${f.t} ${f.verified ? '' : '<span class="vchip todo">검증 예정</span>'}</li>`).join('')}</ul>
        <div class="src">출처: ${srcs}<br/>수치는 평균값과 범위값을 구분해 표시하고, 값마다 출처와 마지막 검증일을 관리합니다. "검증 예정" 항목은 PHASE 2 콘텐츠 작업에서 원문과 대조합니다.</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-k="more">${I.info}자세히</button>
        <button class="btn ${gravityOk ? 'lav' : 'ghost'}" data-k="grav" ${gravityOk ? '' : 'disabled'}>${I.jump}${gravityOk ? '중력 체험' : '체험 미지원'}</button>
        <button class="btn" data-k="save">${I.save}도감 저장</button>
      </div>`;
    hud.querySelector('[data-k="nav"]').innerHTML = `
      <button class="icon-btn" data-k="prev" title="이전">${I.back}</button>
      <div class="glass chip">발견 ${idx + 1} / ${list.length} · ${b.ko}</div>
      <button class="icon-btn" data-k="next" title="다음" style="transform:scaleX(-1)">${I.back}</button>`;
    hud.querySelector('[data-k="prev"]').addEventListener('click', () => setBody(list[(idx + list.length - 1) % list.length]));
    hud.querySelector('[data-k="next"]').addEventListener('click', () => setBody(list[(idx + 1) % list.length]));
    hud.querySelector('[data-k="grav"]').addEventListener('click', () => gravityOk && ctx.go('gravity'));
    hud.querySelector('[data-k="save"]').addEventListener('click', () => toast(`도감에 "${b.ko}" 카드를 저장했어요 · 비회원은 이번 접속에서만 유지`));
    hud.querySelector('[data-k="more"]').addEventListener('click', () => toast('자세히 알아보기: 탐사선 사진·구조 단면·관련 미션 (PHASE 2)'));
  }

  function toast(text) {
    hud.querySelector('.toast')?.remove();
    const t = h(`<div class="glass toast">${text}</div>`);
    hud.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  setBody('mars');
  return {
    id: 'planet',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.45, bloomThreshold: 0.92 },
    enter(p) {
      from = p?.from || 'space';
      const backLabel = { space: '우주 탐험으로', moon: '달 착륙지로', station: '정거장으로', lounge: '라운지로' }[from] || '돌아가기';
      hud = h(`<div><div class="tl" style="flex-direction:row;align-items:center" data-k="nav"></div>
        <div class="tl pc-only" style="top:auto;bottom:calc(16px + var(--safe-b))"><button class="btn return" data-k="map">${I.back}<b>${backLabel}</b></button></div>
        <div class="tr mobile-only" style="top:calc(54px + var(--safe-t))"><button class="icon-btn" data-k="map2">${I.back}</button></div>
        <div class="info"></div></div>`);
      ctx.hud.appendChild(hud);
      const back = () => ctx.go(from, from === 'moon' ? { id: 'free' } : {});
      hud.querySelector('[data-k="map"]').addEventListener('click', back);
      hud.querySelector('[data-k="map2"]').addEventListener('click', back);
      setBody(p?.id && byId[p.id] ? p.id : id);
    },
    exit() {},
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      const look = consumeLook();
      dragYaw += look.dx * 0.01;
      const mobile = ctx.isMobile();
      // PC: 행성은 왼쪽 절반 / 모바일: 위쪽 40%
      const { w, hgt } = ctx.size();
      const dist = mobile ? 14.5 : 11;
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
      const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
      const vw = vh * (w / hgt);
      holder.position.set(mobile ? 0 : -vw * 0.22, mobile ? vh * 0.27 : 0, 0);
      holder.scale.setScalar(mobile ? 0.82 : 1);
      holder.rotation.y = dragYaw;
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.material.uniforms.time.value = t;
      const sw = sunWorld.clone();
      current?.update(dt, t, sw);
      void BODIES;
    },
  };
}
