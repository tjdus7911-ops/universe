// 「깜빡 속았지! 달 대시」 판(스테이지) 데이터 — x 좌표(m), y = 윗면 높이(m)
// 판을 깨면 다음 판으로, 실패하면 그 판의 시작점으로 돌아간다 (장소를 나갔다 들어오면 1판부터).
//
// 공통 항목
//  grounds   [x0, x1, top=0, kind?]  땅·기둥 (kind 'stone' = 돌기둥 모양, 'ice' = 미끄러운 얼음)
//  fakes     [x0, x1]                 진짜 같은 가짜 바닥 (밟으면 무너짐)
//  collapse  [x0, x1]                 1 m씩 차례로 무너지는 바닥 (계속 달리면 건넘)
//  sinkers   {x0, x1, top}            밟으면 땅속으로 가라앉는 기둥
//  hidden    {x, y}                   아래에서 머리로 부딪혀야 나타나는 투명 블록 (y = 아랫면)
//  bricks    {x, y, n}                벽돌 줄 (밟고 올라설 수 있음)
//  crates    {x, y, kind}             ★ 상자 (star = 별, coin = 코인, alien = 외계인이 튀어나옴)
//  coins     [x, y]                   코인
//  springs   {x, v}                   밟으면 높이 튀어 오르는 스프링 (땅 위)
//  plats     {x0, x1, y, drop?, move?: {ax, ay, period}}  발판 (drop = 밟으면 빠짐, move = 왕복)
//  spikes    {x0, x1, trig:[a, b], always?}  솟는 가시 (always = 처음부터 나와 있음)
//  thwomps   {x, y}                   지나가면 흔들린 뒤 떨어지는 돌 블록
//  fakeFlag  {x}                      가까이 가면 날아가는 가짜 골인 깃발 (+ 뒤따르는 운석)
//  meteors   {trig, after?}           지나가면 '계속 달리면 닿을 자리'에 떨어지는 운석 (빛기둥으로 미리 표시)
//  walkers   {min, max, speed?}       걸어 다니는 외계인 (위에서 밟으면 물리침)
//  poppers   {x, trig}                구멍에서 튀어나오는 외계인
export const LEVELS = [
  {
    name: '달 기슭',
    theme: { bg: '#04060f', top: '#b3ada4', side: '#77716a', rock: '#5d554d', earth: true, flag: '#3ad49b' },
    start: 1.5,
    goal: 194,
    grounds: [[-6, 28], [30.5, 56], [60, 80], [80, 110], [124, 150], [152.5, 160], [168, 210]],
    fakes: [[56, 60]],
    collapse: [[160, 168]],
    hidden: [{ x: 28, y: 2.5 }, { x: 29, y: 2.5 }, { x: 150, y: 2.5 }, { x: 151, y: 2.5 }],
    crates: [{ x: 36, y: 3.2, kind: 'star' }, { x: 38, y: 3.2, kind: 'coin' }, { x: 40, y: 3.2, kind: 'alien' }],
    coins: [[13, 1.4], [14.5, 1.9], [16, 2.2], [17.5, 1.9], [19, 1.4], [113.1, 3], [117.7, 4], [122.1, 3]],
    spikes: [{ x0: 66, x1: 67.6, trig: [64.6, 65.4] }],
    fakeFlag: { x: 86 },
    meteors: [{ trig: 95.5 }, { trig: 88.2, after: 'flag' }],
    plats: [
      { x0: 112, x1: 114.2, y: 1.6 },
      { x0: 116.6, x1: 118.8, y: 2.6, drop: true },
      { x0: 121, x1: 123.2, y: 1.6 },
    ],
    walkers: [{ min: 73.5, max: 79.3 }, { min: 103.5, max: 109 }, { min: 136, max: 148 }],
    poppers: [{ x: 132.5, trig: 3.6 }],
  },
  {
    name: '얼음 크레이터',
    theme: { bg: '#0a1230', top: '#e6f2ff', side: '#8fa6c8', rock: '#9fb3d6', earth: true, ice: true, flag: '#5aa7ff' },
    start: 1.5,
    goal: 172,
    grounds: [[-6, 24], [28, 44], [44, 52, 6, 'stone'], [52, 56], [56, 72, 0, 'ice'], [72, 92], [102, 130], [138, 185]],
    collapse: [[130, 138]],
    hidden: [{ x: 129, y: 2.6 }],
    bricks: [{ x: 31, y: 3.4, n: 5 }],
    crates: [{ x: 33, y: 6.8, kind: 'coin' }, { x: 104, y: 3.4, kind: 'alien' }, { x: 106, y: 3.4, kind: 'star' }],
    coins: [[31.5, 4.8], [32.5, 4.8], [33.5, 4.8], [34.5, 4.8], [35.5, 4.8], [46, 7.4], [47, 7.4], [48, 7.4], [95, 3], [97, 3.6], [99, 3]],
    springs: [{ x: 41.5, v: 21 }],
    plats: [
      { x0: 24.6, x1: 27.4, y: 0, move: { ax: 0, ay: 1.6, period: 3.2 } },
      { x0: 93, x1: 95.4, y: 1.6, move: { ax: 1.6, ay: 0, period: 3.0 } },
      { x0: 97.6, x1: 100, y: 1.6, move: { ax: -1.6, ay: 0, period: 3.0 } },
    ],
    spikes: [{ x0: 72.6, x1: 74.2, trig: [0, 0], always: true }, { x0: 111, x1: 112.6, trig: [109.6, 110.4] }],
    thwomps: [{ x: 49, y: 10.5 }],
    fakeFlag: { x: 146 },
    meteors: [{ trig: 148.2, after: 'flag' }, { trig: 158 }],
    walkers: [{ min: 78, max: 90 }, { min: 117, max: 122, speed: 2.2 }],
    poppers: [{ x: 124, trig: 3.4 }],
  },
  {
    name: '별빛 언덕',
    theme: { bg: '#0c0a26', top: '#9ee6a8', side: '#7a5a3a', rock: '#6b7fae', earth: false, flag: '#ffb347' },
    start: 1.5,
    goal: 178,
    grounds: [[-6, 20], [20, 22, 3, 'stone'], [22, 40], [48, 60], [60, 62, 3.8, 'stone'], [62, 76], [92, 112], [120, 140], [146, 156], [160, 190]],
    sinkers: [{ x0: 82, x1: 85, top: 2.5 }],
    hidden: [{ x: 41, y: 4.2 }],
    bricks: [{ x: 8, y: 3.4, n: 4 }, { x: 26, y: 3.4, n: 6 }, { x: 96, y: 3.6, n: 5 }, { x: 124, y: 3.4, n: 3 }],
    crates: [{ x: 10, y: 6.6, kind: 'star' }, { x: 28, y: 6.6, kind: 'coin' }, { x: 30, y: 6.6, kind: 'alien' }, { x: 98, y: 7, kind: 'coin' }],
    coins: [[44, 3], [45, 4.6], [46, 3], [66, 1.6], [66, 2.6], [66, 3.6], [66, 4.6], [66, 5.6], [130, 1.4], [131.5, 1.4], [133, 1.4]],
    springs: [{ x: 66, v: 18 }],
    plats: [
      { x0: 77, x1: 79.4, y: 1.8, move: { ax: 0, ay: 2.2, period: 3.4 } },
      { x0: 87.2, x1: 89.6, y: 2.0 },
      { x0: 113, x1: 115.4, y: 1.6, drop: true },
      { x0: 116.6, x1: 119, y: 1.6 },
      { x0: 141.4, x1: 143.6, y: 2.2, move: { ax: 0, ay: 1.4, period: 2.6 } },
      { x0: 156.6, x1: 158.8, y: 1.4 },
    ],
    spikes: [{ x0: 52, x1: 53.6, trig: [50.6, 51.4] }, { x0: 134.5, x1: 136, trig: [0, 0], always: true }],
    thwomps: [{ x: 104, y: 9 }],
    fakeFlag: { x: 150 },
    meteors: [{ trig: 152.2, after: 'flag' }],
    walkers: [{ min: 30, max: 39 }, { min: 64, max: 75 }, { min: 100, max: 111, speed: 2 }, { min: 162, max: 172, speed: 2.4 }],
    poppers: [{ x: 70, trig: 3.2 }, { x: 128.5, trig: 3.4 }],
  },
];
