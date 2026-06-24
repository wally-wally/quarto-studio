import { render, screen } from "@testing-library/react";
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

describe("QuartoWorkspace", () => {
  it("문서 목록, 에디터, preview를 한 화면에 보여준다", () => {
    render(
      <QuartoWorkspace
        initialWorkspace={workspace}
        saveDocument={vi.fn()}
        renderDocument={vi.fn()}
        selectDocument={vi.fn()}
      />
    );

    expect(screen.getByText("Quarto Studio")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("운영 리포트")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Getting Started")).toBeInTheDocument();
    expect(screen.getByTitle("Rendered preview")).toBeInTheDocument();
  });

  it("코드 실행 toggle과 저장 액션을 호출한다", async () => {
    const user = userEvent.setup();
    const saveDocument = vi.fn(async () => workspace);

    render(
      <QuartoWorkspace
        initialWorkspace={workspace}
        saveDocument={saveDocument}
        renderDocument={vi.fn()}
        selectDocument={vi.fn()}
      />
    );

    await user.click(screen.getByRole("switch", { name: "코드 실행" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({ executeCode: true })
    );
  });

  it("렌더링 오류가 있으면 preview pane에 오류를 함께 표시한다", () => {
    render(
      <QuartoWorkspace
        initialWorkspace={{
          ...workspace,
          activeDocument: {
            ...workspace.activeDocument,
            renderStatus: "error",
            renderError: "syntax error"
          }
        }}
        saveDocument={vi.fn()}
        renderDocument={vi.fn()}
        selectDocument={vi.fn()}
      />
    );

    expect(screen.getByText("syntax error")).toBeInTheDocument();
  });

  it("제목과 QMD를 수정한 뒤 렌더하면 draft 내용으로 렌더 액션을 호출한다", async () => {
    const user = userEvent.setup();
    const renderDocument = vi.fn(async () => workspace);

    render(
      <QuartoWorkspace
        initialWorkspace={workspace}
        saveDocument={vi.fn()}
        renderDocument={renderDocument}
        selectDocument={vi.fn()}
      />
    );

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
});
