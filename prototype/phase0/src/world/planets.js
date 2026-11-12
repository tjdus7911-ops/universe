import * as THREE from 'three';
import { NOISE } from '../core/glsl.js';
import { canvasTexture } from '../core/renderer.js';
import { createEarth, createMoon } from './earth.js';

// 행성 표면은 실제 사진이 아닌 '스타일라이즈드' 절차적 셰이더로 그린다 (라이선스 걱정 없음)
const TYPES = { rocky: 0, venus: 1, mars: 2, jupiter: 3, saturn: 4, uranus: 5, neptune: 6, sun: 7 };
const PAL = {
  mercury: ['#8d8a87', '#b9b4ae', '#6e6a68', '#d6d0c8'],
  venus: ['#e8cf96', '#d3a865', '#f3e2b8', '#b98b4e'],
  mars: ['#c8643c', '#e08a55', '#8f3f2a', '#f1e7dc'],
  jupiter: ['#e9d6b6', '#c79a6b', '#9c6b4b', '#f4ece0'],
  saturn: ['#efdcb1', '#d8bb84', '#c4a26a', '#f7ecd3'],
  uranus: ['#a9e3e6', '#8fd4dc', '#c6f0f0', '#7cc4cf'],
  neptune: ['#3f6fe0', '#2c4fb8', '#6f9bf0', '#1d3a8f'],
  sun: ['#fff2c4', '#ffb547', '#ff7a1a', '#ffffff'],
};

const vert = /* glsl */ `
  varying vec3 vObj; varying vec3 vN; varying vec3 vP;
  void main(){ vObj = normal; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const frag = /* glsl */ `
  ${NOISE}
  uniform int ptype; uniform vec3 c1, c2, c3, c4; uniform vec3 sunPos; uniform float time; uniform float ambient;
  varying vec3 vObj; varying vec3 vN; varying vec3 vP;
  vec3 bands(float y, float w, vec3 a, vec3 b, vec3 c){ float t = sin(y) * 0.5 + 0.5; float u = sin(y * 2.3 + 1.0) * 0.5 + 0.5; return mix(mix(a, b, t), c, u * w); }
  void main(){
    vec3 p = normalize(vObj);
    vec3 col;
    if (ptype == 0) {
      float n = fbm3(p * 3.0, 6); float cr = smoothstep(0.35, 0.5, fbm3(p * 9.0 + 4.0, 3));
      col = mix(c2, c1, n * 0.5 + 0.5); col = mix(col, c3, cr * 0.5); col = mix(col, c4, smoothstep(0.55, 0.8, fbm3(p * 18.0, 2)) * 0.3);
    } else if (ptype == 1) {
      float w = fbm3(p * 2.5 + vec3(time * 0.02, 0.0, 0.0), 5);
      col = bands(p.y * 7.0 + w * 3.0, 0.6, c1, c2, c3);
    } else if (ptype == 2) {
      float n = fbm3(p * 2.6, 6); float dark = smoothstep(0.05, 0.4, fbm3(p * 1.6 + 7.0, 4));
      col = mix(c1, c2, n * 0.5 + 0.5); col = mix(col, c3, dark * 0.55);
      col = mix(col, c4, smoothstep(0.86, 0.93, abs(p.y) + n * 0.05));
    } else if (ptype == 3 || ptype == 4) {
      float w = fbm3(vec3(p.x * 2.0, p.y * 9.0, p.z * 2.0) + vec3(time * 0.01, 0.0, 0.0), 5);
      float freq = ptype == 3 ? 15.0 : 11.0;
      col = bands(p.y * freq + w * 1.8, 0.7, c1, c2, c3);
      col = mix(col, c4, smoothstep(0.5, 0.9, sin(p.y * freq * 0.5 + w) * 0.5 + 0.5) * 0.35);
      if (ptype == 3) {
        vec2 spot = vec2(atan(p.z, p.x) - 0.9, (p.y + 0.36) * 3.2);
        float d = length(spot * vec2(1.0, 1.6));
        col = mix(col, vec3(0.78, 0.36, 0.25), smoothstep(0.32, 0.12, d) * 0.85);
      }
    } else if (ptype == 5 || ptype == 6) {
      float w = fbm3(p * 3.0 + vec3(0.0, 0.0, time * 0.01), 4);
      col = mix(c1, c2, smoothstep(-0.4, 0.6, sin(p.y * 8.0 + w * 1.5)) * 0.6);
      if (ptype == 6) { col = mix(col, c4, smoothstep(0.25, 0.6, fbm3(p * 4.0 + 2.0, 4)) * 0.5); col = mix(col, vec3(0.92, 0.96, 1.0), smoothstep(0.62, 0.75, fbm3(vec3(p.x * 3.0, p.y * 14.0, p.z * 3.0), 3)) * 0.7); }
      else col = mix(col, c3, smoothstep(0.2, 0.7, p.y) * 0.3);
    } else {
      float g1 = fbm3(p * 9.0 + vec3(0.0, time * 0.05, 0.0), 5);
      float g2 = fbm3(p * 30.0 - vec3(time * 0.08), 3);
      col = mix(c3, c2, g1 * 0.5 + 0.6); col = mix(col, c1, smoothstep(0.1, 0.6, g2) * 0.6);
      gl_FragColor = vec4(col * 2.6, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    vec3 N = normalize(vN); vec3 L = normalize(sunPos - vP); vec3 V = normalize(cameraPosition - vP);
    float lit = max(dot(N, L), 0.0);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 c = col * (ambient + lit * 1.15) + c1 * rim * 0.25 * (0.3 + lit);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function planetMaterial(id, typeKey) {
  const pal = PAL[id] || PAL.mercury;
  return new THREE.ShaderMaterial({
    uniforms: {
      ptype: { value: TYPES[typeKey] },
      c1: { value: new THREE.Color(pal[0]) }, c2: { value: new THREE.Color(pal[1]) }, c3: { value: new THREE.Color(pal[2]) }, c4: { value: new THREE.Color(pal[3]) },
      sunPos: { value: new THREE.Vector3() },
      time: { value: 0 },
      ambient: { value: 0.06 },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

function ringTexture(kind) {
  return canvasTexture(1024, 8, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let a, c;
      if (kind === 'saturn') {
        a = 0.25 + 0.55 * Math.abs(Math.sin(t * 40) * Math.sin(t * 13 + 1));
        if (t > 0.62 && t < 0.68) a *= 0.08; // 카시니 간극
        if (t < 0.12) a *= t / 0.12;
        if (t > 0.94) a *= (1 - t) / 0.06;
        c = `rgba(${235 - t * 40},${215 - t * 50},${170 - t * 50},${a})`;
      } else {
        a = (Math.sin(t * 60) > 0.92 ? 0.55 : 0.04) * (t > 0.2 && t < 0.95 ? 1 : 0);
        c = `rgba(200,230,240,${a})`;
      }
      ctx.fillStyle = c;
      ctx.fillRect(x, 0, 1, h);
    }
  });
}

function makeRing(inner, outer, kind) {
  const geo = new THREE.RingGeometry(inner, outer, 160, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({ map: ringTexture(kind), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: kind === 'saturn' ? '#ffffff' : '#cfeef5' });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

// id: sun | mercury | venus | earth | moon | mars | jupiter | saturn | uranus | neptune
export function createPlanet(id, radius, opts = {}) {
  const group = new THREE.Group();
  let mat = null, earth = null, body;
  const seg = opts.segments ?? 64;
  if (id === 'earth') {
    earth = createEarth(radius, { segments: seg, atmStrength: 1.1 });
    group.add(earth.group);
    body = earth.mesh;
  } else if (id === 'moon') {
    body = createMoon(radius);
    group.add(body);
  } else {
    const type = { sun: 'sun', mercury: 'rocky', venus: 'venus', mars: 'mars', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune' }[id];
    mat = planetMaterial(id, type);
    body = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, seg / 2), mat);
    group.add(body);
  }
  const tilt = { saturn: 0.47, uranus: 1.71, neptune: 0.49, mars: 0.44, earth: 0.41, jupiter: 0.05 }[id] || 0;
  if (id === 'saturn') group.add(makeRing(radius * 1.25, radius * 2.3, 'saturn'));
  if (id === 'uranus') group.add(makeRing(radius * 1.5, radius * 2.0, 'uranus'));
  group.rotation.z = tilt;
  return {
    group,
    body,
    earth,
    update(dt, t, sunWorld) {
      body.rotation.y += dt * (opts.spin ?? 0.15);
      if (mat) {
        mat.uniforms.time.value = t;
        mat.uniforms.sunPos.value.copy(sunWorld);
      }
      if (earth) {
        const wp = new THREE.Vector3();
        group.getWorldPosition(wp);
        earth.setSun(sunWorld.clone().sub(wp));
        earth.update(dt);
      }
    },
  };
}
