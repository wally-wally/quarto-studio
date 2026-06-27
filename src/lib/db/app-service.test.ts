import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeSql } from "./connection";
import { createAppDocumentService } from "./app-service";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://quarto:quarto@localhost:5432/quarto_studio";
const sql = postgres(DATABASE_URL);

afterAll(async () => {
  await sql.end();
  await closeSql();
});

beforeEach(async () => {
  await sql`TRUNCATE documents, render_jobs RESTART IDENTITY CASCADE`;
});

describe("app document service", () => {
  it("Postgres에서 seed workspace를 반환한다", async () => {
    const workspace = await createAppDocumentService().getInitialWorkspace();
    expect(workspace.activeDocument).toEqual(
      expect.objectContaining({
        title: "Getting Started",
        slug: "getting-started",
        executeCode: false,
        renderStatus: "idle",
      }),
    );
    expect(workspace.documents).toEqual([
      expect.objectContaining({
        id: workspace.activeDocument.id,
        title: "Getting Started",
      }),
    ]);
  });
});
