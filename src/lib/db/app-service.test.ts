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
  await sql`TRUNCATE users, sessions, documents, render_jobs, artifacts RESTART IDENTITY CASCADE`;
});

describe("app document service", () => {
  it("Postgres에서 seed workspace를 반환한다", async () => {
    const [user] = await sql`
      INSERT INTO users (email, password_hash)
      VALUES ('test@example.com', 'hash')
      RETURNING id
    `;
    const workspace = await createAppDocumentService().getInitialWorkspace(user.id);
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
