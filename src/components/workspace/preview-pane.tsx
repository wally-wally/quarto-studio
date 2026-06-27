import { AlertCircle, RefreshCw } from "lucide-react";
import type { DocumentRecord } from "@/lib/documents/types";

type PreviewPaneProps = {
  document: DocumentRecord;
  isBusy: boolean;
  isRendering: boolean;
  onRender: () => void;
};

export function PreviewPane({
  document,
  isBusy,
  isRendering,
  onRender
}: PreviewPaneProps) {
  return (
    <section className="workspace-pane preview-pane" aria-label="렌더 미리보기">
      <div className="pane-header">
        <div>
          <h2>미리보기</h2>
          <p>
            {document.renderedAt
              ? `마지막 렌더 ${document.renderedAt}`
              : "아직 렌더되지 않음"}
          </p>
        </div>
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
            렌더링 중…
          </span>
        ) : null}
      </div>
      {document.latestArtifactId ? (
        <iframe
          className="preview-frame"
          sandbox="allow-scripts"
          src={`/preview/${document.latestArtifactId}`}
          title="Rendered preview"
        />
      ) : (
        <div className="preview-placeholder">
          <p>미리보기 없음. 렌더를 실행하면 미리보기가 표시됩니다.</p>
        </div>
      )}
      {document.renderError ? (
        <div className="render-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <pre>{document.renderError}</pre>
        </div>
      ) : null}
    </section>
  );
}
