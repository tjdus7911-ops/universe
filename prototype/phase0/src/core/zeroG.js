import * as THREE from 'three';
import { input } from './input.js';

// 게임형 무중력 이동 — 우주 탐험·우주 유영이 같이 쓴다 (실제 물리 시뮬레이션이 아니라 쉬운 조작이 목표)
//  · Space / ▲(상승): 누르는 동안 위로 올라가고, 놓으면 그 높이에서 부드럽게 멈춰 떠 있다. 다시 누르면 거기서 더 올라간다.
//  · C / ▼(하강): 아래로 내려간다. 높이는 [minY, maxY] 안으로 제한 (끝에 가까울수록 느려지다 멈춤).
//  · WASD / 조이스틱: 아바타가 바라보는 방향 기준 이동 — 기울어진 자세 그대로 그 방향으로 날아간다.
//  · 드래그(마우스·터치) / 방향키: 아바타를 360° 회전 (좌우 = yaw, 상하 = pitch). 쿼터니언이라 거꾸로 돌아도 튀지 않는다.
//  · X / '수평' 버튼: 자세를 천천히 바로 세운다 (바라보는 방향은 유지).
//  · 카메라는 아바타 뒤에서 따라오며, 위쪽 방향도 아바타를 따라 부드럽게 돌아 갑자기 뒤집히지 않는다.
export function createZeroG(opts) {
  const P = { speed: 3, boostMul: 2, rise: 2.4, accel: 0.35, damp: 0.45, minY: -30, maxY: 30, soft: 3, lean: 0.3, ...opts };
  const s = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    view: new THREE.Quaternion(),
    want: new THREE.Vector3(),
    thrust: 0,
    capped: 0, // +1 최대 높이, -1 최저 높이에 닿음
    leveling: 0,
    boosting: false,
    rising: false,
  };
  const ax = { y: new THREE.Vector3(0, 1, 0), x: new THREE.Vector3(1, 0, 0) };
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const tq = new THREE.Quaternion(), lv = new THREE.Quaternion();
  const cam = { pos: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), ready: false, dist: P.camDist || 4.5 };

  function axes(q = s.quat) {
    fwd.set(0, 0, 1).applyQuaternion(q);
    right.set(-1, 0, 0).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
  }
  function rotate(yaw, pitch) {
    if (yaw) s.quat.multiply(tq.setFromAxisAngle(ax.y, yaw));
    if (pitch) s.quat.multiply(tq.setFromAxisAngle(ax.x, pitch));
    s.quat.normalize();
  }
  function face(yaw) {
    s.quat.setFromAxisAngle(ax.y, yaw);
    s.view.copy(s.quat);
  }

  return {
    s,
    P,
    face,
    level() { s.leveling = 1; },
    place(p, yaw = 0) {
      s.pos.copy(p);
      s.vel.set(0, 0, 0);
      face(yaw);
      cam.ready = false;
    },
    // look: consumeLook() 결과 (dx, dy, zoom) · boostOk: 부스트 가능 여부(연료)
    update(dt, look, { boostOk = true, auto = null } = {}) {
      const k = input.keys;
      // 회전: 드래그 + 방향키
      const yawRate = ((k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0)) * 1.8;
      const pitchRate = ((k.has('arrowdown') ? 1 : 0) - (k.has('arrowup') ? 1 : 0)) * 1.5;
      const ry = yawRate * dt - (look?.dx || 0) * 0.006;
      const rp = pitchRate * dt + (look?.dy || 0) * 0.005;
      if (ry || rp) { rotate(ry, rp); s.leveling = 0; }
      if (input.pressed.has('x')) s.leveling = 1;
      if (s.leveling > 0) {
        // 바라보는 방향의 수평 성분만 남기고 바로 선 자세로
        axes();
        const h = Math.atan2(fwd.x, fwd.z);
        lv.setFromAxisAngle(ax.y, Number.isFinite(h) ? h : 0);
        s.quat.slerp(lv, 1 - Math.exp(-dt * 5));
        if (s.quat.angleTo(lv) < 0.01) { s.quat.copy(lv); s.leveling = 0; }
      }
      // 이동 의도
      let mx = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      let my = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
      if (input.joy.active) { mx += input.joy.x; my += input.joy.y; }
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const upK = k.has(' ') || input.hold.up || input.hold.jump;
      const dnK = k.has('c') || input.hold.down;
      const vert = (upK ? 1 : 0) - (dnK ? 1 : 0);
      axes();
      const boosting = (k.has('shift') || input.hold.boost) && boostOk && (ml > 0.05 || vert !== 0);
      const sp = P.speed * (boosting ? P.boostMul : 1);
      s.want.set(0, 0, 0).addScaledVector(fwd, my * sp).addScaledVector(right, mx * sp);
      s.want.y += vert * P.rise * (boosting ? 1.5 : 1);
      if (auto) s.want.copy(auto);
      const has = s.want.lengthSq() > 1e-4;
      // 누르는 동안 가속, 놓으면 부드럽게 멈춤 → 그 자리(높이)에 떠 있음
      s.vel.lerp(s.want, 1 - Math.exp(-dt / (has ? P.accel : P.damp)));
      // 높이 제한: 끝에 가까울수록 느려지다가 정확히 그 높이에서 멈춘다 (넘지 못함)
      const top = P.maxY - s.pos.y, bot = s.pos.y - P.minY;
      const upLim = P.rise * 1.5 * Math.max(0.08, Math.min(1, top / P.soft));
      const dnLim = P.rise * 1.5 * Math.max(0.08, Math.min(1, bot / P.soft));
      if (s.vel.y > upLim) s.vel.y = upLim;
      if (s.vel.y < -dnLim) s.vel.y = -dnLim;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y > P.maxY) { s.pos.y = P.maxY; if (s.vel.y > 0) s.vel.y = 0; }
      if (s.pos.y < P.minY) { s.pos.y = P.minY; if (s.vel.y < 0) s.vel.y = 0; }
      const edge = Math.max(0.3, P.soft * 0.08);
      s.capped = upK && P.maxY - s.pos.y < edge ? 1 : dnK && s.pos.y - P.minY < edge ? -1 : 0;
      s.boosting = boosting;
      s.rising = upK;
      s.thrust = THREE.MathUtils.lerp(s.thrust, Math.min(1, s.want.length() / Math.max(P.speed, 1e-3)) * (boosting ? 1 : 0.6), 1 - Math.exp(-dt * 6));
      // 보이는 자세: 앞으로 나갈 때 살짝 숙임
      const fwdSp = s.vel.dot(fwd) / Math.max(P.speed, 1e-3);
      s.view.copy(s.quat).multiply(tq.setFromAxisAngle(ax.x, THREE.MathUtils.clamp(fwdSp, -1, 1.5) * P.lean));
      return s;
    },
    // 3인칭 추적 카메라: 아바타 뒤·위에서 따라감. 카메라 위쪽도 아바타 자세를 따라 천천히 회전
    camera(camera, dt, { height = 1.2, lookUp = 0.7, zoom = 0, min = 2.5, max = 14 } = {}) {
      cam.dist = THREE.MathUtils.clamp(cam.dist + zoom * (P.zoomStep || 0.5), min, max);
      axes();
      const desired = new THREE.Vector3().copy(s.pos).addScaledVector(up, height).addScaledVector(fwd, -cam.dist);
      if (!cam.ready) {
        cam.pos.copy(desired);
        cam.up.copy(up);
        cam.ready = true;
      }
      cam.pos.lerp(desired, 1 - Math.exp(-dt * 7));
      cam.up.lerp(up, 1 - Math.exp(-dt * 5)).normalize();
      camera.position.copy(cam.pos);
      camera.up.copy(cam.up);
      camera.lookAt(s.pos.x + up.x * lookUp, s.pos.y + up.y * lookUp, s.pos.z + up.z * lookUp);
    },
    axes() { axes(); return { fwd, right, up }; },
  };
}

// 추진기 불꽃 입자 (등 뒤 노즐에서)
export function createJetTrail(scene, { n = 260, size = 40, life = 1.6 } = {}) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), lf = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('life', new THREE.BufferAttribute(lf, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { pr: { value: Math.min(devicePixelRatio, 2) }, sz: { value: size } },
    vertexShader: 'attribute float life; varying float vL; uniform float pr; uniform float sz; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (sz * life + sz * 0.15) * pr / -mv.z; }',
    fragmentShader: 'varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vL; gl_FragColor = vec4(mix(vec3(0.45,0.95,0.85), vec3(1.0), vL) * a * 2.2, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  let idx = 0;
  const tmp = new THREE.Vector3();
  return {
    emit(nozzles, dir, baseVel, amount, spread = 1) {
      const c = Math.ceil(amount * 6);
      for (let k = 0; k < c; k++) {
        nozzles[(idx + k) % nozzles.length].getWorldPosition(tmp);
        const i = idx % n;
        pos.set([tmp.x, tmp.y, tmp.z], i * 3);
        vel.set([
          -dir.x * (2.2 + Math.random()) * spread + (Math.random() - 0.5) * 0.6 * spread + baseVel.x * 0.5,
          -dir.y * (2.2 + Math.random()) * spread - (0.6 + Math.random() * 0.4) * spread + baseVel.y * 0.5,
          -dir.z * (2.2 + Math.random()) * spread + (Math.random() - 0.5) * 0.6 * spread + baseVel.z * 0.5,
        ], i * 3);
        lf[i] = 1;
        idx++;
      }
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        if (lf[i] <= 0) continue;
        lf[i] = Math.max(0, lf[i] - dt * life);
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.life.needsUpdate = true;
    },
  };
}
