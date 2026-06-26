import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { closeSql } from "@/lib/db/connection";

// Mock next/headers cookies (same pattern as session.test.ts)
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

import { registerAction, loginAction, logoutAction } from "./actions";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://quarto:quarto@localhost:5432/quarto_studio";
const sql = postgres(DATABASE_URL);

afterAll(async () => {
  await sql.end();
  await closeSql();
});

beforeEach(async () => {
  cookieStore.clear();
  await sql`TRUNCATE sessions, users RESTART IDENTITY CASCADE`;
});

describe("registerAction", () => {
  it("성공 케이스: users row 및 sessions row 생성, ok:true 반환", async () => {
    const result = await registerAction({
      email: "new@example.com",
      password: "password123",
      name: "테스트 사용자",
    });

    expect(result).toEqual({ ok: true });

    const users = await sql`SELECT * FROM users WHERE email = 'new@example.com'`;
    expect(users.length).toBe(1);
    expect(users[0].name).toBe("테스트 사용자");

    const sessions = await sql`SELECT * FROM sessions WHERE user_id = ${users[0].id}`;
    expect(sessions.length).toBe(1);
  });

  it("이메일 형식 오류: ok:false, error 포함", async () => {
    const result = await registerAction({
      email: "invalid-email",
      password: "password123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("비밀번호 8자 미만: ok:false, error 포함", async () => {
    const result = await registerAction({
      email: "short@example.com",
      password: "short",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("중복 이메일: ok:false, error 포함", async () => {
    // First registration
    await registerAction({
      email: "dup@example.com",
      password: "password123",
    });

    // Second registration with same email
    const result = await registerAction({
      email: "dup@example.com",
      password: "differentpassword",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe("loginAction", () => {
  it("성공: ok:true, sessions row 생성", async () => {
    // Create user first
    await registerAction({
      email: "login@example.com",
      password: "password123",
    });
    // Clear session set during registration
    cookieStore.clear();
    await sql`DELETE FROM sessions`;

    const result = await loginAction({
      email: "login@example.com",
      password: "password123",
    });

    expect(result).toEqual({ ok: true });

    const users = await sql`SELECT * FROM users WHERE email = 'login@example.com'`;
    const sessions = await sql`SELECT * FROM sessions WHERE user_id = ${users[0].id}`;
    expect(sessions.length).toBe(1);
  });

  it("틀린 비밀번호: ok:false, error 포함", async () => {
    await registerAction({
      email: "wrongpw@example.com",
      password: "correctpassword",
    });
    cookieStore.clear();

    const result = await loginAction({
      email: "wrongpw@example.com",
      password: "wrongpassword",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("존재하지 않는 이메일: ok:false, error 포함", async () => {
    const result = await loginAction({
      email: "nonexistent@example.com",
      password: "password123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe("logoutAction", () => {
  it("성공: sessions row 삭제", async () => {
    // Register and get session
    await registerAction({
      email: "logout@example.com",
      password: "password123",
    });

    const users = await sql`SELECT * FROM users WHERE email = 'logout@example.com'`;
    const sessionsBefore = await sql`SELECT * FROM sessions WHERE user_id = ${users[0].id}`;
    expect(sessionsBefore.length).toBe(1);

    await logoutAction();

    const sessionsAfter = await sql`SELECT * FROM sessions WHERE user_id = ${users[0].id}`;
    expect(sessionsAfter.length).toBe(0);
  });
});
