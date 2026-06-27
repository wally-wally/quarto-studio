"use server";

import { getSql } from "@/lib/db/connection";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, setSessionCookie } from "./session";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerAction(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, error: "올바른 이메일 형식이 아닙니다." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (input.password.length > 72) {
    return { ok: false, error: "비밀번호는 72자 이하여야 합니다." };
  }

  const sql = getSql();
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return { ok: false, error: "이미 사용 중인 이메일입니다." };
  }

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim() || null;
  const rows = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES (${email}, ${passwordHash}, ${name})
    RETURNING id
  `;
  const userId = rows[0].id as string;
  const sessionId = await createSession(userId);
  await setSessionCookie(sessionId);
  return { ok: true };
}

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length > 72) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }
  const sql = getSql();
  const rows = await sql`SELECT id, password_hash FROM users WHERE email = ${email}`;
  if (rows.length === 0) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const user = rows[0] as { id: string; password_hash: string };
  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const sessionId = await createSession(user.id);
  await setSessionCookie(sessionId);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}
