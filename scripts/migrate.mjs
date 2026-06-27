// 경량 마이그레이션 러너: db/migrations/*.sql 를 이름순으로 적용하고
// schema_migrations 테이블로 적용 여부를 추적한다.
// 사용: DATABASE_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

async function main() {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const appliedRows = await sql`select name from schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.name));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const text = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`applying ${file} ...`);
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    count += 1;
  }

  console.log(count === 0 ? "마이그레이션: 적용할 항목 없음" : `마이그레이션 ${count}건 적용 완료`);
}

main()
  .then(() => sql.end())
  .catch((error) => {
    console.error(error);
    return sql.end().finally(() => process.exit(1));
  });
