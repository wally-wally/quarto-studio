import postgres from "postgres";
import type { Sql } from "postgres";

let singleton: Sql | null = null;

export function getSql(): Sql {
  if (singleton) return singleton;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is required");
  singleton = postgres(url);
  return singleton;
}

export async function closeSql(): Promise<void> {
  if (!singleton) return;
  await singleton.end();
  singleton = null;
}
