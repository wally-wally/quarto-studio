# 렌더 HTML의 외부 폰트 CDN 의존 제거 설계

날짜: 2026-07-05
상태: 설계 승인 대기

## 배경과 목표

렌더 진행 단계 표시 기능(직전 작업)을 실제로 써보던 중, 코드가 전혀 없는 순수
마크다운 문서조차 `executing` 단계가 13초 이상 걸리는 것을 발견했다. 실제 Daytona
sandbox에서 타이밍을 측정해보니:

| 문서 | preparing | executing |
|---|---|---|
| print 2줄짜리 Python | 2.6s | 19.1s |
| 코드 셀 없는 순수 마크다운 | 2.7s | 13.8s |

코드 실행 여부와 무관하게 13초 이상의 고정비가 있고, 렌더 로그를 보면 원인이
드러난다:

```
[WARNING] Could not fetch resource https://cdn.jsdelivr.net/.../pretendard...css
  (ConnectionFailure ... "cdn.jsdelivr.net" ... does not exist (Try again))
[WARNING] ... fonts.googleapis.com ... does not exist (Try again)
```

`_quarto.yml`의 `embed-resources: true`(self-contained HTML 산출물 요구사항,
[Daytona 전환 설계](2026-07-04-daytona-render-backend-design.md) 이후에도 유지)가
HTML/CSS 안의 모든 외부 리소스를 인라인하려 시도하는데, sandbox는
`networkBlockAll: true`라 다음 두 외부 리소스에 대한 fetch가 매번 DNS 조회
단계에서 실패한다:

1. 우리가 직접 넣은 Pretendard 웹폰트 CDN 링크(`cdn.jsdelivr.net`)
2. `theme: cosmo`(Bootswatch)가 자체적으로 갖고 있는 Google Fonts `@import`
   (`fonts.googleapis.com`, Source Sans Pro)

이 두 실패한 fetch의 DNS 재시도 지연이 렌더 시간의 상당 부분을 차지하는 것으로
추정된다. 목표는 렌더 sandbox 안에서 어떤 외부 네트워크 fetch도 시도되지 않게
만들어 이 지연을 제거하는 것이다.

## 확정된 결정

| 항목 | 결정 |
|---|---|
| Pretendard 웹폰트 | 완전히 제거. 시스템 폰트로 폴백 |
| cosmo의 Google Fonts import | SCSS 오버라이드로 함께 제거 |
| Docker 이미지/Daytona 스냅샷 | 변경 없음 — 폰트 파일을 굽지 않으므로 재빌드 불필요 |
| 차트(matplotlib/ggplot2/Julia Plots) 폰트 | 영향 없음 — 별도 파이프라인(Rprofile.site/matplotlibrc, NanumGothic/Noto Sans KR)으로 이미 해결되어 있고 이번 변경과 무관 |

## 아키텍처

Docker 이미지나 Daytona 스냅샷을 건드리지 않고, worker가 매 렌더마다 업로드하는
파일만으로 해결한다. 새 스냅샷 빌드가 필요 없다.

### 1. `src/lib/quarto/project.ts`

- Pretendard `<link rel="stylesheet" ...>` 삭제
- 본문 폰트 CSS에서 `"Pretendard Variable", Pretendard,`를 제거하고 나머지
  시스템 폰트 폴백(`-apple-system, BlinkMacSystemFont, system-ui,
  "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`)은 유지
- 생성되는 `_quarto.yml`의 `theme: cosmo` → `theme: [custom.scss, cosmo]`로 변경
  (커스텀 scss가 먼저, 테마 이름이 나중 — 순서가 바뀌면 오버라이드가 적용되지
  않는다)
- `custom.scss`의 고정 내용을 상수로 export:
  ```
  /*-- scss:rules --*/
  $web-font-path: false;
  ```

### 2. `worker/daytona.ts`

- 매 렌더마다 `index.qmd`/`_quarto.yml`과 함께 `custom.scss`도 `/work`에
  업로드한다. 이 파일 내용은 문서 내용과 무관하게 항상 고정이므로
  `RenderFiles`(문서 유래 콘텐츠) 타입에는 넣지 않고, `daytona.ts` 안의 상수로
  둔다.

### 3. 검증

- `src/lib/quarto/project.test.ts`의 기존 테스트("본문 폰트를 Pretendard CDN으로
  주입한다")를 반대로 뒤집어 "Pretendard CDN을 쓰지 않는다 + system-font 폴백만
  남는다 + theme이 `[custom.scss, cosmo]`다"를 검증하도록 교체
- `worker/daytona.test.ts`에 `custom.scss` 업로드 호출 검증 추가
- 실 Daytona 대상으로 앞서 쓴 것과 같은 방식의 타이밍 재측정(순수 마크다운 문서
  기준 `executing` 단계가 유의미하게 줄고, 로그에 `Could not fetch resource`
  경고가 사라지는지) — 자동화 테스트가 아니라 수동 검증(기존 Daytona 관련
  작업들과 같은 관례)

## 영향 범위

- **시각적 변화**: 본문 텍스트 서체가 Pretendard(가변 폰트)에서 사용자 OS의
  기본 한글 폰트(맥: Apple SD Gothic Neo, 윈도우: 맑은 고딕)로 바뀐다. 사용자가
  이미 이 트레이드오프를 확인하고 승인함.
- **차트 폰트**: 영향 없음(위 표 참고) — matplotlib/R/Julia가 그리는 이미지는
  브라우저 CSS와 무관하게 sandbox 안에서 이미 렌더된 상태로 HTML에 박힘.
- **기존 렌더 산출물과의 호환성**: 새로 렌더되는 문서부터 적용. 과거에 렌더된
  아티팩트(HTML)는 이미 Pretendard CDN 링크가 박제되어 있으므로 재렌더 전까지는
  그대로 남는다(문제 없음 — 이미 렌더된 정적 HTML은 재실행되지 않는다).

## 테스트 계획

1. `project.test.ts`: 기존 Pretendard 검증 테스트를 뒤집어 CDN 링크 부재 +
   `theme: [custom.scss, cosmo]` + `$web-font-path: false` 포함 여부 확인
2. `daytona.test.ts`: `custom.scss` 업로드 호출 검증
3. 실 Daytona 수동 검증: 순수 마크다운 문서 재측정으로 `executing` 단계 단축 +
   fetch 경고 소멸 확인
