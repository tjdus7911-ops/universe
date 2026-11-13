import { h } from './dom.js';

// 어디서나 여는 '이동' 메뉴 — 달 ↔ 라운지 ↔ 정거장 ↔ 우주 탐험을 중간 화면 없이 바로 이동
// 같은 곳으로 가는 버튼은 막고, 한 번 누르면 모든 버튼을 잠가 중복 이동을 막는다.
export const DESTS = [
  { id: 'moon', p: { id: 'free' }, ico: '🌙', name: '달 착륙지', sub: '친구들이 모인 달 언덕 · 라운지 · 월면차' },
  { id: 'lounge', p: {}, ico: '🛋️', name: '달 기지 라운지', sub: '상점 · 탐험 도감 벽 · 물 마시기' },
  { id: 'station', p: { id: 'safe' }, ico: '🛰️', name: '궤도 정거장', sub: '거대한 지구 전망 · 행성 관측실 · 우주선' },
  { id: 'space', p: {}, ico: '🔭', name: '우주 탐험', sub: '아바타로 날아다니며 행성을 발견해요' },
];

export function openTravel(ctx, here, opts = {}) {
  ctx.hud.querySelector('.travel-menu')?.remove();
  const list = DESTS.filter((d) => !opts.only || opts.only.includes(d.id));
  const el = h(`<div class="modal-wrap travel-menu"><div class="modal">
    <div class="kicker">${opts.kicker || '이동 · 어디로 갈까요?'}</div>
    <h3>${opts.title || '바로 이동하기'}</h3>
    <div class="dest">${list.map((d) => `<button data-to="${d.id}" ${d.id === here ? 'disabled' : ''}><b>${d.ico} ${d.name}${d.id === here ? ' · 지금 여기' : ''}</b><span>${d.sub}</span></button>`).join('')}</div>
    <div class="row-btn"><button class="btn ghost" data-k="close" style="color:#141b3d;background:#f2f3fb">${opts.stay || '닫기'}</button></div>
  </div></div>`);
  ctx.hud.appendChild(el);
  el.querySelector('[data-k="close"]').addEventListener('click', () => el.remove());
  el.addEventListener('pointerdown', (e) => { if (e.target === el) el.remove(); });
  el.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => {
    if (el.dataset.busy) return;
    el.dataset.busy = '1';
    el.querySelectorAll('button').forEach((x) => (x.disabled = true));
    const d = DESTS.find((x) => x.id === b.dataset.to);
    ctx.go(d.id, d.p);
  }));
  return el;
}
