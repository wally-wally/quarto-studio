import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DB_PATH =
  process.env.QUARTO_STUDIO_DB_PATH ?? "./data/quarto-studio.db";
const EXAMPLES_DIR = path.join(ROOT, "examples");

// Python/R/Julia 청크는 서버 실행이 필요하므로 execute_code = 1,
// Markdown/Observable JS 는 0.
const EXECUTABLE_LANGS = new Set(["python", "r", "julia"]);

function extractTitle(content, fallback) {
  const match = content.match(/^title:\s*"(.*?)"\s*$/m);
  return match ? match[1] : fallback;
}

function langToken(fileName) {
  // 파일명 패턴: NN-LANG-rest.qmd
  const parts = fileName.replace(/\.qmd$/, "").split("-");
  return parts[1] ?? "";
}

const db = new Database(path.resolve(ROOT, DB_PATH));
db.pragma("journal_mode = WAL");

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

const files = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((name) => name.endsWith(".qmd"))
  .sort();

const deleteBySlug = db.prepare("delete from documents where slug = ?");
const insert = db.prepare(`
  insert into documents (
    id, title, slug, content, execute_code, render_status,
    rendered_html, render_error, created_at, updated_at, rendered_at
  ) values (?, ?, ?, ?, ?, 'idle', null, null, ?, ?, null)
`);

const seedAll = db.transaction((entries) => {
  for (const entry of entries) {
    deleteBySlug.run(entry.slug); // 재실행 시 갱신(upsert) 효과
    insert.run(
      entry.id,
      entry.title,
      entry.slug,
      entry.content,
      entry.executeCode ? 1 : 0,
      entry.timestamp,
      entry.timestamp
    );
  }
});

const now = new Date().toISOString();
const entries = files.map((fileName) => {
  const content = fs.readFileSync(path.join(EXAMPLES_DIR, fileName), "utf8");
  const slug = fileName.replace(/\.qmd$/, "");
  return {
    id: crypto.randomUUID(),
    slug,
    title: extractTitle(content, slug),
    content,
    executeCode: EXECUTABLE_LANGS.has(langToken(fileName)),
    timestamp: now
  };
});

seedAll(entries);

console.log(`Seeded ${entries.length} example documents into ${DB_PATH}`);
for (const entry of entries) {
  console.log(
    `  - ${entry.slug.padEnd(28)} execute_code=${entry.executeCode ? 1 : 0}  "${entry.title}"`
  );
}

db.close();
