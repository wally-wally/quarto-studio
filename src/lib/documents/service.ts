import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  DocumentRecord,
  DocumentSummary,
  RenderJobRecord,
  RenameDocumentInput,
  SaveDocumentInput,
} from "./types";

type DocumentRepository = {
  listDocuments(): Promise<DocumentSummary[]>;
  getDocument(id: string): Promise<DocumentRecord | null>;
  getOrCreateSeedDocument(): Promise<DocumentRecord>;
  createDocument(input: CreateDocumentInput): Promise<DocumentRecord>;
  renameDocument(input: Pick<RenameDocumentInput, "id" | "title">): Promise<DocumentRecord>;
  deleteDocument(id: string): Promise<void>;
  updateDocument(input: SaveDocumentInput): Promise<DocumentRecord>;
  enqueueRenderJob(input: { documentId: string; contentSnapshot: string; executeCode: boolean }): Promise<{ jobId: string }>;
  getRenderJob(jobId: string): Promise<RenderJobRecord | null>;
};

export type WorkspaceState = {
  documents: DocumentSummary[];
  activeDocument: DocumentRecord;
};

type Dependencies = {
  repository: DocumentRepository;
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

export function createDocumentService({ repository }: Dependencies) {
  const buildWorkspace = async (activeDocument: DocumentRecord): Promise<WorkspaceState> => ({
    documents: await repository.listDocuments(),
    activeDocument,
  });

  return {
    async getInitialWorkspace(): Promise<WorkspaceState> {
      return buildWorkspace(await repository.getOrCreateSeedDocument());
    },

    async getWorkspace(documentId: string): Promise<WorkspaceState> {
      return buildWorkspace(assertDocument(await repository.getDocument(documentId), documentId));
    },

    async saveDocument(input: SaveDocumentInput): Promise<WorkspaceState> {
      return buildWorkspace(await repository.updateDocument(input));
    },

    async createDocument(input: CreateDocumentInput): Promise<WorkspaceState> {
      return buildWorkspace(await repository.createDocument(input));
    },

    async renameDocument(input: RenameDocumentInput): Promise<WorkspaceState> {
      const renamedDocument = await repository.renameDocument({
        id: input.id,
        title: input.title,
      });
      const activeDocument =
        input.id === input.activeDocumentId
          ? renamedDocument
          : assertDocument(
              await repository.getDocument(input.activeDocumentId),
              input.activeDocumentId,
            );

      return buildWorkspace(activeDocument);
    },

    async deleteDocument(input: DeleteDocumentInput): Promise<WorkspaceState> {
      await repository.deleteDocument(input.id);

      const documents = await repository.listDocuments();
      if (documents.length === 0) {
        return buildWorkspace(await repository.createDocument({ title: "새 문서" }));
      }

      const nextActiveDocumentId =
        input.id === input.activeDocumentId ? documents[0].id : input.activeDocumentId;

      return buildWorkspace(
        assertDocument(await repository.getDocument(nextActiveDocumentId), nextActiveDocumentId),
      );
    },

    async renderDocument(input: SaveDocumentInput): Promise<WorkspaceState> {
      const savedDocument = await repository.updateDocument(input);
      await repository.enqueueRenderJob({
        documentId: savedDocument.id,
        contentSnapshot: input.content,
        executeCode: input.executeCode,
      });
      return buildWorkspace(assertDocument(await repository.getDocument(savedDocument.id), savedDocument.id));
    },

    async getRenderJob(jobId: string): Promise<RenderJobRecord | null> {
      return repository.getRenderJob(jobId);
    },
  };
}
