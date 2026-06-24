import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureDocumentSchema } from "@/lib/documents/repository";

let singleton: Database.Database | null = null;

function resolveDatabasePath() {
  return (
    process.env.QUARTO_STUDIO_DB_PATH ??
    path.join(process.cwd(), "data", "quarto-studio.db")
  );
}

export function openAppDatabase() {
  if (singleton) {
    return singleton;
  }

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  singleton = new Database(dbPath);
  ensureDocumentSchema(singleton);
  return singleton;
}
