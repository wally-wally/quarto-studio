import postgres from "postgres";

// 통합 테스트 전용 DB. dev/prod DB와 반드시 분리한다(테스트는 TRUNCATE로 전체를 비운다).
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quarto:quarto@localhost:5432/quarto_studio_test";

function databaseName(connectionString: string): string {
  try {
    return new URL(connectionString).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

/**
 * 통합 테스트는 `TRUNCATE ... CASCADE`로 모든 테이블을 비운다. 실수로 dev/prod DB를
 * 가리키면 데이터가 영구 소실되므로, DB 이름에 'test'가 없으면 즉시 throw해 사고를 막는다.
 */
export function assertTestDatabase(connectionString = TEST_DATABASE_URL): void {
  const name = databaseName(connectionString);
  if (!/test/i.test(name)) {
    throw new Error(
      `[test guard] 통합 테스트가 비-테스트 DB('${name || connectionString}')를 가리킵니다. ` +
        `TRUNCATE로 데이터가 삭제될 수 있어 중단합니다. ` +
        `DATABASE_URL의 DB 이름에 'test'가 포함돼야 합니다(예: quarto_studio_test).`,
    );
  }
}

/** 가드를 통과한 뒤 테스트 DB 연결을 만든다. */
export function createTestSql(): ReturnType<typeof postgres> {
  assertTestDatabase();
  return postgres(TEST_DATABASE_URL);
}

/** 모든 테이블을 비운다. 호출 전 테스트 DB인지 다시 확인한다. */
export async function truncateAll(
  sql: ReturnType<typeof postgres>,
): Promise<void> {
  assertTestDatabase();
  await sql`TRUNCATE users, sessions, documents, render_jobs, artifacts RESTART IDENTITY CASCADE`;
}
