import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDocumentRepository } from "./repository";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://quarto:quarto@localhost:5432/quarto_studio";
const sql = postgres(DATABASE_URL);
const repository = createDocumentRepository(sql);

afterAll(async () => {
  await sql.end();
});

beforeEach(async () => {
  await sql`TRUNCATE documents, render_jobs, artifacts RESTART IDENTITY CASCADE`;
});

describe("document repository", () => {
  it("첫 실행용 seed 문서를 생성하고 다시 호출하면 같은 문서를 반환한다", async () => {
    const first = await repository.getOrCreateSeedDocument();
    const second = await repository.getOrCreateSeedDocument();

    expect(first.id).toBe(second.id);
    expect(first.title).toBe("Getting Started");
    expect(first.slug).toBe("getting-started");
    expect(await repository.listDocuments()).toHaveLength(1);
  });

  it("새 문서를 생성할 때 제목 기반 기본 콘텐츠와 고유 slug를 저장한다", async () => {
    const created = await repository.createDocument({ title: "새 분석 문서" });

    expect(created.title).toBe("새 분석 문서");
    expect(created.slug).toMatch(/^document-/);
    expect(created.content).toContain('title: "새 분석 문서"');
    expect(created.executeCode).toBe(true);
    expect(created.renderStatus).toBe("idle");
    const fetched = await repository.getDocument(created.id);
    expect(fetched?.content).toContain("# 새 분석 문서");
  });

  it("문서 내용을 저장하고 다시 조회한다", async () => {
    const document = await repository.getOrCreateSeedDocument();

    const saved = await repository.updateDocument({
      id: document.id,
      title: "Analytics Report",
      slug: "analytics-report",
      content: "# Analytics\n\nBody",
      executeCode: true,
    });

    expect(saved.title).toBe("Analytics Report");
    expect(saved.executeCode).toBe(true);
    const fetched = await repository.getDocument(document.id);
    expect(fetched?.content).toContain("Body");
  });

  it("같은 영문 제목으로 문서를 만들면 slug suffix를 붙인다", async () => {
    const second = await repository.createDocument({ title: "Quarterly Report" });
    const third = await repository.createDocument({ title: "Quarterly Report" });

    expect(second.slug).toBe("quarterly-report");
    expect(third.slug).toBe("quarterly-report-2");
  });

  it("문서 제목만 수정하고 문서를 삭제한다", async () => {
    const created = await repository.createDocument({ title: "원본 제목" });

    const renamed = await repository.renameDocument({
      id: created.id,
      title: "수정된 제목",
    });
    await repository.deleteDocument(created.id);

    expect(renamed.title).toBe("수정된 제목");
    expect(renamed.slug).toBe(created.slug);
    expect(renamed.content).toBe(created.content);
    expect(await repository.getDocument(created.id)).toBeNull();
  });

  it("render status derivation: no job → idle; enqueue → rendering; succeeded → success", async () => {
    const doc = await repository.getOrCreateSeedDocument();

    // No job → idle
    expect(doc.renderStatus).toBe("idle");
    expect(doc.latestArtifactId).toBeNull();

    // Enqueue job → rendering
    await repository.enqueueRenderJob({
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });
    const afterEnqueue = await repository.getDocument(doc.id);
    expect(afterEnqueue?.renderStatus).toBe("rendering");

    // Manually insert succeeded job + artifact (simulating what the worker does)
    await sql`
      INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code, finished_at)
      VALUES (${doc.id}, 'succeeded', ${doc.content}, false, now())
    `;
    const artifactId = randomUUID();
    await sql`
      INSERT INTO artifacts (id, document_id, storage_key)
      VALUES (${artifactId}, ${doc.id}, ${artifactId + ".html"})
    `;
    await sql`
      UPDATE documents SET latest_artifact_id = ${artifactId} WHERE id = ${doc.id}
    `;
    const afterSuccess = await repository.getDocument(doc.id);
    expect(afterSuccess?.renderStatus).toBe("success");
    expect(afterSuccess?.latestArtifactId).toBe(artifactId);
  });

  it("enqueueRenderJob이 jobId를 반환하고 getRenderJob이 RenderJobRecord를 반환한다", async () => {
    const doc = await repository.getOrCreateSeedDocument();

    const { jobId } = await repository.enqueueRenderJob({
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    expect(jobId).toBeTruthy();

    const job = await repository.getRenderJob(jobId);
    expect(job).not.toBeNull();
    expect(job?.status).toBe("queued");
    expect(job?.documentId).toBe(doc.id);
    expect(job?.log).toBeNull();
    expect(job?.artifactId).toBeNull();
  });

  it("문서 삭제 시 render_jobs도 cascade 삭제된다", async () => {
    const doc = await repository.getOrCreateSeedDocument();
    const { jobId } = await repository.enqueueRenderJob({
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    await repository.deleteDocument(doc.id);

    expect(await repository.getRenderJob(jobId)).toBeNull();
  });

  it("재렌더 중(queued)에도 직전 latestArtifactId가 유지된다", async () => {
    const doc = await repository.getOrCreateSeedDocument();

    // 이전 성공 잡 직접 삽입 + artifact 생성
    await sql`
      INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code, finished_at)
      VALUES (${doc.id}, 'succeeded', ${doc.content}, false, now())
    `;
    const artifactId = randomUUID();
    await sql`
      INSERT INTO artifacts (id, document_id, storage_key)
      VALUES (${artifactId}, ${doc.id}, ${artifactId + ".html"})
    `;
    await sql`
      UPDATE documents SET latest_artifact_id = ${artifactId} WHERE id = ${doc.id}
    `;

    // 새 잡 enqueue (queued 상태)
    await repository.enqueueRenderJob({
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    const afterEnqueue = await repository.getDocument(doc.id);
    // renderStatus는 rendering (최신 잡이 queued)
    expect(afterEnqueue?.renderStatus).toBe("rendering");
    // 하지만 latestArtifactId는 직전 succeeded에서 유지
    expect(afterEnqueue?.latestArtifactId).toBe(artifactId);
  });

  it("failed 잡은 renderStatus error, latestArtifactId null, renderError에 log", async () => {
    const doc = await repository.getOrCreateSeedDocument();

    await sql`
      INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code, log, finished_at)
      VALUES (${doc.id}, 'failed', ${doc.content}, false, 'render error: parse failed', now())
    `;

    const afterFailed = await repository.getDocument(doc.id);
    expect(afterFailed?.renderStatus).toBe("error");
    expect(afterFailed?.latestArtifactId).toBeNull();
    expect(afterFailed?.renderError).toBe("render error: parse failed");
  });
});
