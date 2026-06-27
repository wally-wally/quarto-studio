// examples/*.qmd 를 Postgres documents 테이블에 시드(slug 기준 upsert).
// 사용: SEED_USER_EMAIL=user@example.com DATABASE_URL=... node scripts/seed-examples.mjs
// SEED_USER_EMAIL: 이 이메일의 사용자(users 테이블)를 owner로 사용합니다.
//   사용자가 없으면 에러로 종료합니다.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = process.cwd();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL;
if (!SEED_USER_EMAIL) {
  console.error("SEED_USER_EMAIL 환경변수가 필요합니다.");
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

const userRows = await sql`
  SELECT id FROM users WHERE email = ${SEED_USER_EMAIL}
`;
if (userRows.length === 0) {
  console.error(`사용자를 찾을 수 없습니다: ${SEED_USER_EMAIL}`);
  await sql.end();
  process.exit(1);
}
const ownerId = userRows[0].id;

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
    insert into documents (title, slug, content, execute_code, owner_id)
    values (${entry.title}, ${entry.slug}, ${entry.content}, ${entry.executeCode}, ${ownerId})
    on conflict (owner_id, slug) do update
      set title = excluded.title,
          content = excluded.content,
          execute_code = excluded.execute_code,
          updated_at = now()
  `;
}

console.log(`Seeded ${entries.length} example documents for ${SEED_USER_EMAIL} (owner_id=${ownerId})`);
for (const entry of entries) {
  console.log(
    `  - ${entry.slug.padEnd(28)} execute_code=${entry.executeCode}  "${entry.title}"`,
  );
}

await sql.end();
