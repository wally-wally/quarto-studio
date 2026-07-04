# Daytona 렌더 백엔드 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** worker의 로컬 Docker 일회용 컨테이너 렌더를 Daytona 관리형 sandbox로 전면 교체한다.

**Architecture:** PostgreSQL `render_jobs` 큐·아티팩트 저장·프론트는 무변경. `worker/daytona.ts` 헬퍼가 잡당 ephemeral sandbox(생성→업로드→`quarto render`→다운로드→삭제)를 담당하고, `worker/render-worker.ts`의 Docker 경로(runDocker/볼륨 마운트/docker kill)를 이 헬퍼 호출로 교체한다. 스냅샷은 기존 `docker/render/Dockerfile`을 Daytona 서버사이드 빌드로 올린다.

**Tech Stack:** Node 24 + tsx, `@daytonaio/sdk`(TS), vitest, PostgreSQL(postgres.js), Daytona CLI(스냅샷 빌드)

**스펙:** `docs/superpowers/specs/2026-07-04-daytona-render-backend-design.md`

## Global Constraints

- `DAYTONA_API_KEY`는 **절대 git에 커밋 금지** — `.env.local`에만 존재(이미 저장됨). 커밋 전 `git diff --cached | grep dtn_`로 유출 검사
- sandbox는 잡당 일회용: `ephemeral: true`, `autoStopInterval: 5`(분), `networkBlockAll: true`
- sandbox 리소스는 스냅샷에 정의: 2 vCPU / 2GiB RAM / 10GiB 디스크
- 환경변수: `DAYTONA_API_KEY`(필수), `DAYTONA_SNAPSHOT`(기본 `quarto-render-1`), `QUARTO_RENDER_TIMEOUT_MS`(유지, 기본 60000)
- 제거 대상: `DOCKER_HOST`, `QUARTO_RENDER_IMAGE`, `RENDER_WORK_DIR`, `RENDER_WORK_VOLUME`, docker-compose의 `socket-proxy` 서비스와 `render-work` 볼륨, Dockerfile.worker의 docker CLI 설치
- 주석·로그는 기존 코드처럼 한국어. 커밋 메시지는 `type(scope): 한국어 요약` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Node `>=24 <25`, pnpm 9.15.9. 각 태스크 완료 시 `pnpm typecheck && pnpm lint` 통과

## File Structure

| 파일 | 작업 | 책임 |
|---|---|---|
| `worker/daytona.ts` | 생성 | Daytona SDK 래퍼 — sandbox 1회 렌더 실행(`runQuartoRender`) |
| `worker/daytona.test.ts` | 생성 | 헬퍼 단위 테스트 (SDK mock) |
| `worker/render-worker.ts` | 수정 | Docker 경로 제거, 헬퍼 호출로 교체 |
| `package.json` | 수정 | `@daytonaio/sdk` 의존성, `smoke:daytona` 스크립트 |
| `Dockerfile.worker` | 수정 | docker CLI 설치 제거, ENV 교체 |
| `docker-compose.yml` | 수정 | socket-proxy·render-work 제거, worker ENV 교체 |
| `dev-start.sh` | 수정 | 렌더 이미지 빌드 제거, .env.local의 Daytona 변수 로드 |
| `scripts/daytona-snapshot.sh` | 생성 | 스냅샷 서버사이드 빌드 래퍼 |
| `scripts/daytona-smoke.ts` | 생성 | 실 Daytona로 smoke qmd 렌더 검증 |
| `docs/DEPLOY.md`, `QUICKSTART.md` | 수정 | Daytona 전환 반영 |

---

### Task 1: `worker/daytona.ts` — 성공/실패 경로 (TDD)

**Files:**
- Modify: `package.json` (의존성)
- Create: `worker/daytona.ts`
- Test: `worker/daytona.test.ts`

**Interfaces:**
- Consumes: `@daytonaio/sdk`의 `Daytona`, `Sandbox`
- Produces (Task 2·3·5가 사용):
  ```ts
  export type RenderFiles = { indexQmd: string; quartoYml: string };
  export type RenderOutcome =
    | { kind: "success"; html: string; log: string }
    | { kind: "failed"; log: string }
    | { kind: "timed_out"; log: string }
    | { kind: "canceled" };
  export function runQuartoRender(opts: {
    jobId: string;
    files: RenderFiles;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<RenderOutcome>;
  ```

- [ ] **Step 1: SDK 설치**

```bash
pnpm add @daytonaio/sdk
```

- [ ] **Step 2: SDK 타입 시그니처 확인 (계획의 가정 검증)**

```bash
grep -rn "uploadFile" node_modules/@daytonaio/sdk/src/FileSystem.d.ts node_modules/@daytonaio/sdk/dist/*.d.ts 2>/dev/null | head
grep -rn "downloadFile\|createFolder" node_modules/@daytonaio/sdk/dist/*.d.ts 2>/dev/null | head
grep -rn "networkBlockAll\|ephemeral\|autoStopInterval" node_modules/@daytonaio/sdk/dist/*.d.ts 2>/dev/null | head
grep -rn "executeCommand" node_modules/@daytonaio/sdk/dist/*.d.ts 2>/dev/null | head
```

확인 사항 (아래 Step 4 코드는 이 시그니처를 가정):
- `sandbox.fs.uploadFile(file: Buffer, remotePath: string)` — Buffer 오버로드 존재 여부
- `sandbox.fs.downloadFile(remotePath: string): Promise<Buffer>` — 인자 1개 오버로드
- `daytona.create({ snapshot, ephemeral, autoStopInterval, networkBlockAll, labels })`
- `sandbox.process.executeCommand(command, cwd, env?, timeoutSec?)` → `{ exitCode: number; result: string }`

시그니처가 다르면 Step 4 구현을 실제 시그니처에 맞추고(예: Buffer 미지원 시 `os.tmpdir()` 임시 파일 경유), 테스트 mock도 동일하게 조정한다.

- [ ] **Step 3: 실패하는 테스트 작성**

`worker/daytona.test.ts`:

```ts
// worker/daytona.ts 단위 테스트: SDK를 mock하여 sandbox 생명주기(생성→업로드→실행→
// 다운로드→삭제)와 결과 매핑을 검증한다. 실제 Daytona 호출은 scripts/daytona-smoke.ts 담당.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const executeCommand = vi.fn();
  const uploadFile = vi.fn();
  const downloadFile = vi.fn();
  const createFolder = vi.fn();
  const sandbox = {
    id: "sb-test",
    process: { executeCommand },
    fs: { uploadFile, downloadFile, createFolder },
  };
  return {
    executeCommand,
    uploadFile,
    downloadFile,
    createFolder,
    sandbox,
    create: vi.fn(),
    del: vi.fn(),
  };
});

vi.mock("@daytonaio/sdk", () => ({
  Daytona: vi.fn(() => ({ create: mocks.create, delete: mocks.del })),
}));

// 모듈 레벨 클라이언트 캐시를 테스트마다 초기화하기 위해 동적 import 사용.
async function importHelper() {
  vi.resetModules();
  return import("./daytona");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  process.env.DAYTONA_API_KEY = "dtn_test_key";
  process.env.DAYTONA_SNAPSHOT = "quarto-render-test";
  mocks.create.mockResolvedValue(mocks.sandbox);
  mocks.del.mockResolvedValue(undefined);
  mocks.createFolder.mockResolvedValue(undefined);
  mocks.uploadFile.mockResolvedValue(undefined);
  mocks.executeCommand.mockResolvedValue({ exitCode: 0, result: "render ok" });
  mocks.downloadFile.mockResolvedValue(Buffer.from("<html>done</html>", "utf8"));
});

const baseOpts = {
  jobId: "job-1",
  files: { indexQmd: "# hello", quartoYml: "project:\n" },
  timeoutMs: 60_000,
};

describe("runQuartoRender — 성공/실패", () => {
  it("성공: 파일 업로드 → 렌더 → index.html 다운로드 → sandbox 삭제", async () => {
    const { runQuartoRender } = await importHelper();
    const outcome = await runQuartoRender(baseOpts);

    expect(outcome).toEqual({ kind: "success", html: "<html>done</html>", log: "render ok" });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: "quarto-render-test",
        ephemeral: true,
        autoStopInterval: 5,
        networkBlockAll: true,
        labels: { app: "quarto-studio", job: "job-1" },
      }),
    );
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      "quarto render index.qmd --to html",
      "/work",
      undefined,
      60,
    );
    expect(mocks.downloadFile).toHaveBeenCalledWith("/work/index.html");
    expect(mocks.del).toHaveBeenCalledWith(mocks.sandbox);
  });

  it("렌더 exit code != 0이면 failed + 로그, 다운로드 없이 sandbox 삭제", async () => {
    mocks.executeCommand.mockResolvedValue({ exitCode: 1, result: "SyntaxError: ..." });
    const { runQuartoRender } = await importHelper();
    const outcome = await runQuartoRender(baseOpts);

    expect(outcome).toEqual({ kind: "failed", log: "SyntaxError: ..." });
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.del).toHaveBeenCalled();
  });

  it("업로드 실패 예외가 나도 sandbox는 삭제된다", async () => {
    mocks.uploadFile.mockRejectedValue(new Error("upload broke"));
    const { runQuartoRender } = await importHelper();

    await expect(runQuartoRender(baseOpts)).rejects.toThrow("upload broke");
    expect(mocks.del).toHaveBeenCalled();
  });

  it("DAYTONA_API_KEY 미설정이면 즉시 실패", async () => {
    delete process.env.DAYTONA_API_KEY;
    const { runQuartoRender } = await importHelper();

    await expect(runQuartoRender(baseOpts)).rejects.toThrow("DAYTONA_API_KEY");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `pnpm vitest run worker/daytona.test.ts`
Expected: FAIL — `Cannot find module './daytona'` 류 (모듈 미존재)

- [ ] **Step 5: 최소 구현**

`worker/daytona.ts`:

```ts
// Daytona sandbox에서 quarto render를 1회 실행하는 헬퍼.
// 잡당 일회용(ephemeral) sandbox: 생성 → 파일 업로드 → 렌더 → index.html 다운로드 → 삭제.
// 격리(비루트·네트워크 차단·리소스 제한) 책임은 Daytona로 이관되었다.
import { Daytona, type Sandbox } from "@daytonaio/sdk";

export type RenderFiles = { indexQmd: string; quartoYml: string };

export type RenderOutcome =
  | { kind: "success"; html: string; log: string }
  | { kind: "failed"; log: string }
  | { kind: "timed_out"; log: string }
  | { kind: "canceled" };

const WORK_DIR = "/work";
// Daytona측 executeCommand 타임아웃이 안 먹었을 때를 대비한 워커측 감시 여유분.
const WATCHDOG_EXTRA_MS = 10_000;

let client: Daytona | null = null;

function getClient(): Daytona {
  if (!client) {
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) throw new Error("DAYTONA_API_KEY 환경변수가 필요합니다.");
    client = new Daytona({ apiKey });
  }
  return client;
}

async function createSandbox(jobId: string): Promise<Sandbox> {
  return getClient().create({
    snapshot: process.env.DAYTONA_SNAPSHOT ?? "quarto-render-1",
    ephemeral: true,        // 정지 시 자동 삭제
    autoStopInterval: 5,    // 워커 크래시로 삭제를 놓친 고아 sandbox 안전망(분)
    networkBlockAll: true,  // 기존 --network none과 동일 보안 수준
    labels: { app: "quarto-studio", job: jobId },
  });
}

export async function runQuartoRender(opts: {
  jobId: string;
  files: RenderFiles;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<RenderOutcome> {
  const { jobId, files, timeoutMs, signal } = opts;
  if (signal?.aborted) return { kind: "canceled" };

  // getClient()를 sandbox 생성 전에 호출해 API 키 미설정을 조기 실패시킨다.
  const daytona = getClient();
  const sandbox = await createSandbox(jobId);

  try {
    await sandbox.fs.createFolder(WORK_DIR, "755");
    await sandbox.fs.uploadFile(Buffer.from(files.indexQmd, "utf8"), `${WORK_DIR}/index.qmd`);
    await sandbox.fs.uploadFile(Buffer.from(files.quartoYml, "utf8"), `${WORK_DIR}/_quarto.yml`);
    if (signal?.aborted) return { kind: "canceled" };

    const response = await sandbox.process.executeCommand(
      "quarto render index.qmd --to html",
      WORK_DIR,
      undefined,
      Math.ceil(timeoutMs / 1000),
    );
    if (signal?.aborted) return { kind: "canceled" };
    if (response.exitCode !== 0) return { kind: "failed", log: response.result };

    const html = await sandbox.fs.downloadFile(`${WORK_DIR}/index.html`);
    return { kind: "success", html: html.toString("utf8"), log: response.result };
  } finally {
    // 어떤 경로든 sandbox를 폐기한다. 실패해도 autoStopInterval이 정리한다.
    void daytona.delete(sandbox).catch(() => {});
  }
}
```

(타임아웃·취소·rate-limit은 Task 2에서 추가 — 이 단계에서는 위 4개 테스트만 통과하면 된다.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm vitest run worker/daytona.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: 타입·린트 확인 후 커밋**

```bash
pnpm typecheck && pnpm lint
git add package.json pnpm-lock.yaml worker/daytona.ts worker/daytona.test.ts
git diff --cached | grep dtn_ && echo "KEY LEAKED — 중단" || git commit -m "feat(render): Daytona sandbox 렌더 헬퍼 — 성공/실패 경로

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(참고: `dtn_test_key`는 테스트용 가짜 값이라 grep에 걸린다 — `grep -E 'dtn_[a-f0-9]{32,}'`로 실키 패턴만 검사한다.)

---

### Task 2: `worker/daytona.ts` — 타임아웃·취소·rate-limit (TDD)

**Files:**
- Modify: `worker/daytona.ts`
- Test: `worker/daytona.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1의 `runQuartoRender` 시그니처 (변경 없음)
- Produces: `timed_out`/`canceled` outcome, 429 시 1회 재시도 후 한국어 혼잡 메시지 Error

- [ ] **Step 1: 실패하는 테스트 추가**

`worker/daytona.test.ts`에 추가:

```ts
describe("runQuartoRender — 타임아웃/취소/재시도", () => {
  it("Daytona측 타임아웃 에러 메시지는 timed_out으로 매핑", async () => {
    mocks.executeCommand.mockRejectedValue(new Error("Command timed out after 60 seconds"));
    const { runQuartoRender } = await importHelper();
    const outcome = await runQuartoRender(baseOpts);

    expect(outcome.kind).toBe("timed_out");
    expect(mocks.del).toHaveBeenCalled();
  });

  it("워치독: 실행이 timeoutMs+10s를 넘기면 timed_out", async () => {
    vi.useFakeTimers();
    mocks.executeCommand.mockReturnValue(new Promise(() => {})); // 영원히 pending
    const { runQuartoRender } = await importHelper();

    const pending = runQuartoRender(baseOpts);
    await vi.advanceTimersByTimeAsync(60_000 + 10_000 + 1);
    const outcome = await pending;

    expect(outcome.kind).toBe("timed_out");
    expect(mocks.del).toHaveBeenCalled();
  });

  it("실행 중 abort되면 canceled + sandbox 삭제", async () => {
    mocks.executeCommand.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const { runQuartoRender } = await importHelper();

    const pending = runQuartoRender({ ...baseOpts, signal: controller.signal });
    await Promise.resolve(); // 업로드 마이크로태스크 소진
    controller.abort();
    const outcome = await pending;

    expect(outcome).toEqual({ kind: "canceled" });
    expect(mocks.del).toHaveBeenCalled();
  });

  it("시작 전에 이미 abort면 sandbox를 만들지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const { runQuartoRender } = await importHelper();
    const outcome = await runQuartoRender({ ...baseOpts, signal: controller.signal });

    expect(outcome).toEqual({ kind: "canceled" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("429 + retry-after<=3초면 대기 후 1회 재시도해 성공", async () => {
    vi.useFakeTimers();
    mocks.create
      .mockRejectedValueOnce({ statusCode: 429, headers: { get: () => "1" } })
      .mockResolvedValueOnce(mocks.sandbox);
    const { runQuartoRender } = await importHelper();

    const pending = runQuartoRender(baseOpts);
    await vi.advanceTimersByTimeAsync(1_000);
    const outcome = await pending;

    expect(outcome.kind).toBe("success");
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("429 + retry-after가 크면 재시도 없이 혼잡 안내 에러", async () => {
    mocks.create.mockRejectedValue({ statusCode: 429, headers: { get: () => "30" } });
    const { runQuartoRender } = await importHelper();

    await expect(runQuartoRender(baseOpts)).rejects.toThrow("혼잡");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run worker/daytona.test.ts`
Expected: FAIL — 새 6개 테스트 (기존 4개는 PASS 유지)

- [ ] **Step 3: 구현 확장**

`worker/daytona.ts`의 `createSandbox`를 재시도 포함으로 교체:

```ts
function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: number }).statusCode === 429
  );
}

function getRetryAfterSeconds(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("headers" in error)) return undefined;
  const headers = (error as { headers?: { get?: (key: string) => string } }).headers;
  const seconds = Number(headers?.get?.("retry-after"));
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

// 429 시 retry-after가 짧으면(<=3초) 한 번만 인라인 재시도한다. (ai-api 패턴 축소판)
async function createSandbox(jobId: string): Promise<Sandbox> {
  const params = {
    snapshot: process.env.DAYTONA_SNAPSHOT ?? "quarto-render-1",
    ephemeral: true,
    autoStopInterval: 5,
    networkBlockAll: true,
    labels: { app: "quarto-studio", job: jobId },
  };
  try {
    return await getClient().create(params);
  } catch (error) {
    if (isRateLimitError(error)) {
      const retryAfter = getRetryAfterSeconds(error);
      if (retryAfter !== undefined && retryAfter <= 3) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return getClient().create(params);
      }
      throw new Error("렌더 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.");
    }
    throw error;
  }
}
```

`runQuartoRender`의 실행 부분을 Promise.race 구조로 교체:

```ts
export async function runQuartoRender(opts: {
  jobId: string;
  files: RenderFiles;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<RenderOutcome> {
  const { jobId, files, timeoutMs, signal } = opts;
  if (signal?.aborted) return { kind: "canceled" };

  const daytona = getClient();
  const sandbox = await createSandbox(jobId);
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  try {
    await sandbox.fs.createFolder(WORK_DIR, "755");
    await sandbox.fs.uploadFile(Buffer.from(files.indexQmd, "utf8"), `${WORK_DIR}/index.qmd`);
    await sandbox.fs.uploadFile(Buffer.from(files.quartoYml, "utf8"), `${WORK_DIR}/_quarto.yml`);
    if (signal?.aborted) return { kind: "canceled" };

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
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
pnpm typecheck && pnpm lint
git add worker/daytona.ts worker/daytona.test.ts
git commit -m "feat(render): Daytona 헬퍼 타임아웃·취소·429 재시도

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `worker/render-worker.ts` 통합 — Docker 경로 제거

**Files:**
- Modify: `worker/render-worker.ts`

**Interfaces:**
- Consumes: Task 1·2의 `runQuartoRender`, `RenderOutcome`; `buildQuartoProjectFiles()`(반환 `{ indexQmd, quartoYml }`은 `RenderFiles`와 동일 형태)
- Produces: 기존과 동일한 render_jobs 상태 전이·아티팩트 저장 (외부 계약 무변경)

- [ ] **Step 1: import·상수 정리**

`worker/render-worker.ts` 상단 교체:
- 제거: `import { spawn } from "node:child_process"`, `import fs from "node:fs/promises"`, `import path from "node:path"`
- 추가: `import { runQuartoRender } from "./daytona"`
- 제거: `RENDER_IMAGE`, `RENDER_WORK_DIR`, `RENDER_WORK_VOLUME` 상수와 관련 주석 (파일 최상단 주석도 Daytona 기준으로 갱신: "잡마다 일회용 Daytona sandbox로 렌더")
- `os`, `crypto`는 `WORKER_ID`·artifact ID에 쓰이므로 유지
- `DAYTONA_API_KEY` 부재 시 기동 실패 가드 추가 (DATABASE_URL 가드 아래):

```ts
if (!process.env.DAYTONA_API_KEY) {
  console.error("DAYTONA_API_KEY 환경변수가 필요합니다.");
  process.exit(1);
}
```

- [ ] **Step 2: `runDocker()` 함수와 `DockerResult` 타입 삭제**

- [ ] **Step 3: `processJob()` 교체**

```ts
async function processJob(job: ClaimedJob): Promise<void> {
  // 실행 중 취소 감시: 사용자가 중단하면 잡이 'canceled'로 바뀐다 → abort로 sandbox 폐기.
  const controller = new AbortController();
  const cancelWatcher = setInterval(() => {
    sql<{ status: string }[]>`select status from render_jobs where id = ${job.id}`
      .then((rows) => {
        if (rows[0]?.status === "canceled") controller.abort();
      })
      .catch(() => {});
  }, 1500);

  try {
    const files = buildQuartoProjectFiles({
      content: job.content_snapshot,
      executeCode: job.execute_code,
    });

    const outcome = await runQuartoRender({
      jobId: job.id,
      files,
      timeoutMs: TIMEOUT_MS,
      signal: controller.signal,
    });

    if (outcome.kind === "canceled") {
      console.log(`[job ${job.id}] canceled — sandbox 폐기, 결과 폐기`);
      return;
    }

    if (outcome.kind !== "success") {
      await sql`
        update render_jobs
           set status = ${outcome.kind}, log = ${outcome.log}, finished_at = now()
         where id = ${job.id} and status = 'running'
      `;
      console.log(`[job ${job.id}] ${outcome.kind}`);
      return;
    }

    const artifactId = crypto.randomUUID();
    const key = `${artifactId}.html`;
    const { sizeBytes } = await artifactStore.putArtifact(key, outcome.html);

    // 성공 결과 저장은 repository로 위임(artifacts INSERT → render_jobs.artifact_id 순서로
    // 즉시검사 FK를 만족시키고, status='running' 가드로 완료 직전 취소를 보호한다).
    const { stored } = await repository.completeRenderJob({
      jobId: job.id,
      documentId: job.document_id,
      artifactId,
      storageKey: key,
      sizeBytes,
      log: outcome.log,
    });

    if (!stored) {
      await artifactStore.deleteArtifact(key);
      console.log(`[job ${job.id}] 완료 직전 취소 — 결과 폐기`);
      return;
    }

    // Retention: keep latest 5 artifacts for this document
    const old = await sql<{ id: string; storage_key: string }[]>`
      select id, storage_key from artifacts
      where document_id = ${job.document_id}
      order by created_at desc
      offset 5
    `;
    for (const row of old) {
      await artifactStore.deleteArtifact(row.storage_key);
      await sql`delete from artifacts where id = ${row.id}`;
    }

    console.log(`[job ${job.id}] succeeded → artifact ${artifactId} (${sizeBytes} bytes)`);
  } catch (error) {
    await sql`
      update render_jobs
         set status = 'failed', log = ${String(error)}, finished_at = now()
       where id = ${job.id} and status = 'running'
    `;
    console.error(`[job ${job.id}] error`, error);
  } finally {
    clearInterval(cancelWatcher);
  }
}
```

- [ ] **Step 4: `main()` 기동 로그 갱신**

```ts
console.log(
  `render-worker ${WORKER_ID} 시작 (snapshot=${process.env.DAYTONA_SNAPSHOT ?? "quarto-render-1"}, timeout=${TIMEOUT_MS}ms)`,
);
```

- [ ] **Step 5: 검증 후 커밋**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 모두 PASS. 추가로 `grep -n "docker\|spawn\|RENDER_WORK" worker/render-worker.ts` 결과 없음 확인.

```bash
git add worker/render-worker.ts
git commit -m "feat(render): 워커 렌더 실행을 Docker에서 Daytona sandbox로 교체

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 인프라 정리 — Dockerfile.worker · docker-compose.yml · dev-start.sh

**Files:**
- Modify: `Dockerfile.worker`
- Modify: `docker-compose.yml`
- Modify: `dev-start.sh`

**Interfaces:**
- Consumes: Task 3의 worker (DAYTONA_API_KEY 필수, DOCKER_HOST 불필요)
- Produces: `docker compose config`가 유효한 스택 (socket-proxy·render-work 없음)

- [ ] **Step 1: Dockerfile.worker 정리**

- docker CLI 설치 블록(`ARG DOCKER_CLI_VERSION` ~ `docker --version` RUN) 삭제. 단 `ca-certificates`는 SDK의 TLS 통신에 필요하므로 유지:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*
```

- ENV 블록 교체:

```dockerfile
ENV NODE_ENV=production
ENV DATABASE_URL=""
ENV ARTIFACT_DIR="/artifacts"
ENV DAYTONA_API_KEY=""
ENV DAYTONA_SNAPSHOT="quarto-render-1"
```

- 파일 상단 주석(docker CLI 설치 이유)도 함께 삭제

- [ ] **Step 2: docker-compose.yml 정리**

- `socket-proxy` 서비스 전체 삭제 (주석 포함)
- `volumes:` 목록에서 `render-work:` 삭제
- worker 서비스 수정:

```yaml
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      DATABASE_URL: postgres://quarto:quarto@postgres:5432/quarto_studio
      ARTIFACT_DIR: /artifacts
      DAYTONA_API_KEY: ${DAYTONA_API_KEY:?DAYTONA_API_KEY가 필요합니다 (.env.local 참고)}
      DAYTONA_SNAPSHOT: ${DAYTONA_SNAPSHOT:-quarto-render-1}
    volumes:
      - artifacts:/artifacts
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
```

- 파일 헤더 주석의 "socket-proxy" 언급 삭제

- [ ] **Step 3: dev-start.sh 정리**

- `--skip-render-build` 플래그 처리와 "── 렌더 이미지 빌드 ──" 섹션 전체 삭제 (사용법 주석도 갱신)
- ".env.local 준비" 섹션 바로 아래에 Daytona 변수 로드 추가:

```bash
# ── Daytona 설정 로드 ─────────────────────────────────────────────────────
# 워커는 dotenv를 읽지 않으므로 .env.local의 변수를 셸로 내보낸다.
set -a
# shellcheck source=/dev/null
source "$ROOT/.env.local"
set +a
[[ -n "${DAYTONA_API_KEY:-}" ]] || warn "DAYTONA_API_KEY가 .env.local에 없습니다. 렌더가 실패합니다."
```

- [ ] **Step 4: 검증 후 커밋**

```bash
bash -n dev-start.sh
DAYTONA_API_KEY=dummy docker compose config --quiet && echo "compose OK"
docker compose config 2>/dev/null | grep -q "socket-proxy" && echo "FAIL: socket-proxy 잔존" || echo "OK"
```
Expected: `compose OK`, `OK`

```bash
git add Dockerfile.worker docker-compose.yml dev-start.sh
git commit -m "chore(infra): 렌더 Docker 의존 제거 — socket-proxy·render-work·docker CLI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 스냅샷 빌드·스모크 스크립트

**Files:**
- Create: `scripts/daytona-snapshot.sh`
- Create: `scripts/daytona-smoke.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `runQuartoRender`(Task 1·2), `buildQuartoProjectFiles`(기존), `docker/render/smoke/*.qmd`(기존 7개), Daytona CLI
- Produces: `quarto-render-<N>` 스냅샷, `pnpm smoke:daytona` 명령

- [ ] **Step 1: 스냅샷 빌드 스크립트 작성**

`scripts/daytona-snapshot.sh`:

```bash
#!/usr/bin/env bash
# Daytona 서버사이드 빌드로 렌더 스냅샷 생성.
# 사용: DAYTONA_API_KEY=... ./scripts/daytona-snapshot.sh [버전번호]
#   예: ./scripts/daytona-snapshot.sh 2  →  quarto-render-2 생성
# 생성 후 .env.local(운영은 배포 환경변수)의 DAYTONA_SNAPSHOT을 새 이름으로 교체한다.
set -euo pipefail

VERSION="${1:-1}"
NAME="quarto-render-${VERSION}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v daytona >/dev/null 2>&1 || {
  echo "[ERROR] daytona CLI가 없습니다. 설치: brew install daytonaio/cli/daytona" >&2
  exit 1
}
[[ -n "${DAYTONA_API_KEY:-}" ]] || {
  echo "[ERROR] DAYTONA_API_KEY를 export 하세요 (.env.local 참고)" >&2
  exit 1
}

echo "[INFO] 스냅샷 ${NAME} 서버사이드 빌드 시작 (수십 분 소요 가능)..."
daytona snapshot create "${NAME}" \
  --dockerfile "${ROOT}/docker/render/Dockerfile" \
  --context "${ROOT}/docker/render" \
  --cpu 2 --memory 2 --disk 10

echo "[OK] 스냅샷 ${NAME} 생성 완료"
echo "     → DAYTONA_SNAPSHOT=${NAME} 으로 설정한 뒤 'pnpm smoke:daytona'로 검증하세요"
```

```bash
chmod +x scripts/daytona-snapshot.sh
```

(CLI 플래그명이 다르면 — `daytona snapshot create --help` 확인 — 실제 플래그에 맞춰 수정한다. 리소스 스펙 2vCPU/2GiB/10GiB는 유지.)

- [ ] **Step 2: 스모크 스크립트 작성**

`scripts/daytona-smoke.ts`:

```ts
// 실제 Daytona sandbox에서 smoke qmd(Python·R·Julia·한글 폰트)를 렌더해 스냅샷을 검증한다.
// 사용: set -a; source .env.local; set +a; pnpm smoke:daytona
// 산출 html은 docker/render/smoke/*.html (gitignore 대상)에 저장된다.
import fs from "node:fs/promises";
import path from "node:path";
import { buildQuartoProjectFiles } from "../src/lib/quarto/project";
import { runQuartoRender } from "../worker/daytona";

const SMOKE_DIR = path.join(process.cwd(), "docker/render/smoke");
// julia 첫 렌더는 precompile 때문에 느릴 수 있어 워커 기본(60s)보다 여유를 둔다.
const SMOKE_TIMEOUT_MS = 180_000;

async function main(): Promise<void> {
  const entries = (await fs.readdir(SMOKE_DIR)).filter((name) => name.endsWith(".qmd")).sort();
  if (entries.length === 0) {
    console.error(`smoke qmd가 없습니다: ${SMOKE_DIR}`);
    process.exit(1);
  }

  let failed = 0;
  for (const name of entries) {
    const content = await fs.readFile(path.join(SMOKE_DIR, name), "utf8");
    const files = buildQuartoProjectFiles({ content, executeCode: true });
    const startedAt = Date.now();
    const outcome = await runQuartoRender({
      jobId: `smoke-${name}`,
      files,
      timeoutMs: SMOKE_TIMEOUT_MS,
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (outcome.kind === "success") {
      const htmlPath = path.join(SMOKE_DIR, name.replace(/\.qmd$/, ".html"));
      await fs.writeFile(htmlPath, outcome.html);
      console.log(`✅ ${name} (${elapsed}s, ${outcome.html.length} bytes)`);
    } else {
      failed += 1;
      const log = "log" in outcome ? outcome.log.slice(-2000) : "";
      console.error(`❌ ${name}: ${outcome.kind} (${elapsed}s)\n${log}`);
    }
  }

  console.log(failed === 0 ? "\n스모크 전체 통과" : `\n${failed}건 실패`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: package.json 스크립트 추가**

```json
"smoke:daytona": "tsx scripts/daytona-smoke.ts",
```

(`"worker"` 스크립트 아래에 추가)

- [ ] **Step 4: 정적 검증 후 커밋**

```bash
bash -n scripts/daytona-snapshot.sh
pnpm typecheck && pnpm lint
git add scripts/daytona-snapshot.sh scripts/daytona-smoke.ts package.json
git commit -m "feat(render): Daytona 스냅샷 빌드·스모크 스크립트

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(실제 스냅샷 생성·스모크 실행은 Task 7에서 수행 — CLI 로그인과 수십 분 빌드가 필요.)

---

### Task 6: 문서 갱신 — DEPLOY.md · QUICKSTART.md

**Files:**
- Modify: `docs/DEPLOY.md`
- Modify: `QUICKSTART.md`

**Interfaces:**
- Consumes: Task 4·5의 최종 인프라 구성
- Produces: 배포·시작 문서가 실제 구성과 일치

- [ ] **Step 1: DEPLOY.md 환경변수 표 갱신**

`docs/DEPLOY.md:37-40`의 4행(`DOCKER_HOST`, `QUARTO_RENDER_IMAGE`, `RENDER_WORK_DIR`, `RENDER_WORK_VOLUME`)을 삭제하고 아래 2행으로 교체:

```markdown
| `DAYTONA_API_KEY` | (비밀 — .env.local/배포 시크릿) | Daytona API 키. **git 커밋 절대 금지** |
| `DAYTONA_SNAPSHOT` | `quarto-render-1` | 렌더용 Daytona 스냅샷 이름 (`scripts/daytona-snapshot.sh`로 생성) |
```

- [ ] **Step 2: DEPLOY.md 보안/격리 섹션 교체**

`docs/DEPLOY.md:56` 이하의 "보안 / 격리" 섹션(docker run 플래그 표 + socket-proxy 행 + Phase 4 Post `--read-only` 계획)을 아래로 교체:

```markdown
## 보안 / 격리

렌더(사용자 코드 실행)는 Daytona 관리형 sandbox에서 수행된다. 워커·웹 서버에서는
어떤 사용자 코드도 실행되지 않는다.

| 항목 | 내용 |
|---|---|
| 실행 격리 | 잡당 일회용 ephemeral sandbox (종료 시 삭제, 상태 잔존 없음) |
| 네트워크 | `networkBlockAll: true` — sandbox 내부에서 외부 통신 불가 (기존 `--network none` 동급) |
| 리소스 | 스냅샷 정의: 2 vCPU / 2GiB RAM / 10GiB 디스크 |
| 타임아웃 | ① Daytona exec timeout(60s) ② 워커 워치독(+10s) ③ autoStopInterval 5분 |
| 고아 정리 | 워커 크래시 시 autoStopInterval이 5분 내 sandbox 자동 정지·삭제(과금 중단) |
| 워커 권한 | Docker 소켓 접근 불필요 (socket-proxy 제거) — 아웃바운드 HTTPS(Daytona API)만 필요 |

스냅샷 갱신 절차: `docker/render/Dockerfile` 수정 → `./scripts/daytona-snapshot.sh <새버전>` →
`pnpm smoke:daytona`로 검증 → 배포 환경의 `DAYTONA_SNAPSHOT` 교체.
```

- [ ] **Step 3: DEPLOY.md·QUICKSTART.md 잔여 Docker 렌더 언급 정리**

```bash
grep -n "quarto-render:dev\|socket-proxy\|render-work\|DOCKER_HOST\|QUARTO_RENDER_IMAGE" docs/DEPLOY.md QUICKSTART.md README.md
```

검색된 각 문단을 실제 구성에 맞게 수정한다:
- 렌더 이미지 로컬 빌드 안내(`docker build -t quarto-render:dev ...`) → "Daytona 스냅샷 사용 — `scripts/daytona-snapshot.sh` 참고"로 교체
- compose 스택 설명에서 socket-proxy 제거
- QUICKSTART의 사전 조건에 "Daytona API 키 (.env.local의 `DAYTONA_API_KEY`)" 추가

- [ ] **Step 4: 커밋**

```bash
grep -rn "socket-proxy\|QUARTO_RENDER_IMAGE" docs/DEPLOY.md QUICKSTART.md README.md && echo "잔존 언급 있음 — 확인" || true
git add docs/DEPLOY.md QUICKSTART.md README.md
git diff --cached | grep -E "dtn_[a-f0-9]{32,}" && echo "KEY LEAKED — 중단" || git commit -m "docs: Daytona 렌더 백엔드 전환 반영

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 실환경 검증 (수동 — 사용자 확인 필요 단계 포함)

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: Task 1~6 전체
- Produces: 스냅샷 `quarto-render-1` 실존 + 스모크 통과 + E2E 확인

- [ ] **Step 1: Daytona CLI 설치·인증**

```bash
command -v daytona || brew install daytonaio/cli/daytona
set -a; source .env.local; set +a
daytona snapshot list   # 인증 확인 (API 키가 유효하면 목록/빈 목록 출력)
```

- [ ] **Step 2: 스냅샷 생성**

```bash
./scripts/daytona-snapshot.sh 1
```

Expected: `quarto-render-1` 생성 완료. (서버사이드 빌드 수십 분 소요 — Julia precompile 포함)
실패 시: CLI 플래그·디스크 한도(10GiB) 에러 메시지에 따라 `scripts/daytona-snapshot.sh` 수정 후 재시도.

- [ ] **Step 3: 스모크 실행**

```bash
set -a; source .env.local; set +a
pnpm smoke:daytona
```

Expected: 7개 qmd(py-altair, r-ggplot, jl-plots, ko-* 3종, md) 전부 `✅` — Python·R·Julia 커널과 한글 폰트가 sandbox에서 정상 동작함을 의미.

- [ ] **Step 4: 로컬 E2E**

```bash
./dev-start.sh
```

브라우저 `http://localhost:3000`에서:
1. Python 코드 셀 문서 렌더 → 그래프 표시 확인
2. R·Julia 예제 문서 렌더 확인
3. 렌더 중 **취소** 버튼 → 잡이 `canceled`로 종료되고 Daytona 대시보드에서 sandbox가 사라지는지 확인
4. 무한루프 셀(`while True: pass`) 문서 렌더 → 60초 후 `timed_out` 확인
5. 동시 렌더 4건 시도 → 4번째가 쿼터 초과 에러인지 확인

- [ ] **Step 5: 고아 sandbox 부재 확인**

```bash
daytona sandbox list
```

Expected: E2E 종료 후 실행 중 sandbox 없음 (일회용 삭제 + autoStop 안전망 동작 확인)
