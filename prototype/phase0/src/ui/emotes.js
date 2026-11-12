import { h, I } from './dom.js';

// 감정 표현(모션) 8종 — 숫자키 1~8, 모바일은 오른쪽 보조 줄의 '감정' 버튼
// dur 0 = 움직이기 전까지 계속 · indoor = canDrink가 false인 장면에서는 막음
// 물 마시기: 정거장(무중력)·라운지는 물주머니, 달 표면은 헬멧을 쓴 채 우주복 안 음료 주머니의 빨대로
export const EMOTES = [
  { k: 'wave', key: '1', ico: '👋', label: '인사', dur: 2.6 },
  { k: 'cheer', key: '2', ico: '🙌', label: '만세', dur: 2.4 },
  { k: 'dance', key: '3', ico: '💃', label: '춤', dur: 0 },
  { k: 'clap', key: '4', ico: '👏', label: '박수', dur: 2.6 },
  { k: 'sit', key: '5', ico: '🪑', label: '앉기', dur: 0 },
  { k: 'lie', key: '6', ico: '🌌', label: '눕기', dur: 0 },
  { k: 'flip', key: '7', ico: '🤸', label: '공중제비', dur: 0 },
  { k: 'drink', key: '8', ico: '💧', label: '물 마시기', dur: 4.8, indoor: true },
];

function panelIn(host, onPick, opts = {}) {
  let panel = host.querySelector(':scope > .emote-panel');
  if (panel) return panel;
  panel = h(`<div class="glass emote-panel" style="display:none">${EMOTES.map((e) => {
    const off = e.indoor && opts.canDrink === false;
    return `<button data-e="${e.k}" ${off ? 'class="off" title="이 장소에서는 마실 수 없어요"' : ''}><span class="ico">${e.ico}</span>${e.label}<small class="pc-only">${e.key}</small>${off ? '<small>여기선 불가</small>' : ''}</button>`;
  }).join('')}</div>`);
  host.appendChild(panel);
  panel.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => {
    onPick(b.dataset.e);
    panel.style.display = 'none';
  }));
  return panel;
}
const toggle = (p) => { p.style.display = p.style.display === 'none' ? 'grid' : 'none'; };

// PC: 오른쪽 세로 줄의 '감정 표현' 버튼 + 펼침 패널
export function mountEmotes(container, onPick, opts) {
  const btn = h(`<button class="btn ghost side-btn" data-k="emote">${I.smile}감정 표현 <span class="pc-only" style="opacity:.6">1~8</span></button>`);
  container.appendChild(btn);
  btn.addEventListener('click', () => toggle(panelIn(container, onPick, opts)));
}

// 모바일: 보조 줄 '감정' 버튼이 여는 패널 (조작 버튼과 겹치지 않게 화면 오른쪽 가운데)
export function toggleEmotePanel(hud, onPick, opts) {
  toggle(panelIn(hud, onPick, opts));
}

// 숫자키로 고른 감정 표현
export function emoteFromKeys(pressed) {
  for (const e of EMOTES) if (pressed.has(e.key)) return e.k;
  return null;
}
