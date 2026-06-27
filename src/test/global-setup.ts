import { execFileSync } from "node:child_process";

// 테스트 실행 1회 전, 테스트 전용 DB(quarto_studio_test)를 생성·마이그레이션한다.
// 이렇게 해야 통합 테스트가 dev DB가 아니라 격리된 테스트 DB에서 돈다.
export default function setup() {
  execFileSync("node", ["scripts/setup-test-db.mjs"], { stdio: "inherit" });
}
