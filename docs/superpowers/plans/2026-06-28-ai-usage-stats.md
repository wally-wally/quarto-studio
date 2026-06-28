# AI 생성 사용량 표시 — 구현 계획

**Goal:** AI 작성 완료 시 드로어에 **토큰 사용량 · 추정 비용($) · 소요 시간**을 표시한다(Anthropic·OpenAI 공통).

**Architecture:** Vercel AI SDK가 두 프로바이더의 usage를 `LanguageModelUsage`(`inputTokens`/`outputTokens`)로 정규화한다. Route Handler는 응답을 **NDJSON 프레임**으로 바꿔 텍스트와 함께 usage를 내려보내고, 클라이언트는 시간을 계측하고 요금표로 비용을 추정해 표시한다.

**Tech Stack:** Next.js Route Handler · `streamText().fullStream`(finish 파트의 `totalUsage`) · `performance.now()`.

## Global Constraints

- 표시 비용은 **추정치**다(요금표 기준). UI에 "약"으로 표기한다.
- 요금표는 1M 토큰당 USD. 출처·기준일을 주석으로 남기고 한 곳(`pricing.ts`)에서 관리한다.
- 요금표에 없는 모델은 토큰·시간만 표시하고 비용은 "—".
- 스트리밍 텍스트 경로(스크롤·되돌리기) 동작은 불변. NDJSON 파싱만 추가.

## 요금표 (1M 토큰당 USD, 2026-06 기준)

| provider | model | input | output |
|---|---|---|---|
| anthropic | claude-opus-4-8 | 5.00 | 25.00 |
| anthropic | claude-sonnet-4-6 | 3.00 | 15.00 |
| anthropic | claude-haiku-4-5 | 1.00 | 5.00 |
| openai | gpt-5.5-pro | 30.00 | 180.00 |
| openai | gpt-5.5 | 5.00 | 30.00 |
| openai | gpt-5.4-pro | 30.00 | 180.00 |
| openai | gpt-5.4 | 2.50 | 15.00 |
| openai | gpt-5.4-mini | 0.75 | 4.50 |

---

### Task 1: 요금표·포맷 (`src/lib/ai/pricing.ts` + test)

- `TokenUsage = { inputTokens: number; outputTokens: number }`
- `estimateCostUsd(provider, model, usage): number | null` — 요금표 없으면 null.
- `formatUsd(cost): string` — `<$0.0001` / `$0.0042` / `$1.23`.
- `formatDuration(ms): string` — `12.3초` / `1분 5초`.
- 테스트: 비용 계산(앤트로픽·오픈AI), 미등록 모델 null, 포맷 경계값.

### Task 2: Route NDJSON + usage (`src/app/api/ai/generate/route.ts`)

- 응답을 NDJSON으로: 텍스트는 `{"type":"delta","text":...}\n`, 종료 시 `{"type":"done","usage":{inputTokens,outputTokens},"provider","model"}\n`.
- `fullStream`의 `finish` 파트에서 `totalUsage` 캡처. error 파트는 기존대로 `controller.error()`.

### Task 3: 클라이언트 계측·파싱·표시 (`src/components/workspace/ai-drawer.tsx` + globals.css)

- `performance.now()`로 생성 시작→완료 경과 계측.
- 읽기 루프에서 NDJSON 라인 파싱: `delta`→누적 텍스트(onChunk), `done`→usage 캡처.
- 완료 시 `lastResult = { inputTokens, outputTokens, costUsd, elapsedMs }` 상태로 저장, 드로어에 요약 블록 표시.
- 새 생성 시작·되돌리기 시 `lastResult` 초기화.

### Task 4: 검증·커밋·푸시

- `pnpm verify` 통과, 커밋·푸시(PR #10 갱신).
