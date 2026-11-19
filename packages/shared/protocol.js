// 우주마을 실시간 프로토콜 — 클라이언트(3D 시안)와 실시간 서버가 같이 쓴다.
// 받은 값은 무엇이든 믿지 않는다: 이 파일의 sanitize* 함수로 모양·범위·길이를 확인하고 잘라 낸다.
// 서버는 여기에 더해 이동 속도·좌석 중복·보내는 횟수를 검사한다 (server/src/index.js).

export const PROTOCOL = 1;

// 공간(존)별 이동 가능 범위와 최고 속도 (m/s · 우주 탐험은 게임 단위/초)
//  r: 원점 기준 수평 반경 · y: 높이 범위 · box: 각 축 절댓값 한계 · rect: 축별 [최소, 최대] · speed: 상한(여유 포함)
export const ZONES = {
  moon: { r: 52, y: [-30, 80], speed: 9 },
  lounge: { r: 12, y: [-1, 12], speed: 6 },
  station: { r: 16, y: [-1, 12], speed: 7 },
  space: { box: 30000, speed: 260 },
  // 우주 엘리베이터 1구간 (옆에서 보는 2.5D · packages/shared/climb.js의 CLIMB_BOUNDS와 같은 값)
  climb: { rect: { x: [-18, 18], y: [-4, 35], z: [-3, 3] }, speed: 14 },
};
export const ZONE_IDS = Object.keys(ZONES);

// 장면 id → 존
export function zoneOf(sceneId) {
  return ZONES[sceneId] ? sceneId : null;
}

// 아바타 동작 (감정 표현 포함) — 이 목록에 없는 값은 'idle'
export const MODES = ['idle', 'walk', 'air', 'sit', 'float', 'wave', 'cheer', 'dance', 'clap', 'lie', 'drink', 'sip'];
export const SUITS = ['mint', 'lavender', 'coral', 'sky'];
export const ROVER_COUNT = 24; // 달 착륙지 월면차 수 (좌석 4개씩)
export const SEATS = 4;
export const CHAT_MAX = 60;
export const NAME_MAX = 12;

// ---------- 글자 걸러 내기 (채팅·닉네임) ----------
const BAD = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', 'fuck', 'shit'];
// 보이지 않는 글자·제어 문자 (방향 바꾸기 문자 포함)
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g;
export function cleanText(t, max = CHAT_MAX) {
  let s = String(t ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, max);
  // 연락처·주소가 퍼지지 않게 가림: 이메일 · 링크 · 전화번호(숫자 9자리 이상)
  s = s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '(가림)')
    .replace(/(https?:\/\/|www\.)\S+/gi, '(가림)')
    .replace(/\d[\d\s.-]{7,}\d/g, '(가림)');
  for (const w of BAD) s = s.split(w).join('♡'.repeat(Math.min(w.length, 3)));
  return s;
}
export function cleanName(t) {
  const s = cleanText(t, NAME_MAX).replace(/[^\p{L}\p{N}_\- ]/gu, '').trim();
  return s.length >= 2 ? s : '';
}

// ---------- 값 확인 ----------
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// 위치를 존 범위 안으로 (범위 밖이면 가장 가까운 안쪽 점)
export function clampToZone(zone, p) {
  const Z = ZONES[zone];
  if (!Z) return null;
  let [x, y, z] = p;
  if (Z.rect) {
    const c = (v, [a, b]) => Math.max(a, Math.min(b, v));
    x = c(x, Z.rect.x);
    y = c(y, Z.rect.y);
    z = c(z, Z.rect.z);
  } else if (Z.r) {
    const d = Math.hypot(x, z);
    if (d > Z.r) { x *= Z.r / d; z *= Z.r / d; }
    y = Math.min(Z.y[1], Math.max(Z.y[0], y));
  } else {
    const b = Z.box;
    x = Math.max(-b, Math.min(b, x));
    y = Math.max(-b, Math.min(b, y));
    z = Math.max(-b, Math.min(b, z));
  }
  return [r2(x), r2(y), r2(z)];
}

// 한 사람의 상태(위치·방향·동작·월면차) — 클라이언트가 보내는 모양 그대로 받아서 확인
//  { p:[x,y,z], h, q?:[x,y,z,w], m, rv?:[rover, seat], rp?:[x, z, yaw] }
export function sanitizeState(zone, s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.p) || s.p.length !== 3 || !s.p.every(num)) return null;
  const p = clampToZone(zone, s.p);
  if (!p) return null;
  const out = { p, h: num(s.h) ? r2(Math.atan2(Math.sin(s.h), Math.cos(s.h))) : 0, m: MODES.includes(s.m) ? s.m : 'idle' };
  if (Array.isArray(s.q) && s.q.length === 4 && s.q.every(num)) {
    const l = Math.hypot(...s.q) || 1;
    out.q = s.q.map((v) => r3(v / l));
  }
  if (zone === 'moon' && Array.isArray(s.rv) && s.rv.length === 2 && s.rv.every(Number.isInteger)
    && s.rv[0] >= 0 && s.rv[0] < ROVER_COUNT && s.rv[1] >= 0 && s.rv[1] < SEATS) {
    out.rv = [s.rv[0], s.rv[1]];
    // 운전석(0)만 월면차 위치를 보낸다
    if (s.rv[1] === 0 && Array.isArray(s.rp) && s.rp.length === 3 && s.rp.every(num)) {
      const c = clampToZone('moon', [s.rp[0], 0, s.rp[1]]);
      out.rp = [c[0], c[2], r2(s.rp[2])];
    }
  }
  return out;
}

// 보스 피해 기록 (Claude 실시간 방에서만 presence로 주고받음): [판 번호, 내가 준 피해]
export function sanitizeBossDmg(v) {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger)) return null;
  if (v[0] < 0 || v[0] > 1e6 || v[1] < 0 || v[1] > 40) return null;
  return [v[0], v[1]];
}

// 다른 사람 프로필 (닉네임·우주복·피부색 번호)
export function sanitizeProfile(o) {
  return {
    n: cleanName(o?.n) || '탐험가',
    s: SUITS.includes(o?.s) ? o.s : 'mint',
    k: Number.isInteger(o?.k) && o.k >= 0 && o.k < 4 ? o.k : 0,
  };
}
