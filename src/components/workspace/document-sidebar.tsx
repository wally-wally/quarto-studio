import { FilePlus, Search } from "lucide-react";
import type { DocumentSummary } from "@/lib/documents/types";

type DocumentSidebarProps = {
  documents: DocumentSummary[];
  activeDocumentId: string;
  onSelectDocument: (documentId: string) => void;
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
  onSelectDocument
}: DocumentSidebarProps) {
  return (
    <aside className="document-sidebar" aria-label="문서 목록">
      <div className="sidebar-header">
        <span>문서함</span>
        <button
          className="icon-button"
          type="button"
          aria-label="새 문서 준비 중"
          disabled
        >
          <FilePlus size={16} aria-hidden="true" />
        </button>
      </div>
      <label className="search-field">
        <Search size={15} aria-hidden="true" />
        <input
          aria-label="문서 검색 준비 중"
          placeholder="문서 검색"
          readOnly
        />
      </label>
      <div className="document-list">
        {documents.map((document) => (
          <button
            className={`document-item ${
              document.id === activeDocumentId ? "active" : ""
            }`}
            key={document.id}
            type="button"
            onClick={() => onSelectDocument(document.id)}
          >
            <strong>{document.title}</strong>
            <span>
              QMD · {document.executeCode ? "코드 실행" : "코드 미실행"} ·{" "}
              {statusLabel[document.renderStatus]}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
