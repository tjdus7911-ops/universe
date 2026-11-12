import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAstronaut, makeSpaceEnv } from '../world/astronaut.js';
import { canvasTexture, FONT } from '../core/renderer.js';
import { tex } from '../world/earth.js';
import { consumeLook } from '../core/input.js';
import { h, I } from '../ui/dom.js';
import { GAME_TIME_SCALE, GRAVITY, JUMP_V0, SOURCES } from '../data/planets.js';

// 장면 6 — 중력 체험: 같은 초기 속도(v0)로 지구·달·화성에서 동시에 점프
const LOOK = {
  earth: { ground: '#8fd38a', sky: ['#7cc3ff', '#d9f0ff'], helmet: false },
  moon: { ground: '#b9b7b2', sky: ['#05060f', '#151a33'], helmet: true },
  mars: { ground: '#d7875a', sky: ['#c9926a', '#f0c9a0'], helmet: true },
};

export function createGravityScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  scene.background = new THREE.Color('#070b1f');
  scene.environment = makeSpaceEnv(ctx.renderer.renderer);
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#4a3b33', 0.9));
  const key = new THREE.DirectionalLight('#fff4e6', 2.2);
  key.position.set(4, 8, 6);
  scene.add(key);

  const lanes = GRAVITY.map((g, i) => {
    const look = LOOK[g.id];
    const lane = new THREE.Group();
    // 배경 패널 (각 천체의 하늘)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.2), new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 512, (c, w, hh) => {
        const gr = c.createLinearGradient(0, 0, 0, hh);
        gr.addColorStop(0, look.sky[0]);
        gr.addColorStop(1, look.sky[1]);
        c.fillStyle = gr;
        c.fillRect(0, 0, w, hh);
        if (g.id === 'moon') {
          for (let k = 0; k < 90; k++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; c.fillRect(Math.random() * w, Math.random() * hh * 0.8, 2, 2); }
          const eg = c.createRadialGradient(190, 90, 4, 190, 90, 30);
          eg.addColorStop(0, '#9fd2ff');
          eg.addColorStop(1, '#2b5fbf');
          c.fillStyle = eg;
          c.beginPath();
          c.arc(190, 90, 26, 0, 7);
          c.fill();
        }
        if (g.id === 'earth') { c.fillStyle = 'rgba(255,255,255,0.8)'; [[60, 120], [170, 180]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 40, 14, 0, 0, 7); c.fill(); }); }
      }),
    }));
    back.position.set(0, 2.3, -1.4);
    lane.add(back);
    const groundMat = g.id === 'moon'
      ? new THREE.MeshStandardMaterial({ map: tex('moon.jpg'), roughness: 1, color: '#ffffff' })
      : new THREE.MeshStandardMaterial({ color: look.ground, roughness: 0.9 });
    const ground = new THREE.Mesh(new RoundedBoxGeometry(4.4, 0.5, 2.8, 3, 0.15), groundMat);
    ground.position.set(0, -0.25, 0);
    lane.add(ground);
    // 높이 눈금자 (0 ~ 2 m)
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.25), new THREE.MeshBasicMaterial({
      transparent: true,
      map: canvasTexture(128, 464, (c, w, hh) => {
        c.fillStyle = 'rgba(10,15,38,0.55)';
        c.fillRect(0, 0, w, hh);
        c.strokeStyle = '#ffffff';
        c.fillStyle = '#ffffff';
        c.font = `700 22px ${FONT}`;
        for (let m = 0; m <= 20; m++) {
          const y = hh - 12 - (m / 20) * (hh - 24);
          c.lineWidth = m % 5 === 0 ? 3 : 1.5;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(m % 5 === 0 ? 42 : 22, y);
          c.stroke();
          if (m % 5 === 0) c.fillText(`${(m / 10).toFixed(1)}m`, 50, y + 8);
        }
      }),
    }));
    ruler.position.set(-1.55, 1.1, 0.2);
    lane.add(ruler);
    // 최고 높이 표시선
    const hmax = (JUMP_V0 * JUMP_V0) / (2 * g.g);
    const peak = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.03), new THREE.MeshBasicMaterial({ color: '#6ff0d2', transparent: true, opacity: 0.85 }));
    peak.position.set(0.1, hmax, 0.25);
    lane.add(peak);
    const a = createAstronaut({ preset: ['sky', 'mint', 'coral'][i], helmet: look.helmet });
    a.setHelmet(look.helmet);
    a.root.rotation.y = 0.35;
    a.root.position.set(0.3, 0, 0.3);
    lane.add(a.root);
    scene.add(lane);
    return { g, lane, a, hmax, flight: (2 * JUMP_V0) / g.g, y: 0, peak };
  });

  let t0 = 0, hud, quizDone = false;
  function layout() {
    const mobile = ctx.isMobile();
    lanes.forEach((l, i) => {
      l.lane.position.set((i - 1) * (mobile ? 3.45 : 4.9), 0, 0);
      l.lane.scale.setScalar(mobile ? 0.72 : 1);
    });
    camera.position.set(0, mobile ? 2.6 : 2.0, mobile ? 24 : 13.5);
    camera.lookAt(0, mobile ? 1.9 : 1.25, 0);
  }

  function buildHud() {
    const src = (k) => `<a href="${SOURCES[k].url}" target="_blank" rel="noopener" style="color:var(--blue)">${SOURCES[k].title}</a>`;
    hud = h(`<div>
      <div class="tc"><div class="glass chip" style="font-size:14px">같은 힘으로 점프하면? · 지구·달·화성 중력 비교</div></div>
      <div class="tl pc-only"><button class="btn return" data-k="back">${I.back}<b>행성 정보</b></button></div>
      <div class="lanes">${lanes.map((l) => `<div class="glass lane-card"><div class="n">${l.g.ko}</div><div class="g">g = ${l.g.g} m/s²</div>
        <div class="live"><span>지금 높이<b data-h="${l.g.id}">0.00 m</b></span><span>최고 높이<b>${l.hmax.toFixed(2)} m</b></span><span>체공 시간<b>${l.flight.toFixed(2)} s</b></span></div></div>`).join('')}</div>
      <div class="bc"><div class="glass grav-panel">
        <div class="t">실제 물리값 그대로 · 시간 배율 ${GAME_TIME_SCALE.toFixed(1)} (게임 보정 없음)</div>
        <div class="note mobile-only">v₀ ${JUMP_V0} m/s · 실제 g 값 · 시간 배율 1.0 · 출처: NASA Fact Sheet (지구·달·화성)</div>
        <div class="note long">초기 점프 속도 v₀ = ${JUMP_V0} m/s · 최고 높이 h = v₀²/2g · 체공 시간 t = 2v₀/g · 공기 저항 없음 가정. 실제 우주복은 무겁고 움직임을 제한해 실제 점프는 이보다 낮아요.</div>
        <div class="note long">g 출처: ${GRAVITY.map((g) => `${g.ko} ${g.basis} — ${src(g.src)}`).join(' · ')}</div>
        <div style="display:flex;gap:8px"><button class="btn ghost" data-k="again">${I.jump}다시 점프</button><button class="btn lav" data-k="quiz">퀴즈 풀기</button></div>
        <div class="quiz" style="display:none">
          <div style="font-weight:800;font-size:14px">달에서 같은 힘으로 뛰면, 지구보다 약 몇 배 높이 올라갈까요?</div>
          <button data-a="0">① 약 2배</button><button data-a="1">② 약 6배</button><button data-a="0">③ 약 20배</button>
        </div>
      </div></div>
    </div>`);
    ctx.hud.appendChild(hud);
    hud.querySelector('[data-k="back"]').addEventListener('click', () => ctx.go('planet', { id: 'moon' }));
    hud.querySelector('[data-k="again"]').addEventListener('click', () => (t0 = 0));
    hud.querySelector('[data-k="quiz"]').addEventListener('click', () => (hud.querySelector('.quiz').style.display = 'grid'));
    hud.querySelectorAll('.quiz button').forEach((b) => b.addEventListener('click', () => {
      if (quizDone) return;
      quizDone = b.dataset.a === '1';
      b.classList.add(b.dataset.a === '1' ? 'right' : 'wrong');
      if (quizDone) b.textContent += ' — 정답! 1.78 m ÷ 0.29 m ≈ 6.05배';
    }));
  }

  return {
    id: 'gravity',
    scene,
    camera,
    renderOpts: { exposure: 1.0, bloomStrength: 0.3, bloomThreshold: 1.0 },
    enter() { buildHud(); layout(); t0 = 0; },
    exit() {},
    resize(w, hh) {
      camera.aspect = w / hh;
      camera.fov = w / hh < 0.8 ? 52 : 40;
      camera.updateProjectionMatrix();
      layout();
    },
    update(dt, t) {
      consumeLook();
      t0 += dt * GAME_TIME_SCALE;
      const cycle = lanes.reduce((m, l) => Math.max(m, l.flight), 0) + 1.4;
      const tt = t0 % cycle - 0.5; // 0.5초 준비 후 동시에 점프
      for (const l of lanes) {
        const air = tt > 0 && tt < l.flight;
        l.y = air ? JUMP_V0 * tt - 0.5 * l.g.g * tt * tt : 0;
        l.a.root.position.y = Math.max(0, l.y);
        l.a.state.mode = air ? 'float' : 'idle';
        l.a.update(dt, t);
        if (hud) {
          hud.querySelector(`[data-h="${l.g.id}"]`).textContent = `${Math.max(0, l.y).toFixed(2)} m`;
        }
      }
    },
  };
}
