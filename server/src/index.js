// 우주마을 실시간 서버 (Socket.IO) — 아직 어디에도 배포하지 않았다. 로컬 실행과 부하 테스트용.
//
// 하는 일
//  · 존(달 착륙지·라운지·정거장·유영·우주 탐험)마다 채널을 나누고, 채널 정원(CHANNEL_CAP)이 차면 다음 채널로 보낸다.
//  · 접속자의 위치·동작·월면차 탑승을 받아 0.1초마다 같은 채널에 스냅숏으로 보낸다.
//  · 채팅을 같은 채널에 전한다 (욕설·연락처 가림, 도배 제한).
//
// 클라이언트를 믿지 않는다
//  · 모양·범위·길이: packages/shared/protocol.js 의 sanitize*로 확인하고 잘라 낸다.
//  · 속도: 존별 최고 속도를 넘는 이동은 서버가 이전 위치에서 최대 거리까지만 옮긴다 (순간 이동은 'warp' 뒤 2초 안, 1.5초에 한 번).
//  · 좌석: 월면차 좌석은 먼저 앉은 사람이 임자. 이미 찬 자리는 거절한다 ('seatTaken').
//  · 횟수: 이벤트 종류별 토큰 버킷. 너무 많이 보내면 버리고, 계속되면 연결을 끊는다.
//  · 운영 통계(/stats)는 STATS_TOKEN 헤더가 맞을 때만. 토큰을 정하지 않으면 /stats 자체가 없다.
import http from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { PROTOCOL, ZONES, MODES, cleanText, sanitizeProfile, sanitizeState } from '../../packages/shared/protocol.js';

const PORT = Number(process.env.PORT) || 8787;
const CAP = Math.max(2, Number(process.env.CHANNEL_CAP) || 30);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 500;
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 8;
const TICK_MS = 100;
const STATS_TOKEN = process.env.STATS_TOKEN || '';
const PROD = process.env.NODE_ENV === 'production';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (PROD && !ORIGINS.length) {
  console.error('운영 모드에서는 ALLOWED_ORIGINS(허용할 웹 주소, 쉼표로 구분)를 꼭 정해야 합니다.');
  process.exit(1);
}

// ---------- 통계 ----------
const RES = 10; // 이벤트 루프 지연 측정 간격(ms): 잰 값에서 이 간격을 빼야 실제 '밀린 시간'
const loop = monitorEventLoopDelay({ resolution: RES });
loop.enable();
const stat = { inMsgs: 0, outSnaps: 0, outBytes: 0, chats: 0, fixes: 0, dropped: 0, kicked: 0, seatRejects: 0 };
let cpuPrev = process.cpuUsage(), cpuAt = process.hrtime.bigint();

// ---------- HTTP: /health · /stats ----------
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.url === '/stats' && STATS_TOKEN && req.headers['x-stats-token'] === STATS_TOKEN) {
    const now = process.hrtime.bigint();
    const cpu = process.cpuUsage(cpuPrev);
    const wall = Number(now - cpuAt) / 1000; // µs
    cpuPrev = process.cpuUsage();
    cpuAt = now;
    const ms = (v) => Math.max(0, Math.round((v / 1e6 - RES) * 100) / 100);
    const body = {
      players: players.size,
      channels: [...channels.values()].map((c) => ({ zone: c.zone, ch: c.ch, n: c.players.size })),
      eventLoopMs: { p50: ms(loop.percentile(50)), p95: ms(loop.percentile(95)), p99: ms(loop.percentile(99)), max: ms(loop.max) },
      cpuPercent: Math.round(((cpu.user + cpu.system) / Math.max(1, wall)) * 1000) / 10,
      memMB: { rss: Math.round(process.memoryUsage().rss / 1048576), heap: Math.round(process.memoryUsage().heapUsed / 1048576) },
      counters: { ...stat },
    };
    loop.reset();
    for (const k of Object.keys(stat)) stat[k] = 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: ORIGINS.length ? ORIGINS : true },
  maxHttpBufferSize: 4096, // 한 메시지 최대 4 KB
  pingInterval: 20000,
  pingTimeout: 20000,
  transports: ['websocket', 'polling'],
});

// ---------- 채널 ----------
const channels = new Map(); // `${zone}:${ch}` → { zone, ch, key, players: Map<id, P>, seats: Map<'i:k', id>, dirty, lastSent }
const players = new Map(); // socket.id → P
let nextId = 1;
const perIp = new Map();

function pickChannel(zone) {
  for (let ch = 1; ; ch++) {
    const key = `${zone}:${ch}`;
    let c = channels.get(key);
    if (!c) {
      c = { zone, ch, key, players: new Map(), seats: new Map(), dirty: true, lastSent: 0 };
      channels.set(key, c);
    }
    if (c.players.size < CAP) return c;
  }
}
function leaveChannel(P) {
  const c = P.chan;
  if (!c) return;
  c.players.delete(P.id);
  if (P.seatKey) c.seats.delete(P.seatKey);
  P.seatKey = null;
  P.sock.leave(c.key);
  P.sock.to(c.key).emit('gone', { id: P.id });
  P.chan = null;
  P.st = null;
  if (!c.players.size) channels.delete(c.key);
}

// ---------- 횟수 제한 (토큰 버킷) ----------
function bucket(rate, burst) { return { t: burst, at: Date.now(), rate, burst }; }
function take(b) {
  const now = Date.now();
  b.t = Math.min(b.burst, b.t + ((now - b.at) / 1000) * b.rate);
  b.at = now;
  if (b.t < 1) return false;
  b.t -= 1;
  return true;
}

// ---------- 접속 ----------
io.use((socket, next) => {
  if (players.size >= MAX_PLAYERS) return next(new Error('full'));
  const ip = (process.env.TRUST_PROXY === '1' && String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim()) || socket.handshake.address;
  const n = perIp.get(ip) || 0;
  if (n >= MAX_PER_IP) return next(new Error('too_many'));
  perIp.set(ip, n + 1);
  socket.data.ip = ip;
  next();
});

io.on('connection', (sock) => {
  const P = {
    id: String(nextId++),
    sock,
    prof: { n: '탐험가', s: 'mint', k: 0 },
    chan: null,
    st: null,
    stAt: 0,
    spawn: true,
    warpUntil: 0,
    lastWarp: 0,
    seatKey: null,
    drops: 0,
    b: { all: bucket(40, 80), st: bucket(15, 20), chat: bucket(1, 3), join: bucket(2, 4) },
  };
  players.set(sock.id, P);
  sock.emit('welcome', { id: P.id, v: PROTOCOL, cap: CAP });

  // 모든 이벤트 공통: 너무 자주 보내면 버리고, 1초에 30번 넘게 버려지면 끊음
  sock.use(([ev], next) => {
    stat.inMsgs++;
    if (take(P.b.all)) return next();
    stat.dropped++;
    if (++P.drops > 30) { stat.kicked++; sock.disconnect(true); }
    return undefined;
  });
  const dropTimer = setInterval(() => { P.drops = 0; }, 1000);

  sock.on('hello', (o) => {
    if (!take(P.b.join)) return;
    P.prof = sanitizeProfile(o);
    if (P.chan) P.sock.to(P.chan.key).emit('meta', [{ id: P.id, ...P.prof }]);
  });

  sock.on('join', (o) => {
    if (!take(P.b.join)) return;
    const zone = o?.z;
    if (!ZONES[zone]) return;
    leaveChannel(P);
    const c = pickChannel(zone);
    c.players.set(P.id, P);
    P.chan = c;
    P.spawn = true;
    sock.join(c.key);
    sock.emit('joined', { z: zone, ch: c.ch, cap: CAP });
    sock.emit('meta', [...c.players.values()].map((q) => ({ id: q.id, ...q.prof })));
    sock.to(c.key).emit('meta', [{ id: P.id, ...P.prof }]);
    c.dirty = true;
  });

  sock.on('leave', () => leaveChannel(P));

  sock.on('warp', () => {
    const now = Date.now();
    if (now - P.lastWarp < 1500) return;
    P.lastWarp = now;
    P.warpUntil = now + 2000;
  });

  sock.on('st', (raw) => {
    const c = P.chan;
    if (!c || !take(P.b.st)) return;
    const st = sanitizeState(c.zone, raw);
    if (!st) return;
    const now = Date.now();
    const Z = ZONES[c.zone];
    // 속도 확인: 들어온 직후·순간 이동 허락 안에서는 건너뜀
    if (P.st && !P.spawn && now > P.warpUntil) {
      const dt = Math.min(2, Math.max(0.05, (now - P.stAt) / 1000));
      const [x0, y0, z0] = P.st.p;
      const [x1, y1, z1] = st.p;
      const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const maxD = Z.speed * dt * 1.5 + 0.5;
      if (d > maxD) {
        const k = maxD / d;
        st.p = [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k].map((v) => Math.round(v * 100) / 100);
        stat.fixes++;
        sock.emit('fix', { p: st.p });
      }
    }
    P.spawn = false;
    // 월면차 좌석: 먼저 앉은 사람이 임자
    const key = st.rv ? `${st.rv[0]}:${st.rv[1]}` : null;
    if (key !== P.seatKey) {
      if (P.seatKey) c.seats.delete(P.seatKey);
      P.seatKey = null;
      if (key) {
        const holder = c.seats.get(key);
        if (holder && holder !== P.id && c.players.has(holder)) {
          stat.seatRejects++;
          sock.emit('seatTaken', { rv: st.rv });
          delete st.rv;
          delete st.rp;
        } else {
          c.seats.set(key, P.id);
          P.seatKey = key;
        }
      }
    }
    P.st = st;
    P.stAt = now;
    c.dirty = true;
  });

  sock.on('chat', (text) => {
    const c = P.chan;
    if (!c || !take(P.b.chat)) return;
    const x = cleanText(text);
    if (!x) return;
    stat.chats++;
    sock.to(c.key).emit('chat', { id: P.id, x });
  });

  // 지연 시간 측정용 (부하 테스트)
  sock.on('ping2', (ack) => { if (typeof ack === 'function') ack(Date.now()); });

  sock.on('disconnect', () => {
    clearInterval(dropTimer);
    leaveChannel(P);
    players.delete(sock.id);
    const ip = sock.data.ip;
    const n = (perIp.get(ip) || 1) - 1;
    if (n > 0) perIp.set(ip, n);
    else perIp.delete(ip);
  });
});

// ---------- 스냅숏: 0.1초마다, 바뀐 채널만 (안 바뀌어도 1초에 한 번은) ----------
setInterval(() => {
  const now = Date.now();
  for (const c of channels.values()) {
    if (c.players.size < 2) continue;
    if (!c.dirty && now - c.lastSent < 1000) continue;
    const l = [];
    for (const P of c.players.values()) {
      if (!P.st) continue;
      const s = P.st;
      const ex = {};
      if (s.q) ex.q = s.q;
      if (s.rv) ex.rv = s.rv;
      if (s.rp) ex.rp = s.rp;
      const row = [P.id, s.p[0], s.p[1], s.p[2], s.h, Math.max(0, MODES.indexOf(s.m))];
      if (ex.q || ex.rv) row.push(ex);
      l.push(row);
    }
    const msg = { z: c.zone, l };
    io.to(c.key).emit('snap', msg);
    stat.outSnaps += c.players.size;
    stat.outBytes += JSON.stringify(msg).length * c.players.size;
    c.dirty = false;
    c.lastSent = now;
  }
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`우주마을 실시간 서버 :${PORT} · 채널 정원 ${CAP} · 허용 주소 ${ORIGINS.length ? ORIGINS.join(', ') : '(개발: 모두)'} · /stats ${STATS_TOKEN ? '켜짐(토큰 필요)' : '꺼짐'}`);
});
