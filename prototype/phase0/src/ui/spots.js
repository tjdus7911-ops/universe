import { h, project } from './dom.js';

// 위치 풍선 (3D 이름표) — PC는 클릭, 모바일은 탭하면 그 자리 앞으로 바로 이동해서 바로 실행한다.
//  · 가까운 것부터 놓고, 화면에서 겹치면 먼 쪽 풍선을 숨긴다.
//  · 멀리 있는 풍선은 작게 + 거리 표시, 바로 앞에 있는 풍선은 할 일('라운지 들어가기')까지 보여 준다.
// spots: [{ key, pos: Vector3, label, act, cls, r }]  · onPick(spot) = 이동 + 실행 (장면이 정함)
export function mountSpots(ctx, spots, onPick) {
  const els = spots.map((s) => {
    const el = h(`<button type="button" class="pill-label ${s.cls || ''}" data-spot="${s.key}" aria-label="${s.label} · ${s.act}">
      <i></i><span class="pl-t">${s.label}</span><span class="pl-d"></span><span class="pl-a">${s.act}</span></button>`);
    // 풍선을 누를 때 화면 드래그(시점 회전)·조이스틱으로 이어지지 않게
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPick(s);
    });
    ctx.labels.appendChild(el);
    return { el, d: '', near: false, far: false };
  });
  return {
    // camera: 장면 카메라 · from: 내 위치 · max: 풍선이 보이는 최대 거리(m) · flat: 수평 거리로 잴지
    // 돌려주는 값: 바로 실행할 수 있는 지점의 key (없으면 null)
    layout(camera, from, { max = 60, flat = true, minY = 50, farAt = 12 } = {}) {
      const { w, hgt } = ctx.size();
      const order = spots.map((s, i) => ({ s, i, dist: flat ? Math.hypot(s.pos.x - from.x, s.pos.z - from.z) : s.pos.distanceTo(from) }))
        .sort((a, b) => a.dist - b.dist);
      let nearKey = null;
      for (const o of order) if (o.dist < o.s.r) { nearKey = o.s.key; break; }
      const placed = [];
      for (const { s, i, dist } of order) {
        const L = els[i];
        const near = s.key === nearKey;
        const far = !near && dist > farAt;
        const pr = project(s.pos, camera, w, hgt);
        let vis = !pr.behind && pr.x > -40 && pr.x < w + 40 && pr.y > minY && pr.y < hgt + 30 && dist < max;
        if (vis) {
          const lw = near ? (s.label.length + s.act.length) * 12 + 60 : s.label.length * (far ? 11 : 13) + (far ? 70 : 40);
          const box = { x0: pr.x - lw / 2, x1: pr.x + lw / 2, y0: pr.y - (near ? 44 : 32), y1: pr.y };
          if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) vis = false;
          else placed.push(box);
        }
        const el = L.el;
        el.style.display = vis ? 'flex' : 'none';
        if (!vis) continue;
        el.style.left = `${pr.x}px`;
        el.style.top = `${pr.y}px`;
        if (L.near !== near) { L.near = near; el.classList.toggle('near', near); }
        if (L.far !== far) { L.far = far; el.classList.toggle('far', far); }
        const d = far ? `${Math.round(dist)} m` : '';
        if (L.d !== d) { L.d = d; el.querySelector('.pl-d').textContent = d; }
      }
      return nearKey;
    },
    hide() { for (const L of els) L.el.style.display = 'none'; },
  };
}
