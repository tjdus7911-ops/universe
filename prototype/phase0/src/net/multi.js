import { PROTOCOL, MODES, cleanText, cleanName, sanitizeProfile, sanitizeState, sanitizeBossDmg, zoneOf } from '../../../../packages/shared/protocol.js';
import { SKINS } from '../world/astronaut.js';

// 멀티플레이 — 같은 공간(존)에 있는 다른 사람의 아바타·움직임·감정 표현·월면차 탑승·채팅
//
// 연결 방법 두 가지 (장면 코드는 같다)
//  1) 'room'   — Claude 아티팩트의 실시간 방. 아티팩트를 공유받아(초대) 들어온 claude.ai 사용자끼리, 서버 없이.
//                내 상태와 최근 채팅 3개를 presence(나를 나타내는 객체 하나)로 보낸다. 링크만 받은 사람은 연결되지 않는다.
//  2) 'server' — 우주마을 실시간 서버(Socket.IO, server/). 주소 뒤에 ?server=https://… 를 붙이면 연결 (배포 전에는 로컬 테스트용)
//  둘 다 안 되면 혼자 모드: NPC 친구만 보이고 채팅은 내 화면에만 남는다.
//
// 받은 값은 하나도 믿지 않는다: 모양·범위·길이를 packages/shared/protocol.js로 확인하고, 존 밖 위치는 안쪽으로 당긴다.
// 위치·좌석·보상의 최종 판단은 서버가 한다(2). 서버가 없는 1)은 화면 표시용이며 보상과 연결하지 않는다.
export function createMulti(ctx) {
  const params = new URLSearchParams(location.search);
  const serverUrl = params.get('server');
  const S = {
    mode: 'off', // 'off' | 'room' | 'server'
    connected: false,
    zone: null,
    peers: new Map(), // id → { id, name, suit, skin, st, seenSeq }
    meta: new Map(), // 서버 모드: id → 프로필
    myId: null,
    chatSeq: 0,
    myChat: [], // [seq, text] 최근 3개 (room 모드는 presence로 보냄)
    self: null,
    lastSend: 0,
    lastJson: '',
    channel: null,
    off: 0, // 서버 시계 - 내 시계 (ms) · 서버 모드에서만
    bd: null, // [판 번호, 내가 준 보스 피해] · 실시간 방 모드에서 presence로
  };
  const L = { chat: new Set(), seat: new Set(), boss: new Set() };
  const fire = (k, v) => L[k].forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
  const skinIdx = () => Math.max(0, SKINS.indexOf(ctx.profile.skin));
  const profile = () => ({ v: PROTOCOL, n: cleanName(ctx.profile.name) || '탐험가', s: ctx.profile.preset, k: skinIdx() });

  function upsertPeer(id, prof, st, chatList, quietFirst = true, bd = null) {
    let e = S.peers.get(id);
    const fresh = !e;
    if (!e) {
      e = { id, seenSeq: -1 };
      S.peers.set(id, e);
    }
    e.name = prof.n;
    e.suit = prof.s;
    e.skin = prof.k;
    e.st = st;
    e.bd = bd;
    // presence로 온 채팅: 처음 본 사람의 지난 채팅은 다시 띄우지 않는다
    if (Array.isArray(chatList)) {
      let max = e.seenSeq;
      for (const it of chatList.slice(-3)) {
        if (!Array.isArray(it) || !Number.isInteger(it[0])) continue;
        if (it[0] > e.seenSeq) {
          if (!(fresh && quietFirst)) {
            const text = cleanText(it[1]);
            if (text) fire('chat', { peer: id, who: e.name, text, zone: S.zone });
          }
          max = Math.max(max, it[0]);
        }
      }
      e.seenSeq = max;
    }
  }

  // ---------- 1) Claude 아티팩트 실시간 방 ----------
  let room = null, zr = null, zrName = null, unsubPeers = null;
  async function startRoom() {
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') return false;
    try { room = await cl.use('room'); } catch { room = null; }
    if (!room) return false;
    S.mode = 'room';
    room.onConnection((c) => { S.connected = c; }, () => { S.connected = false; S.mode = 'off'; S.peers.clear(); });
    if (S.zone) joinRoom(S.zone);
    return true;
  }
  async function joinRoom(zone) {
    const name = zone ? `sv-${zone}` : null;
    if (zrName === name) return;
    const prev = zr;
    zr = null;
    zrName = name;
    unsubPeers?.();
    unsubPeers = null;
    S.peers.clear();
    try { await prev?.leave(); } catch { /* 이미 나감 */ }
    if (!name) return;
    try {
      const r = await room.join(name);
      if (zrName !== name) { r.leave().catch(() => {}); return; }
      zr = r;
      unsubPeers = r.onPeers((ch) => onRoomPeers(ch.peers), () => { S.peers.clear(); });
      send(true);
    } catch {
      zrName = null; // not_permitted · limit_reached 등: 혼자 모드로
    }
  }
  function onRoomPeers(list) {
    const seen = new Set();
    for (const p of list) {
      if (p.sameTab) { S.myId = p.peer; continue; }
      if (p.kind !== 'viewer') continue;
      const pr = p.presence || {};
      if (pr.v !== PROTOCOL || pr.z !== S.zone) continue;
      const st = sanitizeState(S.zone, pr);
      if (!st) continue;
      seen.add(p.peer);
      upsertPeer(p.peer, sanitizeProfile(pr), st, pr.c, true, sanitizeBossDmg(pr.bd));
    }
    for (const id of [...S.peers.keys()]) if (!seen.has(id)) S.peers.delete(id);
  }

  // ---------- 2) 우주마을 실시간 서버 (Socket.IO) ----------
  let sock = null;
  async function startServer(url) {
    let io;
    try { ({ io } = await import('socket.io-client')); } catch { return false; }
    sock = io(url, { transports: ['websocket'], reconnectionDelayMax: 4000, timeout: 8000 });
    // 시험용: 서버 판정 확인에 쓰는 날 보내기 (개발자 도구로 누구나 할 수 있는 일이라 서버가 다시 확인한다)
    window.__multiRaw = { emit: (e, d) => sock.emit(e, d) };
    S.mode = 'server';
    sock.on('connect', () => {
      S.connected = true;
      sock.emit('hello', profile());
      if (S.zone) sock.emit('join', { z: S.zone });
    });
    sock.on('disconnect', () => { S.connected = false; S.peers.clear(); });
    sock.on('welcome', (m) => { S.myId = String(m?.id ?? ''); if (Number.isFinite(m?.t)) S.off = m.t - Date.now(); });
    sock.on('joined', (m) => { S.channel = m?.ch ?? null; S.peers.clear(); S.meta.clear(); });
    sock.on('meta', (list) => {
      if (!Array.isArray(list)) return;
      for (const m of list.slice(0, 300)) if (m && m.id != null) S.meta.set(String(m.id), sanitizeProfile(m));
    });
    sock.on('gone', (m) => { S.peers.delete(String(m?.id)); S.meta.delete(String(m?.id)); });
    sock.on('snap', onSnap);
    sock.on('chat', (m) => {
      const id = String(m?.id ?? '');
      if (!id || id === S.myId) return;
      const text = cleanText(m?.x);
      const who = S.peers.get(id)?.name || S.meta.get(id)?.n || '탐험가';
      if (text) fire('chat', { peer: id, who, text, zone: S.zone });
    });
    sock.on('seatTaken', (m) => fire('seat', m));
    // 보스 상태 (서버가 판정): { f 판, hp, max, win, now }
    sock.on('boss', (m) => {
      if (!m || !Number.isInteger(m.f) || !Number.isFinite(m.hp) || !Number.isFinite(m.max)) return;
      if (Number.isFinite(m.now)) S.off = m.now - Date.now();
      fire('boss', { f: m.f, hp: Math.max(0, m.hp | 0), max: Math.max(1, m.max | 0), win: !!m.win, since: Number.isFinite(m.since) ? m.since : null });
    });
    return true;
  }
  // 스냅숏: { z, l: [[id, x, y, z, h, m, extra?], …] } · extra = { q, rv, rp }
  function onSnap(m) {
    if (!m || m.z !== S.zone || !Array.isArray(m.l)) return;
    const seen = new Set();
    for (const it of m.l.slice(0, 300)) {
      if (!Array.isArray(it)) continue;
      const id = String(it[0]);
      if (id === S.myId) continue;
      const ex = it[6] && typeof it[6] === 'object' ? it[6] : {};
      const st = sanitizeState(S.zone, { p: [it[1], it[2], it[3]], h: it[4], m: MODES[it[5]], q: ex.q, rv: ex.rv, rp: ex.rp });
      if (!st) continue;
      seen.add(id);
      upsertPeer(id, S.meta.get(id) || { n: '탐험가', s: 'mint', k: 0 }, st, null);
    }
    for (const id of [...S.peers.keys()]) if (!seen.has(id)) S.peers.delete(id);
  }

  // ---------- 보내기 ----------
  function send(force) {
    if (!S.self || !S.zone) return;
    const now = performance.now();
    if (S.mode === 'room' && zr) {
      const body = { ...profile(), z: S.zone, p: S.self.p, h: S.self.h, m: S.self.m, q: S.self.q || null, rv: S.self.rv || null, rp: S.self.rp || null, c: S.myChat, bd: S.bd };
      const json = JSON.stringify(body);
      if (!force && (json === S.lastJson || now - S.lastSend < 125)) return;
      S.lastSend = now;
      S.lastJson = json;
      zr.presence(body).catch(() => {});
    } else if (S.mode === 'server' && sock?.connected) {
      const json = JSON.stringify(S.self);
      if (!force && (json === S.lastJson || now - S.lastSend < 100)) return;
      S.lastSend = now;
      S.lastJson = json;
      sock.emit('st', S.self);
    }
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;

  const api = {
    get mode() { return S.mode; },
    get zone() { return S.zone; },
    connected: () => S.connected && (S.mode === 'server' ? !!S.zone : !!zr),
    count: () => S.peers.size,
    myId: () => S.myId,
    list: () => [...S.peers.values()].filter((p) => p.st),
    // 장면이 바뀔 때 (main.js가 부름): 같은 존 사람들끼리만 보이고 들린다
    setScene(sceneId) {
      const z = zoneOf(sceneId);
      if (z === S.zone) return;
      S.zone = z;
      S.self = null;
      S.lastJson = '';
      S.peers.clear();
      if (S.mode === 'room' && room) joinRoom(z);
      else if (S.mode === 'server' && sock?.connected) {
        if (z) sock.emit('hello', profile()); // 닉네임·우주복을 바꿨을 수 있으니 다시 알림
        sock.emit(z ? 'join' : 'leave', { z });
      }
    },
    // 매 프레임 내 상태 (장면이 부름) — 바뀐 것만, 1초에 8~10번까지
    tick(state) {
      if (!S.zone || !state?.p) return;
      const st = { p: state.p.map(r2), h: r2(state.h || 0), m: MODES.includes(state.m) ? state.m : 'idle' };
      if (state.q) st.q = state.q.map(r3);
      if (state.rv) st.rv = state.rv;
      if (state.rp) st.rp = state.rp.map(r2);
      S.self = st;
      send(false);
    },
    // 위치 풍선·이동 메뉴로 순간 이동하기 직전에 (서버는 이것이 있어야 큰 이동을 받아 준다)
    warp() { if (S.mode === 'server' && sock?.connected) sock.emit('warp'); },
    sendChat(text) {
      const t = cleanText(text);
      if (!t) return;
      if (S.mode === 'room') {
        S.myChat = [...S.myChat, [++S.chatSeq, t]].slice(-3);
        send(true);
      } else if (S.mode === 'server' && sock?.connected) sock.emit('chat', t);
    },
    onChat(fn) { L.chat.add(fn); return () => L.chat.delete(fn); },
    // ---------- 협동 보스 (우주 엘리베이터) ----------
    // 공통 시계(초): 서버 모드는 서버 시계, 그 밖에는 내 시계 (실시간 방 사람들끼리는 각자 시계라 조금 어긋날 수 있음)
    nowSec() { return (Date.now() + (S.mode === 'server' ? S.off : 0)) / 1000; },
    onBoss(fn) { L.boss.add(fn); return () => L.boss.delete(fn); },
    // 서버 모드: 약점을 밟았다고 알림 (서버가 위치·시간·간격을 다시 확인해 체력을 깎음)
    // (바로 앞에 내 위치를 먼저 보내서 서버가 최신 위치로 확인하게)
    bossHit(f) { if (S.mode === 'server' && sock?.connected) { send(true); sock.emit('bhit', { f }); } },
    // 실시간 방 모드: 내가 준 피해를 presence에 실어 보냄 → 체력 = 최대 - 모두의 피해 합
    setBossDmg(bd) { S.bd = bd; if (S.mode === 'room') send(true); },
    peerBossDmg() { return [...S.peers.values()].map((p) => p.bd).filter(Boolean); },
    onSeat(fn) { L.seat.add(fn); return () => L.seat.delete(fn); },
    // 화면 표시용 한 줄
    statusText() {
      if (S.mode === 'off') return '혼자 모드';
      if (!api.connected()) return '실시간 연결 중…';
      const n = S.peers.size + 1;
      return n > 1 ? `실시간 · ${n}명 함께` : '실시간 · 나 혼자';
    },
  };
  // 연결 시작: ?server= 가 있거나 우주마을 서버가 내보낸 페이지면 우주마을 서버, 아니면 아티팩트 실시간 방 (없으면 혼자 모드)
  (async () => {
    // 우주마을 서버가 화면까지 같이 내보낼 때(공개 웹페이지)는 index.html에 <meta name="sv-server" content="same-origin">이 붙는다 → 같은 주소로 접속
    const same = document.querySelector('meta[name="sv-server"]')?.content === 'same-origin';
    if (serverUrl && /^(https?|wss?):\/\//i.test(serverUrl)) await startServer(serverUrl);
    else if (same) await startServer(location.origin);
    else await startRoom();
  })();
  return api;
}
