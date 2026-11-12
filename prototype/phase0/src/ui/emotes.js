import { h } from './dom.js';

// 감정 표현(모션) 7종 — 숫자키 1~7, 모바일은 버튼 묶음
// dur 0 = 움직이기 전까지 계속
export const EMOTES = [
  { k: 'wave', key: '1', ico: '👋', label: '인사', dur: 2.6 },
  { k: 'cheer', key: '2', ico: '🙌', label: '만세', dur: 2.4 },
  { k: 'dance', key: '3', ico: '💃', label: '춤', dur: 0 },
  { k: 'clap', key: '4', ico: '👏', label: '박수', dur: 2.6 },
  { k: 'sit', key: '5', ico: '🪑', label: '앉기', dur: 0 },
  { k: 'lie', key: '6', ico: '🌌', label: '눕기', dur: 0 },
  { k: 'flip', key: '7', ico: '🤸', label: '공중제비', dur: 0 },
];

// 오른쪽 세로 버튼 아래에 붙는 '감정 표현' 버튼 + 펼침 패널
export function mountEmotes(container, onPick) {
  const btn = h(`<button class="btn ghost side-btn" data-k="emote"><span style="font-size:15px">😊</span>감정 표현 <span class="pc-only" style="opacity:.6">1~7</span></button>`);
  const panel = h(`<div class="glass emote-panel" style="display:none">${EMOTES.map((e) => `<button data-e="${e.k}"><span class="ico">${e.ico}</span>${e.label}<small class="pc-only">${e.key}</small></button>`).join('')}</div>`);
  container.appendChild(btn);
  container.appendChild(panel);
  btn.addEventListener('click', () => { panel.style.display = panel.style.display === 'none' ? 'grid' : 'none'; });
  panel.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => {
    onPick(b.dataset.e);
    panel.style.display = 'none';
  }));
}

// 숫자키로 고른 감정 표현
export function emoteFromKeys(pressed) {
  for (const e of EMOTES) if (pressed.has(e.key)) return e.k;
  return null;
}
