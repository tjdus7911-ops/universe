# 출처·라이선스 기록 (ASSET_PROVENANCE)

우주마을에 들어가는 코드·데이터·에셋의 출처와 라이선스를 파일 단위로 기록합니다. 라이선스가 불분명한 것은 쓰지 않습니다.

기준일: 2026-11-12 · 대상: `prototype/phase0` (PHASE 0 3D 시안)

## 외부 라이브러리·데이터

| 이름 | 버전 | 라이선스 | 쓰는 곳 | 출처 |
|---|---|---|---|---|
| three.js | 0.187.0 | MIT | 3D 렌더링 전체 | https://github.com/mrdoob/three.js |
| Vite | 8.3.8 | MIT | 개발 서버·빌드 (배포 파일에는 포함되지 않음) | https://github.com/vitejs/vite |
| world-atlas | 2.0.2 | ISC (원본 데이터: Natural Earth, 퍼블릭 도메인) | 지구 육지 텍스처 생성 (`tools/gen-land.mjs`) | https://github.com/topojson/world-atlas · https://www.naturalearthdata.com/ |
| topojson-client | 3.1.0 | ISC | world-atlas 데이터 변환 (텍스처 생성 도구) | https://github.com/topojson/topojson-client |
| webgl-noise (Ashima Arts · Stefan Gustavson) | — | MIT | 달 지형·행성 셰이더 노이즈 (`src/core/glsl.js`, 저작권 표기 포함) | https://github.com/ashima/webgl-noise |

## 직접 만든 것

| 대상 | 만든 방법 |
|---|---|
| 우주인·착륙선·월면차·달 기지·라운지·정거장·우주선 3D 모델 | three.js 기본 도형을 코드로 조합 (`src/world/*.js`, `src/scenes/*.js`) |
| 달 지형·바위·발자국·먼지 | 코드로 생성 (`src/world/moonSurface.js`) |
| `public/textures/earth_*.jpg/png` | world-atlas 육지 데이터를 래스터화하고 절차적 노이즈로 채색 (`tools/gen-land.mjs`, `tools/gen_textures.py`) |
| `public/textures/moon*.jpg` | 절차적 노이즈로 생성 (`tools/gen_textures.py`) |
| 표지판·이름표·도감 글자 | 브라우저 캔버스로 그림 |

## 글꼴·소리

- 글꼴 파일은 포함하지 않습니다. CSS는 기기에 설치된 글꼴(Pretendard, Apple SD Gothic Neo, Noto Sans KR 등)을 순서대로 씁니다.
- 소리 파일은 없습니다.

## 멍글마을에서 가져온 것

- **없음.** PHASE 0 시안에는 멍글마을 파일을 복사하지 않았습니다. 2026-11-12에 시안의 모든 파일과 멍글마을 저장소 파일의 해시를 비교해 같은 파일이 없음을 확인했습니다.
- 우주인 관절 이름(body·torso·head·armL·armR·legL·legR)만 멍글마을 아바타와 같은 규칙으로 맞췄습니다. PHASE 1에서 아바타 빌더를 옮겨 올 때 애니메이션 코드를 그대로 쓰기 위해서입니다.
- PHASE 1 이후 멍글마을에서 코드나 에셋을 복사하면, 원본 경로·커밋·권리 확인 결과를 이 파일에 한 줄씩 추가합니다(기획서 12장 '복사 절차').

## 과학 자료

행성 수치·달 과학 노트의 출처는 기획서 19장과 `prototype/phase0/src/data/planets.js`의 `SOURCES`에 링크와 함께 적혀 있습니다.
