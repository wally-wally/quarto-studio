import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { formatRenderedAt, PreviewPane } from "./preview-pane";
import type { DocumentRecord } from "@/lib/documents/types";

const baseDoc: DocumentRecord = {
  id: "doc-1",
  title: "T",
  slug: "t",
  content: "",
  executeCode: false,
  renderStatus: "rendering",
  latestArtifactId: null,
  renderError: null,
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z",
  renderedAt: null,
};

describe("PreviewPane 렌더 중단 버튼", () => {
  const baseProps = { document: baseDoc, isBusy: true, onRender: vi.fn(), onDownload: vi.fn() };

  it("렌더링 중이면 중단 버튼을 보여주고(isBusy여도 활성) 클릭 시 onCancelRender를 호출한다", () => {
    const onCancelRender = vi.fn();
    render(<PreviewPane {...baseProps} isRendering onCancelRender={onCancelRender} />);
    fireEvent.click(screen.getByRole("button", { name: "렌더 중단" }));
    expect(onCancelRender).toHaveBeenCalledTimes(1);
  });

  it("렌더링 중이 아니면 중단 버튼이 없다", () => {
    render(<PreviewPane {...baseProps} isRendering={false} onCancelRender={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "렌더 중단" })).toBeNull();
  });
});

describe("formatRenderedAt", () => {
  it("UTC ISO를 'YYYY-MM-DD HH:mm:ss'로 포맷한다", () => {
    expect(formatRenderedAt("2026-06-27T12:51:28.276Z")).toBe("2026-06-27 12:51:28");
  });

  it("한 자리 월·일·시·분·초를 0으로 패딩한다", () => {
    expect(formatRenderedAt("2026-01-05T03:07:09.000Z")).toBe("2026-01-05 03:07:09");
  });

  it("파싱할 수 없는 값은 원본을 그대로 반환한다", () => {
    expect(formatRenderedAt("not-a-date")).toBe("not-a-date");
  });
});
