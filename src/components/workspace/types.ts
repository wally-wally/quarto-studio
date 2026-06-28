import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  DocumentRecord,
  DocumentSummary,
  RenameDocumentInput,
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

export type CreateDocumentAction = (
  input: CreateDocumentInput
) => Promise<WorkspaceState>;

export type RenameDocumentAction = (
  input: RenameDocumentInput
) => Promise<WorkspaceState>;

export type DeleteDocumentAction = (
  input: DeleteDocumentInput
) => Promise<WorkspaceState>;

export type RenderDocumentAction = (
  input: SaveDocumentInput
) => Promise<{ workspace: WorkspaceState; jobId: string }>;

export type CancelRenderAction = (
  documentId: string
) => Promise<WorkspaceState>;
