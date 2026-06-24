import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DocumentRecord } from "../documents/types";
import {
  buildQuartoProjectFiles,
  buildQuartoRenderCommand,
} from "./project";
import { runProcess as runRuntimeProcess } from "./runtime";
import type { ProcessResult } from "./runtime";

export type RenderResult =
  | { ok: true; html: string; log: string }
  | { ok: false; error: string; log: string };

type RenderDependencies = {
  createTempDir: () => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  removeDir: (dirPath: string) => Promise<void>;
  runProcess: (
    command: string,
    args: string[],
    options: { cwd: string; timeoutMs: number },
  ) => Promise<ProcessResult>;
  timeoutMs: number;
};

const DEFAULT_RENDER_TIMEOUT_MS = 15000;

export function parseRenderTimeoutMs(value: string | undefined): number {
  if (!value || value.trim() === "") {
    return DEFAULT_RENDER_TIMEOUT_MS;
  }

  const timeoutMs = Number(value);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_RENDER_TIMEOUT_MS;
  }

  return timeoutMs;
}

function createDefaultDependencies(): RenderDependencies {
  return {
    createTempDir: () => fs.mkdtemp(path.join(os.tmpdir(), "quarto-studio-")),
    writeFile: (filePath, content) => fs.writeFile(filePath, content),
    readFile: (filePath) => fs.readFile(filePath, "utf8"),
    removeDir: (dirPath) => fs.rm(dirPath, { recursive: true, force: true }),
    runProcess: runRuntimeProcess,
    timeoutMs: parseRenderTimeoutMs(process.env.QUARTO_RENDER_TIMEOUT_MS),
  };
}

function combineLog(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

export async function renderDocumentToHtml(
  document: DocumentRecord,
  dependencies: RenderDependencies = createDefaultDependencies(),
): Promise<RenderResult> {
  let tempDir: string | null = null;

  try {
    tempDir = await dependencies.createTempDir();

    const files = buildQuartoProjectFiles({
      content: document.content,
      executeCode: document.executeCode,
    });

    await dependencies.writeFile(path.join(tempDir, "index.qmd"), files.indexQmd);
    await dependencies.writeFile(
      path.join(tempDir, "_quarto.yml"),
      files.quartoYml,
    );

    const [command, args] = buildQuartoRenderCommand();
    const processResult = await dependencies.runProcess(command, args, {
      cwd: tempDir,
      timeoutMs: dependencies.timeoutMs,
    });
    const log = combineLog(processResult.stdout, processResult.stderr);

    if (processResult.code !== 0) {
      const error = log || `Quarto render failed with code ${processResult.code}`;

      return {
        ok: false,
        error,
        log: log || error,
      };
    }

    const html = await dependencies.readFile(path.join(tempDir, "index.html"));

    return {
      ok: true,
      html,
      log,
    };
  } finally {
    if (tempDir) {
      await dependencies.removeDir(tempDir);
    }
  }
}
