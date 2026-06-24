import { Play, Save, ToggleLeft, ToggleRight } from "lucide-react";

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
  onSave: () => void;
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
  onSave,
  onRender
}: EditorPaneProps) {
  return (
    <section className="workspace-pane editor-pane" aria-label="QMD 에디터">
      <div className="pane-header">
        <div className="title-fields">
          <input
            aria-label="문서 제목"
            className="title-input"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <input
            aria-label="문서 slug"
            className="slug-input"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
          />
        </div>
        <div className="pane-actions">
          <button
            aria-label="코드 실행"
            aria-checked={executeCode}
            className="toggle-button"
            role="switch"
            type="button"
            onClick={() => onExecuteCodeChange(!executeCode)}
          >
            {executeCode ? (
              <ToggleRight size={18} aria-hidden="true" />
            ) : (
              <ToggleLeft size={18} aria-hidden="true" />
            )}
            {executeCode ? "실행" : "중지"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onSave}
            disabled={isBusy}
          >
            <Save size={16} aria-hidden="true" />
            저장
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
      <textarea
        aria-label="QMD content"
        className="qmd-editor"
        spellCheck={false}
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
      />
    </section>
  );
}
