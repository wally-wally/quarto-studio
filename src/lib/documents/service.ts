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
  listDocuments(ownerId: string): Promise<DocumentSummary[]>;
  getDocument(ownerId: string, id: string): Promise<DocumentRecord | null>;
  getOrCreateSeedDocument(ownerId: string): Promise<DocumentRecord>;
  createDocument(ownerId: string, input: CreateDocumentInput): Promise<DocumentRecord>;
  renameDocument(ownerId: string, input: Pick<RenameDocumentInput, "id" | "title">): Promise<DocumentRecord>;
  deleteDocument(ownerId: string, id: string): Promise<void>;
  updateDocument(ownerId: string, input: SaveDocumentInput): Promise<DocumentRecord>;
  enqueueRenderJob(input: { ownerId: string; documentId: string; contentSnapshot: string; executeCode: boolean }): Promise<{ jobId: string }>;
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
  const buildWorkspace = async (ownerId: string, activeDocument: DocumentRecord): Promise<WorkspaceState> => ({
    documents: await repository.listDocuments(ownerId),
    activeDocument,
  });

  return {
    async getInitialWorkspace(ownerId: string): Promise<WorkspaceState> {
      return buildWorkspace(ownerId, await repository.getOrCreateSeedDocument(ownerId));
    },

    async getWorkspace(ownerId: string, documentId: string): Promise<WorkspaceState> {
      return buildWorkspace(ownerId, assertDocument(await repository.getDocument(ownerId, documentId), documentId));
    },

    async saveDocument(ownerId: string, input: SaveDocumentInput): Promise<WorkspaceState> {
      return buildWorkspace(ownerId, await repository.updateDocument(ownerId, input));
    },

    async createDocument(ownerId: string, input: CreateDocumentInput): Promise<WorkspaceState> {
      return buildWorkspace(ownerId, await repository.createDocument(ownerId, input));
    },

    async renameDocument(ownerId: string, input: RenameDocumentInput): Promise<WorkspaceState> {
      const renamedDocument = await repository.renameDocument(ownerId, {
        id: input.id,
        title: input.title,
      });
      const activeDocument =
        input.id === input.activeDocumentId
          ? renamedDocument
          : assertDocument(
              await repository.getDocument(ownerId, input.activeDocumentId),
              input.activeDocumentId,
            );

      return buildWorkspace(ownerId, activeDocument);
    },

    async deleteDocument(ownerId: string, input: DeleteDocumentInput): Promise<WorkspaceState> {
      await repository.deleteDocument(ownerId, input.id);

      const documents = await repository.listDocuments(ownerId);
      if (documents.length === 0) {
        return buildWorkspace(ownerId, await repository.createDocument(ownerId, { title: "새 문서" }));
      }

      const nextActiveDocumentId =
        input.id === input.activeDocumentId ? documents[0].id : input.activeDocumentId;

      return buildWorkspace(
        ownerId,
        assertDocument(await repository.getDocument(ownerId, nextActiveDocumentId), nextActiveDocumentId),
      );
    },

    async renderDocument(ownerId: string, input: SaveDocumentInput): Promise<{ workspace: WorkspaceState; jobId: string }> {
      const savedDocument = await repository.updateDocument(ownerId, input);
      const { jobId } = await repository.enqueueRenderJob({
        ownerId,
        documentId: savedDocument.id,
        contentSnapshot: input.content,
        executeCode: input.executeCode,
      });
      const workspace = await buildWorkspace(ownerId, assertDocument(await repository.getDocument(ownerId, savedDocument.id), savedDocument.id));
      return { workspace, jobId };
    },

    async getRenderJob(jobId: string): Promise<RenderJobRecord | null> {
      return repository.getRenderJob(jobId);
    },
  };
}
