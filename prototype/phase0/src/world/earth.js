import * as THREE from 'three';
import { NOISE } from '../core/glsl.js';

const loader = new THREE.TextureLoader();
const cache = {};
function tex(name, srgb = true) {
  if (!cache[name]) {
    const t = loader.load(`${import.meta.env.BASE_URL}textures/${name}`);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    cache[name] = t;
  }
  return cache[name];
}
export const textureManager = THREE.DefaultLoadingManager;

// 지구: 낮(대륙)·밤(도시 불빛)·구름·바다 반사·대기 테두리를 셰이더 하나로 합성
export function createEarth(radius = 1000, opts = {}) {
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(1, 0.3, 0.2).normalize();
  const uniforms = {
    dayMap: { value: tex('earth_day.jpg') },
    nightMap: { value: tex('earth_night.jpg') },
    cloudMap: { value: tex('earth_clouds.jpg', false) },
    oceanMap: { value: tex('earth_ocean.png', false) },
    sunDir: { value: sunDir },
    cloudShift: { value: 0 },
    nightBoost: { value: opts.nightBoost ?? 1.6 },
    dayBoost: { value: opts.dayBoost ?? 1.0 },
    atmIn: { value: opts.atmIn ?? 0.6 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
      void main(){
        vUv = uv; vObj = normal;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform sampler2D dayMap, nightMap, cloudMap, oceanMap;
      uniform vec3 sunDir; uniform float cloudShift, nightBoost, dayBoost, atmIn;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vP);
        vec3 L = normalize(sunDir);
        float ndl = dot(N, L);
        float lit = max(ndl, 0.0);
        float dayAmt = smoothstep(-0.10, 0.20, ndl);
        float ocean = texture2D(oceanMap, vUv).r;
        vec3 day = texture2D(dayMap, vUv).rgb;
        // 가까이서 봐도 뭉개지지 않도록 잔무늬 노이즈를 덧입힌다
        float det = snoise(vObj * 220.0) * 0.5 + snoise(vObj * 640.0) * 0.25;
        day *= 1.0 + det * mix(0.10, 0.03, ocean);
        vec3 night = texture2D(nightMap, vUv).rgb;
        float cloud = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
        float shadow = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0) + L.xz * 0.0015).r;
        float lum = dot(day, vec3(0.299, 0.587, 0.114));
        day = mix(vec3(lum), day, 1.18);
        vec3 col = day * (0.025 + lit * 1.0 * dayBoost) * (1.0 - shadow * 0.35 * dayAmt);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 70.0) * ocean * (1.0 - cloud) * smoothstep(0.0, 0.2, ndl);
        col += vec3(1.0, 0.92, 0.78) * spec * 0.9;
        vec3 cloudCol = vec3(1.0, 1.0, 1.02) * (0.02 + lit * 1.15 * dayBoost);
        col = mix(col, cloudCol, cloud * 0.78);
        col += night * (1.0 - dayAmt) * (1.0 - cloud * 0.75) * nightBoost;
        float term = smoothstep(-0.06, 0.08, ndl) * (1.0 - smoothstep(0.08, 0.3, ndl));
        col += vec3(0.85, 0.35, 0.12) * term * 0.10;
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 atm = mix(vec3(0.20, 0.45, 1.0), vec3(0.50, 0.78, 1.0), lit);
        col += atm * fres * (0.06 + 0.94 * smoothstep(-0.25, 0.4, ndl)) * atmIn;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const seg = opts.segments ?? 160;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, seg / 2), mat);
  group.add(mesh);

  // 바깥 대기 빛: 시선이 지구 중심을 얼마나 가깝게 지나는지로 테두리 빛을 계산 (경계선 없이 부드럽게 사라짐)
  const shell = radius * (opts.atmScale ?? 1.045);
  const atmMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: uniforms.sunDir,
      center: { value: new THREE.Vector3() },
      R: { value: radius },
      Rs: { value: shell },
      strength: { value: opts.atmStrength ?? 1.25 },
    },
    vertexShader: /* glsl */ `varying vec3 vP;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, center; uniform float R, Rs, strength; varying vec3 vP;
      void main(){
        vec3 D = normalize(vP - cameraPosition);
        vec3 oc = center - cameraPosition;
        float tc = dot(oc, D);
        vec3 closest = cameraPosition + D * tc;
        float d = length(closest - center);
        float inten = d < R ? pow(d / R, 22.0) * 0.7 : pow(clamp(1.0 - (d - R) / (Rs - R), 0.0, 1.0), 2.4);
        vec3 limbN = normalize(closest - center);
        float sun = dot(limbN, normalize(sunDir));
        float light = smoothstep(-0.35, 0.35, sun);
        vec3 c = mix(vec3(0.16, 0.38, 1.0), vec3(0.42, 0.72, 1.0), light);
        c = mix(vec3(1.0, 0.48, 0.22), c, smoothstep(-0.18, 0.2, sun));
        gl_FragColor = vec4(c * inten * (0.06 + light) * strength, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atm = new THREE.Mesh(new THREE.SphereGeometry(shell, 128, 64), atmMat);
  atm.onBeforeRender = () => { group.getWorldPosition(atmMat.uniforms.center.value); };
  group.add(atm);

  return {
    group,
    mesh,
    uniforms,
    setSun(v) { uniforms.sunDir.value.copy(v).normalize(); },
    update(dt) { uniforms.cloudShift.value += dt * 0.0012; },
    // 경도·위도를 정면(+Z, 카메라 쪽)으로 돌려 놓는다
    face(lonDeg, latDeg, roll = 0, pitch = 0) {
      const lat = THREE.MathUtils.degToRad(latDeg);
      const phi = (lonDeg + 180) / 360 * Math.PI * 2;
      const d = new THREE.Vector3(-Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat));
      const a = Math.atan2(-d.x, d.z);
      const zh = -d.x * Math.sin(a) + d.z * Math.cos(a);
      const b = Math.atan2(d.y, zh) + pitch;
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), b);
      const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
      group.quaternion.copy(qz.multiply(qx.multiply(qy)));
    },
  };
}

export function createMoon(radius = 60) {
  const mat = new THREE.MeshStandardMaterial({ map: tex('moon.jpg'), bumpMap: tex('moon_bump.jpg', false), bumpScale: 2.2, roughness: 0.95, metalness: 0 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  return m;
}

export { tex };
