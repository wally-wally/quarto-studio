import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { formatRenderedAt, PreviewPane, renderPhaseLabel } from "./preview-pane";
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

  it("renderPhase가 preparing이면 '샌드박스 준비 중...'을 보여준다", () => {
    render(<PreviewPane {...baseProps} isRendering renderPhase="preparing" onCancelRender={vi.fn()} />);
    expect(screen.getByText("샌드박스 준비 중...")).toBeInTheDocument();
  });

  it("renderPhase가 executing이면 '코드 실행 중...'을 보여준다", () => {
    render(<PreviewPane {...baseProps} isRendering renderPhase="executing" onCancelRender={vi.fn()} />);
    expect(screen.getByText("코드 실행 중...")).toBeInTheDocument();
  });

  it("렌더링 중이 아니면 중단 버튼이 없다", () => {
    render(<PreviewPane {...baseProps} isRendering={false} onCancelRender={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "렌더 중단" })).toBeNull();
  });
});

describe("PreviewPane 전체 화면 버튼", () => {
  const baseProps = {
    isBusy: false,
    isRendering: false,
    onRender: vi.fn(),
    onCancelRender: vi.fn(),
    onDownload: vi.fn(),
  };

  it("렌더 결과가 있으면 전체 화면 버튼을 보여주고 클릭 시 iframe.requestFullscreen을 호출한다", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    // jsdom은 requestFullscreen 미구현 — iframe 프로토타입에 주입한다.
    HTMLIFrameElement.prototype.requestFullscreen = requestFullscreen;

    render(<PreviewPane {...baseProps} document={{ ...baseDoc, latestArtifactId: "artifact-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "미리보기 전체 화면" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("렌더 결과가 없으면 전체 화면 버튼이 없다", () => {
    render(<PreviewPane {...baseProps} document={baseDoc} />);
    expect(screen.queryByRole("button", { name: "미리보기 전체 화면" })).toBeNull();
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
