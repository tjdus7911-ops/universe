import * as THREE from 'three';
import { project } from './dom.js';

// 채팅 말풍선 — 채팅을 보내면 보낸 사람 머리 위에 몇 초 동안 말풍선이 뜬다 (PC·모바일 같음)
// 머리 위 3D 위치를 화면 좌표로 바꿔 DOM으로 그린다 → 글자가 선명하고, 길이에 맞게 늘어나고 줄바꿈된다.
// 한 사람당 말풍선 하나: 새 말을 하면 이전 말풍선을 바로 바꾼다.
const live = new Map(); // 아바타 root(Object3D) → { el, y, until }
let layer = null;
const v = new THREE.Vector3();

export function initBubbles(el) {
  layer = el;
}

// anchor: 아바타 root(발 기준) · y: 머리 위 높이(아바타 로컬 좌표, 이름표 바로 위)
export function say(anchor, text, { me = false, y = 2.02, ms } = {}) {
  if (!layer || !anchor || !text) return;
  live.get(anchor)?.el.remove();
  const el = document.createElement('div');
  el.className = `chat-bubble${me ? ' me' : ''}`;
  el.textContent = text;
  el.style.display = 'none';
  layer.appendChild(el);
  // 보이는 시간: 글자 수에 따라 4~9초 (window.__bubbleMs = 시안 점검용 고정값)
  const dur = ms ?? window.__bubbleMs ?? Math.min(9000, 4200 + text.length * 90);
  live.set(anchor, { el, y, until: performance.now() + dur });
}

export function updateBubbles(camera, w, hgt) {
  if (!live.size || !camera) return;
  const now = performance.now();
  for (const [anchor, b] of live) {
    if (now > b.until || !anchor.parent) {
      b.el.remove();
      live.delete(anchor);
      continue;
    }
    anchor.updateWorldMatrix(true, false);
    anchor.localToWorld(v.set(0, b.y, 0));
    const pr = project(v, camera, w, hgt);
    let shown = anchor.visible;
    for (let p = anchor.parent; p && shown; p = p.parent) shown = p.visible;
    const vis = shown && !pr.behind && pr.x > -80 && pr.x < w + 80 && pr.y > -20 && pr.y < hgt + 60 && v.distanceTo(camera.position) < 90;
    b.el.style.display = vis ? 'block' : 'none';
    if (!vis) continue;
    b.el.style.left = `${pr.x.toFixed(1)}px`;
    b.el.style.top = `${pr.y.toFixed(1)}px`;
    b.el.style.opacity = String(Math.min(1, (b.until - now) / 450));
  }
}

export function clearBubbles() {
  for (const b of live.values()) b.el.remove();
  live.clear();
}

// 시안 점검용
export function bubbleCount() {
  return live.size;
}
