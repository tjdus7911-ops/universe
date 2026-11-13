import { h, I } from './dom.js';
import { mountChat } from './chat.js';
import { mountControls } from './controls.js';
import { mountEmotes, toggleEmotePanel } from './emotes.js';
import { say } from './bubbles.js';

// 장면 공통 HUD: 채팅(PC·모바일) + 모바일 조작 + '이동' 메뉴 + 감정 표현
// o: { here, room, chatTitle, seed, npcs, main, extra, aux, emote(k), canDrink, speaker(m) }
//  speaker(m): 채팅 메시지를 말한 아바타(root)를 돌려주면 그 머리 위에 말풍선을 띄운다 (없으면 null)
export function mountSceneUi(ctx, hud, o) {
  let mc = null;
  const onSay = (m) => {
    const a = o.speaker?.(m);
    const root = a && (a.isObject3D ? a : a.root);
    if (root) say(root, m.text, { me: m.kind === 'me', y: a.isObject3D ? undefined : a.y });
  };
  const chat = mountChat(ctx, hud, { room: o.room, title: o.chatTitle, seed: o.seed, npcs: o.npcs, onBadge: (n) => mc?.badge('chat', n), onSay });
  const aux = [{ k: 'chat', icon: I.chat, label: '채팅', onTap: () => chat.toggle() }];
  if (o.emote) aux.push({ k: 'emote', icon: I.smile, label: '감정', onTap: () => toggleEmotePanel(hud, o.emote, { canDrink: o.canDrink }) });
  aux.push(...(o.aux || []));
  aux.push({ k: 'travel', icon: I.compass, label: '이동', onTap: () => ctx.travel(o.here) });
  mc = mountControls(ctx, hud, { main: o.main, extra: o.extra, aux });
  // PC: 오른쪽 세로 줄에 '이동'(M)과 '감정 표현'(1~8)
  let mr = hud.querySelector('.mr');
  if (!mr) {
    mr = h('<div class="mr pc-only"></div>');
    hud.appendChild(mr);
  }
  const tb = h(`<button class="btn ghost side-btn" data-k="travel">${I.compass}이동 <span style="opacity:.6">M</span></button>`);
  tb.addEventListener('click', () => ctx.travel(o.here));
  mr.appendChild(tb);
  if (o.emote) mountEmotes(mr, o.emote, { canDrink: o.canDrink });
  mountHintToggle(hud);
  // 실시간 접속 상태 (혼자 모드 · 연결 중 · n명 함께) — 장소 이름표의 작은 글씨
  const online = hud.querySelectorAll('[data-k="online"]');
  if (online.length && ctx.multi) {
    const upd = () => {
      if (!hud.isConnected) { clearInterval(timer); return; }
      const t = ctx.multi.statusText();
      online.forEach((el) => { if (el.textContent !== t) el.textContent = t; });
    };
    const timer = setInterval(upd, 700);
    upd();
  }
  return { chat, mc };
}

// 아래쪽 조작 안내: × 로 닫고, 닫으면 작은 '조작 안내' 단추만 남긴다. 닫은 상태는 이 브라우저에 기억해 모든 장소에 같이 적용
const HINT_KEY = 'sv.hint.off';
function hintOff() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } }
function setHintOff(v) { try { v ? localStorage.setItem(HINT_KEY, '1') : localStorage.removeItem(HINT_KEY); } catch { /* 저장 불가 환경 */ } }
export function mountHintToggle(hud) {
  const hint = hud.querySelector('.bc .hint');
  if (!hint || hint.dataset.toggle) return;
  hint.dataset.toggle = '1';
  const x = h('<button class="hint-x" data-k="hint-close" title="안내 닫기" aria-label="조작 안내 닫기">×</button>');
  const open = h('<button class="glass hint-open" data-k="hint-open" title="조작 안내 보기">⌨ 조작 안내</button>');
  hint.appendChild(x);
  hint.parentElement.appendChild(open);
  const apply = (off) => { hint.style.display = off ? 'none' : ''; open.style.display = off ? '' : 'none'; };
  x.addEventListener('click', () => { setHintOff(true); apply(true); });
  open.addEventListener('click', () => { setHintOff(false); apply(false); });
  apply(hintOff());
}
