import { Play } from "lucide-react";
import CodeEditor from "./code-editor";

type EditorPaneProps = {
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  isBusy: boolean;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onExecuteCodeChange: (value: boolean) => void;
  onRender: () => void;
};

export function EditorPane({
  title,
  slug,
  content,
  executeCode,
  isBusy,
  onTitleChange,
  onSlugChange,
  onContentChange,
  onExecuteCodeChange,
  onRender
}: EditorPaneProps) {
  return (
    <section className="workspace-pane editor-pane" aria-label="QMD 에디터">
      <div className="pane-header">
        <div className="title-fields">
          <input
            aria-label="문서 제목"
            className="title-input"
            disabled={isBusy}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <input
            aria-label="문서 slug"
            className="slug-input"
            disabled={isBusy}
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
          />
        </div>
        <div className="pane-actions">
          <button
            aria-label="코드 실행"
            aria-checked={executeCode}
            className="seg-control"
            disabled={isBusy}
            role="switch"
            type="button"
            onClick={() => onExecuteCodeChange(!executeCode)}
          >
            <span className={`seg-item ${executeCode ? "active" : ""}`}>코드 실행</span>
            <span className={`seg-item ${executeCode ? "" : "active"}`}>미실행</span>
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onRender}
            disabled={isBusy}
          >
            <Play size={16} aria-hidden="true" />
            렌더
          </button>
        </div>
      </div>
      <CodeEditor
        value={content}
        onChange={onContentChange}
        readOnly={isBusy}
      />
    </section>
  );
}
