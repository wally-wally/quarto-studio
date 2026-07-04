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
  // 화살표 함수는 new로 호출할 수 없으므로(TypeError: not a constructor),
  // Daytona가 `new Daytona(...)`로 생성되는 실제 SDK 사용 패턴을 그대로 mock하려면
  // vi.fn에 일반 함수 표현식을 넘겨야 한다.
  Daytona: vi.fn(function () {
    return { create: mocks.create, delete: mocks.del };
  }),
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
