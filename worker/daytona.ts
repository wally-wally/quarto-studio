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
    ephemeral: true, // 정지 시 자동 삭제
    autoStopInterval: 5, // 워커 크래시로 삭제를 놓친 고아 sandbox 안전망(분)
    networkBlockAll: true, // 기존 --network none과 동일 보안 수준
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
