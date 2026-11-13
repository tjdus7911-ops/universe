import { h } from './dom.js';

// 오른쪽 위 '지금 위치' 드롭다운 — 지금 어디인지 보여 주고, 고르면 그 장소로 바로 이동
// 장소 목록은 '이동' 메뉴(travel.js)와 같은 DESTS를 쓴다. 한 번 고르면 잠가서 중복 이동을 막는다.
import { DESTS } from './travel.js';

export function mountPlaceMenu(ctx, host, here, opts = {}) {
  const cur = DESTS.find((d) => d.id === here);
  const el = h(`<div class="place-dd">
    <button class="glass place-btn" data-k="place" aria-haspopup="true" aria-expanded="false">
      <span class="pin">📍</span><span class="nm">${cur ? cur.name : '장소'}</span><span class="car">▾</span>
    </button>
    <div class="glass place-list" role="menu" hidden>
      <div class="cap">장소 이동</div>
      ${DESTS.map((d) => `<button role="menuitem" data-to="${d.id}" ${d.id === here ? 'disabled' : ''}><b>${d.ico} ${d.name}</b>${d.id === here ? '<em>지금 여기</em>' : `<span>${d.sub}</span>`}</button>`).join('')}
    </div>
  </div>`);
  if (opts.last) host.append(el);
  else host.prepend(el);
  const btn = el.querySelector('.place-btn');
  const list = el.querySelector('.place-list');
  const set = (open) => {
    list.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(list.hidden); });
  const outside = (e) => { if (!el.isConnected) { document.removeEventListener('pointerdown', outside, true); return; } if (!el.contains(e.target)) set(false); };
  document.addEventListener('pointerdown', outside, true);
  list.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => {
    if (el.dataset.busy) return;
    el.dataset.busy = '1';
    list.querySelectorAll('button').forEach((x) => (x.disabled = true));
    set(false);
    const d = DESTS.find((x) => x.id === b.dataset.to);
    ctx.go(d.id, d.p);
  }));
  return el;
}
