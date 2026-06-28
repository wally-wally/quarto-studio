import type { Sql } from "postgres";
import { normalizeSlug } from "./slug";
import type {
  CreateDocumentInput,
  DocumentRecord,
  DocumentSummary,
  RenderJobRecord,
  RenameDocumentInput,
  SaveDocumentInput
} from "./types";

type DocumentRow = {
  id: string;
  title: string;
  slug: string;
  content: string;
  execute_code: boolean;
  created_at: Date;
  updated_at: Date;
  job_status: string | null;
  latest_artifact_id: string | null;
  job_log: string | null;
  job_finished_at: Date | null;
};

type RenderJobRow = {
  id: string;
  document_id: string;
  status: RenderJobRecord["status"];
  log: string | null;
  artifact_id: string | null;
  created_at: Date;
  finished_at: Date | null;
};

const seedContent = `---
title: "Getting Started"
format: html
---

# Getting Started

이 문서는 Postgres에 저장되고 Quarto로 렌더링됩니다.

::: {.callout-note}
코드 실행은 기본적으로 꺼져 있습니다.
:::
`;

function normalizeTitle(title: string) {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  if (normalizedTitle.length === 0) {
    throw new Error("Document title is required");
  }
  return normalizedTitle;
}

function escapeYamlDoubleQuoted(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createDefaultContent(title: string) {
  return `---
title: "${escapeYamlDoubleQuoted(title)}"
format:
  html:
    toc: true
---

# ${title}

새 Quarto 문서를 작성해보세요.
`;
}

function deriveRenderStatus(row: DocumentRow): Pick<DocumentRecord, "renderStatus" | "latestArtifactId" | "renderError" | "renderedAt"> {
  const status = row.job_status;
  // latestArtifactId comes directly from documents.latest_artifact_id
  // regardless of current job status — preserved across re-renders
  const latestArtifactId = row.latest_artifact_id;

  if (!status) {
    return { renderStatus: "idle", latestArtifactId, renderError: null, renderedAt: null };
  }
  if (status === "queued" || status === "running") {
    return { renderStatus: "rendering", latestArtifactId, renderError: null, renderedAt: row.job_finished_at?.toISOString() ?? null };
  }
  if (status === "succeeded") {
    return {
      renderStatus: "success",
      latestArtifactId,
      renderError: null,
      renderedAt: row.job_finished_at ? row.job_finished_at.toISOString() : null
    };
  }
  if (status === "canceled") {
    // 중단은 오류가 아니다 — 기존 아티팩트는 유지하고 idle로 되돌린다.
    return { renderStatus: "idle", latestArtifactId, renderError: null, renderedAt: null };
  }
  // failed | timed_out
  return { renderStatus: "error", latestArtifactId, renderError: row.job_log, renderedAt: null };
}

function toDocument(row: DocumentRow): DocumentRecord {
  const renderFields = deriveRenderStatus(row);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    executeCode: row.execute_code,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...renderFields
  };
}

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    slug: document.slug,
    executeCode: document.executeCode,
    renderStatus: document.renderStatus,
    updatedAt: document.updatedAt,
    renderedAt: document.renderedAt
  };
}

const RENDER_QUOTA = Number(process.env.RENDER_QUOTA ?? "3");

export function createDocumentRepository(sql: Sql) {
  const getDocumentById = async (ownerId: string, id: string): Promise<DocumentRecord | null> => {
    const rows = await sql<DocumentRow[]>`
      SELECT d.*,
             j.status as job_status,
             j.log as job_log, j.finished_at as job_finished_at,
             d.latest_artifact_id
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT status, log, finished_at
        FROM render_jobs
        WHERE document_id = d.id
        ORDER BY created_at DESC
        LIMIT 1
      ) j ON true
      WHERE d.id = ${id} AND d.owner_id = ${ownerId}
    `;
    const row = rows[0];
    return row ? toDocument(row) : null;
  };

  const createUniqueSlug = async (ownerId: string, title: string, id: string): Promise<string> => {
    const baseSlug = normalizeSlug(title, `document-${id.slice(0, 8)}`);
    let candidate = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await sql`SELECT id FROM documents WHERE owner_id = ${ownerId} AND slug = ${candidate}`;
      if (existing.length === 0) break;
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  };

  return {
    async listDocuments(ownerId: string): Promise<DocumentSummary[]> {
      const rows = await sql<DocumentRow[]>`
        SELECT d.*,
               j.status as job_status,
               j.log as job_log, j.finished_at as job_finished_at,
               d.latest_artifact_id
        FROM documents d
        LEFT JOIN LATERAL (
          SELECT status, log, finished_at
          FROM render_jobs
          WHERE document_id = d.id
          ORDER BY created_at DESC
          LIMIT 1
        ) j ON true
        WHERE d.owner_id = ${ownerId}
        ORDER BY d.updated_at DESC
      `;
      return rows.map(toDocument).map(toSummary);
    },

    async getDocument(ownerId: string, id: string): Promise<DocumentRecord | null> {
      return getDocumentById(ownerId, id);
    },

    async getOrCreateSeedDocument(ownerId: string): Promise<DocumentRecord> {
      const existing = await sql<DocumentRow[]>`
        SELECT d.*,
               j.status as job_status,
               j.log as job_log, j.finished_at as job_finished_at,
               d.latest_artifact_id
        FROM documents d
        LEFT JOIN LATERAL (
          SELECT status, log, finished_at
          FROM render_jobs
          WHERE document_id = d.id
          ORDER BY created_at DESC
          LIMIT 1
        ) j ON true
        WHERE d.owner_id = ${ownerId}
        ORDER BY d.created_at ASC
        LIMIT 1
      `;
      if (existing.length > 0) {
        return toDocument(existing[0]);
      }

      const inserted = await sql<{ id: string }[]>`
        INSERT INTO documents (title, slug, content, execute_code, owner_id)
        VALUES ('Getting Started', 'getting-started', ${seedContent}, false, ${ownerId})
        RETURNING id
      `;
      const id = inserted[0].id;
      const doc = await getDocumentById(ownerId, id);
      if (!doc) throw new Error("Failed to create seed document");
      return doc;
    },

    async createDocument(ownerId: string, input: CreateDocumentInput): Promise<DocumentRecord> {
      const title = normalizeTitle(input.title);

      // Insert with a temporary placeholder slug, then update once the DB-generated id is known
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO documents (title, slug, content, execute_code, owner_id)
        VALUES (${title}, ${`temp-${Date.now()}`}, ${createDefaultContent(title)}, true, ${ownerId})
        RETURNING id
      `;
      const id = inserted[0].id;
      const slug = await createUniqueSlug(ownerId, title, id);

      await sql`
        UPDATE documents SET slug = ${slug} WHERE id = ${id}
      `;

      const doc = await getDocumentById(ownerId, id);
      if (!doc) throw new Error(`Document not found: ${id}`);
      return doc;
    },

    async renameDocument(
      ownerId: string,
      input: Pick<RenameDocumentInput, "id" | "title">
    ): Promise<DocumentRecord> {
      const title = normalizeTitle(input.title);
      const result = await sql`
        UPDATE documents
        SET title = ${title},
            updated_at = now()
        WHERE id = ${input.id} AND owner_id = ${ownerId}
      `;
      if (result.count === 0) {
        throw new Error(`Document not found: ${input.id}`);
      }

      const doc = await getDocumentById(ownerId, input.id);
      if (!doc) throw new Error(`Document not found: ${input.id}`);
      return doc;
    },

    async deleteDocument(ownerId: string, id: string): Promise<void> {
      const result = await sql`DELETE FROM documents WHERE id = ${id} AND owner_id = ${ownerId}`;
      if (result.count === 0) {
        throw new Error(`Document not found: ${id}`);
      }
    },

    async updateDocument(ownerId: string, input: SaveDocumentInput): Promise<DocumentRecord> {
      const result = await sql`
        UPDATE documents
        SET title = ${input.title},
            slug = ${input.slug},
            content = ${input.content},
            execute_code = ${input.executeCode},
            updated_at = now()
        WHERE id = ${input.id} AND owner_id = ${ownerId}
      `;
      if (result.count === 0) {
        throw new Error(`Document not found: ${input.id}`);
      }

      const doc = await getDocumentById(ownerId, input.id);
      if (!doc) throw new Error(`Document not found: ${input.id}`);
      return doc;
    },

    async enqueueRenderJob(input: {
      ownerId: string;
      documentId: string;
      contentSnapshot: string;
      executeCode: boolean;
    }): Promise<{ jobId: string }> {
      // 1. Verify the document belongs to the owner
      const docCheck = await sql`
        SELECT id FROM documents WHERE id = ${input.documentId} AND owner_id = ${input.ownerId}
      `;
      if (docCheck.length === 0) {
        throw new Error(`Document not found: ${input.documentId}`);
      }

      // 2 & 3. Quota check + insert in a single transaction to prevent race conditions
      return await sql.begin(async (tx) => {
        const quotaRows = await tx<{ count: string }[]>`
          SELECT COUNT(*) as count FROM render_jobs
          WHERE requested_by = ${input.ownerId} AND status IN ('queued', 'running')
        `;
        const activeCount = Number(quotaRows[0].count);
        if (activeCount >= RENDER_QUOTA) {
          throw new Error("렌더 동시 실행 한도 초과");
        }

        const inserted = await tx<{ id: string }[]>`
          INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code, requested_by)
          VALUES (${input.documentId}, 'queued', ${input.contentSnapshot}, ${input.executeCode}, ${input.ownerId})
          RETURNING id
        `;
        const jobId = inserted[0].id;
        await tx`SELECT pg_notify('render_jobs', ${jobId})`;
        return { jobId };
      });
    },

    async getRenderJob(jobId: string): Promise<RenderJobRecord | null> {
      const rows = await sql<RenderJobRow[]>`
        SELECT id, document_id, status, log, artifact_id, created_at, finished_at
        FROM render_jobs
        WHERE id = ${jobId}
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        documentId: row.document_id,
        status: row.status,
        log: row.log,
        artifactId: row.artifact_id,
        createdAt: row.created_at.toISOString(),
        finishedAt: row.finished_at ? row.finished_at.toISOString() : null
      };
    },

    async cancelDocumentRenders(ownerId: string, documentId: string): Promise<{ canceledCount: number }> {
      // 본인이 요청한 그 문서의 queued/running 잡만 canceled로 표시한다.
      // 워커가 실행 중인 잡이면 docker kill로 컨테이너를 종료한다(워커가 이 상태를 감시).
      const rows = await sql<{ id: string }[]>`
        UPDATE render_jobs
           SET status = 'canceled', log = '사용자에 의해 중단됨', finished_at = now()
         WHERE document_id = ${documentId}
           AND requested_by = ${ownerId}
           AND status IN ('queued', 'running')
        RETURNING id
      `;
      return { canceledCount: rows.length };
    },

    async completeRenderJob(input: {
      jobId: string;
      documentId: string;
      artifactId: string;
      storageKey: string;
      sizeBytes: number;
      log: string;
    }): Promise<{ stored: boolean }> {
      return await sql.begin(async (tx) => {
        // 레이스 가드: 아직 running인 잡만 성공 처리한다(렌더 완료 직전에 취소된
        // 잡은 status != 'running'이라 0행 → 결과를 덮어쓰지 않는다).
        const updated = await tx<{ id: string }[]>`
          UPDATE render_jobs
             SET status = 'succeeded', log = ${input.log}, finished_at = now()
           WHERE id = ${input.jobId} AND status = 'running'
          RETURNING id
        `;
        if (updated.length === 0) return { stored: false };

        // render_jobs.artifact_id / documents.latest_artifact_id 는 모두 artifacts(id)를
        // 참조하는 즉시검사 FK다. 반드시 artifacts 행을 먼저 INSERT한 뒤에 참조를 건다.
        await tx`
          INSERT INTO artifacts (id, document_id, job_id, storage_key, size_bytes)
          VALUES (${input.artifactId}, ${input.documentId}, ${input.jobId}, ${input.storageKey}, ${input.sizeBytes})
        `;
        await tx`
          UPDATE render_jobs SET artifact_id = ${input.artifactId} WHERE id = ${input.jobId}
        `;
        await tx`
          UPDATE documents SET latest_artifact_id = ${input.artifactId} WHERE id = ${input.documentId}
        `;
        return { stored: true };
      });
    }
  };
}
