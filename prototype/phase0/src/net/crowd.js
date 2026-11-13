import * as THREE from 'three';
import { createAstronaut, HAIRS, SKINS } from '../world/astronaut.js';

// 다른 사람(실시간 접속자)의 아바타 무리 — multi.list()를 매 프레임 받아 생기고·움직이고·사라진다.
// 받은 위치로 부드럽게 따라가고(보간), 멀리 순간 이동한 것은 바로 옮긴다. 동작(걷기·감정 표현)은 받은 값 그대로.
// opts: { helmet, scale, teleport(m), place(peer, entry) → true면 위치·자세를 장면이 직접 정함 (예: 월면차 좌석) }
export function createCrowd(scene, opts = {}) {
  const { helmet = false, scale = 1, teleport = 6 } = opts;
  const avs = new Map();
  const tq = new THREE.Quaternion(), tv = new THREE.Vector3();

  function make(p) {
    const av = createAstronaut({ preset: p.suit, skin: SKINS[p.skin] || SKINS[0], hair: HAIRS[p.skin] || HAIRS[0], name: p.name, helmet });
    av.setHelmet(helmet);
    av.root.scale.setScalar(scale);
    av.root.position.fromArray(p.st.p);
    if (p.st.q) av.root.quaternion.fromArray(p.st.q);
    else av.root.rotation.set(0, p.st.h, 0);
    av.root.userData.remote = p.id;
    scene.add(av.root);
    return { av, name: p.name, suit: p.suit, skin: p.skin, last: av.root.position.clone() };
  }

  return {
    sync(list, dt, t) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let e = avs.get(p.id);
        if (!e) {
          e = make(p);
          avs.set(p.id, e);
        } else if (e.name !== p.name || e.suit !== p.suit || e.skin !== p.skin) {
          e.av.applyProfile({ name: p.name, preset: p.suit, skin: SKINS[p.skin], hair: HAIRS[p.skin] });
          Object.assign(e, { name: p.name, suit: p.suit, skin: p.skin });
        }
        const root = e.av.root;
        const k = 1 - Math.exp(-dt * 10);
        let mode = p.st.m;
        if (!opts.place?.(p, e)) {
          tv.fromArray(p.st.p);
          if (root.position.distanceTo(tv) > teleport * scale) root.position.copy(tv);
          else root.position.lerp(tv, k);
          if (p.st.q) root.quaternion.slerp(tq.fromArray(p.st.q), k);
          else {
            let d = p.st.h - root.rotation.y;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            root.rotation.set(0, root.rotation.y + d * k, 0);
          }
        } else mode = 'sit';
        // 걷기 속도·점프 방향은 움직임에서 계산
        const inv = 1 / Math.max(dt, 1e-3);
        const hs = Math.hypot(root.position.x - e.last.x, root.position.z - e.last.z) * inv / scale;
        const vy = (root.position.y - e.last.y) * inv / scale;
        e.last.copy(root.position);
        const st = e.av.state;
        st.mode = mode;
        st.speed = Math.min(3, hs * 0.55);
        st.air = Math.max(-1, Math.min(1, vy / 2.4));
        st.thrust = mode === 'float' ? Math.min(1, hs * 0.2) : 0;
        st.flip = 0;
        e.av.update(dt, t);
      }
      for (const [id, e] of avs) {
        if (seen.has(id)) continue;
        scene.remove(e.av.root);
        avs.delete(id);
      }
    },
    anchorOf(id) { return avs.get(id)?.av.root || null; },
    has(id) { return avs.has(id); },
    count() { return avs.size; },
    clear() {
      for (const e of avs.values()) scene.remove(e.av.root);
      avs.clear();
    },
  };
}
