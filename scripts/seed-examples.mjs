// examples/*.qmd 를 Postgres documents 테이블에 시드(slug 기준 upsert).
// 사용: DATABASE_URL=... node scripts/seed-examples.mjs
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = process.cwd();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}
const EXAMPLES_DIR = path.join(ROOT, "examples");

// Python/R/Julia 청크는 서버 실행이 필요하므로 execute_code=true, Markdown/OJS는 false.
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

const sql = postgres(DATABASE_URL, { onnotice: () => {} });

const files = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((name) => name.endsWith(".qmd"))
  .sort();

const entries = files.map((fileName) => {
  const content = fs.readFileSync(path.join(EXAMPLES_DIR, fileName), "utf8");
  const slug = fileName.replace(/\.qmd$/, "");
  return {
    slug,
    title: extractTitle(content, slug),
    content,
    executeCode: EXECUTABLE_LANGS.has(langToken(fileName)),
  };
});

for (const entry of entries) {
  await sql`
    insert into documents (title, slug, content, execute_code)
    values (${entry.title}, ${entry.slug}, ${entry.content}, ${entry.executeCode})
    on conflict (slug) do update
      set title = excluded.title,
          content = excluded.content,
          execute_code = excluded.execute_code,
          updated_at = now()
  `;
}

console.log(`Seeded ${entries.length} example documents into Postgres`);
for (const entry of entries) {
  console.log(
    `  - ${entry.slug.padEnd(28)} execute_code=${entry.executeCode}  "${entry.title}"`,
  );
}

await sql.end();
