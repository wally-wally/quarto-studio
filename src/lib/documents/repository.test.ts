import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDocumentRepository } from "./repository";
import { createTestSql, truncateAll } from "@/test/db";

const sql = createTestSql();
const repository = createDocumentRepository(sql);

afterAll(async () => {
  await sql.end();
});

beforeEach(async () => {
  await truncateAll(sql);
});

async function createTestUser(email = "test@example.com") {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'hash')
    RETURNING id
  `;
  return rows[0].id;
}

describe("document repository", () => {
  it("첫 실행용 seed 문서를 생성하고 다시 호출하면 같은 문서를 반환한다", async () => {
    const ownerId = await createTestUser();
    const first = await repository.getOrCreateSeedDocument(ownerId);
    const second = await repository.getOrCreateSeedDocument(ownerId);

    expect(first.id).toBe(second.id);
    expect(first.title).toBe("Getting Started");
    expect(first.slug).toBe("getting-started");
    expect(await repository.listDocuments(ownerId)).toHaveLength(1);
  });

  it("새 문서를 생성할 때 제목 기반 기본 콘텐츠와 고유 slug를 저장한다", async () => {
    const ownerId = await createTestUser();
    const created = await repository.createDocument(ownerId, { title: "새 분석 문서" });

    expect(created.title).toBe("새 분석 문서");
    expect(created.slug).toMatch(/^document-/);
    expect(created.content).toContain('title: "새 분석 문서"');
    expect(created.executeCode).toBe(true);
    expect(created.renderStatus).toBe("idle");
    const fetched = await repository.getDocument(ownerId, created.id);
    expect(fetched?.content).toContain("# 새 분석 문서");
  });

  it("문서 내용을 저장하고 다시 조회한다", async () => {
    const ownerId = await createTestUser();
    const document = await repository.getOrCreateSeedDocument(ownerId);

    const saved = await repository.updateDocument(ownerId, {
      id: document.id,
      title: "Analytics Report",
      slug: "analytics-report",
      content: "# Analytics\n\nBody",
      executeCode: true,
    });

    expect(saved.title).toBe("Analytics Report");
    expect(saved.executeCode).toBe(true);
    const fetched = await repository.getDocument(ownerId, document.id);
    expect(fetched?.content).toContain("Body");
  });

  it("같은 영문 제목으로 문서를 만들면 slug suffix를 붙인다", async () => {
    const ownerId = await createTestUser();
    const second = await repository.createDocument(ownerId, { title: "Quarterly Report" });
    const third = await repository.createDocument(ownerId, { title: "Quarterly Report" });

    expect(second.slug).toBe("quarterly-report");
    expect(third.slug).toBe("quarterly-report-2");
  });

  it("문서 제목만 수정하고 문서를 삭제한다", async () => {
    const ownerId = await createTestUser();
    const created = await repository.createDocument(ownerId, { title: "원본 제목" });

    const renamed = await repository.renameDocument(ownerId, {
      id: created.id,
      title: "수정된 제목",
    });
    await repository.deleteDocument(ownerId, created.id);

    expect(renamed.title).toBe("수정된 제목");
    expect(renamed.slug).toBe(created.slug);
    expect(renamed.content).toBe(created.content);
    expect(await repository.getDocument(ownerId, created.id)).toBeNull();
  });

  it("render status derivation: no job → idle; enqueue → rendering; succeeded → success", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);

    // No job → idle
    expect(doc.renderStatus).toBe("idle");
    expect(doc.latestArtifactId).toBeNull();

    // Enqueue job → rendering
    await repository.enqueueRenderJob({
      ownerId,
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });
    const afterEnqueue = await repository.getDocument(ownerId, doc.id);
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
    const afterSuccess = await repository.getDocument(ownerId, doc.id);
    expect(afterSuccess?.renderStatus).toBe("success");
    expect(afterSuccess?.latestArtifactId).toBe(artifactId);
  });

  it("enqueueRenderJob이 jobId를 반환하고 getRenderJob이 RenderJobRecord를 반환한다", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);

    const { jobId } = await repository.enqueueRenderJob({
      ownerId,
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

  it("cancelDocumentRenders는 queued/running 잡을 canceled로 표시하고 문서 상태를 idle로 되돌린다", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);
    const { jobId } = await repository.enqueueRenderJob({
      ownerId,
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    const { canceledCount } = await repository.cancelDocumentRenders(ownerId, doc.id);
    expect(canceledCount).toBe(1);

    const job = await repository.getRenderJob(jobId);
    expect(job?.status).toBe("canceled");

    // queued 잡이 사라지므로 무한 '렌더링 중'에서 벗어나 idle로 복구된다.
    const refreshed = await repository.getDocument(ownerId, doc.id);
    expect(refreshed?.renderStatus).toBe("idle");
  });

  it("문서 삭제 시 render_jobs도 cascade 삭제된다", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);
    const { jobId } = await repository.enqueueRenderJob({
      ownerId,
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    await repository.deleteDocument(ownerId, doc.id);

    expect(await repository.getRenderJob(jobId)).toBeNull();
  });

  it("재렌더 중(queued)에도 직전 latestArtifactId가 유지된다", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);

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
      ownerId,
      documentId: doc.id,
      contentSnapshot: doc.content,
      executeCode: false,
    });

    const afterEnqueue = await repository.getDocument(ownerId, doc.id);
    // renderStatus는 rendering (최신 잡이 queued)
    expect(afterEnqueue?.renderStatus).toBe("rendering");
    // 하지만 latestArtifactId는 직전 succeeded에서 유지
    expect(afterEnqueue?.latestArtifactId).toBe(artifactId);
  });

  it("failed 잡은 renderStatus error, latestArtifactId null, renderError에 log", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);

    await sql`
      INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code, log, finished_at)
      VALUES (${doc.id}, 'failed', ${doc.content}, false, 'render error: parse failed', now())
    `;

    const afterFailed = await repository.getDocument(ownerId, doc.id);
    expect(afterFailed?.renderStatus).toBe("error");
    expect(afterFailed?.latestArtifactId).toBeNull();
    expect(afterFailed?.renderError).toBe("render error: parse failed");
  });

  // --- New tests for owner isolation, slug uniqueness per owner, quota, and seed isolation ---

  it("owner 격리: A의 문서를 B가 getDocument로 못 봄(null), listDocuments도 못 봄", async () => {
    const ownerA = await createTestUser("a@example.com");
    const ownerB = await createTestUser("b@example.com");

    const docA = await repository.createDocument(ownerA, { title: "A의 문서" });

    // B cannot see A's document
    expect(await repository.getDocument(ownerB, docA.id)).toBeNull();
    expect(await repository.listDocuments(ownerB)).toHaveLength(0);
    // A can see their own document
    expect(await repository.getDocument(ownerA, docA.id)).not.toBeNull();
    expect(await repository.listDocuments(ownerA)).toHaveLength(1);
  });

  it("owner별 slug 유니크: 같은 slug가 다른 owner에서는 가능, 같은 owner에서는 suffix 붙음", async () => {
    const ownerA = await createTestUser("a@example.com");
    const ownerB = await createTestUser("b@example.com");

    const docA = await repository.createDocument(ownerA, { title: "Quarterly Report" });
    const docB = await repository.createDocument(ownerB, { title: "Quarterly Report" });

    // Different owners can share the same slug
    expect(docA.slug).toBe("quarterly-report");
    expect(docB.slug).toBe("quarterly-report");

    // Same owner gets a suffix
    const docA2 = await repository.createDocument(ownerA, { title: "Quarterly Report" });
    expect(docA2.slug).toBe("quarterly-report-2");
  });

  it("쿼터 초과 거부: queued 잡 3개인 owner가 enqueueRenderJob하면 '렌더 동시 실행 한도 초과' 에러", async () => {
    const ownerId = await createTestUser();
    const doc = await repository.getOrCreateSeedDocument(ownerId);

    // Manually insert 3 queued jobs for this owner
    for (let i = 0; i < 3; i++) {
      await sql`
        INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code, requested_by)
        VALUES (${doc.id}, 'queued', ${doc.content}, false, ${ownerId})
      `;
    }

    await expect(
      repository.enqueueRenderJob({
        ownerId,
        documentId: doc.id,
        contentSnapshot: doc.content,
        executeCode: false,
      })
    ).rejects.toThrow("렌더 동시 실행 한도 초과");
  });

  it("getOrCreateSeedDocument owner별: userA의 seed와 userB의 seed는 별개 문서", async () => {
    const ownerA = await createTestUser("a@example.com");
    const ownerB = await createTestUser("b@example.com");

    const seedA = await repository.getOrCreateSeedDocument(ownerA);
    const seedB = await repository.getOrCreateSeedDocument(ownerB);

    expect(seedA.id).not.toBe(seedB.id);
    expect(await repository.listDocuments(ownerA)).toHaveLength(1);
    expect(await repository.listDocuments(ownerB)).toHaveLength(1);
  });

  it("다른 owner 문서에 enqueue하면 에러: Document not found", async () => {
    const ownerA = await createTestUser("a@example.com");
    const ownerB = await createTestUser("b@example.com");

    const docA = await repository.getOrCreateSeedDocument(ownerA);

    await expect(
      repository.enqueueRenderJob({
        ownerId: ownerB,
        documentId: docA.id,
        contentSnapshot: docA.content,
        executeCode: false,
      })
    ).rejects.toThrow(`Document not found: ${docA.id}`);
  });
});
