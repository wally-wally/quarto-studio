import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuartoWorkspace } from "./quarto-workspace";
import type { WorkspaceState } from "./types";

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
    renderedHtml: "<h1>Getting Started</h1>",
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
    deleteDocument: vi.fn(async () => workspace)
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

  it("코드 실행 toggle과 저장 액션을 호출한다", async () => {
    const user = userEvent.setup();
    const saveDocument = vi.fn(async () => workspace);

    renderWorkspace({ saveDocument });

    await user.click(screen.getByRole("switch", { name: "코드 실행" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({ executeCode: true })
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

  it("저장 액션이 실패하면 한국어 안내와 오류 메시지를 alert로 보여준다", async () => {
    const user = userEvent.setup();
    const saveDocument = vi.fn(async () => {
      throw new Error("database unavailable");
    });

    renderWorkspace({ saveDocument });

    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "작업을 완료하지 못했습니다: database unavailable"
    );
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
        renderedHtml: "",
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
        renderedHtml: "",
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
});
