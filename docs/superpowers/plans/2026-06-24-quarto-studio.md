# Quarto Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 웹 인터페이스에서 SQLite에 저장된 QMD 문서를 편집하고 Quarto HTML로 렌더링해 미리보기하는 로컬 문서 CMS MVP를 만든다.

**Architecture:** Next.js App Router는 첫 화면에 3-pane 작업 공간을 제공한다. SQLite repository가 문서 원문과 렌더링 상태를 관리하고, Quarto render service가 임시 프로젝트 디렉토리에 `index.qmd`와 `_quarto.yml`을 쓴 뒤 `quarto render index.qmd --to html`을 실행한다. UI는 server action을 통해 저장과 렌더링을 호출하고, 마지막 성공 HTML 또는 오류 로그를 preview pane에 표시한다.

**Tech Stack:** Node 24, pnpm, Next.js App Router, React, TypeScript, SQLite via `better-sqlite3`, Vitest, Testing Library, Quarto CLI, lucide-react.

---

## 파일 구조

- Create: `.nvmrc` - Node 24 사용 표시.
- Create: `.node-version` - Node 24 사용 표시.
- Create: `.env.example` - 로컬 DB path와 render timeout 예시.
- Create: `package.json` - pnpm scripts, Node engine, dependencies.
- Create: `tsconfig.json` - Next.js/TypeScript 설정.
- Create: `next-env.d.ts` - Next.js 타입 shim.
- Create: `next.config.ts` - server-only SQLite 사용을 위한 기본 Next 설정.
- Create: `eslint.config.mjs` - Next.js ESLint flat config.
- Create: `vitest.config.ts` - Vitest + jsdom + path alias 설정.
- Create: `src/test/setup.ts` - Testing Library matcher 설정.
- Create: `src/app/layout.tsx` - 전역 shell metadata와 스타일 적용.
- Create: `src/app/page.tsx` - Quarto workspace server entry.
- Create: `src/app/actions.ts` - 문서 저장/렌더링 server actions.
- Create: `src/app/globals.css` - 남색 IT 서비스 톤의 3-pane UI 스타일.
- Create: `src/lib/documents/types.ts` - 문서 domain type.
- Create: `src/lib/documents/slug.ts` - slug 정규화.
- Create: `src/lib/documents/repository.ts` - SQLite schema와 repository.
- Create: `src/lib/documents/service.ts` - 저장/렌더링 application service.
- Create: `src/lib/db/connection.ts` - SQLite connection singleton.
- Create: `src/lib/db/app-service.ts` - SQLite repository와 document service 조립.
- Create: `src/lib/quarto/project.ts` - `_quarto.yml` 생성과 Quarto command 구성.
- Create: `src/lib/quarto/render.ts` - 임시 Quarto project 생성, CLI 실행, HTML 수집.
- Create: `src/lib/quarto/runtime.ts` - child process 실행 wrapper.
- Create: `src/components/workspace/quarto-workspace.tsx` - client workspace coordinator.
- Create: `src/components/workspace/document-sidebar.tsx` - 문서 목록 pane.
- Create: `src/components/workspace/editor-pane.tsx` - QMD editor pane.
- Create: `src/components/workspace/preview-pane.tsx` - preview/error pane.
- Create: `src/components/workspace/types.ts` - client component props.
- Test: `src/lib/documents/slug.test.ts`
- Test: `src/lib/documents/repository.test.ts`
- Test: `src/lib/quarto/project.test.ts`
- Test: `src/lib/quarto/render.test.ts`
- Test: `src/lib/documents/service.test.ts`
- Test: `src/lib/db/app-service.test.ts`
- Test: `src/components/workspace/quarto-workspace.test.tsx`

## 참고한 Quarto 동작

- Quarto HTML format reference는 execution option을 `execute` key 아래에 둔다고 설명하고, `eval: false`는 code cell을 평가하지 않는 값이다: <https://quarto.org/docs/reference/formats/html.html#execution>
- Quarto render 명령은 `quarto render document.qmd --to html` 형태로 단일 문서를 렌더링할 수 있다: <https://quarto.org/docs/computations/r.html#rendering>
- Quarto HTML의 `embed-resources: true`는 CSS, script, image 등을 단일 HTML 파일에 포함하는 self-contained output을 만든다: <https://quarto.org/docs/output-formats/html-publishing.html#standalone-html>

---

### Task 1: Node 24 Next.js/Vitest/SQLite 골격

**Files:**
- Create: `.nvmrc`
- Create: `.node-version`
- Create: `.env.example`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Modify: `.gitignore`

- [ ] **Step 1: Node 24 전환 확인**

Run:

```bash
node -v
```

Expected: `v24.`로 시작한다. 다르면 `nvm use 24`, `fnm use 24`, 또는 로컬 환경의 Node version manager로 Node 24를 활성화한 뒤 다시 확인한다.

- [ ] **Step 2: 런타임 고정 파일 작성**

Create `.nvmrc`:

```text
24
```

Create `.node-version`:

```text
24
```

Create `.env.example`:

```bash
QUARTO_STUDIO_DB_PATH=./data/quarto-studio.db
QUARTO_RENDER_TIMEOUT_MS=15000
```

- [ ] **Step 3: package.json 작성**

Create `package.json`:

```json
{
  "name": "quarto-studio",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.15.9",
  "engines": {
    "node": ">=24 <25"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

- [ ] **Step 4: dependencies 설치**

Run:

```bash
corepack enable
pnpm add next react react-dom better-sqlite3 lucide-react
pnpm add -D typescript @types/node @types/react @types/react-dom @types/better-sqlite3 vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event eslint eslint-config-next @eslint/eslintrc
```

Expected: `package.json`에 dependencies/devDependencies가 추가되고 `pnpm-lock.yaml`이 생성된다.

- [ ] **Step 5: TypeScript, Next, Vitest 설정 작성**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"]
};

export default nextConfig;
```

Create `eslint.config.mjs`:

```js
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const dirnameName = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: dirnameName
});

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "coverage/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript")
];

export default eslintConfig;
```

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: 최소 App Router shell 작성**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quarto Studio",
  description: "SQLite-backed Quarto document studio"
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="app-shell">
      <p>Quarto Studio 초기화 중</p>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color: #142033;
  background: #eef3f8;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
}

button,
textarea,
input {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  background: #eef3f8;
}
```

- [ ] **Step 7: .gitignore 보강**

Modify `.gitignore` so it includes:

```gitignore
data/
.env.local
```

- [ ] **Step 8: scaffold 검증**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: lint/typecheck/test/build 모두 성공한다. `pnpm test`는 테스트 파일이 없어서 통과하거나 빈 test suite 안내를 출력한다.

- [ ] **Step 9: Commit**

```bash
git add .nvmrc .node-version .env.example .gitignore package.json pnpm-lock.yaml tsconfig.json next-env.d.ts next.config.ts eslint.config.mjs vitest.config.ts src
git commit -m "chore: Node 24 Next.js 프로젝트 골격 구성"
```

---

### Task 2: 문서 타입과 slug 정규화

**Files:**
- Create: `src/lib/documents/types.ts`
- Create: `src/lib/documents/slug.ts`
- Test: `src/lib/documents/slug.test.ts`

- [ ] **Step 1: 실패하는 slug 테스트 작성**

Create `src/lib/documents/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeSlug } from "./slug";

describe("normalizeSlug", () => {
  it("영문 제목을 preview route에 사용할 slug로 바꾼다", () => {
    expect(normalizeSlug("Getting Started With Quarto!")).toBe(
      "getting-started-with-quarto"
    );
  });

  it("한글처럼 slug 문자로 남기기 어려운 제목은 fallback을 사용한다", () => {
    expect(normalizeSlug("문서 제목", "document-1")).toBe("document-1");
  });

  it("fallback도 비어 있으면 untitled를 사용한다", () => {
    expect(normalizeSlug("!!!", "")).toBe("untitled");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/lib/documents/slug.test.ts
```

Expected: FAIL with module not found for `./slug`.

- [ ] **Step 3: 문서 타입과 slug 구현**

Create `src/lib/documents/types.ts`:

```ts
export type RenderStatus = "idle" | "rendering" | "success" | "error";

export type DocumentRecord = {
  id: string;
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  renderStatus: RenderStatus;
  renderedHtml: string | null;
  renderError: string | null;
  createdAt: string;
  updatedAt: string;
  renderedAt: string | null;
};

export type DocumentSummary = Pick<
  DocumentRecord,
  "id" | "title" | "slug" | "executeCode" | "renderStatus" | "updatedAt" | "renderedAt"
>;

export type SaveDocumentInput = {
  id: string;
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
};
```

Create `src/lib/documents/slug.ts`:

```ts
export function normalizeSlug(input: string, fallback = "untitled") {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (slug.length > 0) {
    return slug;
  }

  const normalizedFallback = fallback
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalizedFallback || "untitled";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:

```bash
pnpm test src/lib/documents/slug.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/types.ts src/lib/documents/slug.ts src/lib/documents/slug.test.ts
git commit -m "feat: 문서 slug 정규화 추가"
```

---

### Task 3: SQLite document repository

**Files:**
- Create: `src/lib/db/connection.ts`
- Create: `src/lib/documents/repository.ts`
- Test: `src/lib/documents/repository.test.ts`

- [ ] **Step 1: 실패하는 repository 테스트 작성**

Create `src/lib/documents/repository.test.ts`:

```ts
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

    repository.markRenderSuccess(document.id, "<h1>Done</h1>", "2026-06-24T00:00:00.000Z");
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/lib/documents/repository.test.ts
```

Expected: FAIL with module not found for `./repository`.

- [ ] **Step 3: SQLite connection 구현**

Create `src/lib/db/connection.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureDocumentSchema } from "@/lib/documents/repository";

let singleton: Database.Database | null = null;

function resolveDatabasePath() {
  return (
    process.env.QUARTO_STUDIO_DB_PATH ??
    path.join(process.cwd(), "data", "quarto-studio.db")
  );
}

export function openAppDatabase() {
  if (singleton) {
    return singleton;
  }

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  singleton = new Database(dbPath);
  ensureDocumentSchema(singleton);
  return singleton;
}
```

- [ ] **Step 4: repository 구현**

Create `src/lib/documents/repository.ts`:

```ts
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { DocumentRecord, DocumentSummary, SaveDocumentInput } from "./types";

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
  const selectAll = db.prepare<[], DocumentRow>(
    "select * from documents order by updated_at desc"
  );

  return {
    listDocuments(): DocumentSummary[] {
      return selectAll.all().map(toDocument).map(toSummary);
    },

    getDocument(id: string): DocumentRecord | null {
      const row = selectById.get(id);
      return row ? toDocument(row) : null;
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

      return document;
    },

    updateDocument(input: SaveDocumentInput): DocumentRecord {
      const updatedAt = nowIso();
      db.prepare(`
        update documents
        set title = ?, slug = ?, content = ?, execute_code = ?, updated_at = ?
        where id = ?
      `).run(
        input.title,
        input.slug,
        input.content,
        input.executeCode ? 1 : 0,
        updatedAt,
        input.id
      );

      const saved = this.getDocument(input.id);
      if (!saved) {
        throw new Error(`Document not found: ${input.id}`);
      }
      return saved;
    },

    markRendering(id: string): void {
      db.prepare(
        "update documents set render_status = 'rendering', render_error = null where id = ?"
      ).run(id);
    },

    markRenderSuccess(id: string, renderedHtml: string, renderedAt = nowIso()): void {
      db.prepare(`
        update documents
        set render_status = 'success', rendered_html = ?, render_error = null, rendered_at = ?
        where id = ?
      `).run(renderedHtml, renderedAt, id);
    },

    markRenderError(id: string, renderError: string): void {
      db.prepare(
        "update documents set render_status = 'error', render_error = ? where id = ?"
      ).run(renderError, id);
    }
  };
}
```

- [ ] **Step 5: repository 테스트 통과 확인**

Run:

```bash
pnpm test src/lib/documents/repository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/connection.ts src/lib/documents/repository.ts src/lib/documents/repository.test.ts
git commit -m "feat: SQLite 문서 저장소 추가"
```

---

### Task 4: Quarto project 파일과 command builder

**Files:**
- Create: `src/lib/quarto/project.ts`
- Test: `src/lib/quarto/project.test.ts`

- [ ] **Step 1: 실패하는 Quarto project 테스트 작성**

Create `src/lib/quarto/project.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQuartoProjectFiles, buildQuartoRenderCommand } from "./project";

describe("buildQuartoProjectFiles", () => {
  it("코드 실행이 꺼진 문서는 execute.eval false로 렌더링한다", () => {
    const files = buildQuartoProjectFiles({
      content: "# Hello",
      executeCode: false
    });

    expect(files.indexQmd).toBe("# Hello");
    expect(files.quartoYml).toContain("eval: false");
    expect(files.quartoYml).toContain("embed-resources: true");
    expect(files.quartoYml).toContain("format:");
  });

  it("코드 실행이 켜진 문서는 execute.eval true로 렌더링한다", () => {
    const files = buildQuartoProjectFiles({
      content: "# Report",
      executeCode: true
    });

    expect(files.quartoYml).toContain("eval: true");
  });
});

describe("buildQuartoRenderCommand", () => {
  it("단일 index.qmd HTML 렌더링 명령을 만든다", () => {
    expect(buildQuartoRenderCommand()).toEqual([
      "quarto",
      ["render", "index.qmd", "--to", "html"]
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/lib/quarto/project.test.ts
```

Expected: FAIL with module not found for `./project`.

- [ ] **Step 3: project builder 구현**

Create `src/lib/quarto/project.ts`:

```ts
type QuartoProjectInput = {
  content: string;
  executeCode: boolean;
};

export function buildQuartoProjectFiles(input: QuartoProjectInput) {
  return {
    indexQmd: input.content,
    quartoYml: [
      "project:",
      "  type: default",
      "format:",
      "  html:",
      "    toc: true",
      "    theme: cosmo",
      "    embed-resources: true",
      "execute:",
      `  eval: ${input.executeCode ? "true" : "false"}`,
      ""
    ].join("\n")
  };
}

export function buildQuartoRenderCommand(): [string, string[]] {
  return ["quarto", ["render", "index.qmd", "--to", "html"]];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:

```bash
pnpm test src/lib/quarto/project.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quarto/project.ts src/lib/quarto/project.test.ts
git commit -m "feat: Quarto 렌더링 프로젝트 구성 추가"
```

---

### Task 5: Quarto render service

**Files:**
- Create: `src/lib/quarto/runtime.ts`
- Create: `src/lib/quarto/render.ts`
- Test: `src/lib/quarto/render.test.ts`

- [ ] **Step 1: 실패하는 render service 테스트 작성**

Create `src/lib/quarto/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "@/lib/documents/types";
import { renderDocumentToHtml } from "./render";

const baseDocument: DocumentRecord = {
  id: "doc-1",
  title: "Report",
  slug: "report",
  content: "# Report",
  executeCode: false,
  renderStatus: "idle",
  renderedHtml: null,
  renderError: null,
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
  renderedAt: null
};

describe("renderDocumentToHtml", () => {
  it("임시 Quarto project를 만들고 성공 HTML을 반환한다", async () => {
    const writes: Array<{ fileName: string; content: string }> = [];

    const result = await renderDocumentToHtml(baseDocument, {
      createTempDir: async () => "/tmp/quarto-studio-test",
      writeFile: async (fileName, content) => {
        writes.push({ fileName, content });
      },
      readFile: async () => "<main><h1>Report</h1></main>",
      removeDir: async () => undefined,
      runProcess: async () => ({ code: 0, stdout: "ok", stderr: "" }),
      timeoutMs: 15000
    });

    expect(result).toEqual({
      ok: true,
      html: "<main><h1>Report</h1></main>",
      log: "ok"
    });
    expect(writes).toContainEqual({
      fileName: "/tmp/quarto-studio-test/index.qmd",
      content: "# Report"
    });
    expect(writes.some((write) => write.content.includes("eval: false"))).toBe(true);
  });

  it("Quarto 실패를 error result로 매핑한다", async () => {
    const result = await renderDocumentToHtml(
      { ...baseDocument, executeCode: true },
      {
        createTempDir: async () => "/tmp/quarto-studio-test",
        writeFile: async () => undefined,
        readFile: async () => "",
        removeDir: async () => undefined,
        runProcess: async () => ({ code: 1, stdout: "", stderr: "syntax error" }),
        timeoutMs: 15000
      }
    );

    expect(result).toEqual({
      ok: false,
      error: "syntax error",
      log: "syntax error"
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/lib/quarto/render.test.ts
```

Expected: FAIL with module not found for `./render`.

- [ ] **Step 3: process runtime 구현**

Create `src/lib/quarto/runtime.ts`:

```ts
import { spawn } from "node:child_process";

export type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      resolve({
        code: 124,
        stdout,
        stderr: `${stderr}\nRender timed out after ${options.timeoutMs}ms`.trim()
      });
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
```

- [ ] **Step 4: render service 구현**

Create `src/lib/quarto/render.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DocumentRecord } from "@/lib/documents/types";
import { buildQuartoProjectFiles, buildQuartoRenderCommand } from "./project";
import { runProcess, type ProcessResult } from "./runtime";

type RenderSuccess = {
  ok: true;
  html: string;
  log: string;
};

type RenderFailure = {
  ok: false;
  error: string;
  log: string;
};

export type RenderResult = RenderSuccess | RenderFailure;

type RenderDependencies = {
  createTempDir: () => Promise<string>;
  writeFile: (fileName: string, content: string) => Promise<void>;
  readFile: (fileName: string) => Promise<string>;
  removeDir: (dirName: string) => Promise<void>;
  runProcess: (
    command: string,
    args: string[],
    options: { cwd: string; timeoutMs: number }
  ) => Promise<ProcessResult>;
  timeoutMs: number;
};

function defaultTimeoutMs() {
  return Number(process.env.QUARTO_RENDER_TIMEOUT_MS ?? 15000);
}

function createDefaultDependencies(): RenderDependencies {
  return {
    createTempDir: () => fs.mkdtemp(path.join(os.tmpdir(), "quarto-studio-")),
    writeFile: (fileName, content) => fs.writeFile(fileName, content, "utf8"),
    readFile: (fileName) => fs.readFile(fileName, "utf8"),
    removeDir: (dirName) => fs.rm(dirName, { recursive: true, force: true }),
    runProcess,
    timeoutMs: defaultTimeoutMs()
  };
}

function combineLog(stdout: string, stderr: string) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

export async function renderDocumentToHtml(
  document: DocumentRecord,
  dependencies: RenderDependencies = createDefaultDependencies()
): Promise<RenderResult> {
  const workDir = await dependencies.createTempDir();

  try {
    const files = buildQuartoProjectFiles({
      content: document.content,
      executeCode: document.executeCode
    });
    await dependencies.writeFile(path.join(workDir, "index.qmd"), files.indexQmd);
    await dependencies.writeFile(path.join(workDir, "_quarto.yml"), files.quartoYml);

    const [command, args] = buildQuartoRenderCommand();
    const processResult = await dependencies.runProcess(command, args, {
      cwd: workDir,
      timeoutMs: dependencies.timeoutMs
    });
    const log = combineLog(processResult.stdout, processResult.stderr);

    if (processResult.code !== 0) {
      return {
        ok: false,
        error: log || `quarto exited with code ${processResult.code}`,
        log
      };
    }

    const html = await dependencies.readFile(path.join(workDir, "index.html"));
    return { ok: true, html, log };
  } finally {
    await dependencies.removeDir(workDir);
  }
}
```

- [ ] **Step 5: render service 테스트 통과 확인**

Run:

```bash
pnpm test src/lib/quarto/render.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quarto/runtime.ts src/lib/quarto/render.ts src/lib/quarto/render.test.ts
git commit -m "feat: Quarto HTML 렌더러 추가"
```

---

### Task 6: 문서 application service

**Files:**
- Create: `src/lib/documents/service.ts`
- Test: `src/lib/documents/service.test.ts`

- [ ] **Step 1: 실패하는 service 테스트 작성**

Create `src/lib/documents/service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { DocumentRecord, DocumentSummary, SaveDocumentInput } from "./types";
import { createDocumentService } from "./service";

const document: DocumentRecord = {
  id: "doc-1",
  title: "Getting Started",
  slug: "getting-started",
  content: "# Getting Started",
  executeCode: false,
  renderStatus: "idle",
  renderedHtml: "<h1>Old</h1>",
  renderError: null,
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
  renderedAt: null
};

function createRepository() {
  let current = { ...document };
  const summaries: DocumentSummary[] = [
    {
      id: current.id,
      title: current.title,
      slug: current.slug,
      executeCode: current.executeCode,
      renderStatus: current.renderStatus,
      updatedAt: current.updatedAt,
      renderedAt: current.renderedAt
    }
  ];

  return {
    listDocuments: vi.fn(() => summaries),
    getDocument: vi.fn((id: string) => (id === current.id ? current : null)),
    getOrCreateSeedDocument: vi.fn(() => current),
    updateDocument: vi.fn((input: SaveDocumentInput) => {
      current = { ...current, ...input };
      return current;
    }),
    markRendering: vi.fn(),
    markRenderSuccess: vi.fn((id: string, html: string) => {
      current = { ...current, renderStatus: "success", renderedHtml: html };
    }),
    markRenderError: vi.fn((id: string, error: string) => {
      current = { ...current, renderStatus: "error", renderError: error };
    })
  };
}

describe("createDocumentService", () => {
  it("workspace 초기 데이터에 seed 문서와 목록을 포함한다", () => {
    const repository = createRepository();
    const service = createDocumentService({
      repository,
      renderDocument: vi.fn()
    });

    expect(service.getInitialWorkspace().activeDocument.id).toBe("doc-1");
    expect(service.getInitialWorkspace().documents).toHaveLength(1);
  });

  it("렌더링 전에 문서를 저장하고 성공 HTML을 저장한다", async () => {
    const repository = createRepository();
    const service = createDocumentService({
      repository,
      renderDocument: vi.fn(async () => ({
        ok: true,
        html: "<h1>New</h1>",
        log: "ok"
      }))
    });

    const result = await service.renderDocument({
      id: "doc-1",
      title: "Getting Started",
      slug: "getting-started",
      content: "# New",
      executeCode: false
    });

    expect(repository.updateDocument.mock.invocationCallOrder[0]).toBeLessThan(
      repository.markRendering.mock.invocationCallOrder[0]
    );
    expect(repository.markRenderSuccess).toHaveBeenCalledWith("doc-1", "<h1>New</h1>");
    expect(result.activeDocument.renderedHtml).toBe("<h1>New</h1>");
  });

  it("렌더링 실패 시 마지막 성공 HTML을 유지한다", async () => {
    const repository = createRepository();
    const service = createDocumentService({
      repository,
      renderDocument: vi.fn(async () => ({
        ok: false,
        error: "syntax error",
        log: "syntax error"
      }))
    });

    const result = await service.renderDocument({
      id: "doc-1",
      title: "Getting Started",
      slug: "getting-started",
      content: "# Broken",
      executeCode: true
    });

    expect(repository.markRenderError).toHaveBeenCalledWith("doc-1", "syntax error");
    expect(result.activeDocument.renderedHtml).toBe("<h1>Old</h1>");
    expect(result.activeDocument.renderError).toBe("syntax error");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/lib/documents/service.test.ts
```

Expected: FAIL with module not found for `./service`.

- [ ] **Step 3: service 구현**

Create `src/lib/documents/service.ts`:

```ts
import type { RenderResult } from "@/lib/quarto/render";
import { renderDocumentToHtml } from "@/lib/quarto/render";
import type { DocumentRecord, DocumentSummary, SaveDocumentInput } from "./types";

type DocumentRepository = {
  listDocuments(): DocumentSummary[];
  getDocument(id: string): DocumentRecord | null;
  getOrCreateSeedDocument(): DocumentRecord;
  updateDocument(input: SaveDocumentInput): DocumentRecord;
  markRendering(id: string): void;
  markRenderSuccess(id: string, renderedHtml: string): void;
  markRenderError(id: string, renderError: string): void;
};

type WorkspaceState = {
  documents: DocumentSummary[];
  activeDocument: DocumentRecord;
};

type Dependencies = {
  repository: DocumentRepository;
  renderDocument?: (document: DocumentRecord) => Promise<RenderResult>;
};

export function createDocumentService({
  repository,
  renderDocument = renderDocumentToHtml
}: Dependencies) {
  function getWorkspaceForDocument(document: DocumentRecord): WorkspaceState {
    return {
      documents: repository.listDocuments(),
      activeDocument: document
    };
  }

  return {
    getInitialWorkspace(): WorkspaceState {
      return getWorkspaceForDocument(repository.getOrCreateSeedDocument());
    },

    getWorkspace(documentId: string): WorkspaceState {
      const document = repository.getDocument(documentId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }
      return getWorkspaceForDocument(document);
    },

    saveDocument(input: SaveDocumentInput): WorkspaceState {
      const saved = repository.updateDocument(input);
      return getWorkspaceForDocument(saved);
    },

    async renderDocument(input: SaveDocumentInput): Promise<WorkspaceState> {
      const saved = repository.updateDocument(input);
      repository.markRendering(saved.id);
      const result = await renderDocument(saved);

      if (result.ok) {
        repository.markRenderSuccess(saved.id, result.html);
      } else {
        repository.markRenderError(saved.id, result.error);
      }

      const latest = repository.getDocument(saved.id);
      if (!latest) {
        throw new Error(`Document not found after render: ${saved.id}`);
      }

      return getWorkspaceForDocument(latest);
    }
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:

```bash
pnpm test src/lib/documents/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/service.ts src/lib/documents/service.test.ts
git commit -m "feat: 문서 저장과 렌더링 서비스 추가"
```

---

### Task 7: 3-pane client workspace UI

**Files:**
- Create: `src/components/workspace/types.ts`
- Create: `src/components/workspace/document-sidebar.tsx`
- Create: `src/components/workspace/editor-pane.tsx`
- Create: `src/components/workspace/preview-pane.tsx`
- Create: `src/components/workspace/quarto-workspace.tsx`
- Test: `src/components/workspace/quarto-workspace.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 실패하는 workspace UI 테스트 작성**

Create `src/components/workspace/quarto-workspace.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuartoWorkspace } from "./quarto-workspace";
import type { WorkspaceState } from "./types";

const workspace: WorkspaceState = {
  documents: [
    {
      id: "doc-1",
      title: "Getting Started",
      slug: "getting-started",
      executeCode: false,
      renderStatus: "success",
      updatedAt: "2026-06-24T00:00:00.000Z",
      renderedAt: "2026-06-24T00:00:00.000Z"
    }
  ],
  activeDocument: {
    id: "doc-1",
    title: "Getting Started",
    slug: "getting-started",
    content: "# Getting Started",
    executeCode: false,
    renderStatus: "success",
    renderedHtml: "<h1>Getting Started</h1>",
    renderError: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    renderedAt: "2026-06-24T00:00:00.000Z"
  }
};

describe("QuartoWorkspace", () => {
  it("문서 목록, 에디터, preview를 한 화면에 보여준다", () => {
    render(
      <QuartoWorkspace
        initialWorkspace={workspace}
        saveDocument={vi.fn()}
        renderDocument={vi.fn()}
        selectDocument={vi.fn()}
      />
    );

    expect(screen.getByText("Quarto Studio")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Getting Started")).toBeInTheDocument();
    expect(screen.getByTitle("Rendered preview")).toBeInTheDocument();
  });

  it("코드 실행 toggle과 저장 액션을 호출한다", async () => {
    const user = userEvent.setup();
    const saveDocument = vi.fn(async () => workspace);

    render(
      <QuartoWorkspace
        initialWorkspace={workspace}
        saveDocument={saveDocument}
        renderDocument={vi.fn()}
        selectDocument={vi.fn()}
      />
    );

    await user.click(screen.getByRole("switch", { name: "코드 실행" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({ executeCode: true })
    );
  });

  it("렌더링 오류가 있으면 preview pane에 오류를 함께 표시한다", () => {
    render(
      <QuartoWorkspace
        initialWorkspace={{
          ...workspace,
          activeDocument: {
            ...workspace.activeDocument,
            renderStatus: "error",
            renderError: "syntax error"
          }
        }}
        saveDocument={vi.fn()}
        renderDocument={vi.fn()}
        selectDocument={vi.fn()}
      />
    );

    expect(screen.getByText("syntax error")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/components/workspace/quarto-workspace.test.tsx
```

Expected: FAIL with module not found for `./quarto-workspace`.

- [ ] **Step 3: workspace type 구현**

Create `src/components/workspace/types.ts`:

```ts
import type { DocumentRecord, DocumentSummary, SaveDocumentInput } from "@/lib/documents/types";

export type WorkspaceState = {
  documents: DocumentSummary[];
  activeDocument: DocumentRecord;
};

export type WorkspaceAction = (input: SaveDocumentInput) => Promise<WorkspaceState>;

export type SelectDocumentAction = (documentId: string) => Promise<WorkspaceState>;
```

- [ ] **Step 4: sidebar/editor/preview component 구현**

Create `src/components/workspace/document-sidebar.tsx`:

```tsx
import { FilePlus, Search } from "lucide-react";
import type { DocumentSummary } from "@/lib/documents/types";

type Props = {
  documents: DocumentSummary[];
  activeDocumentId: string;
  onSelectDocument: (documentId: string) => void;
};

export function DocumentSidebar({ documents, activeDocumentId, onSelectDocument }: Props) {
  return (
    <aside className="document-sidebar">
      <div className="sidebar-header">
        <span>Documents</span>
        <button className="icon-button" type="button" aria-label="새 문서">
          <FilePlus size={16} />
        </button>
      </div>
      <label className="search-field">
        <Search size={15} />
        <input aria-label="문서 검색" />
      </label>
      <div className="document-list">
        {documents.map((document) => (
          <button
            className={`document-item ${document.id === activeDocumentId ? "active" : ""}`}
            key={document.id}
            type="button"
            onClick={() => onSelectDocument(document.id)}
          >
            <strong>{document.title}</strong>
            <span>
              {document.executeCode ? "code on" : "code off"} · {document.renderStatus}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

Create `src/components/workspace/editor-pane.tsx`:

```tsx
import { Save, ToggleLeft, ToggleRight } from "lucide-react";

type Props = {
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  isBusy: boolean;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onExecuteCodeChange: (value: boolean) => void;
  onSave: () => void;
};

export function EditorPane({
  title,
  slug,
  content,
  executeCode,
  isBusy,
  onTitleChange,
  onSlugChange,
  onContentChange,
  onExecuteCodeChange,
  onSave
}: Props) {
  return (
    <section className="workspace-pane editor-pane">
      <div className="pane-header">
        <div className="title-fields">
          <input
            aria-label="문서 제목"
            className="title-input"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <input
            aria-label="문서 slug"
            className="slug-input"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
          />
        </div>
        <div className="pane-actions">
          <button
            aria-label="코드 실행"
            aria-checked={executeCode}
            className="toggle-button"
            role="switch"
            type="button"
            onClick={() => onExecuteCodeChange(!executeCode)}
          >
            {executeCode ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {executeCode ? "Code on" : "Code off"}
          </button>
          <button className="secondary-button" type="button" onClick={onSave} disabled={isBusy}>
            <Save size={16} />
            저장
          </button>
        </div>
      </div>
      <textarea
        aria-label="QMD content"
        className="qmd-editor"
        spellCheck={false}
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
      />
    </section>
  );
}
```

Create `src/components/workspace/preview-pane.tsx`:

```tsx
import { AlertCircle, ExternalLink } from "lucide-react";
import type { DocumentRecord } from "@/lib/documents/types";

type Props = {
  document: DocumentRecord;
  isBusy: boolean;
  onRender: () => void;
};

export function PreviewPane({ document, isBusy, onRender }: Props) {
  const html =
    document.renderedHtml ??
    "<main><h1>Preview 없음</h1><p>렌더링을 실행하면 HTML 미리보기가 표시됩니다.</p></main>";

  return (
    <section className="workspace-pane preview-pane">
      <div className="pane-header">
        <div>
          <h2>Rendered Preview</h2>
          <p>{document.renderedAt ? `Last render ${document.renderedAt}` : "Not rendered"}</p>
        </div>
        <button className="primary-button" type="button" onClick={onRender} disabled={isBusy}>
          <ExternalLink size={16} />
          렌더
        </button>
      </div>
      <iframe
        className="preview-frame"
        sandbox=""
        srcDoc={html}
        title="Rendered preview"
      />
      {document.renderError ? (
        <div className="render-error" role="alert">
          <AlertCircle size={16} />
          <pre>{document.renderError}</pre>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: workspace coordinator 구현**

Create `src/components/workspace/quarto-workspace.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Database, Play } from "lucide-react";
import { normalizeSlug } from "@/lib/documents/slug";
import type { SaveDocumentInput } from "@/lib/documents/types";
import { DocumentSidebar } from "./document-sidebar";
import { EditorPane } from "./editor-pane";
import { PreviewPane } from "./preview-pane";
import type { SelectDocumentAction, WorkspaceAction, WorkspaceState } from "./types";

type Props = {
  initialWorkspace: WorkspaceState;
  saveDocument: WorkspaceAction;
  renderDocument: WorkspaceAction;
  selectDocument: SelectDocumentAction;
};

export function QuartoWorkspace({
  initialWorkspace,
  saveDocument,
  renderDocument,
  selectDocument
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [draft, setDraft] = useState(initialWorkspace.activeDocument);
  const [isPending, startTransition] = useTransition();

  const input = useMemo<SaveDocumentInput>(
    () => ({
      id: draft.id,
      title: draft.title,
      slug: normalizeSlug(draft.slug || draft.title, draft.id),
      content: draft.content,
      executeCode: draft.executeCode
    }),
    [draft]
  );

  const applyWorkspace = (nextWorkspace: WorkspaceState) => {
    setWorkspace(nextWorkspace);
    setDraft(nextWorkspace.activeDocument);
  };

  const runAction = (action: WorkspaceAction) => {
    startTransition(async () => {
      applyWorkspace(await action(input));
    });
  };

  const handleSelectDocument = (documentId: string) => {
    startTransition(async () => {
      applyWorkspace(await selectDocument(documentId));
    });
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>Quarto Studio</span>
        </div>
        <div className="topbar-status">
          <span className="status-pill">
            <Database size={14} />
            SQLite
          </span>
          <span className="status-pill">Node 24</span>
          <button className="primary-button" type="button" onClick={() => runAction(renderDocument)}>
            <Play size={16} />
            렌더
          </button>
        </div>
      </header>
      <div className="workspace-grid">
        <DocumentSidebar
          documents={workspace.documents}
          activeDocumentId={draft.id}
          onSelectDocument={handleSelectDocument}
        />
        <EditorPane
          title={draft.title}
          slug={draft.slug}
          content={draft.content}
          executeCode={draft.executeCode}
          isBusy={isPending}
          onTitleChange={(title) => setDraft((current) => ({ ...current, title }))}
          onSlugChange={(slug) => setDraft((current) => ({ ...current, slug }))}
          onContentChange={(content) => setDraft((current) => ({ ...current, content }))}
          onExecuteCodeChange={(executeCode) =>
            setDraft((current) => ({ ...current, executeCode }))
          }
          onSave={() => runAction(saveDocument)}
        />
        <PreviewPane document={draft} isBusy={isPending} onRender={() => runAction(renderDocument)} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: 남색 IT 서비스 CSS 구현**

Append to `src/app/globals.css`:

```css
.studio-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: 56px 1fr;
  background: #eef3f8;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background: #0b1f3a;
  color: #f8fbff;
}

.brand,
.topbar-status,
.pane-actions,
.status-pill,
.primary-button,
.secondary-button,
.toggle-button,
.search-field {
  display: inline-flex;
  align-items: center;
}

.brand {
  gap: 10px;
  font-weight: 800;
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: #38bdf8;
  color: #09223d;
}

.topbar-status {
  gap: 8px;
}

.status-pill,
.toggle-button {
  gap: 6px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #d8e7f8;
  font-size: 12px;
}

.primary-button,
.secondary-button,
.icon-button {
  border: 0;
  cursor: pointer;
}

.primary-button {
  gap: 7px;
  height: 34px;
  border-radius: 6px;
  padding: 0 12px;
  background: #10b981;
  color: #062116;
  font-weight: 800;
}

.secondary-button {
  gap: 7px;
  height: 34px;
  border-radius: 6px;
  padding: 0 12px;
  background: #eaf3ff;
  color: #1e3a5f;
  font-weight: 760;
}

.workspace-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 250px minmax(360px, 1fr) minmax(380px, 1fr);
}

.document-sidebar {
  min-width: 0;
  padding: 14px;
  background: #102a4a;
  color: #dce9f7;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 800;
  color: #a9c3dd;
}

.icon-button {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.08);
  color: #dce9f7;
}

.search-field {
  gap: 8px;
  height: 36px;
  border: 1px solid rgba(216, 231, 248, 0.18);
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(5, 18, 34, 0.35);
}

.search-field input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #dce9f7;
}

.document-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.document-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 10px;
  display: grid;
  gap: 4px;
  text-align: left;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  cursor: pointer;
}

.document-item span {
  color: #8da7c1;
  font-size: 12px;
}

.document-item.active {
  border-color: #93c5fd;
  background: #f8fbff;
  color: #142033;
}

.workspace-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #d8e2ee;
  background: #f8fbff;
}

.preview-pane {
  border-right: 0;
  background: #f2f6fa;
}

.pane-header {
  min-height: 68px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #d8e2ee;
  background: #ffffff;
}

.pane-header h2 {
  margin: 0;
  font-size: 14px;
}

.pane-header p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
}

.title-fields {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.title-input,
.slug-input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
}

.title-input {
  color: #142033;
  font-size: 16px;
  font-weight: 800;
}

.slug-input {
  color: #64748b;
  font-size: 12px;
}

.pane-actions {
  gap: 8px;
}

.toggle-button {
  color: #1e3a5f;
  background: #eaf3ff;
  border-color: #cfe0f5;
}

.qmd-editor {
  flex: 1;
  width: 100%;
  resize: none;
  border: 0;
  outline: 0;
  padding: 16px;
  background:
    linear-gradient(#ffffff 31px, #eff5fb 32px),
    linear-gradient(90deg, #f5f8fb 0, #f5f8fb 42px, transparent 42px);
  background-size: 100% 32px, 100% 100%;
  color: #23314a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 32px;
}

.preview-frame {
  flex: 1;
  margin: 14px;
  border: 1px solid #cddaea;
  border-radius: 8px;
  background: #ffffff;
}

.render-error {
  margin: 0 14px 14px;
  border: 1px solid #fecaca;
  border-radius: 7px;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 8px;
  background: #fff1f2;
  color: #9f1239;
}

.render-error pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

@media (max-width: 980px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .document-sidebar,
  .workspace-pane {
    min-height: 360px;
  }
}
```

- [ ] **Step 7: UI 테스트 통과 확인**

Run:

```bash
pnpm test src/components/workspace/quarto-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/workspace src/app/globals.css
git commit -m "feat: Quarto Studio 3-pane UI 추가"
```

---

### Task 8: Next.js server actions와 실제 workspace 연결

**Files:**
- Create: `src/lib/db/app-service.ts`
- Test: `src/lib/db/app-service.test.ts`
- Create: `src/app/actions.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 실패하는 app service factory 테스트 작성**

Create `src/lib/db/app-service.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppDocumentService } from "./app-service";

let tempDir: string;

describe("createAppDocumentService", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quarto-studio-db-"));
    process.env.QUARTO_STUDIO_DB_PATH = path.join(tempDir, "test.db");
  });

  afterEach(async () => {
    delete process.env.QUARTO_STUDIO_DB_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("SQLite repository와 document service를 조립해 seed workspace를 반환한다", () => {
    const service = createAppDocumentService();
    const workspace = service.getInitialWorkspace();

    expect(workspace.activeDocument.title).toBe("Getting Started");
    expect(workspace.documents).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test src/lib/db/app-service.test.ts
```

Expected: FAIL with module not found for `./app-service`.

- [ ] **Step 3: app service factory 구현**

Create `src/lib/db/app-service.ts`:

```ts
import { createDocumentRepository } from "@/lib/documents/repository";
import { createDocumentService } from "@/lib/documents/service";
import { openAppDatabase } from "./connection";

export function createAppDocumentService() {
  const db = openAppDatabase();
  return createDocumentService({
    repository: createDocumentRepository(db)
  });
}
```

- [ ] **Step 4: app service factory 테스트 통과 확인**

Run:

```bash
pnpm test src/lib/db/app-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: server actions 작성**

Create `src/app/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAppDocumentService } from "@/lib/db/app-service";
import type { SaveDocumentInput } from "@/lib/documents/types";

export async function selectDocumentAction(documentId: string) {
  return createAppDocumentService().getWorkspace(documentId);
}

export async function saveDocumentAction(input: SaveDocumentInput) {
  const workspace = createAppDocumentService().saveDocument(input);
  revalidatePath("/");
  return workspace;
}

export async function renderDocumentAction(input: SaveDocumentInput) {
  const workspace = await createAppDocumentService().renderDocument(input);
  revalidatePath("/");
  return workspace;
}
```

- [ ] **Step 6: page를 실제 workspace로 교체**

Modify `src/app/page.tsx`:

```tsx
import {
  renderDocumentAction,
  saveDocumentAction,
  selectDocumentAction
} from "./actions";
import { QuartoWorkspace } from "@/components/workspace/quarto-workspace";
import { createAppDocumentService } from "@/lib/db/app-service";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const initialWorkspace = createAppDocumentService().getInitialWorkspace();

  return (
    <QuartoWorkspace
      initialWorkspace={initialWorkspace}
      saveDocument={saveDocumentAction}
      renderDocument={renderDocumentAction}
      selectDocument={selectDocumentAction}
    />
  );
}
```

- [ ] **Step 7: 연결 검증**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/app-service.ts src/lib/db/app-service.test.ts src/app/actions.ts src/app/page.tsx
git commit -m "feat: 문서 workspace server action 연결"
```

---

### Task 9: Quarto CLI 실제 렌더링과 최종 검증

**Files:**
- Create: `README.md`

- [ ] **Step 1: Quarto CLI 설치 여부 확인**

Run:

```bash
quarto --version
```

Expected: Quarto version string이 출력된다. 실패하면 README에 따라 Quarto CLI를 설치한 뒤 다시 실행한다.

- [ ] **Step 2: README 작성**

Create `README.md`:

````md
# Quarto Studio

SQLite에 저장된 QMD 문서를 Next.js 웹 인터페이스에서 편집하고, Quarto CLI로 HTML 렌더링 결과를 미리보기하는 로컬 문서 CMS 프로토타입입니다.

## 요구 사항

- Node 24
- pnpm 9.15.9
- Quarto CLI

## 실행

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

브라우저에서 `http://localhost:3000`을 열면 3-pane 작업 공간이 표시됩니다.

## 검증

```bash
pnpm verify
```

## 렌더링 정책

새 문서는 코드 실행이 꺼진 상태로 시작합니다. 문서별 `Code on` toggle을 켠 경우에만 `quarto render` 중 코드 실행을 허용합니다.
````

- [ ] **Step 3: 전체 검증**

Run:

```bash
pnpm verify
```

Expected: lint, typecheck, test, build 모두 PASS.

- [ ] **Step 4: dev server 실행**

Run:

```bash
pnpm dev
```

Expected: `http://localhost:3000`에서 앱이 실행된다. 포트가 사용 중이면 Next.js가 안내하는 다른 포트를 사용한다.

- [ ] **Step 5: 브라우저 수동 확인**

Open the dev server URL and verify:

- 첫 화면이 landing page가 아니라 3-pane Quarto Studio workspace다.
- seed 문서가 목록에 보인다.
- QMD content를 수정하고 저장하면 reload 뒤에도 SQLite에서 유지된다.
- 렌더를 누르면 Quarto HTML preview가 표시된다.
- 코드 실행 toggle을 켜고 끌 수 있고 문서 목록 metadata에 반영된다.
- 오류가 나는 QMD를 렌더링하면 error panel이 보이고 마지막 성공 preview는 유지된다.

- [ ] **Step 6: 최종 Commit**

```bash
git add README.md
git commit -m "docs: Quarto Studio 실행 가이드 추가"
```
