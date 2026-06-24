import type { RenderResult } from "@/lib/quarto/render";
import { renderDocumentToHtml } from "@/lib/quarto/render";
import type { DocumentRecord, DocumentSummary, SaveDocumentInput } from "./types";

type DocumentRepository = {
  listDocuments(): DocumentSummary[];
  getDocument(id: string): DocumentRecord | null;
  getOrCreateSeedDocument(): DocumentRecord;
  updateDocument(input: SaveDocumentInput): DocumentRecord;
  markRendering(id: string): void;
  markRenderSuccess(id: string, renderedHtml: string): void;
  markRenderError(id: string, renderError: string): void;
};

export type WorkspaceState = {
  documents: DocumentSummary[];
  activeDocument: DocumentRecord;
};

type Dependencies = {
  repository: DocumentRepository;
  renderDocument?: (document: DocumentRecord) => Promise<RenderResult>;
};

function assertDocument(
  document: DocumentRecord | null,
  documentId: string,
): DocumentRecord {
  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  return document;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDocumentService({
  repository,
  renderDocument = renderDocumentToHtml,
}: Dependencies) {
  const buildWorkspace = (activeDocument: DocumentRecord): WorkspaceState => ({
    documents: repository.listDocuments(),
    activeDocument,
  });

  return {
    getInitialWorkspace(): WorkspaceState {
      return buildWorkspace(repository.getOrCreateSeedDocument());
    },

    getWorkspace(documentId: string): WorkspaceState {
      return buildWorkspace(assertDocument(repository.getDocument(documentId), documentId));
    },

    saveDocument(input: SaveDocumentInput): WorkspaceState {
      return buildWorkspace(repository.updateDocument(input));
    },

    async renderDocument(input: SaveDocumentInput): Promise<WorkspaceState> {
      const savedDocument = repository.updateDocument(input);

      repository.markRendering(savedDocument.id);

      try {
        const result = await renderDocument(savedDocument);

        if (result.ok) {
          repository.markRenderSuccess(savedDocument.id, result.html);
        } else {
          repository.markRenderError(savedDocument.id, result.error);
        }
      } catch (error) {
        repository.markRenderError(savedDocument.id, toErrorMessage(error));
      }

      const latestDocument = assertDocument(
        repository.getDocument(savedDocument.id),
        savedDocument.id,
      );

      return buildWorkspace(latestDocument);
    },
  };
}
