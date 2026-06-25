import crypto from "node:crypto";
import Database from "better-sqlite3";
import { normalizeSlug } from "./slug";
import type {
  CreateDocumentInput,
  DocumentRecord,
  DocumentSummary,
  RenameDocumentInput,
  SaveDocumentInput
} from "./types";

type DocumentRow = {
  id: string;
  title: string;
  slug: string;
  content: string;
  execute_code: 0 | 1;
  render_status: DocumentRecord["renderStatus"];
  rendered_html: string | null;
  render_error: string | null;
  created_at: string;
  updated_at: string;
  rendered_at: string | null;
};

const seedContent = `---
title: "Getting Started"
format: html
---

# Getting Started

이 문서는 SQLite에 저장되고 Quarto로 렌더링됩니다.

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

function nowIso() {
  return new Date().toISOString();
}

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    executeCode: row.execute_code === 1,
    renderStatus: row.render_status,
    renderedHtml: row.rendered_html,
    renderError: row.render_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    renderedAt: row.rendered_at
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

export function ensureDocumentSchema(db: Database.Database) {
  db.exec(`
    create table if not exists documents (
      id text primary key,
      title text not null,
      slug text not null unique,
      content text not null,
      execute_code integer not null default 0,
      render_status text not null default 'idle',
      rendered_html text,
      render_error text,
      created_at text not null,
      updated_at text not null,
      rendered_at text
    );
  `);
}

export function createDocumentRepository(db: Database.Database) {
  const selectById = db.prepare<[string], DocumentRow>(
    "select * from documents where id = ?"
  );
  const selectBySlug = db.prepare<[string], DocumentRow>(
    "select * from documents where slug = ?"
  );
  const selectAll = db.prepare<[], DocumentRow>(
    "select * from documents order by updated_at desc"
  );
  const getDocument = (id: string): DocumentRecord | null => {
    const row = selectById.get(id);
    return row ? toDocument(row) : null;
  };
  const assertDocumentChanged = (changes: number, id: string) => {
    if (changes === 0) {
      throw new Error(`Document not found: ${id}`);
    }
  };
  const createUniqueSlug = (title: string, id: string) => {
    const baseSlug = normalizeSlug(title, `document-${id.slice(0, 8)}`);
    let candidate = baseSlug;
    let suffix = 2;

    while (selectBySlug.get(candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  };
  const insertDocument = (document: DocumentRecord) => {
    db.prepare(`
      insert into documents (
        id, title, slug, content, execute_code, render_status,
        rendered_html, render_error, created_at, updated_at, rendered_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      document.id,
      document.title,
      document.slug,
      document.content,
      document.executeCode ? 1 : 0,
      document.renderStatus,
      document.renderedHtml,
      document.renderError,
      document.createdAt,
      document.updatedAt,
      document.renderedAt
    );
  };

  return {
    listDocuments(): DocumentSummary[] {
      return selectAll.all().map(toDocument).map(toSummary);
    },

    getDocument(id: string): DocumentRecord | null {
      return getDocument(id);
    },

    getOrCreateSeedDocument(): DocumentRecord {
      const existing = selectAll.get();
      if (existing) {
        return toDocument(existing);
      }

      const timestamp = nowIso();
      const document: DocumentRecord = {
        id: crypto.randomUUID(),
        title: "Getting Started",
        slug: "getting-started",
        content: seedContent,
        executeCode: false,
        renderStatus: "idle",
        renderedHtml: null,
        renderError: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        renderedAt: null
      };

      insertDocument(document);

      return document;
    },

    createDocument(input: CreateDocumentInput): DocumentRecord {
      const id = crypto.randomUUID();
      const title = normalizeTitle(input.title);
      const timestamp = nowIso();
      const document: DocumentRecord = {
        id,
        title,
        slug: createUniqueSlug(title, id),
        content: createDefaultContent(title),
        executeCode: false,
        renderStatus: "idle",
        renderedHtml: null,
        renderError: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        renderedAt: null
      };

      insertDocument(document);
      return document;
    },

    renameDocument(
      input: Pick<RenameDocumentInput, "id" | "title">
    ): DocumentRecord {
      const title = normalizeTitle(input.title);
      const updatedAt = nowIso();
      const result = db.prepare(`
        update documents
        set title = ?,
            updated_at = ?
        where id = ?
      `).run(title, updatedAt, input.id);
      assertDocumentChanged(result.changes, input.id);

      const renamed = getDocument(input.id);
      if (!renamed) {
        throw new Error(`Document not found: ${input.id}`);
      }
      return renamed;
    },

    deleteDocument(id: string): void {
      const result = db.prepare("delete from documents where id = ?").run(id);
      assertDocumentChanged(result.changes, id);
    },

    updateDocument(input: SaveDocumentInput): DocumentRecord {
      const updatedAt = nowIso();
      db.prepare(`
        update documents
        set title = ?,
            slug = ?,
            content = ?,
            execute_code = ?,
            render_status = 'idle',
            render_error = null,
            updated_at = ?
        where id = ?
      `).run(
        input.title,
        input.slug,
        input.content,
        input.executeCode ? 1 : 0,
        updatedAt,
        input.id
      );

      const saved = getDocument(input.id);
      if (!saved) {
        throw new Error(`Document not found: ${input.id}`);
      }
      return saved;
    },

    markRendering(id: string): void {
      const result = db.prepare(
        "update documents set render_status = 'rendering', render_error = null where id = ?"
      ).run(id);
      assertDocumentChanged(result.changes, id);
    },

    markRenderSuccess(
      id: string,
      renderedHtml: string,
      renderedAt = nowIso()
    ): void {
      const result = db.prepare(`
        update documents
        set render_status = 'success', rendered_html = ?, render_error = null, rendered_at = ?
        where id = ?
      `).run(renderedHtml, renderedAt, id);
      assertDocumentChanged(result.changes, id);
    },

    markRenderError(id: string, renderError: string): void {
      const result = db.prepare(
        "update documents set render_status = 'error', render_error = ? where id = ?"
      ).run(renderError, id);
      assertDocumentChanged(result.changes, id);
    }
  };
}
