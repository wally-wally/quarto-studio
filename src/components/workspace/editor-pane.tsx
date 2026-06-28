import { Play, Sparkles } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import CodeEditor from "./code-editor";
import { AiDrawer, type AiGenerationHandlers } from "./ai-drawer";

type EditorPaneProps = {
  documentId: string;
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  isBusy: boolean;
  aiDrawerOpen: boolean;
  aiHandlers: AiGenerationHandlers;
  onToggleAiDrawer: () => void;
  onOpenSettings: () => void;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onExecuteCodeChange: (value: boolean) => void;
  onRender: () => void;
  onEditorReady?: (view: EditorView) => void;
};

export function EditorPane({
  documentId,
  title,
  slug,
  content,
  executeCode,
  isBusy,
  aiDrawerOpen,
  aiHandlers,
  onToggleAiDrawer,
  onOpenSettings,
  onTitleChange,
  onSlugChange,
  onContentChange,
  onExecuteCodeChange,
  onRender,
  onEditorReady,
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
            type="button"
            aria-label="AI 작성 열기"
            aria-pressed={aiDrawerOpen}
            className="seg-control"
            onClick={onToggleAiDrawer}
          >
            <span className={`seg-item ${aiDrawerOpen ? "active" : ""}`}>
              <Sparkles size={14} aria-hidden="true" />
              AI 작성
            </span>
          </button>
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
          <button className="primary-button" type="button" onClick={onRender} disabled={isBusy}>
            <Play size={16} aria-hidden="true" />
            렌더
          </button>
        </div>
      </div>
      <CodeEditor
        key={documentId}
        value={content}
        onChange={onContentChange}
        readOnly={isBusy}
        onCreateEditor={onEditorReady}
      />
      <AiDrawer
        key={documentId}
        open={aiDrawerOpen}
        onToggle={onToggleAiDrawer}
        isBusy={isBusy}
        onOpenSettings={onOpenSettings}
        handlers={aiHandlers}
      />
    </section>
  );
}
