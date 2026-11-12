import { h } from './dom.js';
import { input } from '../core/input.js';

// 모바일 조작 UI — 모든 장면이 같은 배치·크기·모양을 쓴다.
//  왼쪽 아래: 이동 조이스틱 · 오른쪽 아래: 주 버튼(크게) + 보조 버튼 최대 3개
//  오른쪽 가운데: 보조 기능 줄(채팅·감정 표현·이동 …) — 조작 버튼과 겹치지 않게 떨어뜨려 둔다.
// 버튼 정의: { k, icon, label, hold?: 'jump'|'up'|'down'|'boost'|'act', onDown?, onTap?, disabled? }
export function mountControls(ctx, hud, { main, extra = [], aux = [] }) {
  const root = h(`<div class="mc mobile-only">
    <div class="mc-joy"><div class="joy-knob"></div></div>
    <div class="mc-right"></div>
    <div class="mc-aux"></div>
  </div>`);
  const right = root.querySelector('.mc-right');
  const auxEl = root.querySelector('.mc-aux');
  const make = (b, cls) => {
    const el = h(`<button class="mc-btn ${cls}" data-k="${b.k}" aria-label="${b.label}">${b.icon}<span class="mc-l">${b.label}</span></button>`);
    if (b.disabled) el.disabled = true;
    el.addEventListener('pointerdown', (e) => {
      if (el.disabled) return;
      el.classList.add('is-down');
      if (b.hold) input.hold[b.hold] = true;
      b.onDown?.(e);
      try { el.setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      e.stopPropagation();
    });
    const off = () => {
      el.classList.remove('is-down');
      if (b.hold) input.hold[b.hold] = false;
    };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    if (b.onTap) el.addEventListener('click', (e) => { if (!el.disabled) b.onTap(e); });
    return el;
  };
  if (main) right.appendChild(make(main, 'mc-main'));
  extra.forEach((b, i) => right.appendChild(make(b, `mc-x mc-x${i + 1}`)));
  aux.forEach((b) => auxEl.appendChild(make(b, 'mc-a')));
  hud.appendChild(root);
  ctx.mountJoystick(root.querySelector('.mc-joy'));
  return {
    root,
    el: (k) => root.querySelector(`[data-k="${k}"]`),
    setLabel(k, text) {
      const l = root.querySelector(`[data-k="${k}"] .mc-l`);
      if (l && l.textContent !== text) l.textContent = text;
    },
    badge(k, n) {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (!el) return;
      let b = el.querySelector('.mc-badge');
      if (!n) { b?.remove(); return; }
      if (!b) { b = h('<span class="mc-badge"></span>'); el.appendChild(b); }
      b.textContent = n > 9 ? '9+' : String(n);
    },
  };
}
