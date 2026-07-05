import { AlertCircle, Download, FileText, Maximize2, RefreshCw, X } from "lucide-react";
import { useRef } from "react";
import type { DocumentRecord } from "@/lib/documents/types";

type PreviewPaneProps = {
  document: DocumentRecord;
  isBusy: boolean;
  isRendering: boolean;
  renderPhase?: "preparing" | "executing" | null;
  onRender: () => void;
  onCancelRender: () => void;
  onDownload: () => void;
};

// 렌더 시각(UTC ISO)을 'YYYY-MM-DD HH:mm:ss'로 표기한다. getUTC*를 써서
// 서버/클라이언트 출력이 동일하므로(하이드레이션 불일치 없음) 저장된 UTC 값을 그대로 보여준다.
export function formatRenderedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

// 렌더 중/실패 시 현재 단계를 문구로. phase는 worker가 render_jobs.phase에 기록한 값을
// 폴링으로 그대로 받은 것 — sandbox 준비(preparing)와 코드 실행(executing) 두 단계만 구분한다.
export function renderPhaseLabel(
  mode: "running" | "error",
  phase: "preparing" | "executing" | null
): string {
  if (mode === "running") {
    if (phase === "preparing") return "샌드박스 준비 중...";
    if (phase === "executing") return "코드 실행 중...";
    return "렌더링 중...";
  }
  if (phase === "preparing") return "샌드박스 준비 중 오류가 발생했습니다";
  if (phase === "executing") return "코드 실행 중 오류가 발생했습니다";
  return "";
}

export function PreviewPane({
  document,
  isBusy,
  isRendering,
  renderPhase = null,
  onRender,
  onCancelRender,
  onDownload
}: PreviewPaneProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 렌더된 미리보기(iframe)를 브라우저 전체 화면으로. Esc로 빠져나온다.
  const handleFullscreen = () => {
    frameRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <section className="workspace-pane preview-pane" aria-label="렌더 미리보기">
      <div className="pane-header">
        <div className="pane-title">
          <h2>미리보기</h2>
          <p>
            {document.renderedAt
              ? `마지막 렌더 ${formatRenderedAt(document.renderedAt)}`
              : "아직 렌더되지 않음"}
          </p>
        </div>
        <div className="preview-actions">
          {document.latestArtifactId ? (
            <button
              className="ghost-button"
              type="button"
              onClick={onDownload}
              disabled={isBusy}
              aria-label="렌더 결과 HTML 다운로드"
            >
              <Download size={16} aria-hidden="true" />
              다운로드
            </button>
          ) : null}
          {document.latestArtifactId ? (
            <button
              className="ghost-button"
              type="button"
              onClick={handleFullscreen}
              aria-label="미리보기 전체 화면"
            >
              <Maximize2 size={16} aria-hidden="true" />
              전체 화면
            </button>
          ) : null}
          <button
            className="ghost-button"
            type="button"
            onClick={onRender}
            disabled={isBusy}
            aria-label="미리보기 다시 렌더"
          >
            <RefreshCw size={16} aria-hidden="true" />
            다시 렌더
          </button>
          {isRendering ? (
            <span className="rendering-indicator" aria-live="polite">
              {renderPhaseLabel("running", renderPhase)}
            </span>
          ) : null}
          {isRendering ? (
            // 중단 버튼은 isBusy로 비활성화하지 않는다 — 무한 렌더에서 빠져나오는 탈출구.
            <button
              className="ghost-button preview-cancel"
              type="button"
              onClick={onCancelRender}
              aria-label="렌더 중단"
            >
              <X size={16} aria-hidden="true" />
              중단
            </button>
          ) : null}
        </div>
      </div>
      {document.latestArtifactId ? (
        <iframe
          ref={frameRef}
          className="preview-frame"
          sandbox="allow-scripts"
          src={`/preview/${document.latestArtifactId}`}
          title="Rendered preview"
        />
      ) : (
        <div className="preview-placeholder">
          <FileText size={40} aria-hidden="true" />
          <p>렌더를 실행하면 미리보기가 표시됩니다.</p>
        </div>
      )}
      {document.renderError ? (
        <div className="render-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <div>
            {renderPhaseLabel("error", renderPhase) ? (
              <p className="render-error-phase">{renderPhaseLabel("error", renderPhase)}</p>
            ) : null}
            <pre>{document.renderError}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
