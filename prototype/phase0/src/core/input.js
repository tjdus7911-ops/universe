// PC 키보드·마우스 + 모바일 조이스틱·버튼 입력을 한곳에 모은다.
// 포인터 ID를 분리해 '조이스틱을 누른 채 다른 손가락으로 버튼'이 가능하도록 처리.
export const input = {
  keys: new Set(),
  joy: { x: 0, y: 0, active: false },
  hold: { up: false, down: false, boost: false, act: false },
  look: { dx: 0, dy: 0 },
  zoom: 0,
  pressed: new Set(), // 이번 프레임에 눌린 키 (한 번만)
};

const typing = (e) => /input|textarea/i.test(e.target?.tagName || '');

export function installInput(surface) {
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const k = e.key.toLowerCase();
    if (!input.keys.has(k)) input.pressed.add(k);
    input.keys.add(k);
    if ([' ', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => input.keys.clear());

  // 화면 드래그 = 카메라 회전, 두 손가락 = 확대/축소
  const ptrs = new Map();
  let pinch = 0;
  surface.addEventListener('pointerdown', (e) => {
    if (e.target !== surface) return;
    surface.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) pinch = dist();
  });
  surface.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 1) {
      input.look.dx += e.clientX - p.x;
      input.look.dy += e.clientY - p.y;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 2) {
      const d = dist();
      input.zoom += (pinch - d) * 0.01;
      pinch = d;
    }
  });
  const end = (e) => ptrs.delete(e.pointerId);
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);
  surface.addEventListener('wheel', (e) => {
    input.zoom += Math.sign(e.deltaY) * 0.6;
    e.preventDefault();
  }, { passive: false });
  function dist() {
    const [a, b] = [...ptrs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

export function consumeLook() {
  const v = { dx: input.look.dx, dy: input.look.dy, zoom: input.zoom };
  input.look.dx = input.look.dy = 0;
  input.zoom = 0;
  return v;
}

export function endFrame() {
  input.pressed.clear();
}

// 이동 의도: x(좌우) y(앞뒤) z(위아래), 길이 0~1
export function moveIntent() {
  const k = input.keys;
  let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  let y = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  let z = (k.has(' ') || k.has('e') || input.hold.up ? 1 : 0) - (k.has('c') || k.has('q') || input.hold.down ? 1 : 0);
  if (input.joy.active) {
    x += input.joy.x;
    y += input.joy.y;
  }
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y, z, boost: k.has('shift') || input.hold.boost };
}

// 가상 조이스틱 (모바일 HUD에 붙인다)
export function mountJoystick(el) {
  const knob = el.querySelector('.joy-knob');
  let id = null;
  let cx = 0, cy = 0;
  const R = 46;
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    el.setPointerCapture(id);
    const r = el.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    move(e);
    e.stopPropagation();
  });
  el.addEventListener('pointermove', (e) => e.pointerId === id && move(e));
  const up = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    input.joy.active = false;
    input.joy.x = input.joy.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  function move(e) {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    input.joy.active = true;
    input.joy.x = dx / R;
    input.joy.y = -dy / R;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

// 누르고 있는 동안 켜지는 버튼 (▲ ▼ 부스트 수거)
export function mountHold(el, key) {
  const on = (e) => {
    input.hold[key] = true;
    el.classList.add('is-down');
    el.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  };
  const off = () => {
    input.hold[key] = false;
    el.classList.remove('is-down');
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
