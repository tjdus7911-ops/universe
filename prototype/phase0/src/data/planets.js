// 행성 정보 시안 데이터 — 값마다 기준·출처·검증 상태를 함께 둔다.
// verified: 'YYYY-MM-DD' = 이번 PHASE 0에서 원문을 열어 확인한 값 / null = PHASE 2 콘텐츠 작업 때 원문 대조 예정
export const SOURCES = {
  table: { title: 'NASA NSSDCA Planetary Fact Sheet (2025-03-18 갱신)', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/index.html' },
  moon: { title: 'NASA Moon Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' },
  mars: { title: 'NASA Mars Fact Sheet (2025-05-19 갱신)', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
  sun: { title: 'NASA Sun Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html' },
  lro: { title: 'NASA LRO — 달 표면 온도', url: 'https://science.nasa.gov/wp-content/uploads/2024/01/lrolitho7temperaturevariation27may2014.pdf' },
  mercury: { title: 'NASA Science — Mercury Facts', url: 'https://science.nasa.gov/mercury/facts' },
  earthStd: { title: 'NASA Earth Fact Sheet (표준 중력 정의값)', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html' },
  feather: { title: 'NASA NSSDCA — The Apollo 15 Hammer-Feather Drop', url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_15_feather_drop.html' },
  tidal: { title: 'NASA Science — Tidal Locking', url: 'https://science.nasa.gov/moon/tidal-locking/' },
  stars: { title: 'The Planetary Society — Why are there no stars in most space images?', url: 'https://www.planetary.org/articles/why-are-there-no-stars' },
  prints: { title: 'Space.com — Apollo 17 발자국이 LRO 사진에 아직 보임', url: 'https://www.space.com/35352-eugene-cernan-moon-legacy-footprints.html' },
};
const V = '2026-11-12';

const T = (label, value, basis, src = 'table', verified = V) => ({ label, value, basis, src, verified });

export const BODIES = [
  {
    id: 'sun', ko: '태양', en: 'Sun', cat: '항성 (G형 주계열성)', landing: 'none',
    intro: '태양계의 중심 별. 스스로 빛과 열을 내는 거대한 플라스마 공이에요.',
    facts: [
      T('분류', '항성', '천체 종류'),
      T('지름', '약 139만 km', '평균 반지름 695,700 km × 2', 'sun'),
      T('표면 중력', '274.0 m/s²', '적도 기준 · 지구의 28배', 'sun'),
      T('자전', '약 25일 (적도)', '위도마다 다르게 돎', 'sun', null),
      T('주성분', '수소와 헬륨', '플라스마 상태', 'sun', null),
    ],
    cmp: { diameter: 109.1, gravity: 27.9 },
    fun: [
      { t: '햇빛이 지구까지 오는 데 약 8분 20초가 걸려요.', verified: null },
      { t: '태양계 전체 질량의 대부분(99% 이상)이 태양에 모여 있어요.', verified: null },
    ],
  },
  {
    id: 'mercury', ko: '수성', en: 'Mercury', cat: '암석형 행성', landing: 'surface',
    intro: '태양에 가장 가까운 가장 작은 행성. 낮과 밤의 온도 차가 극단적이에요.',
    facts: [
      T('태양까지 평균 거리', '5,790만 km', '장반경'),
      T('지름', '4,879 km', '적도 지름'),
      T('중력', '3.7 m/s²', '적도 표면 · 지구의 0.38배'),
      T('기온', '평균 167 °C', '낮 최고 430 °C · 밤 최저 −180 °C (범위)', 'mercury'),
      T('대기', '거의 없음', '아주 옅은 외기권', 'table', null),
      T('자전 주기', '1,407.6시간 (약 58.6일)', '항성 기준'),
      T('공전 주기', '88.0일', '지구일 기준'),
    ],
    cmp: { diameter: 0.383, gravity: 0.38 },
    fun: [{ t: '하루(해가 다시 같은 자리에 오기까지)가 약 176 지구일로, 1년(88일)보다 길어요.', verified: V }],
  },
  {
    id: 'venus', ko: '금성', en: 'Venus', cat: '암석형 행성', landing: 'surface',
    intro: '두꺼운 이산화탄소 대기 때문에 태양계에서 가장 뜨거운 행성이에요.',
    facts: [
      T('태양까지 평균 거리', '1억 820만 km', '장반경'),
      T('지름', '12,104 km', '적도 지름'),
      T('중력', '8.9 m/s²', '적도 표면 · 지구의 0.91배'),
      T('기온', '평균 464 °C', '전체 표면 평균'),
      T('대기', '이산화탄소 약 96%', '황산 구름 · 표면 기압 92 bar', 'table', null),
      T('자전 주기', '5,832.5시간 (역방향)', '항성 기준 · 음수 = 반대로 돎'),
      T('공전 주기', '224.7일', '지구일 기준'),
    ],
    cmp: { diameter: 0.949, gravity: 0.91 },
    fun: [{ t: '자전이 공전보다 느려서 하루(자전 243일)가 1년(225일)보다 길어요.', verified: V }],
  },
  {
    id: 'earth', ko: '지구', en: 'Earth', cat: '암석형 행성', landing: 'surface',
    intro: '우리가 사는 푸른 행성. 지금까지 생명이 확인된 유일한 곳이에요.',
    facts: [
      T('태양까지 평균 거리', '1억 4,960만 km', '장반경 = 1 AU'),
      T('지름', '12,756 km', '적도 지름'),
      T('중력', '9.8 m/s²', '적도 표면 (표준 중력 9.80665 m/s²)'),
      T('기온', '평균 15 °C', '전체 표면 평균'),
      T('대기', '질소 78% · 산소 21%', '부피 기준', 'table', null),
      T('자전 주기', '23.9시간', '항성 기준 (하루 길이 24.0시간)'),
      T('공전 주기', '365.2일', ''),
    ],
    cmp: { diameter: 1, gravity: 1 },
    fun: [{ t: '정거장 전망창으로 보이는 밤쪽의 불빛은 도시예요. 한반도도 찾아보세요!', verified: null }],
  },
  {
    id: 'moon', ko: '달', en: 'Moon', cat: '위성 (지구의 위성)', landing: 'surface',
    intro: '지구의 유일한 자연 위성. 늘 같은 면이 지구를 향하고 있어요.',
    facts: [
      T('지구까지 평균 거리', '38만 4,000 km', '지구 중심 기준'),
      T('지름', '3,475 km', '적도 지름'),
      T('중력', '1.62 m/s²', '표면 · 지구의 0.165배', 'moon'),
      T('기온', '평균 −20 °C', '적도 낮 약 120 °C · 밤 약 −130 °C (범위)', 'lro'),
      T('대기', '거의 없음', '', 'table', null),
      T('자전 주기', '655.7시간 (약 27.3일)', '공전 주기와 같음'),
      T('공전 주기', '27.3일', '지구 둘레'),
    ],
    cmp: { diameter: 0.272, gravity: 0.165 },
    fun: [{ t: '같은 힘으로 뛰면 지구보다 약 6배 높이, 약 6배 오래 떠 있어요.', verified: V }],
  },
  {
    id: 'mars', ko: '화성', en: 'Mars', cat: '암석형 행성', landing: 'surface',
    intro: '붉은 행성. 태양계에서 가장 큰 화산과 거대한 협곡이 있어요.',
    facts: [
      T('태양까지 평균 거리', '2억 2,800만 km', '장반경'),
      T('지름', '6,792 km', '적도 지름'),
      T('중력', '3.7 m/s²', '적도 표면 · 지구의 0.38배'),
      T('기온', '평균 −65 °C', '행성표 기준 (화성 상세 시트는 약 −59 °C)'),
      T('대기', '이산화탄소 95.1%', '질소 2.59% · 아르곤 1.94% · 표면 기압 약 6 mb', 'mars'),
      T('자전 주기', '24.6시간', '하루 길이 24.7시간'),
      T('공전 주기', '687.0일', '지구일 기준'),
    ],
    cmp: { diameter: 0.532, gravity: 0.38 },
    fun: [{ t: '붉은색은 표면 흙에 섞인 산화철(녹) 때문이에요.', verified: null }],
  },
  {
    id: 'jupiter', ko: '목성', en: 'Jupiter', cat: '가스 거대 행성', landing: 'orbit',
    intro: '태양계에서 가장 큰 행성. 단단한 지표면이 없어 착륙할 수 없어요.',
    facts: [
      T('태양까지 평균 거리', '7억 7,850만 km', '장반경'),
      T('지름', '142,984 km', '적도 지름 (1 bar 고도)'),
      T('중력', '23.1 m/s²', '1 bar 고도 · 지구의 2.4배'),
      T('기온', '평균 −110 °C', '1 bar 고도 기준'),
      T('대기', '수소 약 90% · 헬륨 약 10%', '', 'table', null),
      T('자전 주기', '9.9시간', '태양계에서 가장 빠름'),
      T('공전 주기', '4,331일 (약 11.9년)', ''),
    ],
    cmp: { diameter: 11.21, gravity: 2.36 },
    fun: [{ t: '대적점은 지구보다 큰 거대한 폭풍이에요.', verified: null }],
  },
  {
    id: 'saturn', ko: '토성', en: 'Saturn', cat: '가스 거대 행성', landing: 'orbit',
    intro: '아름다운 고리를 가진 행성. 평균 밀도가 물보다 작아요.',
    facts: [
      T('태양까지 평균 거리', '14억 3,200만 km', '장반경'),
      T('지름', '120,536 km', '적도 지름 (1 bar 고도)'),
      T('중력', '9.0 m/s²', '1 bar 고도 · 지구의 0.92배'),
      T('기온', '평균 −140 °C', '1 bar 고도 기준'),
      T('대기', '수소 약 96% · 헬륨 약 3%', '', 'table', null),
      T('자전 주기', '10.7시간', ''),
      T('공전 주기', '10,747일 (약 29.4년)', ''),
    ],
    cmp: { diameter: 9.45, gravity: 0.92 },
    fun: [{ t: '평균 밀도 687 kg/m³ — 물(1,000 kg/m³)보다 가벼워요.', verified: V }],
  },
  {
    id: 'uranus', ko: '천왕성', en: 'Uranus', cat: '얼음 거대 행성', landing: 'orbit',
    intro: '자전축이 거의 옆으로 누운 채 태양 둘레를 도는 행성이에요.',
    facts: [
      T('태양까지 평균 거리', '28억 6,700만 km', '장반경'),
      T('지름', '51,118 km', '적도 지름 (1 bar 고도)'),
      T('중력', '8.7 m/s²', '1 bar 고도 · 지구의 0.89배'),
      T('기온', '평균 −195 °C', '1 bar 고도 기준'),
      T('대기', '수소 · 헬륨 · 메탄', '메탄이 붉은빛을 흡수해 청록색으로 보임', 'table', null),
      T('자전 주기', '17.2시간 (역방향)', ''),
      T('공전 주기', '30,589일 (약 84년)', ''),
    ],
    cmp: { diameter: 4.01, gravity: 0.89 },
    fun: [{ t: '자전축 기울기가 97.8° — 옆으로 누워서 굴러가듯 돌아요.', verified: V }],
  },
  {
    id: 'neptune', ko: '해왕성', en: 'Neptune', cat: '얼음 거대 행성', landing: 'orbit',
    intro: '태양에서 가장 먼 행성. 아주 강한 바람이 부는 푸른 행성이에요.',
    facts: [
      T('태양까지 평균 거리', '45억 1,500만 km', '장반경'),
      T('지름', '49,528 km', '적도 지름 (1 bar 고도)'),
      T('중력', '11.0 m/s²', '1 bar 고도 · 지구의 1.12배'),
      T('기온', '평균 −200 °C', '1 bar 고도 기준'),
      T('대기', '수소 · 헬륨 · 메탄', '', 'table', null),
      T('자전 주기', '16.1시간', ''),
      T('공전 주기', '59,800일 (약 164년)', ''),
    ],
    cmp: { diameter: 3.88, gravity: 1.12 },
    fun: [{ t: '공전 주기가 약 164년이라, 발견(1846년) 뒤 한 바퀴를 돈 지 얼마 되지 않았어요.', verified: null }],
  },
];

export const byId = Object.fromEntries(BODIES.map((b) => [b.id, b]));

// 중력 체험: 실제 값(g_real)과 게임 보정(time_scale)을 분리
export const GRAVITY = [
  { id: 'earth', ko: '지구', g: 9.80665, basis: '표준 중력가속도 (정의값)', src: 'earthStd' },
  { id: 'moon', ko: '달', g: 1.62, basis: '표면 중력', src: 'moon' },
  { id: 'mars', ko: '화성', g: 3.73, basis: '평균 표면 중력', src: 'mars' },
];
export const JUMP_V0 = 2.4; // m/s — 세 천체 모두 같은 초기 속도
export const GAME_TIME_SCALE = 1.0; // 게임 보정 없음

// 달 기지 '달 과학 노트' — 게임 연출과 실제를 구분해 보여 준다.
// kind: 'fact' = 출처 확인 값 · 'calc' = 출처 값으로 계산 · 'game' = 게임 연출(실제와 다름)
const EARTH_EQ_R_KM = 6378.137; // NASA Earth Fact Sheet 적도 반지름
const MOON_MEAN_R_KM = 1737.4; // NASA Moon Fact Sheet 평균 반지름
const EARTH_MOON_KM = 384400; // NASA Moon Fact Sheet 장반경
export const EARTH_GAME_SCALE = 2.5; // 달 장면 화면 속 지구 = 실제 겉보기 크기 × 2.5 (연출)
export const EARTH_FROM_MOON_DEG = (2 * Math.atan(EARTH_EQ_R_KM / EARTH_MOON_KM) * 180) / Math.PI; // ≈ 1.90°
const MOON_FROM_EARTH_DEG = (2 * Math.atan(MOON_MEAN_R_KM / EARTH_MOON_KM) * 180) / Math.PI; // ≈ 0.52°
const horizonKm = (rKm, eyeM) => Math.sqrt(2 * rKm * 1000 * eyeM) / 1000;
const jumpH = (g) => (JUMP_V0 * JUMP_V0) / (2 * g);
export const MOON_NOTES = [
  { k: '중력', v: '1.62 m/s² · 지구의 약 1/6', b: `같은 힘(초속 ${JUMP_V0} m)으로 뛰면 지구 ${jumpH(9.80665).toFixed(2)} m, 달 ${jumpH(1.62).toFixed(2)} m (계산)`, kind: 'calc', src: 'moon', verified: V },
  { k: '망치와 깃털', v: '동시에 떨어져요', b: '아폴로 15호 데이비드 스콧이 마지막 월면 활동 끝에 TV 카메라 앞에서 지질 망치(1.32 kg)와 매 깃털을 함께 놓았고, 둘이 동시에 땅에 닿았어요', kind: 'fact', src: 'feather', verified: V },
  { k: '먼지', v: '포물선으로 툭 떨어져요', b: '공기가 없어 먼지가 구름처럼 떠다니지 않고, 던진 공처럼 날아가 바로 떨어져요 (물리 원리)', kind: 'calc', src: null, verified: null },
  { k: '발자국', v: '아주 오래 남아요', b: '바람과 비가 없어요. 1972년 아폴로 17호의 발자국 길이 지금도 궤도 사진에 보여요', kind: 'fact', src: 'prints', verified: V },
  { k: '지구의 자리', v: '하늘에서 거의 움직이지 않아요', b: '달은 늘 같은 면을 지구로 향해요(조석 고정). 그래서 앞면에서 보면 지구가 뜨고 지지 않고 거의 한자리에 떠 있어요', kind: 'fact', src: 'tidal', verified: V },
  { k: '지구 크기', v: `지름 약 ${EARTH_FROM_MOON_DEG.toFixed(1)}°`, b: `지구에서 본 보름달(약 ${MOON_FROM_EARTH_DEG.toFixed(2)}°)의 약 ${(EARTH_FROM_MOON_DEG / MOON_FROM_EARTH_DEG).toFixed(1)}배 (지구 적도 반지름·평균 거리로 계산). 게임 화면은 ${EARTH_GAME_SCALE}배로 키워 연출`, kind: 'game', src: 'moon', verified: V },
  { k: '별', v: '사진에는 잘 안 찍혀요', b: '햇빛 받은 땅과 우주복에 맞춰 짧게 찍으면 어두운 별빛이 담기지 않아요. 게임은 분위기를 위해 별을 흐리게 보여 줘요', kind: 'game', src: 'stars', verified: V },
  { k: '지평선', v: `약 ${horizonKm(MOON_MEAN_R_KM, 1.7).toFixed(1)} km`, b: `눈높이 1.7 m 기준 계산 (지구는 약 ${horizonKm(6371, 1.7).toFixed(1)} km). 달이 작아 지평선이 더 가까워요 — 게임 지형은 평평하게 단순화`, kind: 'calc', src: 'moon', verified: V },
];
