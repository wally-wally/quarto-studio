import { describe, expect, it, vi } from "vitest";
import { createDocumentService } from "./service";
import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  DocumentRecord,
  DocumentSummary,
  RenderJobRecord,
  RenameDocumentInput,
  SaveDocumentInput,
} from "./types";

const baseTimestamp = "2026-06-24T00:00:00.000Z";
const TEST_OWNER_ID = "user-123";

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    slug: document.slug,
    executeCode: document.executeCode,
    renderStatus: document.renderStatus,
    updatedAt: document.updatedAt,
    renderedAt: document.renderedAt,
  };
}

function createDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    title: "Getting Started",
    slug: "getting-started",
    content: "# Getting Started",
    executeCode: false,
    renderStatus: "idle",
    latestArtifactId: null,
    renderError: null,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    renderedAt: null,
    ...overrides,
  };
}

function createMockRepository(initialDocuments: DocumentRecord[]) {
  const documents = new Map(
    initialDocuments.map((document) => [document.id, { ...document }]),
  );
  const seedDocument = initialDocuments[0] ?? createDocument();

  return {
    listDocuments: vi.fn(async (_ownerId: string) =>
      [...documents.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(toSummary),
    ),
    getDocument: vi.fn(async (_ownerId: string, id: string) => {
      const document = documents.get(id);
      return document ? { ...document } : null;
    }),
    getOrCreateSeedDocument: vi.fn(async (_ownerId: string) => {
      const existing = [...documents.values()][0];
      if (existing) {
        return { ...existing };
      }

      documents.set(seedDocument.id, { ...seedDocument });
      return { ...seedDocument };
    }),
    updateDocument: vi.fn(async (_ownerId: string, input: SaveDocumentInput) => {
      const existing = documents.get(input.id);
      if (!existing) {
        throw new Error(`Document not found: ${input.id}`);
      }

      const updated: DocumentRecord = {
        ...existing,
        ...input,
        renderStatus: "idle",
        renderError: null,
        updatedAt: "2026-06-24T01:00:00.000Z",
      };
      documents.set(input.id, updated);

      return { ...updated };
    }),
    createDocument: vi.fn(async (_ownerId: string, input: CreateDocumentInput) => {
      const document = createDocument({
        id: `doc-${documents.size + 1}`,
        title: input.title,
        slug: input.title.toLowerCase().replace(/\s+/g, "-"),
        content: `# ${input.title}`,
        updatedAt: "2026-06-24T01:00:00.000Z",
      });
      documents.set(document.id, document);

      return { ...document };
    }),
    renameDocument: vi.fn(async (_ownerId: string, input: Pick<RenameDocumentInput, "id" | "title">) => {
      const existing = documents.get(input.id);
      if (!existing) {
        throw new Error(`Document not found: ${input.id}`);
      }

      const renamed: DocumentRecord = {
        ...existing,
        title: input.title,
        updatedAt: "2026-06-24T01:00:00.000Z",
      };
      documents.set(input.id, renamed);

      return { ...renamed };
    }),
    deleteDocument: vi.fn(async (_ownerId: string, id: DeleteDocumentInput["id"]) => {
      if (!documents.delete(id)) {
        throw new Error(`Document not found: ${id}`);
      }
    }),
    enqueueRenderJob: vi.fn(async (_input: { ownerId: string; documentId: string; contentSnapshot: string; executeCode: boolean }) => {
      // After enqueueing, update the document in our mock to show 'rendering'
      const doc = documents.get(_input.documentId);
      if (doc) {
        documents.set(_input.documentId, { ...doc, renderStatus: "rendering" });
      }
      return { jobId: "job-1" };
    }),
    getRenderJob: vi.fn(async (_jobId: string): Promise<RenderJobRecord | null> => null),
    cancelDocumentRenders: vi.fn(async (_ownerId: string, _documentId: string) => ({ canceledCount: 0 })),
  };
}

describe("document service", () => {
  it("초기 workspace에 seed 문서와 문서 목록을 포함한다", async () => {
    const seedDocument = createDocument();
    const repository = createMockRepository([seedDocument]);
    const service = createDocumentService({ repository });

    const workspace = await service.getInitialWorkspace(TEST_OWNER_ID);

    expect(repository.getOrCreateSeedDocument).toHaveBeenCalledWith(TEST_OWNER_ID);
    expect(repository.listDocuments).toHaveBeenCalledWith(TEST_OWNER_ID);
    expect(workspace.activeDocument).toEqual(seedDocument);
    expect(workspace.documents).toEqual([toSummary(seedDocument)]);
  });

  it("새 문서를 만들면 생성된 문서를 active document로 반환한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const service = createDocumentService({ repository });

    const workspace = await service.createDocument(TEST_OWNER_ID, { title: "새 문서" });

    expect(repository.createDocument).toHaveBeenCalledWith(TEST_OWNER_ID, { title: "새 문서" });
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-2",
        title: "새 문서",
      }),
    );
    expect(workspace.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "doc-2", title: "새 문서" }),
      ]),
    );
  });

  it("active 문서의 제목을 수정하면 같은 문서를 active로 유지한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const service = createDocumentService({ repository });

    const workspace = await service.renameDocument(TEST_OWNER_ID, {
      id: "doc-1",
      title: "수정된 제목",
      activeDocumentId: "doc-1",
    });

    expect(repository.renameDocument).toHaveBeenCalledWith(TEST_OWNER_ID, {
      id: "doc-1",
      title: "수정된 제목",
    });
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-1",
        title: "수정된 제목",
      }),
    );
  });

  it("비활성 문서의 제목을 수정하면 기존 active 문서를 유지한다", async () => {
    const activeDocument = createDocument();
    const sidebarDocument = createDocument({
      id: "doc-2",
      title: "Sidebar Note",
      slug: "sidebar-note",
    });
    const repository = createMockRepository([activeDocument, sidebarDocument]);
    const service = createDocumentService({ repository });

    const workspace = await service.renameDocument(TEST_OWNER_ID, {
      id: "doc-2",
      title: "목록에서 수정",
      activeDocumentId: "doc-1",
    });

    expect(workspace.activeDocument).toEqual(activeDocument);
    expect(workspace.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "doc-2", title: "목록에서 수정" }),
      ]),
    );
  });

  it("active 문서를 삭제하면 목록의 다음 문서를 active로 선택한다", async () => {
    const firstDocument = createDocument();
    const nextDocument = createDocument({
      id: "doc-2",
      title: "Next Document",
      slug: "next-document",
      updatedAt: "2026-06-24T00:30:00.000Z",
    });
    const repository = createMockRepository([firstDocument, nextDocument]);
    const service = createDocumentService({ repository });

    const workspace = await service.deleteDocument(TEST_OWNER_ID, {
      id: "doc-1",
      activeDocumentId: "doc-1",
    });

    expect(repository.deleteDocument).toHaveBeenCalledWith(TEST_OWNER_ID, "doc-1");
    expect(workspace.activeDocument).toEqual(nextDocument);
    expect(workspace.documents).toEqual([toSummary(nextDocument)]);
  });

  it("마지막 문서를 삭제하면 새 기본 문서를 만들어 active로 반환한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const service = createDocumentService({ repository });

    const workspace = await service.deleteDocument(TEST_OWNER_ID, {
      id: "doc-1",
      activeDocumentId: "doc-1",
    });

    expect(repository.createDocument).toHaveBeenCalledWith(TEST_OWNER_ID, { title: "새 문서" });
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-1",
        title: "새 문서",
      }),
    );
    expect(workspace.documents).toEqual([
      expect.objectContaining({ id: "doc-1", title: "새 문서" }),
    ]);
  });

  it("renderDocument는 updateDocument 후 enqueueRenderJob을 호출하고 rendering 상태를 반환한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const service = createDocumentService({ repository });

    const workspace = await service.renderDocument(TEST_OWNER_ID, {
      id: "doc-1",
      title: "Quarterly Report",
      slug: "quarterly-report",
      content: "# Quarterly Report",
      executeCode: true,
    });

    expect(repository.updateDocument).toHaveBeenCalledWith(
      TEST_OWNER_ID,
      expect.objectContaining({
        id: "doc-1",
        title: "Quarterly Report",
        content: "# Quarterly Report",
        executeCode: true,
      }),
    );
    expect(repository.enqueueRenderJob).toHaveBeenCalledWith({
      ownerId: TEST_OWNER_ID,
      documentId: "doc-1",
      contentSnapshot: "# Quarterly Report",
      executeCode: true,
    });
    expect(workspace.workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-1",
        renderStatus: "rendering",
      }),
    );
  });

  it("getRenderJob 서비스 메서드가 repository.getRenderJob을 호출한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const mockJob: RenderJobRecord = {
      id: "job-1",
      documentId: "doc-1",
      status: "queued",
      log: null,
      artifactId: null,
      createdAt: baseTimestamp,
      finishedAt: null,
      phase: null,
    };
    repository.getRenderJob.mockResolvedValueOnce(mockJob);
    const service = createDocumentService({ repository });

    const result = await service.getRenderJob("job-1");

    expect(repository.getRenderJob).toHaveBeenCalledWith("job-1");
    expect(result).toEqual(mockJob);
  });

  it("cancelRender는 cancelDocumentRenders를 호출하고 워크스페이스를 반환한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const service = createDocumentService({ repository });

    const workspace = await service.cancelRender(TEST_OWNER_ID, "doc-1");

    expect(repository.cancelDocumentRenders).toHaveBeenCalledWith(TEST_OWNER_ID, "doc-1");
    expect(workspace.activeDocument).toEqual(expect.objectContaining({ id: "doc-1" }));
  });
});
