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
  job_html: string | null;
  job_log: string | null;
  job_finished_at: Date | null;
};

type RenderJobRow = {
  id: string;
  document_id: string;
  status: RenderJobRecord["status"];
  log: string | null;
  rendered_html: string | null;
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

function deriveRenderStatus(row: DocumentRow): Pick<DocumentRecord, "renderStatus" | "renderedHtml" | "renderError" | "renderedAt"> {
  const status = row.job_status;
  if (!status) {
    return { renderStatus: "idle", renderedHtml: null, renderError: null, renderedAt: null };
  }
  if (status === "queued" || status === "running") {
    return { renderStatus: "rendering", renderedHtml: row.job_html, renderError: null, renderedAt: row.job_finished_at?.toISOString() ?? null };
  }
  if (status === "succeeded") {
    return {
      renderStatus: "success",
      renderedHtml: row.job_html,
      renderError: null,
      renderedAt: row.job_finished_at ? row.job_finished_at.toISOString() : null
    };
  }
  // failed | timed_out
  return { renderStatus: "error", renderedHtml: null, renderError: row.job_log, renderedAt: null };
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

export function createDocumentRepository(sql: Sql) {
  const getDocumentById = async (id: string): Promise<DocumentRecord | null> => {
    const rows = await sql<DocumentRow[]>`
      SELECT d.*,
             j.status as job_status, js.rendered_html as job_html,
             j.log as job_log, js.finished_at as job_finished_at
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT status, log
        FROM render_jobs
        WHERE document_id = d.id
        ORDER BY created_at DESC
        LIMIT 1
      ) j ON true
      LEFT JOIN LATERAL (
        SELECT rendered_html, finished_at
        FROM render_jobs
        WHERE document_id = d.id AND status = 'succeeded'
        ORDER BY created_at DESC
        LIMIT 1
      ) js ON true
      WHERE d.id = ${id}
    `;
    const row = rows[0];
    return row ? toDocument(row) : null;
  };

  const createUniqueSlug = async (title: string, id: string): Promise<string> => {
    const baseSlug = normalizeSlug(title, `document-${id.slice(0, 8)}`);
    let candidate = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await sql`SELECT id FROM documents WHERE slug = ${candidate}`;
      if (existing.length === 0) break;
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  };

  return {
    async listDocuments(): Promise<DocumentSummary[]> {
      const rows = await sql<DocumentRow[]>`
        SELECT d.*,
               j.status as job_status, js.rendered_html as job_html,
               j.log as job_log, js.finished_at as job_finished_at
        FROM documents d
        LEFT JOIN LATERAL (
          SELECT status, log
          FROM render_jobs
          WHERE document_id = d.id
          ORDER BY created_at DESC
          LIMIT 1
        ) j ON true
        LEFT JOIN LATERAL (
          SELECT rendered_html, finished_at
          FROM render_jobs
          WHERE document_id = d.id AND status = 'succeeded'
          ORDER BY created_at DESC
          LIMIT 1
        ) js ON true
        ORDER BY d.updated_at DESC
      `;
      return rows.map(toDocument).map(toSummary);
    },

    async getDocument(id: string): Promise<DocumentRecord | null> {
      return getDocumentById(id);
    },

    async getOrCreateSeedDocument(): Promise<DocumentRecord> {
      const existing = await sql<DocumentRow[]>`
        SELECT d.*,
               j.status as job_status, js.rendered_html as job_html,
               j.log as job_log, js.finished_at as job_finished_at
        FROM documents d
        LEFT JOIN LATERAL (
          SELECT status, log
          FROM render_jobs
          WHERE document_id = d.id
          ORDER BY created_at DESC
          LIMIT 1
        ) j ON true
        LEFT JOIN LATERAL (
          SELECT rendered_html, finished_at
          FROM render_jobs
          WHERE document_id = d.id AND status = 'succeeded'
          ORDER BY created_at DESC
          LIMIT 1
        ) js ON true
        ORDER BY d.created_at ASC
        LIMIT 1
      `;
      if (existing.length > 0) {
        return toDocument(existing[0]);
      }

      const inserted = await sql<{ id: string }[]>`
        INSERT INTO documents (title, slug, content, execute_code)
        VALUES ('Getting Started', 'getting-started', ${seedContent}, false)
        RETURNING id
      `;
      const id = inserted[0].id;
      const doc = await getDocumentById(id);
      if (!doc) throw new Error("Failed to create seed document");
      return doc;
    },

    async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
      const title = normalizeTitle(input.title);

      // Insert with a temporary placeholder slug, then update once the DB-generated id is known
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO documents (title, slug, content, execute_code)
        VALUES (${title}, ${`temp-${Date.now()}`}, ${createDefaultContent(title)}, true)
        RETURNING id
      `;
      const id = inserted[0].id;
      const slug = await createUniqueSlug(title, id);

      await sql`
        UPDATE documents SET slug = ${slug} WHERE id = ${id}
      `;

      const doc = await getDocumentById(id);
      if (!doc) throw new Error(`Document not found: ${id}`);
      return doc;
    },

    async renameDocument(
      input: Pick<RenameDocumentInput, "id" | "title">
    ): Promise<DocumentRecord> {
      const title = normalizeTitle(input.title);
      const result = await sql`
        UPDATE documents
        SET title = ${title},
            updated_at = now()
        WHERE id = ${input.id}
      `;
      if (result.count === 0) {
        throw new Error(`Document not found: ${input.id}`);
      }

      const doc = await getDocumentById(input.id);
      if (!doc) throw new Error(`Document not found: ${input.id}`);
      return doc;
    },

    async deleteDocument(id: string): Promise<void> {
      const result = await sql`DELETE FROM documents WHERE id = ${id}`;
      if (result.count === 0) {
        throw new Error(`Document not found: ${id}`);
      }
    },

    async updateDocument(input: SaveDocumentInput): Promise<DocumentRecord> {
      const result = await sql`
        UPDATE documents
        SET title = ${input.title},
            slug = ${input.slug},
            content = ${input.content},
            execute_code = ${input.executeCode},
            updated_at = now()
        WHERE id = ${input.id}
      `;
      if (result.count === 0) {
        throw new Error(`Document not found: ${input.id}`);
      }

      const doc = await getDocumentById(input.id);
      if (!doc) throw new Error(`Document not found: ${input.id}`);
      return doc;
    },

    async enqueueRenderJob(input: {
      documentId: string;
      contentSnapshot: string;
      executeCode: boolean;
    }): Promise<{ jobId: string }> {
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO render_jobs (document_id, status, content_snapshot, execute_code)
        VALUES (${input.documentId}, 'queued', ${input.contentSnapshot}, ${input.executeCode})
        RETURNING id
      `;
      const jobId = inserted[0].id;
      await sql`SELECT pg_notify('render_jobs', ${jobId})`;
      return { jobId };
    },

    async getRenderJob(jobId: string): Promise<RenderJobRecord | null> {
      const rows = await sql<RenderJobRow[]>`
        SELECT id, document_id, status, log, rendered_html, created_at, finished_at
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
        renderedHtml: row.rendered_html,
        createdAt: row.created_at.toISOString(),
        finishedAt: row.finished_at ? row.finished_at.toISOString() : null
      };
    }
  };
}
