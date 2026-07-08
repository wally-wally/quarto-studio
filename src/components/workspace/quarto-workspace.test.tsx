import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuartoWorkspace } from "./quarto-workspace";
import type { WorkspaceState } from "./types";

vi.mock("./apply-edits-to-editor", () => ({
  applyToolFrame: vi.fn(() => ({ kind: "write", failed: false })),
}));

function ndjson(frames: object[]): Response {
  const body = frames.map((f) => JSON.stringify(f) + "\n").join("");
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(body));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

// CodeMirror 에디터는 jsdom에서 contenteditable이라 직접 테스트가 어렵다.
// 테스트에선 동등한 textarea(aria-label="QMD content")로 대체한다.
vi.mock("./code-editor", () => ({
  default: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (value: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      aria-label="QMD content"
      value={value}
      disabled={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const workspace: WorkspaceState = {
  documents: [
    {
      id: "doc-1",
      title: "Getting Started",
      slug: "getting-started",
      executeCode: false,
      renderStatus: "success",
      updatedAt: "2026-06-24T00:00:00.000Z",
      renderedAt: "2026-06-24T00:00:00.000Z"
    },
    {
      id: "doc-2",
      title: "운영 리포트",
      slug: "ops-report",
      executeCode: true,
      renderStatus: "idle",
      updatedAt: "2026-06-24T01:00:00.000Z",
      renderedAt: null
    }
  ],
  activeDocument: {
    id: "doc-1",
    title: "Getting Started",
    slug: "getting-started",
    content: "# Getting Started",
    executeCode: false,
    renderStatus: "success",
    latestArtifactId: "artifact-1",
    renderError: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    renderedAt: "2026-06-24T00:00:00.000Z"
  }
};

const renderWorkspace = (
  props: Partial<Parameters<typeof QuartoWorkspace>[0]> = {}
) => {
  const defaultProps = {
    initialWorkspace: workspace,
    saveDocument: vi.fn(async () => workspace),
    renderDocument: vi.fn(async () => ({ workspace, jobId: "job-1" })),
    selectDocument: vi.fn(async () => workspace),
    createDocument: vi.fn(async () => workspace),
    renameDocument: vi.fn(async () => workspace),
    deleteDocument: vi.fn(async () => workspace),
    getRenderJob: vi.fn(async () => null),
    cancelRender: vi.fn(async () => workspace),
    user: { id: "user-1", email: "test@example.com", name: null }
  };

  return render(<QuartoWorkspace {...defaultProps} {...props} />);
};

describe("QuartoWorkspace", () => {
  const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });

    return { promise, resolve, reject };
  };

  it("문서 목록, 에디터, preview를 한 화면에 보여준다", () => {
    renderWorkspace();

    expect(screen.getByText("Quarto Studio")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("운영 리포트")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Getting Started")).toBeInTheDocument();
    expect(screen.getByTitle("Rendered preview")).toBeInTheDocument();
  });

  it("Quarto HTML 후처리 스크립트가 실행되도록 preview iframe에서 script 실행을 허용한다", () => {
    renderWorkspace();

    expect(screen.getByTitle("Rendered preview")).toHaveAttribute(
      "sandbox",
      "allow-scripts"
    );
  });

  it("코드 실행 토글 등 편집 후 자동 저장이 draft를 저장한다", async () => {
    const user = userEvent.setup();
    const saveDocument = vi.fn(async () => workspace);

    renderWorkspace({ saveDocument });

    await user.click(screen.getByRole("switch", { name: "코드 실행" }));

    // 수동 '저장' 버튼은 제거됨 — 편집 후 디바운스 자동 저장이 동작해야 한다.
    await waitFor(
      () =>
        expect(saveDocument).toHaveBeenCalledWith(
          expect.objectContaining({ executeCode: true })
        ),
      { timeout: 2500 }
    );
  });

  it("렌더링 오류가 있으면 preview pane에 오류를 함께 표시한다", () => {
    renderWorkspace({
      initialWorkspace: {
        ...workspace,
        activeDocument: {
          ...workspace.activeDocument,
          renderStatus: "error",
          renderError: "syntax error"
        }
      }
    });

    expect(screen.getByText("syntax error")).toBeInTheDocument();
  });

  it("제목과 QMD를 수정한 뒤 렌더하면 draft 내용으로 렌더 액션을 호출한다", async () => {
    const user = userEvent.setup();
    const renderDocument = vi.fn(async () => ({ workspace, jobId: "job-1" }));

    renderWorkspace({ renderDocument });

    await user.clear(screen.getByLabelText("문서 제목"));
    await user.type(screen.getByLabelText("문서 제목"), "분기 리뷰");
    await user.clear(screen.getByLabelText("QMD content"));
    await user.type(screen.getByLabelText("QMD content"), "# 분기 리뷰");
    await user.click(screen.getByRole("button", { name: "렌더" }));

    expect(renderDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "분기 리뷰",
        content: "# 분기 리뷰"
      })
    );
  });

  it("저장 또는 렌더링이 진행 중이면 draft 입력과 문서 이동을 잠가 최신 로컬 수정을 막는다", async () => {
    const user = userEvent.setup();
    const renderDeferred = createDeferred<{ workspace: WorkspaceState; jobId: string }>();
    const renderDocument = vi.fn(() => renderDeferred.promise);

    renderWorkspace({ renderDocument });

    await user.click(screen.getByRole("button", { name: "렌더" }));

    expect(screen.getByLabelText("문서 제목")).toBeDisabled();
    expect(screen.getByLabelText("문서 slug")).toBeDisabled();
    expect(screen.getByLabelText("QMD content")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "코드 실행" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "운영 리포트 열기" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "미리보기 다시 렌더" })
    ).toBeDisabled();

    renderDeferred.resolve({ workspace, jobId: "job-1" });
  });

  it("문서 이동 전 자동 저장이 실패하면 오류를 표시하고 대상 문서를 선택하지 않는다", async () => {
    const user = userEvent.setup();
    const saveDocument = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    const selectDocument = vi.fn(async () => workspace);

    renderWorkspace({ saveDocument, selectDocument });

    await user.clear(screen.getByLabelText("문서 제목"));
    await user.type(screen.getByLabelText("문서 제목"), "수정한 문서");
    await user.click(screen.getByRole("button", { name: "운영 리포트 열기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "작업을 완료하지 못했습니다: database unavailable"
    );
    expect(selectDocument).not.toHaveBeenCalled();
  });

  it("draft를 수정한 뒤 다른 문서를 선택하면 현재 draft를 먼저 저장하고 대상 문서를 선택한다", async () => {
    const user = userEvent.setup();
    const selectedWorkspace: WorkspaceState = {
      ...workspace,
      activeDocument: {
        id: "doc-2",
        title: "운영 리포트",
        slug: "ops-report",
        content: "# 운영 리포트",
        executeCode: true,
        renderStatus: "idle",
        latestArtifactId: null,
        renderError: null,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z",
        renderedAt: null
      }
    };
    const saveDocument = vi.fn(async () => workspace);
    const selectDocument = vi.fn(async () => selectedWorkspace);

    renderWorkspace({ saveDocument, selectDocument });

    await user.clear(screen.getByLabelText("문서 제목"));
    await user.type(screen.getByLabelText("문서 제목"), "수정한 문서");
    await user.clear(screen.getByLabelText("문서 slug"));
    await user.type(screen.getByLabelText("문서 slug"), "updated-doc");
    await user.clear(screen.getByLabelText("QMD content"));
    await user.type(screen.getByLabelText("QMD content"), "# 수정한 문서");
    await user.click(screen.getByRole("switch", { name: "코드 실행" }));
    await user.click(screen.getByRole("button", { name: "운영 리포트 열기" }));

    await waitFor(() => {
      expect(saveDocument).toHaveBeenCalledWith({
        id: "doc-1",
        title: "수정한 문서",
        slug: "updated-doc",
        content: "# 수정한 문서",
        executeCode: true
      });
      expect(selectDocument).toHaveBeenCalledWith("doc-2");
    });
    expect(saveDocument.mock.invocationCallOrder[0]).toBeLessThan(
      selectDocument.mock.invocationCallOrder[0]
    );
    expect(screen.getByLabelText("문서 제목")).toHaveValue("운영 리포트");
    expect(screen.getByDisplayValue("# 운영 리포트")).toBeInTheDocument();
  });

  it("draft 변경 없이 다른 문서를 선택하면 저장하지 않고 대상 문서만 선택한다", async () => {
    const user = userEvent.setup();
    const selectedWorkspace: WorkspaceState = {
      ...workspace,
      activeDocument: {
        id: "doc-2",
        title: "운영 리포트",
        slug: "ops-report",
        content: "# 운영 리포트",
        executeCode: true,
        renderStatus: "idle",
        latestArtifactId: null,
        renderError: null,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z",
        renderedAt: null
      }
    };
    const saveDocument = vi.fn(async () => workspace);
    const selectDocument = vi.fn(async () => selectedWorkspace);

    renderWorkspace({ saveDocument, selectDocument });

    await user.click(screen.getByRole("button", { name: "운영 리포트 열기" }));

    await waitFor(() => {
      expect(selectDocument).toHaveBeenCalledWith("doc-2");
    });
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it("새 문서 버튼을 누르면 제목 입력 dialog에서 문서를 생성한다", async () => {
    const user = userEvent.setup();
    const createDocument = vi.fn(async () => workspace);

    renderWorkspace({ createDocument });

    await user.click(screen.getByRole("button", { name: "새 문서 만들기" }));
    await user.type(screen.getByLabelText("새 문서 제목"), "새 분석 문서");
    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(createDocument).toHaveBeenCalledWith({ title: "새 분석 문서" });
  });

  it("사이드바에서 문서 제목을 inline으로 수정한다", async () => {
    const user = userEvent.setup();
    const renameDocument = vi.fn(async () => workspace);

    renderWorkspace({ renameDocument });

    await user.click(
      screen.getByRole("button", { name: "Getting Started 제목 편집" })
    );
    await user.clear(screen.getByLabelText("Getting Started 제목 수정"));
    await user.type(
      screen.getByLabelText("Getting Started 제목 수정"),
      "수정된 제목"
    );
    await user.keyboard("{Enter}");

    expect(renameDocument).toHaveBeenCalledWith({
      id: "doc-1",
      title: "수정된 제목",
      activeDocumentId: "doc-1"
    });
  });

  it("문서 삭제 전에 확인을 받고 active document id와 함께 삭제한다", async () => {
    const user = userEvent.setup();
    const deleteDocument = vi.fn(async () => workspace);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWorkspace({ deleteDocument });

    await user.click(screen.getByRole("button", { name: "Getting Started 삭제" }));

    expect(confirm).toHaveBeenCalledWith(
      "Getting Started 문서를 삭제할까요? 이 작업은 되돌릴 수 없습니다."
    );
    expect(deleteDocument).toHaveBeenCalledWith({
      id: "doc-1",
      activeDocumentId: "doc-1"
    });

    confirm.mockRestore();
  });

  it("문서 검색은 아직 읽기 전용으로 노출한다", () => {
    renderWorkspace();

    expect(screen.getByLabelText("문서 검색 준비 중")).toHaveAttribute(
      "readonly"
    );
  });

  it("렌더 후 폴링으로 succeeded 상태가 되면 프리뷰 HTML이 갱신된다", async () => {
    vi.useFakeTimers();

    const succeededJob = {
      id: "job-1",
      documentId: "doc-1",
      status: "succeeded" as const,
      log: null,
      artifactId: "artifact-new",
      createdAt: "2026-06-24T00:00:00.000Z",
      finishedAt: "2026-06-24T00:01:00.000Z"
    };

    const getRenderJob = vi.fn()
      .mockResolvedValueOnce({ ...succeededJob, status: "running" as const, artifactId: null })
      .mockResolvedValueOnce(succeededJob);

    const renderDocument = vi.fn(async () => ({ workspace, jobId: "job-1" }));

    renderWorkspace({ renderDocument, getRenderJob });

    // 렌더 버튼 클릭 — startTransition 내 async 완료까지 act로 flush
    await act(async () => {
      screen.getByRole("button", { name: "렌더" }).click();
    });

    // 첫 번째 폴링 (running → 계속 폴링)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getRenderJob).toHaveBeenCalledTimes(1);

    // 두 번째 폴링 (succeeded → 중단)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getRenderJob).toHaveBeenCalledTimes(2);

    vi.useRealTimers();

    // 프리뷰 iframe이 새 artifact URL로 갱신됐는지 확인 (real timers 복원 후)
    await waitFor(() => {
      expect(screen.getByTitle("Rendered preview")).toHaveAttribute(
        "src",
        "/preview/artifact-new"
      );
    });
  });

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

  // 회귀 테스트: stopPolling()이 renderPhase를 null로 되돌리던 시절엔, failed/timed_out
  // 처리 직후 호출되는 stopPolling()이 같은 tick에서 setRenderPhase(job.phase)를 덮어써
  // 에러 phase 라벨이 영영 표시되지 않았다.
  it("폴링이 phase가 있는 상태로 실패하면 에러 phase 라벨이 표시된다", async () => {
    vi.useFakeTimers();

    const getRenderJob = vi.fn().mockResolvedValueOnce({
      id: "job-1",
      documentId: "doc-1",
      status: "failed" as const,
      log: "execution error: division by zero",
      artifactId: null,
      createdAt: "2026-06-24T00:00:00.000Z",
      finishedAt: "2026-06-24T00:01:00.000Z",
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

    expect(
      screen.getByText("코드 실행 중 오류가 발생했습니다")
    ).toBeInTheDocument();
    expect(screen.getByText("execution error: division by zero")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("상단바의 AI 설정 버튼을 누르면 설정 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "AI 설정" }));
    expect(await screen.findByRole("dialog", { name: "AI 설정" })).toBeInTheDocument();
  });

  it("에디터 툴바의 AI 작성 버튼이 드로어를 토글한다", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "AI 작성 열기" }));
    expect(screen.getByLabelText("AI 메시지 입력")).toBeInTheDocument();
  });

  it("다른 문서로 이동하면 AI 드로어가 닫히고 메시지가 초기화된다", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "quarto-studio:ai-settings",
      JSON.stringify({
        provider: "anthropic",
        anthropic: { apiKey: "sk", model: "claude-sonnet-4-6" },
        openai: { apiKey: "", model: "" },
      }),
    );
    // /api/ai/chat 스트림 응답 mock (delta + done — tool 프레임은 이 테스트에 불필요)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjson([
          { type: "delta", text: "네, 도와드릴게요." },
          { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );

    const selectedWorkspace: WorkspaceState = {
      ...workspace,
      activeDocument: {
        id: "doc-2",
        title: "운영 리포트",
        slug: "ops-report",
        content: "# 운영 리포트",
        executeCode: true,
        renderStatus: "idle",
        latestArtifactId: null,
        renderError: null,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z",
        renderedAt: null
      }
    };
    renderWorkspace({ selectDocument: vi.fn(async () => selectedWorkspace) });

    // 드로어 열기 → 메시지 전송 → 보낸 메시지가 채팅에 보인다
    await user.click(screen.getByRole("button", { name: "AI 작성 열기" }));
    await user.type(screen.getByLabelText("AI 메시지 입력"), "초기화 테스트 메시지");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("초기화 테스트 메시지")).toBeInTheDocument();

    // 다른 문서로 이동 → 드로어가 닫힌다(메시지 입력창 사라짐)
    await user.click(screen.getByRole("button", { name: "운영 리포트 열기" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("AI 메시지 입력")).not.toBeInTheDocument();
    });

    // 다시 열면 채팅이 비어 있다(resetChat으로 초기화):
    // 보낸 메시지는 사라지고 빈 상태 안내가 다시 보인다.
    await user.click(screen.getByRole("button", { name: "AI 작성 열기" }));
    expect(screen.getByLabelText("AI 메시지 입력")).toBeInTheDocument();
    expect(screen.queryByText("초기화 테스트 메시지")).toBeNull();
    expect(screen.getByText(/만들고 싶은/)).toBeTruthy();
  });

  it("AI가 편집한 뒤 다른 문서로 이동하면 확인을 거친다(취소=머무름, 확인=이동)", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "quarto-studio:ai-settings",
      JSON.stringify({
        provider: "anthropic",
        anthropic: { apiKey: "sk", model: "claude-sonnet-4-6" },
        openai: { apiKey: "", model: "" },
      }),
    );
    // /api/ai/chat 스트림 응답 mock (delta + tool + done)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjson([
          { type: "delta", text: "문서를 만들었어요." },
          { type: "tool", name: "write_document", input: { content: "# 새 문서" } },
          { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );

    const selectedWorkspace: WorkspaceState = {
      ...workspace,
      activeDocument: {
        id: "doc-2",
        title: "운영 리포트",
        slug: "ops-report",
        content: "# 운영 리포트",
        executeCode: true,
        renderStatus: "idle",
        latestArtifactId: null,
        renderError: null,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T01:00:00.000Z",
        renderedAt: null,
      },
    };
    const selectDocument = vi.fn(async () => selectedWorkspace);
    renderWorkspace({ selectDocument });

    // AI 드로어 열기 → textarea에 입력 후 Enter로 전송 → AI가 편집(tool 프레임) → aiEditedThisSession=true
    await user.click(screen.getByRole("button", { name: "AI 작성 열기" }));
    const textarea = screen.getByLabelText("AI 메시지 입력");
    await user.type(textarea, "테스트");
    await user.keyboard("{Enter}");

    // tool 프레임 처리 후 aiEditedThisSession이 true가 될 때까지 대기
    await waitFor(() => expect(vi.mocked(global.fetch)).toHaveBeenCalled());
    // done 프레임 처리 완료 (generating이 false로 전환)까지 대기
    await waitFor(() => expect(screen.queryByRole("button", { name: "중단" })).not.toBeInTheDocument(), { timeout: 3000 });

    // 취소 → 머무름(이동 안 함)
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "운영 리포트 열기" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(selectDocument).not.toHaveBeenCalled();

    // 확인 → 이동
    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "운영 리포트 열기" }));
    await waitFor(() => expect(selectDocument).toHaveBeenCalledWith("doc-2"));

    confirmSpy.mockRestore();
  });

  it("문서 전환 시 진행 중인 폴링이 정리된다", async () => {
    vi.useFakeTimers();

    // 폴링이 계속 running을 반환하는 mock
    const getRenderJob = vi.fn().mockResolvedValue({
      id: "job-1",
      documentId: "doc-1",
      status: "running" as const,
      log: null,
      artifactId: null,
      createdAt: "2026-06-24T00:00:00.000Z",
      finishedAt: null
    });

    const renderDocument = vi.fn(async () => ({ workspace, jobId: "job-1" }));
    const selectDocument = vi.fn(async () => workspace);

    renderWorkspace({ renderDocument, getRenderJob, selectDocument });

    // 렌더 버튼 클릭
    await act(async () => {
      screen.getByRole("button", { name: "렌더" }).click();
    });

    // 폴링 1회
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getRenderJob).toHaveBeenCalledTimes(1);

    // 문서 전환 → stopPolling 호출
    await act(async () => {
      screen.getByRole("button", { name: "운영 리포트 열기" }).click();
    });

    // 추가로 3000ms 경과해도 폴링이 더 이상 호출되지 않음
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(getRenderJob).toHaveBeenCalledTimes(1); // 여전히 1회
  });
});
