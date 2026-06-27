import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeSql } from "./connection";
import { createAppDocumentService } from "./app-service";
import { createTestSql, truncateAll } from "@/test/db";

const sql = createTestSql();

afterAll(async () => {
  await sql.end();
  await closeSql();
});

beforeEach(async () => {
  await truncateAll(sql);
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
