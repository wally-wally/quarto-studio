import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createDocumentRepository, ensureDocumentSchema } from "./repository";

const openMemoryRepository = () => {
  const db = new Database(":memory:");
  ensureDocumentSchema(db);
  return { db, repository: createDocumentRepository(db) };
};

describe("document repository", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) {
      db.close();
    }
  });

  it("첫 실행용 seed 문서를 생성하고 다시 호출하면 같은 문서를 반환한다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);

    const first = repository.getOrCreateSeedDocument();
    const second = repository.getOrCreateSeedDocument();

    expect(first.id).toBe(second.id);
    expect(first.title).toBe("Getting Started");
    expect(repository.listDocuments()).toHaveLength(1);
  });

  it("문서 내용을 저장하고 다시 조회한다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);
    const document = repository.getOrCreateSeedDocument();

    const saved = repository.updateDocument({
      id: document.id,
      title: "Analytics Report",
      slug: "analytics-report",
      content: "# Analytics\n\nBody",
      executeCode: true
    });

    expect(saved.title).toBe("Analytics Report");
    expect(saved.executeCode).toBe(true);
    expect(repository.getDocument(document.id)?.content).toContain("Body");
  });

  it("렌더링 성공과 실패 상태를 저장한다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);
    const document = repository.getOrCreateSeedDocument();

    repository.markRendering(document.id);
    expect(repository.getDocument(document.id)?.renderStatus).toBe("rendering");

    repository.markRenderSuccess(
      document.id,
      "<h1>Done</h1>",
      "2026-06-24T00:00:00.000Z"
    );
    const success = repository.getDocument(document.id);
    expect(success?.renderStatus).toBe("success");
    expect(success?.renderedHtml).toBe("<h1>Done</h1>");

    repository.markRenderError(document.id, "quarto failed");
    const failure = repository.getDocument(document.id);
    expect(failure?.renderStatus).toBe("error");
    expect(failure?.renderedHtml).toBe("<h1>Done</h1>");
    expect(failure?.renderError).toBe("quarto failed");
  });
});
