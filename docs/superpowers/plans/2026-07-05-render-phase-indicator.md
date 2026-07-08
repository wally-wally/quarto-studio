# 렌더 진행 단계 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 렌더 버튼을 눌렀을 때 "샌드박스 준비 중" / "코드 실행 중" 2단계를 사용자에게 보여준다.

**Architecture:** `render_jobs`에 `phase` 컬럼을 추가해 worker가 두 지점(sandbox 생성 시작 직전 / `quarto render` 실행 직전)에서 갱신하고, 기존 1.5초 폴링(`getRenderJob`)이 이 값을 그대로 받아 프론트 로컬 상태에 반영한다. `status` 상태 머신(queued/running/succeeded/failed/timed_out/canceled)은 무변경.

**Tech Stack:** PostgreSQL(postgres.js), Node/tsx worker, Next.js 16 + React 19, vitest + Testing Library

**스펙:** `docs/superpowers/specs/2026-07-05-render-phase-indicator-design.md`

## Global Constraints

- `phase` 값은 정확히 두 가지: `"preparing"` | `"executing"` (그 외 `null`)
- 취소(`canceled`)는 이 기능 대상이 아니다 — `cancelRender` 액션이 폴링과 무관하게 즉시 `idle`로 되돌리는 기존 경로를 그대로 사용
- 콜백/DB 갱신 실패가 렌더 자체를 깨면 안 된다(fire-and-forget)
- 주석은 기존 코드처럼 한국어. 커밋 메시지는 `type(scope): 한국어 요약` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 각 태스크 완료 시 `pnpm typecheck && pnpm lint` 통과. 브랜치는 `feature/render-phase-indicator`(이미 체크아웃됨)

## File Structure

| 파일 | 작업 | 책임 |
|---|---|---|
| `db/migrations/0006_render_phase.sql` | 생성 | `render_jobs.phase` 컬럼 |
| `src/lib/documents/types.ts` | 수정 | `RenderJobRecord.phase` 필드 |
| `src/lib/documents/repository.ts` | 수정 | `getRenderJob`이 `phase` 반환 |
| `src/lib/documents/repository.test.ts` | 수정 | phase 왕복 테스트 |
| `worker/daytona.ts` | 수정 | `onPhaseChange` 콜백 파라미터 |
| `worker/daytona.test.ts` | 수정 | 콜백 호출 시점/예외 격리 테스트 |
| `worker/render-worker.ts` | 수정 | 콜백을 DB UPDATE로 배선 |
| `src/components/workspace/preview-pane.tsx` | 수정 | `renderPhaseLabel` 순수 함수 + UI 배선 |
| `src/components/workspace/preview-pane.test.tsx` | 수정 | `renderPhaseLabel` 단위 테스트 + 컴포넌트 표시 테스트 |
| `src/components/workspace/quarto-workspace.tsx` | 수정 | 폴링에서 `renderPhase` 로컬 상태 갱신 |
| `src/components/workspace/quarto-workspace.test.tsx` | 수정 | 폴링 중 phase가 PreviewPane까지 전달되는지 테스트 |

---

### Task 1: DB 컬럼 + repository 왕복

**Files:**
- Create: `db/migrations/0006_render_phase.sql`
- Modify: `src/lib/documents/types.ts`
- Modify: `src/lib/documents/repository.ts`
- Test: `src/lib/documents/repository.test.ts`

**Interfaces:**
- Produces (Task 2~4가 소비): `RenderJobRecord.phase: "preparing" | "executing" | null`

- [ ] **Step 1: 마이그레이션 작성**

`db/migrations/0006_render_phase.sql`:

```sql
-- 렌더 진행 단계 표시: render_jobs에 phase 컬럼 추가.
-- worker가 sandbox 준비(preparing)/코드 실행(executing) 전환 시점에 갱신한다.
-- queued 상태에서는 NULL이고, 성공해도 마지막 값을 지우지 않는다
-- (무해 — 프론트가 success에서는 phase를 참조하지 않음).
alter table render_jobs add column phase text;
alter table render_jobs add constraint render_jobs_phase_chk
  check (phase is null or phase in ('preparing', 'executing'));
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/documents/repository.test.ts`의 `"enqueueRenderJob이 jobId를 반환하고 getRenderJob이 RenderJobRecord를 반환한다"` 테스트(파일 내 129번째 줄 부근) 바로 뒤에 추가:

```ts
  it("phase 컬럼: 초기엔 null, 직접 갱신하면 getRenderJob에 반영된다", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);
    const { jobId } = await repository.enqueueRenderJob({
      ownerId,
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    const initial = await repository.getRenderJob(jobId);
    expect(initial?.phase).toBeNull();

    await sql`update render_jobs set phase = 'executing' where id = ${jobId}`;
    const updated = await repository.getRenderJob(jobId);
    expect(updated?.phase).toBe("executing");
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/documents/repository.test.ts -t "phase 컬럼"`
Expected: FAIL — `Property 'phase' does not exist` 타입 에러 또는 마이그레이션 미적용으로 인한 컬럼 없음 에러

- [ ] **Step 4: `RenderJobRecord` 타입에 `phase` 추가**

`src/lib/documents/types.ts`의 `RenderJobRecord` (51-59번째 줄)를 다음으로 교체:

```ts
export type RenderJobRecord = {
  id: string;
  documentId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out";
  log: string | null;
  artifactId: string | null;
  createdAt: string;
  finishedAt: string | null;
  phase: "preparing" | "executing" | null;
};
```

- [ ] **Step 5: repository.ts에서 phase 조회·반환**

`src/lib/documents/repository.ts`의 `RenderJobRow` 타입(26-33번째 줄)을 다음으로 교체:

```ts
type RenderJobRow = {
  id: string;
  document_id: string;
  status: RenderJobRecord["status"];
  log: string | null;
  artifact_id: string | null;
  created_at: Date;
  finished_at: Date | null;
  phase: RenderJobRecord["phase"];
};
```

`getRenderJob` 메서드(329-341번째 줄 부근)를 다음으로 교체:

```ts
    async getRenderJob(jobId: string): Promise<RenderJobRecord | null> {
      const rows = await sql<RenderJobRow[]>`
        SELECT id, document_id, status, log, artifact_id, created_at, finished_at, phase
        FROM render_jobs
        WHERE id = ${jobId}
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        documentId: row.document_id,
        status: row.status,
        log: row.log,
        artifactId: row.artifact_id,
        createdAt: row.created_at.toISOString(),
        finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
        phase: row.phase
      };
    },
```

- [ ] **Step 6: 테스트 마이그레이션 적용 확인 후 통과 확인**

`globalSetup`이 테스트 DB에 마이그레이션을 자동 적용하므로 별도 조치 불필요.

Run: `pnpm vitest run src/lib/documents/repository.test.ts`
Expected: PASS (전체)

- [ ] **Step 7: 타입·린트 확인 후 커밋**

```bash
pnpm typecheck && pnpm lint
git add db/migrations/0006_render_phase.sql src/lib/documents/types.ts src/lib/documents/repository.ts src/lib/documents/repository.test.ts
git commit -m "feat(render): render_jobs에 phase 컬럼 추가 및 조회 연결

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: worker/daytona.ts — 단계 콜백

**Files:**
- Modify: `worker/daytona.ts`
- Test: `worker/daytona.test.ts`

**Interfaces:**
- Consumes: 없음(기존 `runQuartoRender` 시그니처 확장)
- Produces (Task 3이 소비): `runQuartoRender(opts: { ...; onPhaseChange?: (phase: "preparing" | "executing") => void })`

- [ ] **Step 1: 실패하는 테스트 작성**

`worker/daytona.test.ts` 맨 끝(183번째 줄, 마지막 `describe` 블록 뒤)에 추가:

```ts
describe("runQuartoRender — 단계 콜백", () => {
  it("preparing은 sandbox 생성 전에, executing은 executeCommand 직전에 호출된다", async () => {
    const phases: string[] = [];
    const { runQuartoRender } = await importHelper();
    await runQuartoRender({ ...baseOpts, onPhaseChange: (phase) => phases.push(phase) });

    expect(phases).toEqual(["preparing", "executing"]);
  });

  it("콜백을 생략해도 기존 동작 그대로 성공한다", async () => {
    const { runQuartoRender } = await importHelper();
    const outcome = await runQuartoRender(baseOpts);

    expect(outcome.kind).toBe("success");
  });

  it("콜백이 예외를 던져도 렌더는 계속 진행된다", async () => {
    const { runQuartoRender } = await importHelper();
    const onPhaseChange = () => {
      throw new Error("콜백 오류");
    };
    const outcome = await runQuartoRender({ ...baseOpts, onPhaseChange });

    expect(outcome.kind).toBe("success");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run worker/daytona.test.ts -t "단계 콜백"`
Expected: FAIL — `onPhaseChange` 파라미터가 타입에 없거나, `phases`가 빈 배열

- [ ] **Step 3: `runQuartoRender`에 콜백 추가**

`worker/daytona.ts`의 `export async function runQuartoRender` 함수(68-141번째 줄)를 다음으로 교체:

```ts
export async function runQuartoRender(opts: {
  jobId: string;
  files: RenderFiles;
  timeoutMs: number;
  signal?: AbortSignal;
  onPhaseChange?: (phase: "preparing" | "executing") => void;
}): Promise<RenderOutcome> {
  const { jobId, files, timeoutMs, signal, onPhaseChange } = opts;
  if (signal?.aborted) return { kind: "canceled" };

  // 단계 표시는 부가 정보다 — 콜백이 던지는 예외가 렌더 자체를 깨면 안 된다.
  const notifyPhase = (phase: "preparing" | "executing") => {
    try {
      onPhaseChange?.(phase);
    } catch {
      // 무시
    }
  };

  notifyPhase("preparing");
  // getClient()를 sandbox 생성 전에 호출해 API 키 미설정을 조기 실패시킨다.
  const daytona = getClient();
  const sandbox = await createSandbox(jobId);
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  try {
    await sandbox.fs.createFolder(WORK_DIR, "755");
    await sandbox.fs.uploadFile(Buffer.from(files.indexQmd, "utf8"), `${WORK_DIR}/index.qmd`);
    await sandbox.fs.uploadFile(Buffer.from(files.quartoYml, "utf8"), `${WORK_DIR}/_quarto.yml`);
    if (signal?.aborted) return { kind: "canceled" };

    notifyPhase("executing");
    // 3중 안전망 중 1·2번: Daytona측 timeout 파라미터 + 워커측 워치독.
    // (3번은 sandbox의 autoStopInterval.) 취소는 abort 신호로 즉시 승리시킨다.
    const exec = sandbox.process
      .executeCommand(
        "quarto render index.qmd --to html",
        WORK_DIR,
        undefined,
        Math.ceil(timeoutMs / 1000),
      )
      .then((response) => ({ type: "done" as const, response }))
      .catch((error: unknown) => ({ type: "error" as const, error }));

    const watchdog = new Promise<{ type: "watchdog" }>((resolve) => {
      watchdogTimer = setTimeout(
        () => resolve({ type: "watchdog" }),
        timeoutMs + WATCHDOG_EXTRA_MS,
      );
    });

    const aborted = new Promise<{ type: "aborted" }>((resolve) => {
      if (!signal) return;
      onAbort = () => resolve({ type: "aborted" });
      signal.addEventListener("abort", onAbort, { once: true });
    });

    const raced = await Promise.race([exec, watchdog, aborted]);

    if (raced.type === "aborted" || signal?.aborted) return { kind: "canceled" };
    if (raced.type === "watchdog") {
      return {
        kind: "timed_out",
        log: `렌더가 ${timeoutMs + WATCHDOG_EXTRA_MS}ms 안에 끝나지 않아 워커가 중단했습니다.`,
      };
    }
    if (raced.type === "error") {
      const message = String(raced.error);
      if (/time.?out|timed.?out|deadline/i.test(message)) {
        return { kind: "timed_out", log: message };
      }
      throw raced.error;
    }

    const { exitCode, result } = raced.response;
    if (exitCode !== 0) return { kind: "failed", log: result };

    const html = await sandbox.fs.downloadFile(`${WORK_DIR}/index.html`);
    return { kind: "success", html: html.toString("utf8"), log: result };
  } finally {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    void daytona.delete(sandbox).catch(() => {});
  }
}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `pnpm vitest run worker/daytona.test.ts`
Expected: PASS (13 tests — 기존 10개 + 신규 3개)

- [ ] **Step 5: 커밋**

```bash
pnpm typecheck && pnpm lint
git add worker/daytona.ts worker/daytona.test.ts
git commit -m "feat(render): Daytona 헬퍼에 단계 전환 콜백 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: worker/render-worker.ts — 콜백을 DB 갱신으로 배선

**Files:**
- Modify: `worker/render-worker.ts`

**Interfaces:**
- Consumes: Task 2의 `runQuartoRender(opts: { ...; onPhaseChange? })`
- Produces: 없음(터미널 소비자)

- [ ] **Step 1: `processJob`에서 콜백 전달**

`worker/render-worker.ts`의 `runQuartoRender` 호출부(73-78번째 줄)를 다음으로 교체:

```ts
    const outcome = await runQuartoRender({
      jobId: job.id,
      files,
      timeoutMs: TIMEOUT_MS,
      signal: controller.signal,
      onPhaseChange: (phase) => {
        // 단계 표시는 부가 정보 — DB 갱신 실패가 렌더를 막으면 안 되므로 fire-and-forget.
        void sql`update render_jobs set phase = ${phase} where id = ${job.id}`.catch(() => {});
      },
    });
```

- [ ] **Step 2: 정적 검증**

이 파일은 기존 관례상 단위 테스트가 없다(worker는 실제 Daytona를 타야 의미 있는 통합 성격이라 Task 7 방식의 수동/E2E로 검증). 이번 태스크는 타입·린트로만 확인한다.

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 전부 PASS (회귀 없음)

- [ ] **Step 3: 커밋**

```bash
git add worker/render-worker.ts
git commit -m "feat(render): 워커가 렌더 단계를 render_jobs.phase에 기록

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 프론트엔드 — 단계 문구 표시

**Files:**
- Modify: `src/components/workspace/preview-pane.tsx`
- Modify: `src/components/workspace/preview-pane.test.tsx`
- Modify: `src/components/workspace/quarto-workspace.tsx`
- Modify: `src/components/workspace/quarto-workspace.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `RenderJobRecord.phase`
- Produces: `renderPhaseLabel(mode: "running" | "error", phase: "preparing" | "executing" | null): string` (export from `preview-pane.tsx`, `formatRenderedAt`와 같은 위치에 둔다)

- [ ] **Step 1: 실패하는 테스트 작성 — 순수 함수**

`src/components/workspace/preview-pane.test.tsx` 맨 끝(74번째 줄 이후)에 추가:

```ts
describe("renderPhaseLabel", () => {
  it("running + preparing → 샌드박스 준비 중", () => {
    expect(renderPhaseLabel("running", "preparing")).toBe("샌드박스 준비 중...");
  });

  it("running + executing → 코드 실행 중", () => {
    expect(renderPhaseLabel("running", "executing")).toBe("코드 실행 중...");
  });

  it("running + phase 없음 → 렌더링 중(폴백)", () => {
    expect(renderPhaseLabel("running", null)).toBe("렌더링 중...");
  });

  it("error + preparing → 준비 중 오류", () => {
    expect(renderPhaseLabel("error", "preparing")).toBe("샌드박스 준비 중 오류가 발생했습니다");
  });

  it("error + executing → 실행 중 오류", () => {
    expect(renderPhaseLabel("error", "executing")).toBe("코드 실행 중 오류가 발생했습니다");
  });

  it("error + phase 없음 → 빈 문자열(라벨 생략)", () => {
    expect(renderPhaseLabel("error", null)).toBe("");
  });
});
```

파일 상단 import(3번째 줄)를 다음으로 교체:

```ts
import { formatRenderedAt, PreviewPane, renderPhaseLabel } from "./preview-pane";
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/components/workspace/preview-pane.test.tsx -t "renderPhaseLabel"`
Expected: FAIL — `renderPhaseLabel` export 없음

- [ ] **Step 3: `renderPhaseLabel` 구현 + PreviewPane 배선**

`src/components/workspace/preview-pane.tsx`를 다음과 같이 수정한다.

`PreviewPaneProps` 타입(5-12번째 줄)을 교체:

```ts
type PreviewPaneProps = {
  document: DocumentRecord;
  isBusy: boolean;
  isRendering: boolean;
  renderPhase?: "preparing" | "executing" | null;
  onRender: () => void;
  onCancelRender: () => void;
  onDownload: () => void;
};
```

`formatRenderedAt` 함수(16-24번째 줄) 바로 뒤에 새 함수 추가:

```ts
// 렌더 중/실패 시 현재 단계를 문구로. phase는 worker가 render_jobs.phase에 기록한 값을
// 폴링으로 그대로 받은 것 — sandbox 준비(preparing)와 코드 실행(executing) 두 단계만 구분한다.
export function renderPhaseLabel(
  mode: "running" | "error",
  phase: "preparing" | "executing" | null
): string {
  if (mode === "running") {
    if (phase === "preparing") return "샌드박스 준비 중...";
    if (phase === "executing") return "코드 실행 중...";
    return "렌더링 중...";
  }
  if (phase === "preparing") return "샌드박스 준비 중 오류가 발생했습니다";
  if (phase === "executing") return "코드 실행 중 오류가 발생했습니다";
  return "";
}
```

`PreviewPane` 함수 선언(26-33번째 줄)에 `renderPhase = null` 기본값 추가:

```ts
export function PreviewPane({
  document,
  isBusy,
  isRendering,
  renderPhase = null,
  onRender,
  onCancelRender,
  onDownload
}: PreviewPaneProps) {
```

`rendering-indicator` 부분(86-90번째 줄)을 교체:

```tsx
          {isRendering ? (
            <span className="rendering-indicator" aria-live="polite">
              {renderPhaseLabel("running", renderPhase)}
            </span>
          ) : null}
```

에러 표시 부분(119-124번째 줄)을 교체:

```tsx
      {document.renderError ? (
        <div className="render-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <div>
            {renderPhaseLabel("error", renderPhase) ? (
              <p className="render-error-phase">{renderPhaseLabel("error", renderPhase)}</p>
            ) : null}
            <pre>{document.renderError}</pre>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 4: 순수 함수 테스트 통과 확인**

Run: `pnpm vitest run src/components/workspace/preview-pane.test.tsx`
Expected: PASS (전체 — 기존 테스트도 `renderPhase` 생략 시 기본값 `null`이라 그대로 통과)

- [ ] **Step 5: 컴포넌트 표시 테스트 추가**

`src/components/workspace/preview-pane.test.tsx`의 `"PreviewPane 렌더 중단 버튼"` describe 블록(20-34번째 줄) 안, 첫 번째 `it` 다음에 추가:

```ts
  it("renderPhase가 preparing이면 '샌드박스 준비 중...'을 보여준다", () => {
    render(<PreviewPane {...baseProps} isRendering renderPhase="preparing" onCancelRender={vi.fn()} />);
    expect(screen.getByText("샌드박스 준비 중...")).toBeInTheDocument();
  });

  it("renderPhase가 executing이면 '코드 실행 중...'을 보여준다", () => {
    render(<PreviewPane {...baseProps} isRendering renderPhase="executing" onCancelRender={vi.fn()} />);
    expect(screen.getByText("코드 실행 중...")).toBeInTheDocument();
  });
```

Run: `pnpm vitest run src/components/workspace/preview-pane.test.tsx`
Expected: PASS (전체)

- [ ] **Step 6: quarto-workspace.tsx — 폴링에서 phase 반영 (실패하는 테스트 먼저)**

`src/components/workspace/quarto-workspace.test.tsx`의 `"렌더 후 폴링으로 succeeded 상태가 되면..."` 테스트(372번째 줄) 바로 뒤에 추가:

```ts
  it("폴링 중 phase가 preview pane에 반영된다", async () => {
    vi.useFakeTimers();

    const getRenderJob = vi.fn()
      .mockResolvedValueOnce({
        id: "job-1",
        documentId: "doc-1",
        status: "running" as const,
        log: null,
        artifactId: null,
        createdAt: "2026-06-24T00:00:00.000Z",
        finishedAt: null,
        phase: "preparing" as const
      })
      .mockResolvedValueOnce({
        id: "job-1",
        documentId: "doc-1",
        status: "running" as const,
        log: null,
        artifactId: null,
        createdAt: "2026-06-24T00:00:00.000Z",
        finishedAt: null,
        phase: "executing" as const
      });

    const renderDocument = vi.fn(async () => ({ workspace, jobId: "job-1" }));

    renderWorkspace({ renderDocument, getRenderJob });

    await act(async () => {
      screen.getByRole("button", { name: "렌더" }).click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("샌드박스 준비 중...")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("코드 실행 중...")).toBeInTheDocument();

    vi.useRealTimers();
  });
```

Run: `pnpm vitest run src/components/workspace/quarto-workspace.test.tsx -t "phase가 preview pane에 반영"`
Expected: FAIL — "샌드박스 준비 중..." 텍스트를 찾지 못함(아직 phase 미배선)

- [ ] **Step 7: `quarto-workspace.tsx`에 `renderPhase` 상태 배선**

`src/components/workspace/quarto-workspace.tsx`의 폴링 상태 선언부(62-64번째 줄)를 교체:

```ts
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [renderPhase, setRenderPhase] = useState<"preparing" | "executing" | null>(null);
  const pollingDocumentIdRef = useRef<string | null>(null);
```

`stopPolling` 콜백(85-89번째 줄)을 교체:

```ts
  const stopPolling = useCallback(() => {
    setPollingJobId(null);
    setIsPolling(false);
    setRenderPhase(null);
    pollingDocumentIdRef.current = null;
  }, []);
```

폴링 `useEffect`(145-208번째 줄) 안, `const job = await getRenderJob(pollingJobId);`와 `if (!job) { ... }` 다음, `if (job.status === "succeeded")` 분기 이전에 한 줄 추가:

```ts
        const job = await getRenderJob(pollingJobId);
        if (!job) {
          stopPolling();
          return;
        }

        setRenderPhase(job.phase);

        if (job.status === "succeeded") {
```

`PreviewPane` 호출부(402-409번째 줄)에 prop 추가:

```tsx
        <PreviewPane
          document={draft}
          isBusy={paneBusy}
          isRendering={isRendering}
          renderPhase={renderPhase}
          onRender={handleRender}
          onCancelRender={handleCancelRender}
          onDownload={handleDownload}
        />
```

- [ ] **Step 8: 전체 테스트 통과 확인**

Run: `pnpm vitest run src/components/workspace/quarto-workspace.test.tsx`
Expected: PASS (전체 — 기존 시나리오 회귀 없음)

Run: `pnpm test`
Expected: 전체 PASS (기존 234 + 이번에 추가된 테스트)

- [ ] **Step 9: 최종 검증 후 커밋**

```bash
pnpm typecheck && pnpm lint
git add src/components/workspace/preview-pane.tsx src/components/workspace/preview-pane.test.tsx \
        src/components/workspace/quarto-workspace.tsx src/components/workspace/quarto-workspace.test.tsx
git commit -m "feat(render): 렌더 중 sandbox 준비/코드 실행 단계 문구 표시

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
