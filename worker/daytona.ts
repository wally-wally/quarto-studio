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
    ephemeral: true, // 정지 시 자동 삭제
    autoStopInterval: 5, // 워커 크래시로 삭제를 놓친 고아 sandbox 안전망(분)
    networkBlockAll: true, // 기존 --network none과 동일 보안 수준
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
