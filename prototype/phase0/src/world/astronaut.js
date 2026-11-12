import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, FONT, roundRect } from '../core/renderer.js';

// SD 비율 우주복 아바타 (시안용 절차적 모델)
// 관절 이름은 멍글마을 아바타(body·torso·head·armL·armR·legL·legR)와 같게 맞춰
// PHASE 1에서 멍글마을 빌더 구조를 옮겨 와도 애니메이션 코드를 그대로 쓸 수 있게 했다.
export const SUIT_PRESETS = {
  mint: { suit: '#f4f6fb', accent: '#5fe0c3', glove: '#ff8f7a', boot: '#d9d4ea' },
  lavender: { suit: '#f6f3ff', accent: '#a98bff', glove: '#ffb36b', boot: '#d4d9ea' },
  coral: { suit: '#fbf6f3', accent: '#ff8a74', glove: '#7cc8ff', boot: '#e0d6d2' },
  sky: { suit: '#f2f7ff', accent: '#6fb4ff', glove: '#ffd166', boot: '#d4dcea' },
};
export const SKINS = ['#ffdcc6', '#f6cba8', '#e3ad86', '#b57c58'];
export const HAIRS = ['#3a2a22', '#6b4127', '#d9a05b', '#2a2633', '#c47a8a'];

const geoCache = new Map();
function G(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.55, metalness: opts.m ?? 0, emissive: opts.e ?? 0x000000, emissiveIntensity: opts.ei ?? 1 });
}

export function nameTag(text, opts = {}) {
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.font = `700 46px ${FONT}`;
    const tw = Math.min(ctx.measureText(text).width + 64, w - 8);
    const x = (w - tw) / 2;
    roundRect(ctx, x, 24, tw, 80, 40);
    ctx.fillStyle = opts.bg || 'rgba(12,18,42,0.72)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = opts.ring || 'rgba(111,240,210,0.85)';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, 66);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(0.9, 0.225, 1);
  sp.renderOrder = 10;
  return sp;
}

export function speechBubble(text) {
  const tex = canvasTexture(640, 200, (ctx, w) => {
    ctx.font = `600 42px ${FONT}`;
    const tw = Math.min(ctx.measureText(text).width + 70, w - 10);
    const x = (w - tw) / 2;
    roundRect(ctx, x, 20, tw, 110, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 18, 128);
    ctx.lineTo(w / 2, 160);
    ctx.lineTo(w / 2 + 18, 128);
    ctx.fill();
    ctx.fillStyle = '#1b2244';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, 76);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.5, 0.47, 1);
  sp.renderOrder = 11;
  return sp;
}

export function createAstronaut(o = {}) {
  const preset = SUIT_PRESETS[o.preset || 'mint'];
  const skin = o.skin || SKINS[0];
  const hair = o.hair || HAIRS[0];
  const root = new THREE.Group();
  root.name = 'astronaut';
  const suitM = new THREE.MeshPhysicalMaterial({ color: preset.suit, roughness: 0.62, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') });
  const accentM = mat(preset.accent, { r: 0.38 });
  const gloveM = mat(preset.glove, { r: 0.5 });
  const bootM = mat(preset.boot, { r: 0.45 });
  const greyM = mat('#c9cede', { r: 0.35, m: 0.25 });
  const skinM = mat(skin, { r: 0.6 });
  const hairM = mat(hair, { r: 0.5 });
  const darkM = mat('#2b211f', { r: 0.25 });
  const whiteGlow = mat('#ffffff', { r: 0.2 });
  const parts = { suitM, accentM, gloveM, bootM };

  const add = (parent, geo, m, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const pivot = (parent, name, pos) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    parent.add(g);
    return g;
  };

  const body = pivot(root, 'body', [0, 0.36, 0]);
  // 다리
  const legs = {};
  for (const s of [-1, 1]) {
    const leg = pivot(body, s < 0 ? 'legL' : 'legR', [0.1 * s, 0.02, 0]);
    add(leg, G('leg', () => new THREE.CapsuleGeometry(0.088, 0.14, 8, 16)), suitM, [0, -0.13, 0]);
    add(leg, G('knee', () => new THREE.TorusGeometry(0.088, 0.022, 8, 20)), accentM, [0, -0.13, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(leg, G('boot', () => new THREE.SphereGeometry(0.115, 24, 16)), bootM, [0, -0.29, 0.03], [1.0, 0.72, 1.32]);
    add(leg, G('sole', () => new THREE.CylinderGeometry(0.105, 0.11, 0.035, 24)), greyM, [0, -0.355, 0.035], [1, 1, 1.3]);
    legs[s] = leg;
  }
  // 몸통
  const torso = pivot(body, 'torso', [0, 0.02, 0]);
  add(torso, G('torso', () => new THREE.CapsuleGeometry(0.2, 0.15, 10, 24)), suitM, [0, 0.22, 0], [1.05, 1, 0.92]);
  add(torso, G('belt', () => new THREE.TorusGeometry(0.2, 0.034, 10, 32)), accentM, [0, 0.07, 0], [1.03, 1, 0.92], [Math.PI / 2, 0, 0]);
  const chest = add(torso, G('chest', () => new RoundedBoxGeometry(0.2, 0.14, 0.07, 3, 0.025)), accentM, [0, 0.27, 0.165], [1, 1, 1], [-0.12, 0, 0]);
  void chest;
  const lights = [];
  ['#6ff0d2', '#ffd166', '#ff8f7a'].forEach((c, i) => {
    const m = mat(c, { e: c, ei: 1.6, r: 0.3 });
    lights.push(add(torso, G('btn', () => new THREE.SphereGeometry(0.016, 12, 8)), m, [-0.05 + i * 0.05, 0.285, 0.205]));
  });
  add(torso, G('collar', () => new THREE.TorusGeometry(0.135, 0.042, 12, 32)), greyM, [0, 0.47, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  // 우주복 배낭(생명유지장치) + 추진기
  const pack = pivot(torso, 'backpack', [0, 0.27, -0.2]);
  add(pack, G('pack', () => new RoundedBoxGeometry(0.36, 0.38, 0.16, 4, 0.05)), suitM, [0, 0, 0]);
  add(pack, G('packStripe', () => new RoundedBoxGeometry(0.37, 0.06, 0.165, 2, 0.02)), accentM, [0, 0.09, 0]);
  const nozzles = [];
  for (const s of [-1, 1]) {
    add(pack, G('nozzle', () => new THREE.CylinderGeometry(0.03, 0.048, 0.08, 16, 1, true)), greyM, [0.1 * s, -0.22, -0.03]);
    const e = new THREE.Object3D();
    e.position.set(0.1 * s, -0.27, -0.03);
    pack.add(e);
    nozzles.push(e);
  }
  const packLight = add(pack, G('packLight', () => new THREE.SphereGeometry(0.018, 10, 8)), mat('#6ff0d2', { e: '#6ff0d2', ei: 2 }), [0.12, 0.14, -0.085]);
  // 팔
  const arms = {};
  for (const s of [-1, 1]) {
    const arm = pivot(torso, s < 0 ? 'armL' : 'armR', [0.235 * s, 0.38, 0]);
    add(arm, G('shoulder', () => new THREE.SphereGeometry(0.088, 20, 14)), suitM, [0, 0, 0]);
    add(arm, G('arm', () => new THREE.CapsuleGeometry(0.066, 0.13, 8, 16)), suitM, [0.012 * s, -0.12, 0]);
    add(arm, G('cuff', () => new THREE.TorusGeometry(0.066, 0.02, 8, 20)), accentM, [0.015 * s, -0.2, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(arm, G('glove', () => new THREE.SphereGeometry(0.076, 20, 14)), gloveM, [0.018 * s, -0.27, 0.01], [1, 1.05, 1]);
    arm.rotation.z = 0.12 * s;
    arms[s] = arm;
  }
  // 머리
  const head = pivot(torso, 'head', [0, 0.76, 0]);
  add(head, G('head', () => new THREE.SphereGeometry(0.25, 40, 28)), skinM, [0, 0, 0], [1.04, 0.98, 1]);
  for (const s of [-1, 1]) {
    add(head, G('eye', () => new THREE.SphereGeometry(0.04, 20, 14)), darkM, [0.083 * s, 0.0, 0.222], [0.82, 1.18, 0.45]);
    add(head, G('hl', () => new THREE.SphereGeometry(0.011, 8, 6)), whiteGlow, [0.083 * s + 0.012, 0.022, 0.245]);
    const blush = add(head, G('blush', () => new THREE.CircleGeometry(0.036, 20)), new THREE.MeshBasicMaterial({ color: '#ff9b9b', transparent: true, opacity: 0.55 }), [0.145 * s, -0.06, 0.196], [1.2, 0.8, 1]);
    blush.lookAt(blush.position.clone().multiplyScalar(2));
    blush.castShadow = false;
  }
  add(head, G('mouth', () => new THREE.TorusGeometry(0.026, 0.0075, 8, 16, Math.PI)), darkM, [0, -0.07, 0.236], [1, 1, 1], [0, 0, Math.PI]);
  // 머리카락 (단발)
  add(head, G('hairCap', () => new THREE.SphereGeometry(0.268, 40, 24, 0, Math.PI * 2, 0, 1.2)), hairM, [0, 0.012, -0.004], [1.05, 1, 1.02]);
  add(head, G('hairBack', () => new THREE.SphereGeometry(0.262, 40, 24, Math.PI, Math.PI, 0.6, 1.35)), hairM, [0, -0.005, -0.012], [1.07, 1, 1.03]);
  for (const [x, y, z, s] of [[-0.11, 0.13, 0.19, 0.075], [0, 0.155, 0.205, 0.08], [0.11, 0.13, 0.19, 0.075], [-0.2, 0.0, 0.11, 0.07], [0.2, 0.0, 0.11, 0.07]]) {
    add(head, G('bang', () => new THREE.SphereGeometry(1, 16, 12)), hairM, [x, y, z], [s * 1.2, s * 0.8, s * 0.7]);
  }
  // 헬멧 (우주 유영용)
  const helmet = new THREE.Group();
  helmet.name = 'helmet';
  head.add(helmet);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#dff3ff', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 2.2, depthWrite: false, side: THREE.FrontSide,
  });
  const bubble = add(helmet, G('helmet', () => new THREE.SphereGeometry(0.355, 48, 32)), glass, [0, 0.02, 0.01]);
  bubble.castShadow = false;
  bubble.renderOrder = 5;
  add(helmet, G('helmRing', () => new THREE.TorusGeometry(0.235, 0.05, 14, 40)), suitM, [0, -0.27, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(helmet, G('lamp', () => new THREE.CylinderGeometry(0.035, 0.04, 0.07, 16)), greyM, [0.33, 0.06, 0.03], [1, 1, 1], [0, 0, Math.PI / 2]);
  add(helmet, G('lampLens', () => new THREE.CircleGeometry(0.03, 16)), mat('#bffcff', { e: '#bffcff', ei: 2.5 }), [0.366, 0.06, 0.03], [1, 1, 1], [0, Math.PI / 2, 0]);
  add(helmet, G('ant', () => new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6)), greyM, [-0.17, 0.33, -0.05], [1, 1, 1], [0.1, 0, 0.35]);
  add(helmet, G('antTip', () => new THREE.SphereGeometry(0.022, 10, 8)), mat(preset.accent, { e: preset.accent, ei: 2.2 }), [-0.2, 0.41, -0.04]);
  helmet.visible = !!o.helmet;

  let tag = null;
  if (o.name) {
    tag = nameTag(o.name, { ring: preset.accent });
    tag.position.set(0, 1.62, 0);
    root.add(tag);
  }

  let phase = Math.random() * 10;
  const t0 = Math.random() * 10;
  const state = { mode: 'idle', speed: 0, thrust: 0, air: 0, squash: 0, lean: 0, flip: 0 };
  return {
    root,
    body,
    torso,
    head,
    helmet,
    nozzles,
    parts,
    state,
    tag,
    setHelmet(v) { helmet.visible = v; if (tag) tag.position.y = v ? 1.72 : 1.62; },
    setPreset(key) {
      const p = SUIT_PRESETS[key];
      suitM.color.set(p.suit);
      accentM.color.set(p.accent);
      gloveM.color.set(p.glove);
      bootM.color.set(p.boot);
    },
    update(dt, t) {
      const tt = t + t0;
      const m = state.mode;
      lights.forEach((l, i) => (l.material.emissiveIntensity = 1.2 + Math.sin(tt * 3 + i * 2) * 0.6));
      packLight.material.emissiveIntensity = 1.5 + Math.sin(tt * 5) * 0.8;
      if (m === 'walk') {
        phase += dt * (4 + state.speed * 2.6);
        const s = Math.sin(phase);
        legs[-1].rotation.x = s * 0.62;
        legs[1].rotation.x = -s * 0.62;
        arms[-1].rotation.x = -s * 0.55;
        arms[1].rotation.x = s * 0.55;
        arms[-1].rotation.z = -0.12;
        arms[1].rotation.z = 0.12;
        legs[-1].rotation.z = legs[1].rotation.z = 0;
        body.position.y = 0.36 + Math.abs(Math.cos(phase)) * 0.035;
        torso.rotation.z = s * 0.04;
        head.rotation.set(0, 0, 0);
      } else if (m === 'air') {
        // 저중력 도약: 다리를 모으고 팔을 벌려 균형 (state.air: +1 상승 … −1 하강)
        const a = Math.max(-1, Math.min(1, state.air));
        legs[-1].rotation.x = -0.32 - a * 0.14;
        legs[1].rotation.x = -0.22 - a * 0.14;
        legs[-1].rotation.z = -0.07;
        legs[1].rotation.z = 0.07;
        arms[-1].rotation.z = -1.0 - a * 0.4 - Math.sin(tt * 2.2) * 0.06;
        arms[1].rotation.z = 1.0 + a * 0.4 + Math.sin(tt * 2.2) * 0.06;
        arms[-1].rotation.x = arms[1].rotation.x = -0.25;
        body.position.y = 0.36;
        torso.rotation.z = 0;
        head.rotation.set(-0.15 * a, 0, 0);
      } else if (m === 'wave' || m === 'cheer') {
        legs[-1].rotation.x = legs[1].rotation.x = 0;
        legs[-1].rotation.z = legs[1].rotation.z = 0;
        if (m === 'wave') {
          arms[-1].rotation.z = -0.16;
          arms[-1].rotation.x = 0;
          arms[1].rotation.z = 2.45 + Math.sin(tt * 8) * 0.38;
          arms[1].rotation.x = -0.15;
          head.rotation.set(0, Math.sin(tt * 1.1) * 0.12, Math.sin(tt * 8) * 0.05);
          body.position.y = 0.36 + Math.abs(Math.sin(tt * 4)) * 0.012;
        } else {
          arms[-1].rotation.z = -2.6 - Math.sin(tt * 6) * 0.15;
          arms[1].rotation.z = 2.6 + Math.sin(tt * 6 + 0.5) * 0.15;
          arms[-1].rotation.x = arms[1].rotation.x = -0.1;
          head.rotation.set(-0.12, 0, 0);
          body.position.y = 0.36 + Math.abs(Math.sin(tt * 5)) * 0.035;
        }
        torso.rotation.z = 0;
      } else if (m === 'dance') {
        // 춤: 리듬에 맞춰 통통 + 팔 번갈아 올리기 + 엉덩이 흔들기
        const b = Math.sin(tt * 6.4);
        legs[-1].rotation.x = Math.max(0, b) * 0.35;
        legs[1].rotation.x = Math.max(0, -b) * 0.35;
        legs[-1].rotation.z = legs[1].rotation.z = 0;
        arms[-1].rotation.z = -1.7 - b * 0.75;
        arms[1].rotation.z = 1.7 - b * 0.75;
        arms[-1].rotation.x = arms[1].rotation.x = -0.2;
        body.position.y = 0.36 + Math.abs(Math.sin(tt * 6.4)) * 0.05;
        torso.rotation.z = Math.sin(tt * 3.2) * 0.2;
        head.rotation.set(0, Math.sin(tt * 3.2) * 0.3, Math.sin(tt * 6.4) * 0.12);
      } else if (m === 'clap') {
        const c = Math.abs(Math.sin(tt * 8));
        legs[-1].rotation.x = legs[1].rotation.x = 0;
        legs[-1].rotation.z = legs[1].rotation.z = 0;
        arms[-1].rotation.x = arms[1].rotation.x = -1.25;
        arms[-1].rotation.z = -0.08 - c * 0.42;
        arms[1].rotation.z = 0.08 + c * 0.42;
        body.position.y = 0.36 + c * 0.012;
        torso.rotation.z = 0;
        head.rotation.set(-0.08, 0, 0);
      } else if (m === 'sit') {
        // 땅에 앉기: 다리를 앞으로 뻗고 엉덩이를 바닥까지
        legs[-1].rotation.x = legs[1].rotation.x = -1.45;
        legs[-1].rotation.z = -0.12;
        legs[1].rotation.z = 0.12;
        arms[-1].rotation.x = arms[1].rotation.x = -0.55;
        arms[-1].rotation.z = -0.28;
        arms[1].rotation.z = 0.28;
        body.position.y = 0.13 + Math.sin(tt * 1.4) * 0.004;
        torso.rotation.z = 0;
        head.rotation.set(-0.12 + Math.sin(tt * 0.5) * 0.05, Math.sin(tt * 0.4) * 0.3, 0);
      } else if (m === 'lie') {
        // 누워서 별 보기: 팔베개
        legs[-1].rotation.x = legs[1].rotation.x = 0;
        legs[-1].rotation.z = -0.1;
        legs[1].rotation.z = 0.1;
        arms[-1].rotation.z = -2.75;
        arms[1].rotation.z = 2.75;
        arms[-1].rotation.x = arms[1].rotation.x = 0.35;
        body.position.y = 0.24;
        torso.rotation.z = 0;
        head.rotation.set(0.25, Math.sin(tt * 0.3) * 0.2, 0);
      } else if (m === 'float') {
        const th = state.thrust;
        legs[-1].rotation.x = 0.28 + Math.sin(tt * 0.9) * 0.12 + th * 0.2;
        legs[1].rotation.x = 0.12 + Math.sin(tt * 0.9 + 1.4) * 0.12 + th * 0.25;
        legs[-1].rotation.z = -0.08;
        legs[1].rotation.z = 0.1;
        arms[-1].rotation.z = -(0.75 - th * 0.45) - Math.sin(tt * 0.7) * 0.12;
        arms[1].rotation.z = 0.75 - th * 0.45 + Math.sin(tt * 0.7 + 0.8) * 0.12;
        arms[-1].rotation.x = 0.2 + th * 0.5;
        arms[1].rotation.x = 0.1 + th * 0.5;
        body.position.y = 0.36;
        torso.rotation.z = Math.sin(tt * 0.5) * 0.05;
        head.rotation.y = Math.sin(tt * 0.33) * 0.35;
        head.rotation.x = -0.1 + Math.sin(tt * 0.41) * 0.08;
      } else {
        // 대기: 숨쉬기 + 살짝 두리번
        legs[-1].rotation.x = legs[1].rotation.x = 0;
        legs[-1].rotation.z = legs[1].rotation.z = 0;
        arms[-1].rotation.x = Math.sin(tt * 1.3) * 0.05;
        arms[1].rotation.x = -Math.sin(tt * 1.3) * 0.05;
        arms[-1].rotation.z = -0.14 - Math.sin(tt * 1.6) * 0.03;
        arms[1].rotation.z = 0.14 + Math.sin(tt * 1.6) * 0.03;
        body.position.y = 0.36 + Math.sin(tt * 1.6) * 0.006;
        torso.rotation.z = 0;
        head.rotation.y = Math.sin(tt * 0.45) * 0.25;
        head.rotation.x = Math.sin(tt * 0.6) * 0.05;
      }
      // 착지 충격(무릎 굽힘)·앞으로 기울기 — 달 기지 장면에서 사용
      const sq = state.squash || 0;
      torso.rotation.x = (state.lean || 0) + sq * 0.28;
      // 공중제비(state.flip)·눕기는 엉덩이 축으로 몸 전체를 돌린다
      body.rotation.x = m === 'lie' ? -1.42 : state.flip || 0;
      if (sq > 0) {
        body.position.y -= sq * 0.075;
        legs[-1].rotation.x -= sq * 0.35;
        legs[1].rotation.x -= sq * 0.35;
      }
    },
  };
}

// 우주 환경 반사용 환경맵 (지구의 파란빛 + 태양)
export function makeSpaceEnv(renderer, sunDir = new THREE.Vector3(-0.5, 0.6, -0.4)) {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 d; void main(){ float e = smoothstep(0.1, -0.6, d.y); vec3 c = mix(vec3(0.02,0.03,0.07), vec3(0.18,0.42,0.85), e); c += vec3(0.6,0.8,1.0) * exp(-pow((d.y + 0.08) / 0.06, 2.0)) * 0.6; gl_FragColor = vec4(c, 1.0); }',
  }));
  s.add(sky);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 28, 25) }));
  sun.position.copy(sunDir.clone().normalize().multiplyScalar(40));
  s.add(sun);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return env;
}
