import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { NOISE } from '../core/glsl.js';
import { canvasTexture } from '../core/renderer.js';

// 별 — 색온도가 다른 점 수천 개 + 은은한 반짝임
export function createStarfield(count = 6000, radius = 9000, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const palette = [[0.75, 0.82, 1.0], [1, 1, 1], [1, 0.95, 0.85], [1, 0.85, 0.7], [0.85, 0.9, 1.0]];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    // 은하수 띠 쪽에 별을 조금 더 모은다
    let x = r * Math.cos(th), y = u, z = r * Math.sin(th);
    if (rnd() < 0.35) {
      y *= 0.18;
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
    }
    pos.set([x * radius, y * radius, z * radius], i * 3);
    const c = palette[Math.floor(rnd() * palette.length)];
    const b = 0.55 + rnd() * 0.6;
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    size[i] = Math.pow(rnd(), 6) * 3.2 + 0.9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pr: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float time; uniform float pr;
      void main(){
        vC = color * (0.85 + 0.15 * sin(time * 1.7 + position.x * 0.013 + position.z * 0.007));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * pr;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vC * a * 1.6, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

// 은하수 + 성운 (배경 구, 절차적 셰이더)
export function createSkyDome(radius = 9500, tint = 1.0) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { tint: { value: tint } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      varying vec3 vDir; uniform float tint;
      void main(){
        vec3 d = normalize(vDir);
        // 기울어진 은하수 띠
        vec3 n = normalize(vec3(0.25, 1.0, 0.35));
        float band = exp(-pow(dot(d, n) / 0.16, 2.0));
        float dust = fbm3(d * 4.0, 5);
        float fine = fbm3(d * 14.0 + 3.0, 4);
        float glow = band * (0.55 + 0.45 * dust) * (0.8 + 0.4 * fine);
        float lane = smoothstep(0.05, 0.35, fbm3(d * 6.0 + 9.0, 4)) * band;
        vec3 col = vec3(0.012, 0.016, 0.04);
        col += glow * vec3(0.16, 0.15, 0.24) * 0.55;
        col -= lane * vec3(0.05, 0.05, 0.07);
        // 파스텔 성운 (라벤더·민트)
        float neb1 = smoothstep(0.15, 0.7, fbm3(d * 2.2 + 11.0, 5)) * smoothstep(0.2, 0.9, dot(d, normalize(vec3(-0.6, 0.35, -0.7))) + 0.6);
        float neb2 = smoothstep(0.2, 0.75, fbm3(d * 2.6 + 4.0, 5)) * smoothstep(0.2, 0.9, dot(d, normalize(vec3(0.8, -0.1, 0.5))) + 0.5);
        col += neb1 * vec3(0.11, 0.06, 0.18) * 0.55 + neb2 * vec3(0.03, 0.12, 0.13) * 0.5;
        gl_FragColor = vec4(max(col, 0.0) * tint, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  m.renderOrder = -20;
  m.frustumCulled = false;
  return m;
}

function radialTexture(stops, size = 256) {
  return canvasTexture(size, size, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

// 태양: 밝은 핵 + 코로나 후광 (블룸으로 빛 번짐)
export function createSun(size = 260) {
  const g = new THREE.Group();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,250,235,1)'], [0.4, 'rgba(255,220,170,0.6)'], [1, 'rgba(255,180,120,0)']]),
    color: new THREE.Color(6, 5.6, 5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  core.scale.setScalar(size);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,240,215,0.55)'], [0.3, 'rgba(255,214,170,0.18)'], [1, 'rgba(255,190,150,0)']]),
    color: new THREE.Color(1.4, 1.3, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(size * 7);
  g.add(halo, core);
  return g;
}

export function createLensflare(color = 0xffffff) {
  const ring = canvasTexture(128, 128, (ctx, w) => {
    const gr = ctx.createRadialGradient(w / 2, w / 2, w * 0.28, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.75, 'rgba(180,220,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, w);
  });
  const dot = radialTexture([[0, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(190,170,255,0.18)'], [1, 'rgba(255,255,255,0)']], 128);
  const flare = new Lensflare();
  flare.addElement(new LensflareElement(dot, 70, 0.32, new THREE.Color(0.75, 0.7, 1.0)));
  flare.addElement(new LensflareElement(ring, 120, 0.55, new THREE.Color(0.55, 0.9, 0.85)));
  flare.addElement(new LensflareElement(dot, 40, 0.75, new THREE.Color(1.0, 0.75, 0.65)));
  flare.addElement(new LensflareElement(ring, 220, 1.0, new THREE.Color(0.6, 0.7, 1.0)));
  return flare;
}
