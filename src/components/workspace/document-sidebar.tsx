import { useState } from "react";
import { Check, FilePlus, FileText, Pencil, Search, Trash2, X } from "lucide-react";
import type { DocumentSummary } from "@/lib/documents/types";

type DocumentSidebarProps = {
  documents: DocumentSummary[];
  activeDocumentId: string;
  isBusy: boolean;
  onSelectDocument: (documentId: string) => void;
  onCreateDocument: (title: string) => void;
  onRenameDocument: (documentId: string, title: string) => void;
  onDeleteDocument: (documentId: string) => void;
};

const statusLabel: Record<DocumentSummary["renderStatus"], string> = {
  idle: "대기",
  rendering: "렌더링",
  success: "완료",
  error: "오류"
};

export function DocumentSidebar({
  documents,
  activeDocumentId,
  isBusy,
  onSelectDocument,
  onCreateDocument,
  onRenameDocument,
  onDeleteDocument
}: DocumentSidebarProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(
    null
  );
  const [editingTitle, setEditingTitle] = useState("");

  const openCreateDialog = () => {
    setNewDocumentTitle("");
    setIsCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setNewDocumentTitle("");
  };

  const submitNewDocument = () => {
    const title = newDocumentTitle.trim();
    if (!title) {
      return;
    }

    closeCreateDialog();
    onCreateDocument(title);
  };

  const startRename = (document: DocumentSummary) => {
    setEditingDocumentId(document.id);
    setEditingTitle(document.title);
  };

  const cancelRename = () => {
    setEditingDocumentId(null);
    setEditingTitle("");
  };

  const submitRename = (document: DocumentSummary) => {
    const title = editingTitle.trim();
    if (!title || title === document.title) {
      cancelRename();
      return;
    }

    cancelRename();
    onRenameDocument(document.id, title);
  };

  const confirmDelete = (document: DocumentSummary) => {
    const canDelete = window.confirm(
      `${document.title} 문서를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
    );
    if (canDelete) {
      onDeleteDocument(document.id);
    }
  };

  return (
    <aside className="document-sidebar" aria-label="문서 목록">
      <div className="lnb-top">
        <button
          className="lnb-new-button"
          type="button"
          aria-label="새 문서 만들기"
          title="새 문서 만들기"
          disabled={isBusy}
          onClick={openCreateDialog}
        >
          <FilePlus size={14} aria-hidden="true" />
          새 문서
        </button>
      </div>
      <div className="lnb-search">
        <label className="search-field">
          <Search size={14} aria-hidden="true" />
          <input
            aria-label="문서 검색 준비 중"
            placeholder="문서 검색..."
            readOnly
          />
        </label>
      </div>
      <div className="sidebar-header">
        <span>문서함</span>
      </div>
      <div className="document-list">
        {documents.map((document) => {
          const isActive = document.id === activeDocumentId;
          const isEditing = document.id === editingDocumentId;

          return (
            <div
              className={`document-item ${isActive ? "active" : ""}`}
              key={document.id}
            >
              <span className="document-doc-icon" aria-hidden="true">
                <FileText size={14} />
              </span>
              {isEditing ? (
                <form
                  className="document-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitRename(document);
                  }}
                >
                  <input
                    aria-label={`${document.title} 제목 수정`}
                    autoFocus
                    value={editingTitle}
                    disabled={isBusy}
                    onBlur={() => submitRename(document)}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                  <button
                    className="document-action-button"
                    type="submit"
                    aria-label={`${document.title} 제목 저장`}
                    title="제목 저장"
                    disabled={isBusy || editingTitle.trim().length === 0}
                  >
                    <Check size={14} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <button
                  className="document-title-button"
                  type="button"
                  aria-label={`${document.title} 열기`}
                  aria-current={isActive ? "page" : undefined}
                  disabled={isBusy}
                  onClick={() => onSelectDocument(document.id)}
                >
                  <strong>{document.title}</strong>
                  <span>
                    QMD · {document.executeCode ? "코드 실행" : "코드 미실행"} ·{" "}
                    {statusLabel[document.renderStatus]}
                  </span>
                </button>
              )}
              <div className="document-actions">
                {isEditing ? (
                  <button
                    className="document-action-button"
                    type="button"
                    aria-label={`${document.title} 제목 편집 취소`}
                    title="편집 취소"
                    disabled={isBusy}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={cancelRename}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    className="document-action-button"
                    type="button"
                    aria-label={`${document.title} 제목 편집`}
                    title="제목 편집"
                    disabled={isBusy}
                    onClick={() => startRename(document)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                )}
                <button
                  className="document-action-button danger"
                  type="button"
                  aria-label={`${document.title} 삭제`}
                  title="삭제"
                  disabled={isBusy}
                  onClick={() => confirmDelete(document)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {isCreateDialogOpen ? (
        <div className="sidebar-dialog-backdrop">
          <form
            className="sidebar-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-document-title"
            onSubmit={(event) => {
              event.preventDefault();
              submitNewDocument();
            }}
          >
            <div className="sidebar-dialog-header">
              <h2 id="create-document-title">새 문서</h2>
              <button
                className="document-action-button"
                type="button"
                aria-label="새 문서 dialog 닫기"
                title="닫기"
                disabled={isBusy}
                onClick={closeCreateDialog}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <label className="sidebar-field">
              <span>제목</span>
              <input
                aria-label="새 문서 제목"
                autoFocus
                value={newDocumentTitle}
                disabled={isBusy}
                onChange={(event) => setNewDocumentTitle(event.target.value)}
              />
            </label>
            <div className="sidebar-dialog-actions">
              <button
                className="ghost-button"
                type="button"
                disabled={isBusy}
                onClick={closeCreateDialog}
              >
                취소
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={isBusy || newDocumentTitle.trim().length === 0}
              >
                생성
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
