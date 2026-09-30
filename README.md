# π — 원주율 인터랙티브 모션그래픽

HTML · CSS · JavaScript(Canvas 2D + SVG)만으로 만든 16:9 모션그래픽 플레이어입니다.
**음성(`audio.currentTime`)이 마스터 타임라인**이고, 모든 장면·자막·이펙트는 그 시각 `t` 하나로 계산됩니다.
`setTimeout`·CSS duration·누적 델타 타이머는 사용하지 않습니다.

```
원 → 선(굴러서 펴짐) → 다각형(아르키메데스) → 숫자(파티클 3.14159…) → 파동 → 원
```

## 빠른 시작

```bash
# 1) 음성 없이 바로 보기 (추정 타이밍 · 무음 모드)
npm run serve            # http://localhost:5173   (의존성 설치 불필요)

# 2) Fish Audio 내레이션 생성 (Node 18+)
cp .env.example .env     # FISH_API_KEY 입력
npm run voices           # (선택) 한국어 보이스 id 조회 → .env 의 FISH_REFERENCE_ID
npm run narration        # public/narration/narration.wav + manifest.json 생성
npm run serve            # 이제 음성이 마스터 클록으로 재생됩니다

# 3) 빌드
npm install
npm run build            # Vite → dist/   (npm run preview 로 확인)
npm run build:static     # Vite 없이 dist/ 생성 (네이티브 ES 모듈 그대로 복사)
npm run serve:dist
```

> `file://` 로 index.html 을 직접 열면 모듈/오디오 로딩이 막힙니다. 위 서버 중 하나를 사용하세요.
> `serve` 는 Range 요청을 지원해서 오디오 seek 가 정상 동작합니다.

## GitHub Pages 배포

- 사이트: https://sandboxwork.github.io/claudesonnet55_pi/
- 저장소: https://github.com/sandboxwork/claudesonnet55_pi
- `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 Node.js 24에서 `npm ci`와 `npm run build`를 실행하고 `dist/`를 GitHub Pages에 배포합니다.
- GitHub의 **Actions → Deploy to GitHub Pages → Run workflow**에서 수동 배포도 가능합니다. Pages의 배포 소스는 **GitHub Actions**입니다.
- Vite의 `base: './'`와 상대 경로를 사용하므로 `/claudesonnet55_pi/` 아래에서도 스크립트·스타일·내레이션이 로드됩니다.
- 생성된 `public/narration/narration.wav`와 `manifest.json`을 함께 배포합니다. 음성을 바꿀 때는 로컬에서 `npm run narration` 실행 후 두 파일을 커밋하세요.
- 배포는 GitHub의 기본 `GITHUB_TOKEN`을 사용합니다. PAT나 Fish Audio API 키를 저장소 또는 Actions secrets에 추가할 필요가 없습니다.

## 동기화 구조 (음성 = master timeline)

```
Fish Audio  ──POST /v1/tts/stream/with-timestamp (SSE)──▶  장면별 audio_base64 + alignment.segments
        │                                                  (chunk_seq 별 누적 스냅샷은 "교체", chunk_audio_offset_sec 가산)
        ▼
scripts/generate-narration.mjs
        ├─ narration.wav          장면 PCM + 무음(PRE_ROLL / GAP / POST_ROLL)을 이어 붙인 단일 파일
        └─ manifest.json          장면 경계, 문장/단어 시각, 큐(cue) 시각 — 모두 "오디오 기준 전역 초"

브라우저
  AudioClock.time()  = <audio>.currentTime  (재생 중에는 갱신 주기 사이만 최대 60ms 보간, 항상 재앵커)
  requestAnimationFrame → render(t) → 장면 함수(t) / 자막(t)
```

- **큐(cue)**: `scripts/script.mjs` 대본에 `⟦name⟧` 마커를 넣으면, 그 뒤 첫 글자가 발화되는 실제 시각이 `manifest.cues` 에 기록되고
  장면 함수가 `cue('unroll')` 처럼 읽어 애니메이션을 시작합니다. 대본을 고치고 `npm run narration` 만 다시 돌리면 화면이 새 음성에 맞춰 재배치됩니다.
- **순수 함수 렌더링**: `render(t)` 는 이전 프레임 상태를 읽지 않습니다. 그래서 재생/일시정지/seek/replay 뒤에도 같은 `t` 는 항상 같은 프레임입니다.
- **시간 압축 헬퍼**: `span(t, start, desired, limit)` 는 애니메이션이 장면 끝을 넘지 않도록 길이를 줄여, 음성 길이가 달라져도 장면 경계의 상태(원·선·링)가 이어지게 합니다.
- **VirtualClock** 은 음성이 없을 때(무음 모드, 오디오 오류 후 "무음 모드로 보기")만 쓰는 같은 인터페이스의 대체 시계입니다.

## 장면

| # | 장면 | 핵심 연출 |
|---|------|-----------|
| 1 | 원 | 점→십자선→원 드로잉, 눈금, π 글리프(SVG 스트로크 드로잉→채움) + 충격파 |
| 2 | 지름 | 지름 측정, 원이 기준선 위를 **굴러서** 둘레가 선으로 펴짐 |
| 3 | 비율 | 지름 막대 3개 + 0.14159…, 크기가 다른 원도 같은 비율(스크램블→확정 숫자), 수식 마스크 와이프 |
| 4 | 근사 | 내접/외접 다각형 6→12→24→48→96 모핑, 하한·상한 실시간 값, 줌인되는 수직선, 223/71 < π < 22/7 |
| 5 | 무한 | 원 → 2,200개 파티클이 `3.14159` 로 모프, 자릿수 스트림(지수 가속), 자릿수 링, π ≠ a/b |
| 6 | 파동 | 단위원 위 점의 y좌표가 사인파로 펼쳐짐(θ = 2π 에서 출발), 2π 주기 표시, 소리·빛·계절·심장 파형 |
| 7 | 회귀 | 파동이 다시 원으로 모프, 궤도 위성, 클리핑 마스크로 흐르는 π 자릿수 |

## 플레이어

Play/Pause · Replay · 진행바(클릭/드래그, 장면 눈금, 호버 툴팁) · 전체 화면 · 음소거 · 자막(단어 단위 하이라이트) · 자동 숨김 컨트롤.

키보드: `Space/K` 재생 · `←/→` 5초(Shift 15초) · `R` 처음부터 · `F` 전체 화면 · `M` 음소거 · `C` 자막 · `1–7` 장면 이동 · `Home/End`.

오류 처리: manifest 누락/손상, 음성 404·디코드 실패·로딩 타임아웃, 재생 중 오디오 오류, 자동 재생 차단(NotAllowedError) 모두
원인 안내 + **다시 시도 / 무음 모드로 보기** 버튼을 제공합니다.

URL 옵션: `?t=42.5` 해당 시각으로 이동 · `?silent=1` 음성 없이 VirtualClock 사용.

## 폴더

```
index.html              플레이어 마크업 (SVG 오버레이 포함)
src/main.js             부팅, 플레이어 UI, 자막, 오류 처리
src/clock.js            AudioClock (master) / VirtualClock (폴백)
src/renderer.js         캔버스 + SVG 렌더러, render(t)
src/scenes.js           7개 장면 (모두 t 의 순수 함수)
src/shapes.js           rollPts · polyPts · sampleText · Formation(파티클 모프)
src/overlay.js          SVG 타이포그래피 (clipPath/mask/stroke-dash)
src/kit.js ease.js      드로잉 헬퍼 / 이징
scripts/script.mjs      대본 + 큐 마커 + 타이밍 레이아웃
scripts/generate-narration.mjs   Fish Audio 호출 → WAV + manifest
scripts/list-voices.mjs          한국어 보이스 조회
scripts/serve.mjs build-static.mjs   의존성 없는 서버/빌드
public/narration/       생성된 음성과 manifest (기본값은 추정 타이밍 manifest)
```

## 보안

- API 키는 `.env`(git 제외)에서 **Node 스크립트만** 읽습니다. 브라우저 번들·`dist/` 에는 포함되지 않으며, 서버도 `.env` 를 서빙하지 않습니다.
- 키를 채팅·이슈·커밋 등에 붙여 넣었다면 Fish Audio 콘솔에서 **재발급(rotate)** 하세요.

## 문제 해결

- `401/403` → 키 확인 · `402` → 크레딧 확인 · `429/5xx` → 자동 재시도(최대 3회).
- `4xx`(format/model 거부) → 스크립트가 `pcm → wav`, `s2.1-pro → s2-pro` 순으로 자동 폴백합니다. 그래도 실패하면 오류 본문이 그대로 출력됩니다.
- 목소리를 바꾸려면 `.env` 의 `FISH_REFERENCE_ID` 또는 `npm run narration -- --voice <id>`; 캐시(`.cache/narration`)는 텍스트·보이스·모델이 같으면 재사용하며 `--force` 로 무시할 수 있습니다.
- 음성과 manifest 길이가 0.6초 이상 다르면 경고 토스트가 뜹니다 → `npm run narration` 을 다시 실행하세요.
