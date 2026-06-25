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

  it("문서 내용을 수정하면 마지막 성공 preview를 유지한 채 렌더링 필요 상태로 바꾼다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);
    const document = repository.getOrCreateSeedDocument();

    repository.markRenderSuccess(
      document.id,
      "<h1>Previous</h1>",
      "2026-06-24T00:00:00.000Z"
    );
    repository.markRenderError(document.id, "old error");

    const saved = repository.updateDocument({
      id: document.id,
      title: "Updated Report",
      slug: "updated-report",
      content: "# Updated",
      executeCode: false
    });

    expect(saved.renderStatus).toBe("idle");
    expect(saved.renderError).toBeNull();
    expect(saved.renderedHtml).toBe("<h1>Previous</h1>");
    expect(saved.renderedAt).toBe("2026-06-24T00:00:00.000Z");
  });

  it("구조 분해한 updateDocument도 문서를 저장하고 반환한다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);
    const document = repository.getOrCreateSeedDocument();
    const { updateDocument } = repository;

    const saved = updateDocument({
      id: document.id,
      title: "Destructured Update",
      slug: "destructured-update",
      content: "# Destructured",
      executeCode: true
    });

    expect(saved.title).toBe("Destructured Update");
    expect(repository.getDocument(document.id)?.content).toBe("# Destructured");
  });

  it("새 문서를 생성할 때 제목 기반 기본 콘텐츠와 고유 slug를 저장한다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);

    const created = repository.createDocument({ title: "새 분석 문서" });

    expect(created.title).toBe("새 분석 문서");
    expect(created.slug).toMatch(/^document-/);
    expect(created.content).toContain('title: "새 분석 문서"');
    expect(created.executeCode).toBe(true);
    expect(created.renderStatus).toBe("idle");
    expect(repository.getDocument(created.id)?.content).toContain(
      "# 새 분석 문서"
    );
  });

  it("같은 영문 제목으로 문서를 만들면 slug suffix를 붙인다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);

    const second = repository.createDocument({ title: "Quarterly Report" });
    const third = repository.createDocument({ title: "Quarterly Report" });

    expect(second.slug).toBe("quarterly-report");
    expect(third.slug).toBe("quarterly-report-2");
  });

  it("문서 제목만 수정하고 문서를 삭제한다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);
    const created = repository.createDocument({ title: "원본 제목" });

    const renamed = repository.renameDocument({
      id: created.id,
      title: "수정된 제목"
    });
    repository.deleteDocument(created.id);

    expect(renamed.title).toBe("수정된 제목");
    expect(renamed.slug).toBe(created.slug);
    expect(renamed.content).toBe(created.content);
    expect(repository.getDocument(created.id)).toBeNull();
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

  it("존재하지 않는 문서의 렌더링 상태 변경은 오류를 던진다", () => {
    const { db, repository } = openMemoryRepository();
    databases.push(db);

    expect(() => repository.markRendering("missing")).toThrow(
      "Document not found: missing"
    );
    expect(() => repository.markRenderSuccess("missing", "<h1>Done</h1>")).toThrow(
      "Document not found: missing"
    );
    expect(() => repository.markRenderError("missing", "quarto failed")).toThrow(
      "Document not found: missing"
    );
  });
});
