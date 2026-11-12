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
    if (a) say(a.root || a, m.text, { me: m.kind === 'me', y: a.y });
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
  return { chat, mc };
}
