import { h, I } from './dom.js';
import { account } from '../core/account.js';
import { input } from '../core/input.js';

// 채팅 — PC(왼쪽 아래 창)와 모바일(위쪽 접는 창)이 같은 메시지 목록을 쓴다.
// 시안: 서버가 없어 같은 브라우저의 다른 탭끼리만 실시간으로 주고받는다(BroadcastChannel).
// PHASE 4에서 send()·onRemote()를 Socket.IO 'chat' 이벤트로 바꾼다.
const rooms = new Map();
let current = null;
let bc = null;
try {
  bc = new BroadcastChannel('sv-chat-v1');
  bc.onmessage = (e) => {
    const m = e.data;
    if (m && m.room && m.text) push(m.room, { who: String(m.who).slice(0, 12), text: clean(m.text), kind: 'remote' }, false);
  };
} catch { /* BroadcastChannel 미지원 */ }

const BAD = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', 'fuck', 'shit'];
export function clean(t) {
  let s = String(t).replace(/\s+/g, ' ').trim().slice(0, 60);
  for (const w of BAD) s = s.split(w).join('♡'.repeat(Math.min(w.length, 3)));
  return s;
}
export const QUICK = ['안녕! 👋', '같이 가자!', '여기 멋지다 ✨', '잠깐만 기다려 줘', '고마워 😊', '또 만나~'];
const REPLIES = ['좋아!', 'ㅋㅋ 나도!', '어디야? 그쪽으로 갈게', '와 대박 ✨', '같이 사진 찍자', '잠깐만~'];

function room(id, seed = []) {
  if (!rooms.has(id)) rooms.set(id, seed.map((m) => ({ ...m })));
  return rooms.get(id);
}
function push(id, m, broadcast = true) {
  const r = room(id);
  r.push(m);
  if (r.length > 60) r.shift();
  if (current && current.room === id) current.render(m);
  if (broadcast && bc) { try { bc.postMessage({ room: id, who: m.who, text: m.text }); } catch { /* 무시 */ } }
}

// Enter로 입력창 열기 (PC) — 장면마다 다시 붙지 않도록 한 번만 등록
window.addEventListener('keydown', (e) => {
  if (!current || e.key !== 'Enter') return;
  if (/input|textarea/i.test(e.target?.tagName || '')) return;
  if (current.focus()) e.preventDefault();
});

// opts: { room, seed: [{who,text,kind}], npcs: ['이름'], onBadge(n), onSay(m) }
//  onSay: 새 메시지가 올 때마다 (내 말·NPC 말·다른 탭) — 장면이 머리 위 말풍선으로 띄운다
export function mountChat(ctx, hud, opts) {
  const id = opts.room;
  const msgs = room(id, opts.seed || []);
  const member = account.isMember();
  let lastSend = 0, unread = 0, open = false;

  const row = member
    ? `<div class="crow"><input type="text" maxlength="60" enterkeyhint="send" placeholder="메시지 입력 (최대 60자)"><button class="csend" aria-label="보내기">${I.send}</button></div>`
    : `<div class="cquick">${QUICK.map((q) => `<button>${q}</button>`).join('')}</div><div class="cnote">비회원은 빠른 채팅만 쓸 수 있어요 · 회원가입하면 직접 입력</div>`;
  const pc = h(`<div class="bl pc-only"><div class="glass chat live"><div class="clist"></div>${row}</div></div>`);
  const sheet = h(`<div class="chat-sheet glass mobile-only" style="display:none">
    <div class="chead"><b>${I.chat}채팅</b><span class="croom">${opts.title || ''}</span><button class="cclose" aria-label="채팅 접기">${I.close}</button></div>
    <div class="clist"></div>${row}</div>`);
  hud.appendChild(pc);
  hud.appendChild(sheet);
  const lists = [pc.querySelector('.clist'), sheet.querySelector('.clist')];

  const line = (m) => `<div class="msg ${m.kind || ''}"><b>${esc(m.who)}</b>${esc(m.text)}</div>`;
  function renderAll() {
    for (const l of lists) {
      l.innerHTML = msgs.slice(-30).map(line).join('');
      l.scrollTop = l.scrollHeight;
    }
  }
  const inst = {
    room: id,
    render(m) {
      for (const l of lists) {
        l.insertAdjacentHTML('beforeend', line(m));
        while (l.children.length > 30) l.firstElementChild.remove();
        l.scrollTop = l.scrollHeight;
      }
      if (m.kind !== 'sys') opts.onSay?.(m);
      if (!open && m.kind !== 'me') {
        unread++;
        opts.onBadge?.(unread);
      }
    },
    focus() {
      if (ctx.isMobile()) return false;
      const inp = pc.querySelector('input');
      if (!inp || !inp.isConnected) return false;
      inp.focus();
      return true;
    },
  };
  current = inst;
  renderAll();

  function send(text) {
    const now = performance.now();
    const t = clean(text);
    if (!t) return false;
    if (now - lastSend < 1200) { toastIn('조금 천천히 보내 주세요'); return false; }
    lastSend = now;
    push(id, { who: ctx.profile.name, text: t, kind: 'me' });
    // 시안: 근처 NPC가 가끔 대답 (실제 다른 사용자 대신)
    const npcs = opts.npcs || [];
    if (npcs.length && Math.random() < 0.65) {
      const who = npcs[Math.floor(Math.random() * npcs.length)];
      setTimeout(() => { if (current === inst) push(id, { who, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], kind: '' }, false); }, 1400 + Math.random() * 1400);
    }
    return true;
  }
  function toastIn(t) {
    const n = h(`<div class="cwarn">${t}</div>`);
    (open ? sheet : pc.firstElementChild).appendChild(n);
    setTimeout(() => n.remove(), 1600);
  }
  for (const box of [pc, sheet]) {
    const inp = box.querySelector('input');
    if (inp) {
      inp.addEventListener('focus', () => { input.keys.clear(); box.classList.add('typing'); });
      inp.addEventListener('blur', () => box.classList.remove('typing'));
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) {
          if (send(inp.value)) inp.value = '';
          else if (!inp.value.trim()) inp.blur();
          e.preventDefault();
        } else if (e.key === 'Escape') inp.blur();
      });
      box.querySelector('.csend').addEventListener('click', () => { if (send(inp.value)) inp.value = ''; inp.focus(); });
    }
    box.querySelectorAll('.cquick button').forEach((b) => b.addEventListener('click', () => send(b.textContent)));
  }
  // 모바일 접기·펼치기 + 가상 키보드가 올라와도 입력창이 보이도록 높이 조절
  const vv = window.visualViewport;
  const fit = () => { if (vv) sheet.style.setProperty('--vvh', `${vv.height}px`); };
  vv?.addEventListener('resize', fit);
  fit();
  inst.toggle = (v) => {
    open = v ?? !open;
    sheet.style.display = open ? 'flex' : 'none';
    if (open) {
      unread = 0;
      opts.onBadge?.(0);
      renderAll();
    } else sheet.querySelector('input')?.blur();
    return open;
  };
  sheet.querySelector('.cclose').addEventListener('click', () => inst.toggle(false));
  inst.send = send;
  // 장면에서 NPC가 말할 때 (예: 월면차에 같이 타면서) — 채팅 목록 + 머리 위 말풍선
  inst.npcSay = (who, text) => push(id, { who, text, kind: '' }, false);
  return inst;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
