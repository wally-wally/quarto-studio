import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeAppDatabase } from "./connection";
import { createAppDocumentService } from "./app-service";

describe("app document service", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    closeAppDatabase();
    delete process.env.QUARTO_STUDIO_DB_PATH;

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("temp SQLite DB 경로에서 seed workspace를 반환한다", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quarto-studio-"));
    const dbPath = path.join(tempDir, "workspace.sqlite");
    process.env.QUARTO_STUDIO_DB_PATH = dbPath;

    const workspace = createAppDocumentService().getInitialWorkspace();

    expect(fs.existsSync(dbPath)).toBe(true);
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        title: "Getting Started",
        slug: "getting-started",
        executeCode: false,
        renderStatus: "idle"
      })
    );
    expect(workspace.documents).toEqual([
      expect.objectContaining({
        id: workspace.activeDocument.id,
        title: "Getting Started",
        slug: "getting-started"
      })
    ]);
  });
});
