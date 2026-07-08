// 실제 Daytona sandbox에서 smoke qmd(Python·R·Julia·한글 폰트)를 렌더해 스냅샷을 검증한다.
// 사용: set -a; source .env.local; set +a; pnpm smoke:daytona
// 산출 html은 docker/render/smoke/*.html (gitignore 대상)에 저장된다.
import fs from "node:fs/promises";
import path from "node:path";
import { buildQuartoProjectFiles } from "../src/lib/quarto/project";
import { runQuartoRender } from "../worker/daytona";

const SMOKE_DIR = path.join(process.cwd(), "docker/render/smoke");
// julia 첫 렌더는 precompile 때문에 느릴 수 있어 워커 기본(60s)보다 여유를 둔다.
const SMOKE_TIMEOUT_MS = 180_000;

async function main(): Promise<void> {
  const entries = (await fs.readdir(SMOKE_DIR)).filter((name) => name.endsWith(".qmd")).sort();
  if (entries.length === 0) {
    console.error(`smoke qmd가 없습니다: ${SMOKE_DIR}`);
    process.exit(1);
  }

  let failed = 0;
  for (const name of entries) {
    const content = await fs.readFile(path.join(SMOKE_DIR, name), "utf8");
    const files = buildQuartoProjectFiles({ content, executeCode: true });
    const startedAt = Date.now();
    const outcome = await runQuartoRender({
      jobId: `smoke-${name}`,
      files,
      timeoutMs: SMOKE_TIMEOUT_MS,
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (outcome.kind === "success") {
      const htmlPath = path.join(SMOKE_DIR, name.replace(/\.qmd$/, ".html"));
      await fs.writeFile(htmlPath, outcome.html);
      console.log(`✅ ${name} (${elapsed}s, ${outcome.html.length} bytes)`);
    } else {
      failed += 1;
      const log = "log" in outcome ? outcome.log.slice(-2000) : "";
      console.error(`❌ ${name}: ${outcome.kind} (${elapsed}s)\n${log}`);
    }
  }

  console.log(failed === 0 ? "\n스모크 전체 통과" : `\n${failed}건 실패`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
