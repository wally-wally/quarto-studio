"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { EditorView } from "@codemirror/view";
import { AlertCircle, Settings } from "lucide-react";
import { SettingsModal } from "@/components/settings/settings-modal";
import { useAiGeneration } from "./use-ai-generation";
import { normalizeSlug } from "@/lib/documents/slug";
import type { RenderJobRecord, SaveDocumentInput } from "@/lib/documents/types";
import { logoutAction } from "@/lib/auth/actions";
import { DocumentSidebar } from "./document-sidebar";
import { EditorPane } from "./editor-pane";
import { PreviewPane } from "./preview-pane";
import type {
  CancelRenderAction,
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
  cancelRender: CancelRenderAction;
  user: { id: string; email: string; name: string | null };
};

export function QuartoWorkspace({
  initialWorkspace,
  saveDocument,
  renderDocument,
  selectDocument,
  createDocument,
  renameDocument,
  deleteDocument,
  getRenderJob,
  cancelRender,
  user
}: QuartoWorkspaceProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [draft, setDraft] = useState(initialWorkspace.activeDocument);
  const [actionError, setActionError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const setDraftContent = useCallback((content: string) => {
    setDraft((current) => ({ ...current, content }));
  }, []);
  // AI 스트리밍을 에디터 뷰에 직접 append(스크롤 튐 방지)하기 위해 EditorView 참조를 보관한다.
  const editorViewRef = useRef<EditorView | null>(null);
  const { generating, handlers: aiHandlers } = useAiGeneration(
    () => draft.content,
    setDraftContent,
    editorViewRef,
  );
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

  // 렌더 중단: 폴링을 멈추고 그 문서의 queued/running 잡을 canceled로 → 상태가 idle로 복구된다.
  // 문서 단위라 새로고침 후 stuck('렌더링 중') 상태에서도 동작한다(jobId 불필요).
  const handleCancelRender = () => {
    setActionError(null);
    stopPolling();
    startTransition(async () => {
      try {
        applyWorkspace(await cancelRender(draft.id));
      } catch (error) {
        setActionError(toActionErrorMessage(error));
      }
    });
  };

  const handleDownload = async () => {
    const artifactId = draft.latestArtifactId;
    if (!artifactId) {
      return;
    }
    try {
      const response = await fetch(`/preview/${artifactId}`);
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const html = await response.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.slug || draft.title || "preview"}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("미리보기 HTML 다운로드에 실패했습니다.");
    }
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
  // 렌더는 비동기다: 잡 등록 transition(isPending) → 워커 처리 폴링(isRendering).
  // 두 구간 모두 편집·문서 이동·재렌더를 잠가, 옛 동기 렌더처럼 "렌더 중엔 다른 동작 불가"를 유지한다.
  const paneBusy = isPending || isRendering || generating;

  const hasDraftChanges =
    draft.title !== workspace.activeDocument.title ||
    actionInput.slug !== workspace.activeDocument.slug ||
    draft.content !== workspace.activeDocument.content ||
    draft.executeCode !== workspace.activeDocument.executeCode;

  // 자동 저장: 편집(draft 변경) 후 일정 시간 idle이면 백그라운드로 저장한다('저장' 버튼 대체).
  // 렌더/문서 전환 시에도 저장되므로, 이는 "편집만 하고 떠나는" 경우의 유실을 막는다.
  // draft는 건드리지 않고 baseline(workspace)만 갱신해, 저장 중 입력한 키를 잃지 않는다.
  useEffect(() => {
    if (!hasDraftChanges || isPending || isRendering) {
      return;
    }
    const timer = setTimeout(() => {
      saveDocument(actionInput)
        .then((saved) => setWorkspace(saved))
        .catch(() => {
          /* 자동 저장 실패는 조용히 — 렌더/전환 시 재시도된다 */
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, [actionInput, hasDraftChanges, isPending, isRendering, saveDocument]);

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
          <div className="topbar-user">
            <span className="topbar-avatar" aria-hidden="true">
              {(user.name?.trim() || user.email).charAt(0).toUpperCase()}
            </span>
            <span className="topbar-username">{user.name ?? user.email}</span>
          </div>
          <button
            type="button"
            aria-label="AI 설정"
            className="ghost-button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} aria-hidden="true" />
          </button>
          <form action={logoutAction}>
            <button type="submit" className="ghost-button">
              로그아웃
            </button>
          </form>
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
          isBusy={paneBusy}
          aiDrawerOpen={aiDrawerOpen}
          aiHandlers={aiHandlers}
          onToggleAiDrawer={() => setAiDrawerOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
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
          onRender={handleRender}
          onEditorReady={(view) => {
            editorViewRef.current = view;
          }}
        />
        <PreviewPane
          document={draft}
          isBusy={paneBusy}
          isRendering={isRendering}
          onRender={handleRender}
          onCancelRender={handleCancelRender}
          onDownload={handleDownload}
        />
      </div>
      {actionError ? (
        <div className="workspace-action-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>작업을 완료하지 못했습니다: {actionError}</span>
        </div>
      ) : null}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
