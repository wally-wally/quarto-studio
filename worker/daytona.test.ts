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
    expect(mocks.del).toHaveBeenCalledWith(mocks.sandbox);
  });

  it("DAYTONA_API_KEY 미설정이면 즉시 실패", async () => {
    delete process.env.DAYTONA_API_KEY;
    const { runQuartoRender } = await importHelper();

    await expect(runQuartoRender(baseOpts)).rejects.toThrow("DAYTONA_API_KEY");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

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
