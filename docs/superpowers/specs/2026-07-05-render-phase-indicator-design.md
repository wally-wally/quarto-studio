# 렌더 진행 단계 표시 설계

날짜: 2026-07-05
상태: 설계 승인 대기

## 배경과 목표

렌더 버튼을 누르면 지금은 `idle → rendering → success/error` 4단계뿐이라, 렌더 중에
"지금 뭘 하고 있는지"를 알 수 없다. Daytona 전환 이후 렌더 한 건의 실제 처리는
① sandbox 준비(생성+파일 업로드) ② 코드 실행(`quarto render`) 두 단계로 뚜렷이
나뉘고, worker가 이미 이 두 단계 전환 시점을 알고 있으므로 이를 그대로 노출한다.

Quarto 내부의 셀 단위 진행률(예: "3번째 코드 셀 실행 중")까지는 다루지 않는다.
`quarto render`는 worker 입장에서 여전히 블랙박스 명령이라, 그 안의 세부 진행은
별도 파싱 파이프라인이 필요해 이번 범위에서 제외한다(스코프를 가벼운 2단계로
한정하기로 사용자와 확정).

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 단계 구분 | 2단계: `preparing`(sandbox 준비 중) / `executing`(코드 실행 중) |
| 저장 방식 | `render_jobs`에 `phase` 컬럼 추가 (기존 `status` 상태 머신은 무변경) |
| 실패 시 표시 | 실패(`failed`/`timed_out`)로 끝나도 마지막 `phase`를 그대로 보여줌 |
| 취소 시 표시 | 해당 없음 — 취소는 `cancelRender` 액션이 폴링과 무관하게 즉시 `idle`로 되돌리는
기존 경로를 그대로 타므로, phase 표시 대상이 아님 |

## 데이터 모델

`db/migrations/0006_render_phase.sql`:
- `render_jobs.phase text` 컬럼 추가 (nullable, CHECK로 `preparing`/`executing`만 허용)
- `status='queued'`일 때는 항상 `null`
- 성공(`succeeded`)해도 마지막 값(`executing`)을 지우지 않음 — 프론트가 `success`
  상태에서는 `phase`를 참조하지 않으므로 무해함

## 아키텍처와 데이터 흐름

### worker/daytona.ts

`runQuartoRender()`에 옵셔널 콜백 파라미터 추가:

```
runQuartoRender({ jobId, files, timeoutMs, signal, onPhaseChange })
  → onPhaseChange?.("preparing")   // sandbox 생성 시작 직전
  → sandbox 생성 + 파일 업로드
  → onPhaseChange?.("executing")   // executeCommand 호출 직전
  → executeCommand + 다운로드
```

콜백은 fire-and-forget으로 다룬다: 콜백이 예외를 던져도 렌더 자체는 계속 진행된다
(단계 표시는 부가 정보이지 렌더 성패에 영향을 줘서는 안 됨).

### worker/render-worker.ts

`processJob()`이 `onPhaseChange`로 다음을 실행하는 함수를 전달:

```sql
update render_jobs set phase = $1 where id = $2
```

이 업데이트 실패(DB 에러 등)는 무시하고 렌더를 계속한다 — 위와 동일한 이유.

### 조회 계층

`src/lib/documents/repository.ts`의 `getRenderJob()` 반환 타입
(`RenderJobRecord`)에 `phase: "preparing" | "executing" | null` 필드 추가.
쿼리에 `phase` 컬럼을 셀렉트에 포함.

### 프론트엔드

기존 폴링(`quarto-workspace.tsx`, 1.5초 간격, `getRenderJob` 호출)이 받는 값에
`phase`가 추가된다. 상태/단계 조합을 문구로 바꾸는 순수 함수를 신설:

```
renderPhaseLabel(status: "running" | "failed" | "timed_out", phase: "preparing" | "executing" | null): string
```

표시 매핑:

| status | phase | 문구 |
|---|---|---|
| running | preparing | "샌드박스 준비 중..." |
| running | executing | "코드 실행 중..." |
| running | null | "렌더링 중..." (초기 짧은 순간의 폴백) |
| failed / timed_out | preparing | "샌드박스 준비 중 오류가 발생했습니다" |
| failed / timed_out | executing | "코드 실행 중 오류가 발생했습니다" (타임아웃은 사실상 항상 이 경우) |

기존 에러 로그(`renderError`) 표시는 그대로 두고, 그 앞에 위 문구를 라벨로 붙인다.
`preview-pane.tsx`의 `rendering-indicator`는 이 함수의 반환값을 렌더링하도록 배선한다.

## 엣지 케이스

- **worker 크래시로 phase 갱신이 멈춘 경우**: 폴링은 `status`가 바뀔 때까지 계속되고,
  사용자는 마지막으로 기록된 phase 문구를 계속 보게 된다. 기존에도 잡이 멈추면
  "렌더링 중..."이 계속 도는 것과 동일한 정도의 문제라, 이번 기능이 상황을
  악화시키지 않는다.

## 테스트 계획

1. **마이그레이션** — 테스트 DB globalSetup으로 자동 적용 확인(별도 전용 테스트 없음)
2. **`worker/daytona.test.ts`** — 콜백이 업로드 전 `"preparing"`, `executeCommand` 직전
   `"executing"`으로 호출되는지, 콜백 생략 시 기존 동작 유지되는지, 콜백이 예외를
   던져도 렌더가 깨지지 않는지
3. **`worker/render-worker.ts`** — 기존 관례대로 단위 테스트 없음. Task 7 방식의
   수동/E2E 검증(실제 렌더 중 폴링해서 phase 전환이 보이는지)으로 확인
4. **`src/lib/documents/repository.test.ts`** — 잡 생성 → phase 갱신 → `getRenderJob`
   조회 시 phase가 왕복되는지 확인하는 테스트 추가
5. **`renderPhaseLabel` 순수 함수** — 별도 테스트 파일로 상태/단계 조합별 문구를 단위
   테스트. `quarto-workspace.tsx`/`preview-pane.tsx`는 배선만 하고 컴포넌트 테스트는
   추가하지 않음(기존에도 이 두 파일은 컴포넌트 테스트가 없음)
