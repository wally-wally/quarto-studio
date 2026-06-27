import "@testing-library/jest-dom/vitest";

// 통합 테스트는 TRUNCATE로 모든 테이블을 비우므로, dev/prod와 분리된 '테스트 전용' DB를
// 기본값으로 제공한다(절대 quarto_studio(dev)를 가리키지 않는다). global-setup이 이 DB를
// 생성·마이그레이션하고, src/test/db.ts의 가드가 비-테스트 DB면 TRUNCATE를 막는다.
// 프로덕션 코드(connection.ts)는 DATABASE_URL을 명시적으로 요구한다.
process.env.DATABASE_URL ??=
  "postgres://quarto:quarto@localhost:5432/quarto_studio_test";
