import { describe, expect, it, vi } from "vitest";
import type { RenderResult } from "@/lib/quarto/render";
import { createDocumentService } from "./service";
import type {
  DocumentRecord,
  DocumentSummary,
  SaveDocumentInput,
} from "./types";

const baseTimestamp = "2026-06-24T00:00:00.000Z";

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
    renderedHtml: null,
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
    listDocuments: vi.fn(() =>
      [...documents.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(toSummary),
    ),
    getDocument: vi.fn((id: string) => {
      const document = documents.get(id);
      return document ? { ...document } : null;
    }),
    getOrCreateSeedDocument: vi.fn(() => {
      const existing = [...documents.values()][0];
      if (existing) {
        return { ...existing };
      }

      documents.set(seedDocument.id, { ...seedDocument });
      return { ...seedDocument };
    }),
    updateDocument: vi.fn((input: SaveDocumentInput) => {
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
    markRendering: vi.fn((id: string) => {
      const existing = documents.get(id);
      if (!existing) {
        throw new Error(`Document not found: ${id}`);
      }

      documents.set(id, { ...existing, renderStatus: "rendering", renderError: null });
    }),
    markRenderSuccess: vi.fn((id: string, renderedHtml: string) => {
      const existing = documents.get(id);
      if (!existing) {
        throw new Error(`Document not found: ${id}`);
      }

      documents.set(id, {
        ...existing,
        renderStatus: "success",
        renderedHtml,
        renderError: null,
        renderedAt: "2026-06-24T02:00:00.000Z",
      });
    }),
    markRenderError: vi.fn((id: string, renderError: string) => {
      const existing = documents.get(id);
      if (!existing) {
        throw new Error(`Document not found: ${id}`);
      }

      documents.set(id, { ...existing, renderStatus: "error", renderError });
    }),
  };
}

describe("document service", () => {
  it("초기 workspace에 seed 문서와 문서 목록을 포함한다", () => {
    const seedDocument = createDocument();
    const repository = createMockRepository([seedDocument]);
    const service = createDocumentService({ repository });

    const workspace = service.getInitialWorkspace();

    expect(repository.getOrCreateSeedDocument).toHaveBeenCalledOnce();
    expect(repository.listDocuments).toHaveBeenCalledOnce();
    expect(workspace.activeDocument).toEqual(seedDocument);
    expect(workspace.documents).toEqual([toSummary(seedDocument)]);
  });

  it("렌더링 전에 문서를 저장하고 성공 HTML을 workspace에 저장한다", async () => {
    const repository = createMockRepository([createDocument()]);
    const renderDocument = vi.fn(
      async (document: DocumentRecord): Promise<RenderResult> => ({
        ok: true,
        html: `<h1>${document.title}</h1>`,
        log: "rendered",
      }),
    );
    const service = createDocumentService({ repository, renderDocument });

    const workspace = await service.renderDocument({
      id: "doc-1",
      title: "Quarterly Report",
      slug: "quarterly-report",
      content: "# Quarterly Report",
      executeCode: true,
    });

    expect(repository.updateDocument).toHaveBeenCalledBefore(repository.markRendering);
    expect(repository.markRendering).toHaveBeenCalledWith("doc-1");
    expect(renderDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        title: "Quarterly Report",
        content: "# Quarterly Report",
        executeCode: true,
        renderStatus: "idle",
      }),
    );
    expect(repository.markRenderSuccess).toHaveBeenCalledWith(
      "doc-1",
      "<h1>Quarterly Report</h1>",
    );
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-1",
        title: "Quarterly Report",
        renderStatus: "success",
        renderedHtml: "<h1>Quarterly Report</h1>",
        renderError: null,
      }),
    );
    expect(workspace.documents).toEqual([
      expect.objectContaining({
        id: "doc-1",
        title: "Quarterly Report",
        renderStatus: "success",
      }),
    ]);
  });

  it("렌더링 실패를 저장하고 마지막 성공 HTML을 유지한다", async () => {
    const repository = createMockRepository([
      createDocument({
        renderedHtml: "<h1>Previous Success</h1>",
        renderedAt: "2026-06-24T00:30:00.000Z",
      }),
    ]);
    const renderDocument = vi.fn(
      async (): Promise<RenderResult> => ({
        ok: false,
        error: "syntax error",
        log: "syntax error",
      }),
    );
    const service = createDocumentService({ repository, renderDocument });

    const workspace = await service.renderDocument({
      id: "doc-1",
      title: "Broken Report",
      slug: "broken-report",
      content: "# Broken\n\n```{r}\n",
      executeCode: true,
    });

    expect(repository.updateDocument).toHaveBeenCalledBefore(repository.markRendering);
    expect(repository.markRenderError).toHaveBeenCalledWith("doc-1", "syntax error");
    expect(repository.markRenderSuccess).not.toHaveBeenCalled();
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-1",
        title: "Broken Report",
        renderStatus: "error",
        renderedHtml: "<h1>Previous Success</h1>",
        renderError: "syntax error",
      }),
    );
    expect(workspace.documents).toEqual([
      expect.objectContaining({
        id: "doc-1",
        renderStatus: "error",
      }),
    ]);
  });

  it("렌더링 성공 상태 저장 오류는 렌더링 오류로 대체하지 않고 전파한다", async () => {
    const repository = createMockRepository([createDocument()]);
    repository.markRenderSuccess.mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });
    const renderDocument = vi.fn(
      async (): Promise<RenderResult> => ({
        ok: true,
        html: "<h1>Rendered</h1>",
        log: "rendered",
      }),
    );
    const service = createDocumentService({ repository, renderDocument });

    await expect(
      service.renderDocument({
        id: "doc-1",
        title: "Quarterly Report",
        slug: "quarterly-report",
        content: "# Quarterly Report",
        executeCode: false,
      }),
    ).rejects.toThrow("database unavailable");

    expect(renderDocument).toHaveBeenCalledOnce();
    expect(repository.markRenderSuccess).toHaveBeenCalledWith(
      "doc-1",
      "<h1>Rendered</h1>",
    );
    expect(repository.markRenderError).not.toHaveBeenCalled();
  });

  it("렌더러 예외를 렌더링 오류로 저장하고 최신 workspace를 반환한다", async () => {
    const repository = createMockRepository([
      createDocument({
        renderedHtml: "<h1>Previous Success</h1>",
        renderedAt: "2026-06-24T00:30:00.000Z",
      }),
    ]);
    const renderDocument = vi.fn(async (): Promise<RenderResult> => {
      throw new Error("failed to create temp dir");
    });
    const service = createDocumentService({ repository, renderDocument });

    const workspace = await service.renderDocument({
      id: "doc-1",
      title: "IO Failure Report",
      slug: "io-failure-report",
      content: "# IO Failure",
      executeCode: false,
    });

    expect(repository.updateDocument).toHaveBeenCalledBefore(repository.markRendering);
    expect(repository.markRenderError).toHaveBeenCalledWith(
      "doc-1",
      "failed to create temp dir",
    );
    expect(repository.markRenderSuccess).not.toHaveBeenCalled();
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        id: "doc-1",
        title: "IO Failure Report",
        renderStatus: "error",
        renderedHtml: "<h1>Previous Success</h1>",
        renderError: "failed to create temp dir",
      }),
    );
    expect(workspace.documents).toEqual([
      expect.objectContaining({
        id: "doc-1",
        renderStatus: "error",
      }),
    ]);
  });
});
