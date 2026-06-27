import { cookies } from "next/headers";
import { getSql } from "@/lib/db/connection";

const COOKIE = "qs_session";

export async function createSession(userId: string): Promise<string> {
  const sql = getSql();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const rows = await sql`
    INSERT INTO sessions (user_id, expires_at)
    VALUES (${userId}, ${expiresAt})
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function getCurrentUser(): Promise<{ id: string; email: string; name: string | null } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE);
  if (!sessionCookie) return null;

  const sessionId = sessionCookie.value;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.email, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId}
      AND s.expires_at > now()
  `;

  if (rows.length === 0) return null;
  return rows[0] as { id: string; email: string; name: string | null };
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  (await cookies()).set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE);
  if (sessionCookie) {
    const sql = getSql();
    await sql`DELETE FROM sessions WHERE id = ${sessionCookie.value}`;
  }
  cookieStore.delete(COOKIE);
}
