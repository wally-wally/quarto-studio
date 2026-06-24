import { describe, expect, it, vi } from "vitest";
import type { DocumentRecord } from "../documents/types";
import { renderDocumentToHtml } from "./render";

function buildDocumentRecord(
  overrides: Partial<DocumentRecord> = {},
): DocumentRecord {
  return {
    id: "doc-1",
    title: "Quarterly Report",
    slug: "quarterly-report",
    content: "# Quarterly Report\n\n```{r}\n1 + 1\n```",
    executeCode: false,
    renderStatus: "idle",
    renderedHtml: null,
    renderError: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    renderedAt: null,
    ...overrides,
  };
}

describe("renderDocumentToHtml", () => {
  it("Quarto 프로젝트 파일을 쓰고 HTML 렌더링 결과를 반환한다", async () => {
    const writtenFiles = new Map<string, string>();
    const runProcess = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "rendered",
      stderr: "",
    });

    const result = await renderDocumentToHtml(buildDocumentRecord(), {
      createTempDir: async () => "/tmp/quarto-studio-test",
      writeFile: async (filePath, content) => {
        writtenFiles.set(filePath, content);
      },
      readFile: async (filePath) => {
        expect(filePath).toBe("/tmp/quarto-studio-test/index.html");
        return "<html><body><h1>Quarterly Report</h1></body></html>";
      },
      removeDir: vi.fn(),
      runProcess,
      timeoutMs: 5000,
    });

    expect(result).toEqual({
      ok: true,
      html: "<html><body><h1>Quarterly Report</h1></body></html>",
      log: "rendered",
    });
    expect(writtenFiles.get("/tmp/quarto-studio-test/index.qmd")).toBe(
      "# Quarterly Report\n\n```{r}\n1 + 1\n```",
    );
    expect(writtenFiles.get("/tmp/quarto-studio-test/_quarto.yml")).toContain(
      "eval: false",
    );
    expect(runProcess).toHaveBeenCalledWith(
      "quarto",
      ["render", "index.qmd", "--to", "html"],
      { cwd: "/tmp/quarto-studio-test", timeoutMs: 5000 },
    );
  });

  it("Quarto 프로세스 실패를 렌더링 실패 결과로 변환한다", async () => {
    const result = await renderDocumentToHtml(buildDocumentRecord(), {
      createTempDir: async () => "/tmp/quarto-studio-test",
      writeFile: vi.fn(),
      readFile: vi.fn(),
      removeDir: vi.fn(),
      runProcess: vi.fn().mockResolvedValue({
        code: 1,
        stdout: "",
        stderr: "syntax error",
      }),
      timeoutMs: 5000,
    });

    expect(result).toEqual({
      ok: false,
      error: "syntax error",
      log: "syntax error",
    });
  });
});
