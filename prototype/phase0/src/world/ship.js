import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAstronaut } from './astronaut.js';

// 개인 우주선 '달마중호' 비행형 (우주 탐험용 · 시안 절차적 모델)
// 로컬 +Z = 앞쪽. 조종석 거품창 안에 내 아바타가 앉아 있다.
export function createShip(profile = {}) {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: '#fbf8f3', roughness: 0.42, sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.3 });
  const coral = new THREE.MeshStandardMaterial({ color: '#ff8f7a', roughness: 0.4 });
  const mint = new THREE.MeshStandardMaterial({ color: '#5fe0c3', roughness: 0.4 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c8ccd8', roughness: 0.3, metalness: 0.8 });
  const add = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    g.add(m);
    return m;
  };
  // 몸통 (앞이 둥근 캡슐)
  add(new THREE.CapsuleGeometry(1.05, 2.4, 12, 32), shell, [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(new THREE.TorusGeometry(1.06, 0.07, 10, 48), coral, [0, 0, -0.7]);
  add(new THREE.TorusGeometry(1.06, 0.04, 8, 48), mint, [0, 0, -0.95]);
  // 날개
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(1.7, 0.14, 1.2, 2, 0.06), coral, [1.35 * s, -0.25, -0.5], [0, -0.25 * s, -0.22 * s]);
    add(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: s < 0 ? '#ff5d6c' : '#6ff0d2', emissive: s < 0 ? '#ff5d6c' : '#6ff0d2', emissiveIntensity: 2.5 }), [2.15 * s, -0.42, -0.62]);
  }
  add(new RoundedBoxGeometry(0.14, 0.9, 1.0, 2, 0.05), coral, [0, 0.95, -1.25], [0.35, 0, 0]);
  // 엔진
  add(new THREE.CylinderGeometry(0.55, 0.75, 0.6, 28, 1, true), metal, [0, 0, -2.05], [Math.PI / 2, 0, 0]);
  const glow = add(new THREE.CircleGeometry(0.52, 24), new THREE.MeshStandardMaterial({ color: '#9fe3ff', emissive: '#9fe3ff', emissiveIntensity: 2 }), [0, 0, -2.3], [0, Math.PI, 0]);
  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { power: { value: 0.3 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float power, time; void main(){ float a = pow(1.0 - vUv.y, 1.6) * power; float fl = 0.85 + 0.15 * sin(time * 40.0 + vUv.y * 20.0); vec3 c = mix(vec3(0.45, 0.8, 1.0), vec3(1.0, 0.98, 0.95), pow(1.0 - vUv.y, 4.0)); gl_FragColor = vec4(c * a * fl, a); }',
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 24, 1, true), flameMat);
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -2.3 - 1.6;
  g.add(flame);
  // 조종석 거품창 + 안에 앉은 내 아바타
  const pilot = createAstronaut({ preset: profile.preset || 'mint', skin: profile.skin, hair: profile.hair });
  pilot.root.scale.setScalar(0.62);
  pilot.root.position.set(0, 0.42, 0.55);
  pilot.state.mode = 'sit';
  g.add(pilot.root);
  const canopy = add(new THREE.SphereGeometry(0.95, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#dff3ff', roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }), [0, 0.55, 0.55], [0, 0, 0], [0.82, 0.78, 1.0]);
  canopy.renderOrder = 4;
  add(new THREE.TorusGeometry(0.78, 0.06, 8, 40), metal, [0, 0.55, 0.55], [Math.PI / 2, 0, 0], [1, 1.22, 1]);
  const light = new THREE.PointLight('#9fd8ff', 0, 14, 1.6);
  light.position.z = -3;
  g.add(light);
  return {
    group: g,
    pilot,
    setThrust(v, t) {
      flameMat.uniforms.power.value = 0.25 + v * 0.95;
      flameMat.uniforms.time.value = t;
      flame.scale.set(1, 0.5 + v * 0.9 + Math.sin(t * 29) * 0.03, 1);
      glow.material.emissiveIntensity = 1.5 + v * 2.5;
      light.intensity = v * 18;
    },
    update(dt, t) { pilot.update(dt, t); },
  };
}
