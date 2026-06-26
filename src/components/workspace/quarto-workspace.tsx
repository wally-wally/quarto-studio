"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Database, Server } from "lucide-react";
import { normalizeSlug } from "@/lib/documents/slug";
import type { RenderJobRecord, SaveDocumentInput } from "@/lib/documents/types";
import { DocumentSidebar } from "./document-sidebar";
import { EditorPane } from "./editor-pane";
import { PreviewPane } from "./preview-pane";
import type {
  CreateDocumentAction,
  DeleteDocumentAction,
  RenderDocumentAction,
  RenameDocumentAction,
  SelectDocumentAction,
  WorkspaceAction,
  WorkspaceState
} from "./types";

type QuartoWorkspaceProps = {
  initialWorkspace: WorkspaceState;
  saveDocument: WorkspaceAction;
  renderDocument: RenderDocumentAction;
  selectDocument: SelectDocumentAction;
  createDocument: CreateDocumentAction;
  renameDocument: RenameDocumentAction;
  deleteDocument: DeleteDocumentAction;
  getRenderJob: (jobId: string) => Promise<RenderJobRecord | null>;
};

export function QuartoWorkspace({
  initialWorkspace,
  saveDocument,
  renderDocument,
  selectDocument,
  createDocument,
  renameDocument,
  deleteDocument,
  getRenderJob
}: QuartoWorkspaceProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [draft, setDraft] = useState(initialWorkspace.activeDocument);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingDocumentIdRef = useRef<string | null>(null);

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

  const toActionErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

  const runWorkspaceAction = (action: WorkspaceAction) => {
    setActionError(null);
    startTransition(async () => {
      try {
        applyWorkspace(await action(actionInput));
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
    });
  };

  const stopPolling = useCallback(() => {
    setPollingJobId(null);
    setIsPolling(false);
    pollingDocumentIdRef.current = null;
  }, []);

  const handleRender = () => {
    setActionError(null);
    startTransition(async () => {
      try {
        const { workspace: nextWorkspace, jobId } = await renderDocument(actionInput);
        applyWorkspace(nextWorkspace);
        setPollingJobId(jobId);
        setIsPolling(true);
        pollingDocumentIdRef.current = actionInput.id;
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
    });
  };

  useEffect(() => {
    if (!pollingJobId || !isPolling) return;

    const intervalId = setInterval(async () => {
      try {
        const job = await getRenderJob(pollingJobId);
        if (!job) {
          stopPolling();
          return;
        }

        if (job.status === "succeeded") {
          // 폴링 중 문서 전환이 없었을 때만 workspace 업데이트
          if (pollingDocumentIdRef.current === draft.id) {
            setWorkspace((prev) => {
              const updated: typeof prev = {
                ...prev,
                activeDocument: {
                  ...prev.activeDocument,
                  renderStatus: "success",
                  latestArtifactId: job.artifactId,
                  renderError: null,
                  renderedAt: job.finishedAt
                }
              };
              return updated;
            });
            setDraft((prev) => ({
              ...prev,
              renderStatus: "success",
              latestArtifactId: job.artifactId,
              renderError: null,
              renderedAt: job.finishedAt
            }));
          }
          stopPolling();
        } else if (job.status === "failed" || job.status === "timed_out") {
          if (pollingDocumentIdRef.current === draft.id) {
            setWorkspace((prev) => ({
              ...prev,
              activeDocument: {
                ...prev.activeDocument,
                renderStatus: "error",
                renderError: job.log,
                renderedAt: null
              }
            }));
            setDraft((prev) => ({
              ...prev,
              renderStatus: "error",
              renderError: job.log,
              renderedAt: null
            }));
          }
          stopPolling();
        }
        // queued/running: 계속 폴링
      } catch {
        // 네트워크 에러 등: 조용히 다음 interval 대기
      }
    }, 1500);

    return () => clearInterval(intervalId);
  }, [pollingJobId, isPolling, getRenderJob, draft.id, stopPolling]);

  const isRendering = draft.renderStatus === "rendering" || isPolling;

  const hasDraftChanges =
    draft.title !== workspace.activeDocument.title ||
    draft.slug !== workspace.activeDocument.slug ||
    draft.content !== workspace.activeDocument.content ||
    draft.executeCode !== workspace.activeDocument.executeCode;

  const saveDraftIfNeeded = async () => {
    if (hasDraftChanges) {
      await saveDocument(actionInput);
    }
  };

  const handleSelectDocument = (documentId: string) => {
    if (documentId === draft.id) {
      return;
    }
    stopPolling();
    setActionError(null);
    startTransition(async () => {
      try {
        if (hasDraftChanges) {
          await saveDocument(actionInput);
        }
        applyWorkspace(await selectDocument(documentId));
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
    });
  };

  const handleCreateDocument = (title: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        await saveDraftIfNeeded();
        applyWorkspace(await createDocument({ title }));
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
    });
  };

  const handleRenameDocument = (documentId: string, title: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        await saveDraftIfNeeded();
        applyWorkspace(
          await renameDocument({
            id: documentId,
            title,
            activeDocumentId: draft.id
          })
        );
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
    });
  };

  const handleDeleteDocument = (documentId: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        if (hasDraftChanges && documentId !== draft.id) {
          await saveDocument(actionInput);
        }
        applyWorkspace(
          await deleteDocument({
            id: documentId,
            activeDocumentId: draft.id
          })
        );
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
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
            Postgres
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
          isBusy={isPending}
          onSelectDocument={handleSelectDocument}
          onCreateDocument={handleCreateDocument}
          onRenameDocument={handleRenameDocument}
          onDeleteDocument={handleDeleteDocument}
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
          onRender={handleRender}
        />
        <PreviewPane
          document={draft}
          isBusy={isPending}
          isRendering={isRendering}
          onRender={handleRender}
        />
      </div>
      {actionError ? (
        <div className="workspace-action-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>작업을 완료하지 못했습니다: {actionError}</span>
        </div>
      ) : null}
    </main>
  );
}
