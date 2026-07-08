// 렌더 워커: render_jobs 큐를 폴링/LISTEN으로 받아, 잡마다 일회용
// Daytona sandbox로 렌더하고 결과를 저장한다. 웹과 분리된 프로세스.
//
// 격리(비루트·네트워크 차단·리소스 제한) 책임은 Daytona로 이관되었다.
// self-contained HTML(embed-resources)이라 _files 산출물 없이 index.html 하나만 읽는다.
import crypto from "node:crypto";
import os from "node:os";
import postgres from "postgres";
import { buildQuartoProjectFiles } from "../src/lib/quarto/project";
import { createDocumentRepository } from "../src/lib/documents/repository";
import { artifactStore } from "../src/lib/storage/artifact-store";
import { runQuartoRender } from "./daytona";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

if (!process.env.DAYTONA_API_KEY) {
  console.error("DAYTONA_API_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const TIMEOUT_MS = Number(process.env.QUARTO_RENDER_TIMEOUT_MS ?? "60000");
const POLL_MS = Number(process.env.QUARTO_WORKER_POLL_MS ?? "2000");
const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;

const sql = postgres(DATABASE_URL, { onnotice: () => {} });
const repository = createDocumentRepository(sql);

type ClaimedJob = {
  id: string;
  document_id: string;
  content_snapshot: string;
  execute_code: boolean;
};

async function claimJob(): Promise<ClaimedJob | null> {
  const rows = await sql<ClaimedJob[]>`
    update render_jobs
       set status = 'running', worker_id = ${WORKER_ID},
           claimed_at = now(), attempts = attempts + 1
     where id = (
       select id from render_jobs
        where status = 'queued'
        order by created_at
        for update skip locked
        limit 1
     )
    returning id, document_id, content_snapshot, execute_code
  `;
  return rows[0] ?? null;
}

async function processJob(job: ClaimedJob): Promise<void> {
  // 실행 중 취소 감시: 사용자가 중단하면 잡이 'canceled'로 바뀐다 → abort로 sandbox 폐기.
  const controller = new AbortController();
  const cancelWatcher = setInterval(() => {
    sql<{ status: string }[]>`select status from render_jobs where id = ${job.id}`
      .then((rows) => {
        if (rows[0]?.status === "canceled") controller.abort();
      })
      .catch(() => {});
  }, 1500);

  try {
    const files = buildQuartoProjectFiles({
      content: job.content_snapshot,
      executeCode: job.execute_code,
    });

    const outcome = await runQuartoRender({
      jobId: job.id,
      files,
      timeoutMs: TIMEOUT_MS,
      signal: controller.signal,
    });

    if (outcome.kind === "canceled") {
      console.log(`[job ${job.id}] canceled — sandbox 폐기, 결과 폐기`);
      return;
    }

    if (outcome.kind !== "success") {
      await sql`
        update render_jobs
           set status = ${outcome.kind}, log = ${outcome.log}, finished_at = now()
         where id = ${job.id} and status = 'running'
      `;
      console.log(`[job ${job.id}] ${outcome.kind}`);
      return;
    }

    const artifactId = crypto.randomUUID();
    const key = `${artifactId}.html`;
    const { sizeBytes } = await artifactStore.putArtifact(key, outcome.html);

    // 성공 결과 저장은 repository로 위임(artifacts INSERT → render_jobs.artifact_id 순서로
    // 즉시검사 FK를 만족시키고, status='running' 가드로 완료 직전 취소를 보호한다).
    const { stored } = await repository.completeRenderJob({
      jobId: job.id,
      documentId: job.document_id,
      artifactId,
      storageKey: key,
      sizeBytes,
      log: outcome.log,
    });

    if (!stored) {
      await artifactStore.deleteArtifact(key);
      console.log(`[job ${job.id}] 완료 직전 취소 — 결과 폐기`);
      return;
    }

    // Retention: keep latest 5 artifacts for this document
    const old = await sql<{ id: string; storage_key: string }[]>`
      select id, storage_key from artifacts
      where document_id = ${job.document_id}
      order by created_at desc
      offset 5
    `;
    for (const row of old) {
      await artifactStore.deleteArtifact(row.storage_key);
      await sql`delete from artifacts where id = ${row.id}`;
    }

    console.log(`[job ${job.id}] succeeded → artifact ${artifactId} (${sizeBytes} bytes)`);
  } catch (error) {
    await sql`
      update render_jobs
         set status = 'failed', log = ${String(error)}, finished_at = now()
       where id = ${job.id} and status = 'running'
    `;
    console.error(`[job ${job.id}] error`, error);
  } finally {
    clearInterval(cancelWatcher);
  }
}

async function main(): Promise<void> {
  console.log(
    `render-worker ${WORKER_ID} 시작 (snapshot=${process.env.DAYTONA_SNAPSHOT ?? "quarto-render-1"}, timeout=${TIMEOUT_MS}ms)`,
  );

  // pg_notify('render_jobs')로 즉시 깨우기(없으면 폴링 폴백).
  let wake: (() => void) | null = null;
  await sql.listen("render_jobs", () => {
    if (wake) wake();
  });

  let running = true;
  const stop = () => {
    running = false;
    if (wake) wake();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    const job = await claimJob();
    if (job) {
      await processJob(job);
      continue;
    }
    // 큐가 비면 NOTIFY 또는 폴링 간격까지 대기.
    await new Promise<void>((resolve) => {
      wake = resolve;
      const timer = setTimeout(resolve, POLL_MS);
      const original = wake;
      wake = () => {
        clearTimeout(timer);
        original();
      };
    });
    wake = null;
  }

  await sql.end();
  console.log("render-worker 종료");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
