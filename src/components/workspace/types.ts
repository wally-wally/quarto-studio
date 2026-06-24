import type {
  DocumentRecord,
  DocumentSummary,
  SaveDocumentInput
} from "@/lib/documents/types";

export type WorkspaceState = {
  documents: DocumentSummary[];
  activeDocument: DocumentRecord;
};

export type WorkspaceAction = (
  input: SaveDocumentInput
) => Promise<WorkspaceState>;

export type SelectDocumentAction = (
  documentId: string
) => Promise<WorkspaceState>;
