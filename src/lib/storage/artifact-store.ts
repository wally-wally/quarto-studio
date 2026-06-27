// Filesystem artifact store. Later replace with S3 backend by swapping this module.
// ARTIFACT_DIR env var (default: <cwd>/data/artifacts), created if absent.

import { promises as fs } from "node:fs";
import path from "node:path";

export type ArtifactStore = {
  putArtifact(key: string, content: string): Promise<{ sizeBytes: number }>;
  getArtifact(key: string): Promise<string | null>;
  deleteArtifact(key: string): Promise<void>;
};

function validateKey(key: string): void {
  if (key === "") {
    throw new Error("Invalid artifact key: must not be empty");
  }
  if (key.includes("/") || key.includes("..")) {
    throw new Error("Invalid artifact key: must not contain / or ..");
  }
}

export function createArtifactStore(artifactDir?: string): ArtifactStore {
  const dir =
    artifactDir ??
    (process.env.ARTIFACT_DIR ||
      path.join(process.cwd(), "data", "artifacts"));

  let dirEnsured = false;

  async function ensureDir(): Promise<void> {
    if (!dirEnsured) {
      await fs.mkdir(dir, { recursive: true });
      dirEnsured = true;
    }
  }

  async function putArtifact(
    key: string,
    content: string
  ): Promise<{ sizeBytes: number }> {
    validateKey(key);
    await ensureDir();
    const filePath = path.join(dir, key);
    await fs.writeFile(filePath, content, "utf8");
    return { sizeBytes: Buffer.byteLength(content, "utf8") };
  }

  async function getArtifact(key: string): Promise<string | null> {
    validateKey(key);
    await ensureDir();
    const filePath = path.join(dir, key);
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async function deleteArtifact(key: string): Promise<void> {
    validateKey(key);
    await ensureDir();
    const filePath = path.join(dir, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }
  }

  return { putArtifact, getArtifact, deleteArtifact };
}

export const artifactStore: ArtifactStore = createArtifactStore();
