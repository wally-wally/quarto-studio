# Phase 1 — 워커 분리 + 큐 (단일 사용자 유지) Plan

> 자율 실행. 설계 결정은 이 문서에 기록하고 검증하며 구현한다. 인증은 Phase 3.

**Goal:** 렌더링을 웹에서 분리한다. 웹은 렌더 잡을 큐에 넣고, 별도 워커가 일회용 `quarto-render` 컨테이너로 실행한 뒤 결과를 저장한다. SQLite → Postgres. 단일 사용자 유지.

## 결정 (Decisions)
- **DB**: SQLite → Postgres. 드라이버 `postgres`(postgres.js) — raw SQL이라 기존 repository와 정합. 동기 → 비동기 전환.
- **마이그레이션**: `db/migrations/NNNN_*.sql` + 경량 러너(`scripts/migrate.mjs`), `schema_migrations` 테이블로 적용 추적.
- **스키마**: `documents`(렌더 필드 제거), `render_jobs`(큐 + 렌더 결과). DocumentRecord의 renderStatus/renderedHtml은 최신 job에서 파생.
- **큐**: `render_jobs` 테이블이 큐. 워커가 `FOR UPDATE SKIP LOCKED`로 클레임. 폴링 + `LISTEN/NOTIFY`로 즉시 깨우기.
- **워커**: Node(`worker/render-worker.ts`, `tsx`로 실행). `src/lib/quarto/project.ts`(buildQuartoProjectFiles) 재사용. 잡마다 `docker run --rm --network none ... quarto-render:dev`로 일회용 컨테이너 실행(child_process + docker CLI, `DOCKER_HOST`→socket-proxy).
- **격리**: `--network none --read-only --tmpfs /work --user --cap-drop ALL --pids-limit --memory --cpus` + 타임아웃(워커가 kill).
- **소켓 하드닝**: `docker-socket-proxy`(Tecnativa)로 containers/create·start·wait·remove·logs만 허용.
- **웹**: `renderDocumentAction` → 잡 enqueue(즉시 반환). `getRenderJobAction(jobId)` 폴링. 프리뷰 페인이 상태 폴링 후 결과 표시.
- **Compose**: web(Next.js) + worker + postgres + socket-proxy. 워커가 띄우는 일회용 렌더 컨테이너는 호스트 도커에서 실행.

## 구현 단위 (각 = 커밋/푸시)
1. **인프라 기반**: `docker-compose.yml`(postgres + socket-proxy 우선), `db/migrations/0001_init.sql`, `scripts/migrate.mjs`. Postgres 기동 + 마이그레이션 검증.
2. **데이터 계층 이전**: `connection.ts`(postgres.js), `repository.ts`(async, PG), `service.ts`/`app-service.ts`/`actions.ts`(async ripple), 테스트 갱신. 앱이 Postgres로 동작(단일 사용자).
3. **잡 큐 + 워커**: render_jobs enqueue/claim, `worker/render-worker.ts`(폴링·일회용 컨테이너·결과 저장), 격리 옵션.
4. **웹 비동기 UI**: 렌더 → enqueue + 잡 ID, 프리뷰 폴링.
5. **Compose 풀 와이어링 + E2E 검증**: web+worker+postgres+socket-proxy, 잡 제출→렌더→결과 확인.

## 검증
- 마이그레이션 적용 → 스키마 확인.
- `pnpm verify`(lint·typecheck·test·build) 통과.
- 워커가 일회용 컨테이너로 예제 문서를 렌더 → render_jobs.succeeded + HTML 저장 확인.
- Compose up → 웹에서 렌더 요청 → 폴링 → 결과 표시(가능한 범위 내 E2E).
