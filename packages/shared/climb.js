// 우주 엘리베이터 대작전 — 1구간(달 기슭)의 지형·보스 시간표. 클라이언트(시안)와 실시간 서버가 같이 쓴다.
// 옆에서 보는 2.5D: x = 좌우(m), y = 높이(m), z = 0 근처 한 줄.
// 보스의 공격·휴식 시간과 운석 위치는 "공통 시계(초)"만으로 정해진다 → 모든 사람 화면에서 똑같이 보이고,
// 서버는 같은 함수로 "지금이 약점을 밟을 수 있는 때인지"를 다시 계산해 판정한다 (클라이언트 값을 믿지 않음).

export const MOON_G = 1.62; // 달 중력 m/s²
export const LEVEL_H = 4.6; // 층 간격 (점프 최고 높이 약 1.8 m라 사다리나 중력 패드로 올라감)

// 발판(거더): y 높이, 좌우 끝. open = 운석이 떨어지는 열린 쪽 (-1 왼쪽, +1 오른쪽)
export const GIRDERS = [
  { y: 0, x0: -15, x1: 15, open: -1 },
  { y: LEVEL_H * 1, x0: -12, x1: 15, open: -1 },
  { y: LEVEL_H * 2, x0: -15, x1: 12, open: 1 },
  { y: LEVEL_H * 3, x0: -12, x1: 15, open: -1 },
  { y: LEVEL_H * 4, x0: -15, x1: 12, open: 1 },
  { y: LEVEL_H * 5, x0: -12, x1: 15, open: -1 }, // 꼭대기: 보스 무대
];
export const TOP = GIRDERS.length - 1;

// 사다리: from 층에서 from+1 층으로 (x 위치)
export const LADDERS = [
  { from: 0, x: 9 }, { from: 0, x: -3 },
  { from: 1, x: -7 }, { from: 1, x: 4 },
  { from: 2, x: 8 }, { from: 2, x: -2 },
  { from: 3, x: -8 }, { from: 3, x: 3 },
  { from: 4, x: 6 }, { from: 4, x: -6 },
];
// 중력 패드: 밟으면 한 층 위로 튀어 오름 (발판은 아래에서 위로 통과 가능)
export const PADS = [
  { level: 0, x: -11 },
  { level: 2, x: 11 - 4 },
  { level: 3, x: 10 },
];
export const PAD_V = 4.4; // m/s → 약 6 m 상승

// 보스: 크레이터 골렘 (꼭대기 오른쪽)
export const BOSS = { x: 12.2, y: GIRDERS[TOP].y };
// 약점 결정: 쉬는 동안 골렘이 엎드리면 등의 결정이 이 높이로 내려온다 (점프로 밟을 수 있음)
export const CRYSTAL = { x: 11.2, yRest: GIRDERS[TOP].y + 1.25, yUp: GIRDERS[TOP].y + 3.1, r: 0.95 };

// 시간표 (초): 던지기 10초 → 쉬기 6초 반복. 던지기 중 1·3·5·7·9초에 운석 하나씩
export const CYCLE = 16;
export const THROW = 10;
export const SPAWNS = [1, 3, 5, 7, 9];
export const METEOR_R = 0.55;
export const ROLL_V = 4.2; // m/s
export const HIT_COOLDOWN = 0.7; // 한 사람이 다시 밟을 수 있을 때까지(초)
export const WIN_PAUSE = 15; // 이긴 뒤 다음 판까지(초)

// 함께한 인원에 따른 보스 체력: 혼자 8, 한 명 늘 때마다 +4, 최대 40
export function bossMaxHp(n) {
  return Math.min(40, 4 + 4 * Math.max(1, n | 0));
}

// 지금(초)의 보스 상태: 'throw' | 'rest', 그 안에서 지난 시간 k(초)
export function bossPhase(sec) {
  const c = ((sec % CYCLE) + CYCLE) % CYCLE;
  return c < THROW ? { phase: 'throw', k: c, left: THROW - c } : { phase: 'rest', k: c - THROW, left: CYCLE - c };
}
// 쉬는 중이고 끝나기 직전이 아니면 약점을 밟을 수 있다 (서버는 grace 초만큼 너그럽게)
export function canHit(sec, grace = 0) {
  const b = bossPhase(sec);
  if (b.phase === 'rest') return b.k > 0.6 - grace && b.left > 0.2 - grace;
  return b.left < grace; // 쉬기 직전 grace 초
}

// ---------- 운석 길: 꼭대기에서 왼쪽으로 굴러 떨어지고, 층마다 방향을 바꿔 바닥 왼쪽 끝에서 부서짐 ----------
function buildPath() {
  const seg = [];
  let t = 0;
  let x = BOSS.x - 1.6;
  for (let lv = TOP; lv >= 0; lv--) {
    const g = GIRDERS[lv];
    const dir = g.open; // 열린 쪽으로 굴러감
    const end = dir < 0 ? g.x0 - METEOR_R : g.x1 + METEOR_R;
    const dur = Math.abs(end - x) / ROLL_V;
    seg.push({ t0: t, t1: t + dur, kind: 'roll', x0: x, x1: end, y: g.y + METEOR_R });
    t += dur;
    x = end;
    if (lv === 0) break;
    const drop = g.y - GIRDERS[lv - 1].y;
    const fall = Math.sqrt((2 * drop) / MOON_G);
    const x2 = x + dir * 0.6; // 떨어지면서 조금 더 나아감
    seg.push({ t0: t, t1: t + fall, kind: 'fall', x0: x, x1: x2, y0: g.y + METEOR_R, y1: GIRDERS[lv - 1].y + METEOR_R });
    t += fall;
    x = x2;
  }
  return { seg, life: t };
}
export const PATH = buildPath();

// 나이(초)에 해당하는 운석 위치 [x, y, 구르는 방향]
export function meteorPos(age) {
  for (const s of PATH.seg) {
    if (age < s.t0 || age > s.t1) continue;
    const u = (age - s.t0) / Math.max(1e-6, s.t1 - s.t0);
    if (s.kind === 'roll') return [s.x0 + (s.x1 - s.x0) * u, s.y, Math.sign(s.x1 - s.x0)];
    const yy = s.y0 - 0.5 * MOON_G * (age - s.t0) ** 2;
    return [s.x0 + (s.x1 - s.x0) * u, Math.max(s.y1, yy), Math.sign(s.x1 - s.x0)];
  }
  return null;
}

// 지금(초) 화면에 있는 운석들: [{ id, x, y, dir, age }] — id는 생성 시각으로 정해져 모두에게 같다
export function meteorsAt(sec, since = -Infinity) {
  const out = [];
  const c1 = Math.floor(sec / CYCLE);
  const c0 = Math.floor((sec - PATH.life) / CYCLE) - 1;
  for (let c = c0; c <= c1; c++) {
    for (const s of SPAWNS) {
      const born = c * CYCLE + s;
      if (born < since) continue; // 판이 시작되기 전(또는 이긴 뒤)에 던진 운석은 없음
      const age = sec - born;
      if (age < 0 || age > PATH.life) continue;
      const p = meteorPos(age);
      if (p) out.push({ id: born, x: p[0], y: p[1], dir: p[2], age });
    }
  }
  return out;
}

// 실시간 서버가 받는 이동 범위 (protocol.js ZONES.climb와 같은 값)
export const CLIMB_BOUNDS = { x: [-18, 18], y: [-4, GIRDERS[TOP].y + 12], z: [-3, 3] };
