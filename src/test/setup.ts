import "@testing-library/jest-dom/vitest";

// 통합 테스트(repository/app-service)가 로컬 Postgres를 쓰도록 기본값 제공.
// 프로덕션 코드(connection.ts)는 DATABASE_URL을 명시적으로 요구한다.
process.env.DATABASE_URL ??=
  "postgres://quarto:quarto@localhost:5432/quarto_studio";
