// 통합 테스트용 DB(quarto_studio_test)를 생성하고 마이그레이션한다.
// dev DB(quarto_studio)와 분리해, 테스트의 TRUNCATE가 실 데이터를 건드리지 못하게 한다.
// 사용: node scripts/setup-test-db.mjs  (pnpm test:db) — vitest global-setup도 이걸 호출한다.
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const HOST = process.env.TEST_PG_HOST ?? "localhost";
const PORT = process.env.TEST_PG_PORT ?? "5432";
const USER = process.env.TEST_PG_USER ?? "quarto";
const PASS = process.env.TEST_PG_PASSWORD ?? "quarto";
const TEST_DB = process.env.TEST_PG_DB ?? "quarto_studio_test";

const ADMIN_URL = `postgres://${USER}:${PASS}@${HOST}:${PORT}/postgres`;
const TEST_URL = `postgres://${USER}:${PASS}@${HOST}:${PORT}/${TEST_DB}`;

if (!/test/i.test(TEST_DB)) {
  console.error(`테스트 DB 이름에 'test'가 없습니다: ${TEST_DB}`);
  process.exit(1);
}

const admin = postgres(ADMIN_URL, { onnotice: () => {} });
try {
  const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`;
  if (rows.length === 0) {
    await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
    console.log(`created database ${TEST_DB}`);
  } else {
    console.log(`database ${TEST_DB} already exists`);
  }
} catch (error) {
  console.error(
    `Postgres에 연결하지 못했습니다(${ADMIN_URL}). 'docker compose up -d postgres'로 먼저 띄우세요.`,
  );
  console.error(String(error?.message ?? error));
  process.exit(1);
} finally {
  await admin.end();
}

// 같은 마이그레이션 러너를 테스트 DB에 대해 실행.
execFileSync("node", ["scripts/migrate.mjs"], {
  env: { ...process.env, DATABASE_URL: TEST_URL },
  stdio: "inherit",
});
