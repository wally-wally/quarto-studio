// 렌더 워커: render_jobs 큐를 폴링/LISTEN으로 받아, 잡마다 일회용
// quarto-render 컨테이너로 렌더하고 결과를 저장한다. 웹과 분리된 프로세스.
//
// 격리: --network none(외부 차단) + cap-drop ALL + no-new-privileges +
//       pids/메모리/CPU 제한 + 타임아웃. (--read-only/비루트 USER는 Phase 4 하드닝.)
// self-contained HTML(embed-resources)이라 _files 산출물 없이 index.html 하나만 읽는다.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { buildQuartoProjectFiles } from "../src/lib/quarto/project";
import { artifactStore } from "../src/lib/storage/artifact-store";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}

const RENDER_IMAGE = process.env.QUARTO_RENDER_IMAGE ?? "quarto-render:dev";
const TIMEOUT_MS = Number(process.env.QUARTO_RENDER_TIMEOUT_MS ?? "60000");
const POLL_MS = Number(process.env.QUARTO_WORKER_POLL_MS ?? "2000");
const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;

const sql = postgres(DATABASE_URL, { onnotice: () => {} });

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

type DockerResult = { code: number; out: string };

function runDocker(args: string[], timeoutMs: number, containerName: string): Promise<DockerResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", args);
    const chunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // 컨테이너를 강제 종료(--rm이라 제거까지 됨).
      spawn("docker", ["kill", containerName]);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, out: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? 124 : code ?? 1, out: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

async function processJob(job: ClaimedJob): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "qs-render-"));
  const containerName = `qs-render-${job.id}`;
  try {
    const files = buildQuartoProjectFiles({
      content: job.content_snapshot,
      executeCode: job.execute_code,
    });
    await fs.writeFile(path.join(tmp, "index.qmd"), files.indexQmd);
    await fs.writeFile(path.join(tmp, "_quarto.yml"), files.quartoYml);

    const args = [
      "run", "--rm", "--name", containerName,
      "--network", "none",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--pids-limit", "256",
      "--memory", "1g",
      "--cpus", "1.5",
      "-v", `${tmp}:/work`,
      "-w", "/work",
      RENDER_IMAGE,
      "quarto", "render", "index.qmd", "--to", "html",
    ];

    const { code, out } = await runDocker(args, TIMEOUT_MS, containerName);

    if (code === 0) {
      const html = await fs.readFile(path.join(tmp, "index.html"), "utf8");

      const artifactId = crypto.randomUUID();
      const key = `${artifactId}.html`;
      const { sizeBytes } = await artifactStore.putArtifact(key, html);

      await sql.begin(async (tx) => {
        // 1. insert artifact row
        await tx`
          insert into artifacts (id, document_id, job_id, storage_key, size_bytes)
          values (${artifactId}, ${job.document_id}, ${job.id}, ${key}, ${sizeBytes})
        `;

        // 2. update render_jobs (no rendered_html anymore)
        await tx`
          update render_jobs
             set status = 'succeeded', artifact_id = ${artifactId}, log = ${out}, finished_at = now()
           where id = ${job.id}
        `;

        // 3. update documents.latest_artifact_id
        await tx`
          update documents
             set latest_artifact_id = ${artifactId}
           where id = ${job.document_id}
        `;
      });

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
    } else {
      const status = code === 124 ? "timed_out" : "failed";
      await sql`
        update render_jobs
           set status = ${status}, log = ${out}, finished_at = now()
         where id = ${job.id}
      `;
      console.log(`[job ${job.id}] ${status} (exit ${code})`);
    }
  } catch (error) {
    await sql`
      update render_jobs
         set status = 'failed', log = ${String(error)}, finished_at = now()
       where id = ${job.id}
    `;
    console.error(`[job ${job.id}] error`, error);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log(`render-worker ${WORKER_ID} 시작 (image=${RENDER_IMAGE}, timeout=${TIMEOUT_MS}ms)`);

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
