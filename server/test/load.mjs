// 부하 테스트 — 봇 N명이 달 착륙지에 들어와 0.1초마다 걷고(위치 전송), 20~40초에 한 번 채팅한다.
// 측정: 서버 이벤트 루프 지연·CPU·메모리(/stats, 1초 간격), 왕복 지연(ping2, 0.5초 간격),
//       스냅숏 간격(봇 하나가 받은 시각 차이), 받은 스냅숏 크기.
// 사용: STATS_TOKEN=… node test/load.mjs --url http://localhost:8787 --bots 30 --secs 30
import { io } from 'socket.io-client';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = arg('url', 'http://localhost:8787');
const N = Number(arg('bots', 30));
const SECS = Number(arg('secs', 30));
const ZONE = arg('zone', 'moon');
const TOKEN = process.env.STATS_TOKEN || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};

const bots = [];
const rtt = [];
const gaps = [];
let snapBytes = 0, snapCount = 0, chatsIn = 0, connectErr = 0;

function makeBot(i) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 10000 });
    const b = { s, i, a: Math.random() * Math.PI * 2, r: 8 + Math.random() * 30, timer: null, chatAt: Date.now() + 20000 + Math.random() * 20000 };
    s.on('connect', () => {
      s.emit('hello', { n: `봇${i}`, s: ['mint', 'lavender', 'coral', 'sky'][i % 4], k: i % 4 });
      s.emit('join', { z: ZONE });
      // 0.1초마다 걷기: 반지름 r 원 위를 1.6 m/s로
      b.timer = setInterval(() => {
        b.a += (1.6 / b.r) * 0.1;
        s.emit('st', { p: [Math.cos(b.a) * b.r, 0, Math.sin(b.a) * b.r], h: b.a, m: 'walk' });
        if (Date.now() > b.chatAt) {
          b.chatAt = Date.now() + 20000 + Math.random() * 20000;
          s.emit('chat', `안녕 나는 봇${i}`);
        }
      }, 100);
      resolve(b);
    });
    s.on('connect_error', () => { connectErr++; resolve(null); });
    s.on('chat', () => { chatsIn++; });
    if (i === 0) {
      let last = 0;
      s.on('snap', (m) => {
        const now = performance.now();
        if (last) gaps.push(now - last);
        last = now;
        snapCount++;
        snapBytes += JSON.stringify(m).length;
      });
    }
  });
}

async function stats() {
  if (!TOKEN) return null;
  try {
    const r = await fetch(`${URL}/stats`, { headers: { 'x-stats-token': TOKEN } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

(async () => {
  await stats(); // 카운터 초기화
  for (let i = 0; i < N; i++) {
    bots.push(await makeBot(i));
    if (i % 10 === 9) await sleep(50);
  }
  const live = bots.filter(Boolean);
  await sleep(1500);
  await stats(); // 접속 과정은 빼고 측정
  const samples = [];
  const probe = live[0]?.s;
  const pingTimer = setInterval(() => {
    const t0 = performance.now();
    probe?.timeout(3000).emit('ping2', (err) => { if (!err) rtt.push(performance.now() - t0); });
  }, 500);
  for (let k = 0; k < SECS; k++) {
    await sleep(1000);
    const s = await stats();
    if (s) samples.push(s);
  }
  clearInterval(pingTimer);
  const last = samples.at(-1);
  const sum = (f) => samples.reduce((a, s) => a + f(s), 0);
  const out = {
    bots: N,
    connected: live.length,
    connectErrors: connectErr,
    channels: last?.channels,
    eventLoopP95MsMax: samples.length ? Math.max(...samples.map((s) => s.eventLoopMs.p95)) : null,
    eventLoopP99MsMax: samples.length ? Math.max(...samples.map((s) => s.eventLoopMs.p99)) : null,
    cpuPercentAvg: samples.length ? Math.round((sum((s) => s.cpuPercent) / samples.length) * 10) / 10 : null,
    cpuPercentMax: samples.length ? Math.max(...samples.map((s) => s.cpuPercent)) : null,
    rssMBMax: samples.length ? Math.max(...samples.map((s) => s.memMB.rss)) : null,
    // 메모리 추세: 처음 1분 평균과 마지막 1분 평균 (오래 돌릴 때 새는지 확인)
    rssMBFirstMin: samples.length ? avg(samples.slice(0, 60).map((s) => s.memMB.rss)) : null,
    rssMBLastMin: samples.length ? avg(samples.slice(-60).map((s) => s.memMB.rss)) : null,
    heapMBFirstMin: samples.length ? avg(samples.slice(0, 60).map((s) => s.memMB.heap)) : null,
    heapMBLastMin: samples.length ? avg(samples.slice(-60).map((s) => s.memMB.heap)) : null,
    inMsgsPerSec: samples.length ? Math.round(sum((s) => s.counters.inMsgs) / samples.length) : null,
    outKBPerSec: samples.length ? Math.round(sum((s) => s.counters.outBytes) / samples.length / 1024) : null,
    serverFixes: sum((s) => s.counters.fixes),
    dropped: sum((s) => s.counters.dropped),
    rttMs: { p50: round(pct(rtt, 50)), p95: round(pct(rtt, 95)), max: round(Math.max(...rtt, 0)) },
    snapGapMs: { p50: round(pct(gaps, 50)), p95: round(pct(gaps, 95)) },
    snapAvgBytes: snapCount ? Math.round(snapBytes / snapCount) : null,
    chatsReceivedByBots: chatsIn,
  };
  console.log(JSON.stringify(out));
  for (const b of live) { clearInterval(b.timer); b.s.close(); }
  await sleep(500);
  process.exit(0);
})();

function round(v) { return v == null ? null : Math.round(v * 10) / 10; }
function avg(a) { return a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null; }
