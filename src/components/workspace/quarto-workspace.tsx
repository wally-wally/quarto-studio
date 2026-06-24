"use client";

import { useMemo, useState, useTransition } from "react";
import { Database, Server } from "lucide-react";
import { normalizeSlug } from "@/lib/documents/slug";
import type { SaveDocumentInput } from "@/lib/documents/types";
import { DocumentSidebar } from "./document-sidebar";
import { EditorPane } from "./editor-pane";
import { PreviewPane } from "./preview-pane";
import type {
  SelectDocumentAction,
  WorkspaceAction,
  WorkspaceState
} from "./types";

type QuartoWorkspaceProps = {
  initialWorkspace: WorkspaceState;
  saveDocument: WorkspaceAction;
  renderDocument: WorkspaceAction;
  selectDocument: SelectDocumentAction;
};

export function QuartoWorkspace({
  initialWorkspace,
  saveDocument,
  renderDocument,
  selectDocument
}: QuartoWorkspaceProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [draft, setDraft] = useState(initialWorkspace.activeDocument);
  const [isPending, startTransition] = useTransition();

  const actionInput = useMemo<SaveDocumentInput>(
    () => ({
      id: draft.id,
      title: draft.title,
      slug: normalizeSlug(draft.slug || draft.title, draft.id),
      content: draft.content,
      executeCode: draft.executeCode
    }),
    [draft]
  );

  const applyWorkspace = (nextWorkspace: WorkspaceState) => {
    setWorkspace(nextWorkspace);
    setDraft(nextWorkspace.activeDocument);
  };

  const runWorkspaceAction = (action: WorkspaceAction) => {
    startTransition(async () => {
      applyWorkspace(await action(actionInput));
    });
  };

  const handleSelectDocument = (documentId: string) => {
    startTransition(async () => {
      applyWorkspace(await selectDocument(documentId));
    });
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>Quarto Studio</span>
        </div>
        <div className="topbar-status" aria-label="작업 환경">
          <span className="status-pill">
            <Database size={14} aria-hidden="true" />
            SQLite
          </span>
          <span className="status-pill">
            <Server size={14} aria-hidden="true" />
            Node 24
          </span>
          <span className="status-pill">QMD</span>
        </div>
      </header>
      <div className="workspace-grid">
        <DocumentSidebar
          documents={workspace.documents}
          activeDocumentId={draft.id}
          onSelectDocument={handleSelectDocument}
        />
        <EditorPane
          title={draft.title}
          slug={draft.slug}
          content={draft.content}
          executeCode={draft.executeCode}
          isBusy={isPending}
          onTitleChange={(title) =>
            setDraft((current) => ({ ...current, title }))
          }
          onSlugChange={(slug) =>
            setDraft((current) => ({ ...current, slug }))
          }
          onContentChange={(content) =>
            setDraft((current) => ({ ...current, content }))
          }
          onExecuteCodeChange={(executeCode) =>
            setDraft((current) => ({ ...current, executeCode }))
          }
          onSave={() => runWorkspaceAction(saveDocument)}
          onRender={() => runWorkspaceAction(renderDocument)}
        />
        <PreviewPane
          document={draft}
          isBusy={isPending}
          onRender={() => runWorkspaceAction(renderDocument)}
        />
      </div>
    </main>
  );
}
