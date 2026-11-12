import * as THREE from 'three';

// 물 마시기 연출
//  g = 0 (궤도 정거장, 무중력): 물주머니를 짜면 물이 표면장력으로 공처럼 뭉쳐 둥둥 떠 있다가 입으로.
//         흩어진 작은 물방울도 아래로 떨어지지 않고 천천히 떠다니다 사라진다.
//  g > 0 (달 라운지, 1/6 중력): 빨대로 마시고, 흘린 물방울은 지구보다 천천히 떨어진다.
//  suit (달 표면, 헬멧 착용): 우주복 안 음료 주머니 — 헬멧 목 고리 안쪽의 빨대로 고개를 숙여 마신다.
//         아폴로 달 탐사 우주복에 실제로 있던 장비 (헬멧 목 고리 안쪽 빨대 · 스미소니언 항공우주박물관 소장품 설명).
//         빨대 끝에 맺힌 물방울은 헬멧 안에서 1/6 중력으로 천천히 떨어진다.
// 우주 유영·우주 탐험에는 감정 표현이 없어서 실행되지 않는다.
const GEO = new THREE.SphereGeometry(1, 24, 16);

export function createDrink(scene, avatar, opts = {}) {
  const arm = avatar.root.getObjectByName('armR');
  const pouch = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.05, 4, 12), new THREE.MeshStandardMaterial({ color: '#e3e9f4', metalness: 0.55, roughness: 0.32 }));
  bag.scale.set(1, 1, 0.45);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.03), new THREE.MeshStandardMaterial({ color: '#6fc3ff', roughness: 0.6 }));
  label.position.set(0, 0, 0.0155);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  straw.position.set(0, -0.075, 0);
  const tip = new THREE.Object3D();
  tip.position.set(0, -0.115, 0);
  pouch.add(bag, label, straw, tip);
  pouch.position.set(0.02, -0.36, 0.045);
  pouch.visible = false;
  arm?.add(pouch);

  // 우주복 안 음료 주머니의 빨대 (머리 기준 좌표: 입 = (0, -0.07, 0.236), 헬멧 목 고리 = y -0.27)
  const sipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.075, -0.3, 0.13),
    new THREE.Vector3(0.06, -0.2, 0.205),
    new THREE.Vector3(0.022, -0.104, 0.238),
  ]);
  const suitTube = new THREE.Mesh(
    new THREE.TubeGeometry(sipCurve, 24, 0.0095, 10),
    new THREE.MeshStandardMaterial({ color: '#dceeff', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false }),
  );
  suitTube.renderOrder = 6;
  const slugMat = new THREE.MeshStandardMaterial({ color: '#58b8ff', emissive: '#1d6fd1', emissiveIntensity: 0.6, roughness: 0.1 });
  const slugs = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(GEO, slugMat);
    m.scale.setScalar(0.0088);
    m.visible = false;
    m.renderOrder = 7;
    suitTube.add(m);
    return m;
  });
  suitTube.visible = false;
  avatar.head?.add(suitTube);
  const SIPS = [0.7, 2.0, 3.3]; // 빨대로 세 모금 (시작 후 초)

  const hq = opts.quality === 'high';
  const OP = hq ? 1 : 0.55;
  // 투명도 + 반사: 고품질은 굴절(투과) 재질, 그 외는 반투명 + 환경 반사
  const baseMat = hq
    ? new THREE.MeshPhysicalMaterial({ color: '#eaf9ff', roughness: 0.02, metalness: 0, transmission: 1, thickness: 0.06, ior: 1.33, transparent: true, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.03 })
    : new THREE.MeshStandardMaterial({ color: '#9fdcff', roughness: 0.03, metalness: 0.15, transparent: true, opacity: OP, envMapIntensity: 2.4, depthWrite: false });

  const drops = [];
  const st = { t: 0, active: false, g: 0, floorY: 0, main: null, spawned: false, side: false, suit: false };
  const tmp = new THREE.Vector3(), mouth = new THREE.Vector3();
  function addDrop(pos, r, vel, main) {
    const m = new THREE.Mesh(GEO, baseMat.clone());
    m.position.copy(pos);
    m.scale.setScalar(Math.max(r, 0.0005));
    m.renderOrder = 5;
    scene.add(m);
    const d = { mesh: m, vel: vel.clone(), r, life: 0, max: main ? 99 : 1.8 + Math.random() * 0.9, main, ph: Math.random() * 6 };
    drops.push(d);
    return d;
  }
  function remove(d) {
    scene.remove(d.mesh);
    d.mesh.material.dispose();
    drops.splice(drops.indexOf(d), 1);
  }

  return {
    get active() { return st.active; },
    get count() { return drops.length; },
    start({ g = 0, floorY = 0, suit = false } = {}) {
      this.stop();
      Object.assign(st, { t: 0, active: true, g, floorY, main: null, spawned: false, side: false, suit });
      pouch.visible = !suit;
      suitTube.visible = suit;
    },
    stop() {
      st.active = false;
      pouch.visible = false;
      suitTube.visible = false;
      while (drops.length) remove(drops[0]);
      avatar.state.drinkT = 0;
    },
    // 움직여서 중간에 멈출 때: 물주머니·큰 물방울만 치우고 흩어진 물방울은 계속 떠다니다 사라짐
    cancel() {
      if (!st.active) return;
      st.active = false;
      pouch.visible = false;
      suitTube.visible = false;
      if (st.main) { remove(st.main); st.main = null; }
      avatar.state.drinkT = 0;
    },
    update(dt, t) {
      if (!st.active && !drops.length) return;
      if (st.active) {
        st.t += dt;
        avatar.state.drinkT = st.t;
        tip.getWorldPosition(tmp);
        avatar.head.localToWorld(mouth.set(0, -0.06, 0.32));
        if (st.suit) {
          // 모금마다 물이 빨대를 타고 입으로 올라감
          let sipping = false;
          for (const s0 of SIPS) {
            const u = (st.t - s0) / 0.75;
            if (u < 0 || u > 1) continue;
            sipping = true;
            slugs.forEach((m, i) => {
              const k = THREE.MathUtils.clamp(u * 1.25 - i * 0.12, 0, 1);
              m.visible = k > 0 && k < 1;
              sipCurve.getPoint(k, m.position);
            });
          }
          if (!sipping) slugs.forEach((m) => (m.visible = false));
          // 마지막 모금 뒤 빨대 끝에 맺힌 물방울 하나: 헬멧 안에서 1/6 중력으로 천천히 떨어짐
          if (st.t > SIPS[2] + 0.8 && !st.side) {
            st.side = true;
            avatar.head.localToWorld(tmp.set(0.022, -0.112, 0.24));
            avatar.head.localToWorld(mouth.set(0, -0.27, 0.15));
            st.floorY = mouth.y;
            addDrop(tmp, 0.0055, new THREE.Vector3(0, 0, 0), false).max = 2.4;
          }
        } else if (st.g === 0) {
          if (st.t > 0.7 && !st.spawned) {
            st.spawned = true;
            st.main = addDrop(tmp, 0.004, new THREE.Vector3(), true);
          }
          const m = st.main;
          if (m) {
            if (st.t < 1.5) {
              m.r = THREE.MathUtils.lerp(0.004, 0.05, (st.t - 0.7) / 0.8);
              m.mesh.position.copy(tmp);
            } else if (st.t < 2.6) m.mesh.position.lerp(mouth, 1 - Math.exp(-dt * 1.6));
            else if (st.t < 3.05) {
              m.mesh.position.lerp(mouth, 1 - Math.exp(-dt * 8));
              m.r = THREE.MathUtils.lerp(m.r, 0, 1 - Math.exp(-dt * 9));
            } else {
              remove(m);
              st.main = null;
            }
          }
          if (st.t > 1.25 && !st.side) {
            st.side = true;
            for (let i = 0; i < 4; i++) addDrop(tmp, 0.012 + Math.random() * 0.012, new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.3) * 0.08, (Math.random() - 0.5) * 0.12), false);
          }
        } else if (st.t > 2.2 && !st.side) {
          st.side = true;
          for (let i = 0; i < 3; i++) addDrop(tmp, 0.007 + Math.random() * 0.006, new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15), false);
        }
        if (st.t > 4.8) {
          st.active = false;
          pouch.visible = false;
          suitTube.visible = false;
          avatar.state.drinkT = 0;
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.life += dt;
        if (!d.main) {
          d.vel.y -= st.g * dt;
          d.mesh.position.addScaledVector(d.vel, dt);
          if (st.g > 0 && d.mesh.position.y < st.floorY + d.r) {
            d.mesh.position.y = st.floorY + d.r;
            d.vel.set(0, 0, 0);
            d.max = Math.min(d.max, d.life + 0.4);
          }
          const fade = 1 - THREE.MathUtils.smoothstep(d.life, d.max - 0.6, d.max);
          d.mesh.material.opacity = OP * fade;
          if (d.life >= d.max) {
            remove(d);
            continue;
          }
        }
        // 표면장력으로 출렁이는 물방울
        const w = Math.sin(t * 11 + d.ph) * 0.09, w2 = Math.cos(t * 9 + d.ph) * 0.06;
        d.mesh.scale.set(d.r * (1 + w), d.r * (1 - w), d.r * (1 + w2));
      }
    },
  };
}
