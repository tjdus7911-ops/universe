import { h, I } from './dom.js';
import { input } from '../core/input.js';
import { cleanText } from '../../../../packages/shared/protocol.js';

// 채팅 — PC(왼쪽 아래 창)와 모바일(위쪽 접는 창)이 같은 메시지 목록을 쓴다. 누구나 직접 입력한다.
// 같은 공간(존)에 있는 사람들과 실시간으로 주고받는다: ctx.multi (net/multi.js — 아티팩트 실시간 방 또는 우주마을 서버)
// 실시간 연결이 없으면(혼자 모드) 내 화면에만 남고, NPC 친구가 가끔 대답한다.
const rooms = new Map();
let current = null;
let wired = false;

// 욕설·연락처(전화번호·이메일·링크)는 가린다 — 서버도 같은 규칙으로 한 번 더 거른다
export const clean = (t) => cleanText(t);
const REPLIES = ['좋아!', 'ㅋㅋ 나도!', '어디야? 그쪽으로 갈게', '와 대박 ✨', '같이 사진 찍자', '잠깐만~'];

function room(id, seed = []) {
  if (!rooms.has(id)) rooms.set(id, seed.map((m) => ({ ...m })));
  return rooms.get(id);
}
function push(id, m) {
  const r = room(id);
  r.push(m);
  if (r.length > 60) r.shift();
  if (current && current.room === id) current.render(m);
}

// Enter로 입력창 열기 (PC) — 장면마다 다시 붙지 않도록 한 번만 등록
window.addEventListener('keydown', (e) => {
  if (!current || e.key !== 'Enter') return;
  if (/input|textarea/i.test(e.target?.tagName || '')) return;
  if (current.focus()) e.preventDefault();
});

// opts: { room, title, seed: [{who,text,kind}], npcs: ['이름'], onBadge(n), onSay(m) }
//  onSay: 새 메시지가 올 때마다 (내 말 · 다른 사람 말 · NPC 말) — 장면이 머리 위 말풍선으로 띄운다
export function mountChat(ctx, hud, opts) {
  const id = opts.room;
  const msgs = room(id, opts.seed || []);
  let lastSend = 0, unread = 0, open = false;
  if (!wired && ctx.multi) {
    wired = true;
    // 다른 사람이 보낸 채팅: 그 사람이 있는 존(= 채팅방)에 쌓고, 지금 보고 있는 방이면 바로 그린다
    ctx.multi.onChat((m) => push(m.zone, { who: m.who, text: m.text, kind: 'remote', peer: m.peer }));
  }

  const row = `<div class="crow"><input type="text" maxlength="60" enterkeyhint="send" placeholder="메시지 입력 (최대 60자)"><button class="csend" aria-label="보내기">${I.send}</button></div>`;
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
    ctx.multi?.sendChat(t);
    // 혼자 있을 때만 근처 NPC가 가끔 대답 (실제 사람이 있으면 끼어들지 않음)
    const npcs = opts.npcs || [];
    if (npcs.length && !(ctx.multi?.count() > 0) && Math.random() < 0.65) {
      const who = npcs[Math.floor(Math.random() * npcs.length)];
      setTimeout(() => { if (current === inst) push(id, { who, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], kind: '' }); }, 1400 + Math.random() * 1400);
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
  // NPC가 장면에서 말할 때 (예: 월면차에 같이 타면서) — 채팅 목록 + 머리 위 말풍선
  inst.npcSay = (who, text) => push(id, { who, text, kind: '' });
  return inst;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
