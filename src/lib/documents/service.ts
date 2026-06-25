import type { RenderResult } from "@/lib/quarto/render";
import { renderDocumentToHtml } from "@/lib/quarto/render";
import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  DocumentRecord,
  DocumentSummary,
  RenameDocumentInput,
  SaveDocumentInput,
} from "./types";

type DocumentRepository = {
  listDocuments(): DocumentSummary[];
  getDocument(id: string): DocumentRecord | null;
  getOrCreateSeedDocument(): DocumentRecord;
  createDocument(input: CreateDocumentInput): DocumentRecord;
  renameDocument(input: Pick<RenameDocumentInput, "id" | "title">): DocumentRecord;
  deleteDocument(id: string): void;
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

    createDocument(input: CreateDocumentInput): WorkspaceState {
      return buildWorkspace(repository.createDocument(input));
    },

    renameDocument(input: RenameDocumentInput): WorkspaceState {
      const renamedDocument = repository.renameDocument({
        id: input.id,
        title: input.title,
      });
      const activeDocument =
        input.id === input.activeDocumentId
          ? renamedDocument
          : assertDocument(
              repository.getDocument(input.activeDocumentId),
              input.activeDocumentId,
            );

      return buildWorkspace(activeDocument);
    },

    deleteDocument(input: DeleteDocumentInput): WorkspaceState {
      repository.deleteDocument(input.id);

      const documents = repository.listDocuments();
      if (documents.length === 0) {
        return buildWorkspace(repository.createDocument({ title: "새 문서" }));
      }

      const nextActiveDocumentId =
        input.id === input.activeDocumentId ? documents[0].id : input.activeDocumentId;

      return buildWorkspace(
        assertDocument(repository.getDocument(nextActiveDocumentId), nextActiveDocumentId),
      );
    },

    async renderDocument(input: SaveDocumentInput): Promise<WorkspaceState> {
      const savedDocument = repository.updateDocument(input);

      repository.markRendering(savedDocument.id);
      let result: RenderResult;

      try {
        result = await renderDocument(savedDocument);
      } catch (error) {
        repository.markRenderError(savedDocument.id, toErrorMessage(error));
        const latestDocument = assertDocument(
          repository.getDocument(savedDocument.id),
          savedDocument.id,
        );

        return buildWorkspace(latestDocument);
      }

      if (result.ok) {
        repository.markRenderSuccess(savedDocument.id, result.html);
      } else {
        repository.markRenderError(savedDocument.id, result.error);
      }

      const latestDocument = assertDocument(
        repository.getDocument(savedDocument.id),
        savedDocument.id,
      );

      return buildWorkspace(latestDocument);
    },
  };
}
