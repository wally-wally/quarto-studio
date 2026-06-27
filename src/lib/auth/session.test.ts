import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";
import { closeSql } from "@/lib/db/connection";
import { createTestSql, truncateAll } from "@/test/db";

// Mock next/headers cookies
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
}));

import { createSession, getCurrentUser, setSessionCookie, destroySession } from "./session";

const sql = createTestSql();

afterAll(async () => {
  await sql.end();
  await closeSql();
});

beforeEach(async () => {
  cookieStore.clear();
  await truncateAll(sql);
});

describe("session", () => {
  it("createSession — DB에 sessions row INSERT되고 uuid string 반환", async () => {
    const [user] = await sql`
      INSERT INTO users (email, password_hash)
      VALUES ('test@example.com', 'dummy-hash')
      RETURNING id
    `;
    const sessionId = await createSession(user.id);
    expect(typeof sessionId).toBe("string");
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const rows = await sql`SELECT * FROM sessions WHERE id = ${sessionId}`;
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(user.id);
  });

  it("getCurrentUser — 유효한 세션이면 {id, email, name} 반환", async () => {
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name)
      VALUES ('valid@example.com', 'dummy-hash', 'Valid User')
      RETURNING id
    `;
    const sessionId = await createSession(user.id);
    await setSessionCookie(sessionId);

    const currentUser = await getCurrentUser();
    expect(currentUser).not.toBeNull();
    expect(currentUser!.id).toBe(user.id);
    expect(currentUser!.email).toBe("valid@example.com");
    expect(currentUser!.name).toBe("Valid User");
  });

  it("getCurrentUser — 만료된 세션이면 null 반환", async () => {
    const [user] = await sql`
      INSERT INTO users (email, password_hash)
      VALUES ('expired@example.com', 'dummy-hash')
      RETURNING id
    `;
    const sessionId = await createSession(user.id);
    // Set expires_at to the past
    await sql`
      UPDATE sessions SET expires_at = now() - interval '1 hour'
      WHERE id = ${sessionId}
    `;
    await setSessionCookie(sessionId);

    const currentUser = await getCurrentUser();
    expect(currentUser).toBeNull();
  });

  it("destroySession — sessions row 삭제 + 쿠키 삭제", async () => {
    const [user] = await sql`
      INSERT INTO users (email, password_hash)
      VALUES ('destroy@example.com', 'dummy-hash')
      RETURNING id
    `;
    const sessionId = await createSession(user.id);
    await setSessionCookie(sessionId);

    await destroySession();

    // Cookie should be cleared
    expect(cookieStore.has("qs_session")).toBe(false);

    // Session row should be deleted
    const rows = await sql`SELECT * FROM sessions WHERE id = ${sessionId}`;
    expect(rows.length).toBe(0);
  });
});
