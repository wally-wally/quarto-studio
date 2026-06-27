import { AlertCircle, Download, FileText, RefreshCw } from "lucide-react";
import type { DocumentRecord } from "@/lib/documents/types";

type PreviewPaneProps = {
  document: DocumentRecord;
  isBusy: boolean;
  isRendering: boolean;
  onRender: () => void;
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

export function PreviewPane({
  document,
  isBusy,
  isRendering,
  onRender,
  onDownload
}: PreviewPaneProps) {
  return (
    <section className="workspace-pane preview-pane" aria-label="렌더 미리보기">
      <div className="pane-header">
        <div>
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
          <FileText size={40} aria-hidden="true" />
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
