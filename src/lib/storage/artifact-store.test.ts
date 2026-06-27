// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createArtifactStore } from "./artifact-store";

let testDir: string;
let store: ReturnType<typeof createArtifactStore>;

// Create temp dir and store instance before all tests run.
// We can't use beforeAll with top-level await in all environments,
// so we initialize lazily in each test that needs the store.
// Instead, use a shared promise for setup.
let initialized = false;
async function setup() {
  if (!initialized) {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "qs-artifact-test-"));
    store = createArtifactStore(testDir);
    initialized = true;
  }
}

afterAll(async () => {
  if (testDir) {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

describe("artifactStore", () => {
  it("put → get roundtrip: returns content and correct sizeBytes", async () => {
    await setup();
    const key = "test-roundtrip.html";
    const content = "<html><body>Hello</body></html>";
    const result = await store.putArtifact(key, content);
    expect(result.sizeBytes).toBe(Buffer.byteLength(content, "utf8"));
    const retrieved = await store.getArtifact(key);
    expect(retrieved).toBe(content);
  });

  it("get missing: returns null for a key never written", async () => {
    await setup();
    const result = await store.getArtifact("nonexistent-key.html");
    expect(result).toBeNull();
  });

  it("delete then get: put, delete, then get returns null", async () => {
    await setup();
    const key = "delete-test.html";
    await store.putArtifact(key, "<html>Delete me</html>");
    await store.deleteArtifact(key);
    const result = await store.getArtifact(key);
    expect(result).toBeNull();
  });

  it("delete missing: deleting a key never written does not throw", async () => {
    await setup();
    await expect(
      store.deleteArtifact("never-written.html")
    ).resolves.toBeUndefined();
  });

  describe("path traversal rejected", () => {
    it("putArtifact with '../evil' throws", async () => {
      await setup();
      await expect(store.putArtifact("../evil", "x")).rejects.toThrow();
    });

    it("putArtifact with 'foo/bar.html' throws", async () => {
      await setup();
      await expect(store.putArtifact("foo/bar.html", "x")).rejects.toThrow();
    });

    it("getArtifact with '../etc/passwd' throws", async () => {
      await setup();
      await expect(store.getArtifact("../etc/passwd")).rejects.toThrow();
    });

    it("deleteArtifact with '../something' throws", async () => {
      await setup();
      await expect(store.deleteArtifact("../something")).rejects.toThrow();
    });
  });

  it("empty key rejected: putArtifact with '' throws", async () => {
    await setup();
    await expect(store.putArtifact("", "x")).rejects.toThrow();
  });

  it("sizeBytes matches Buffer.byteLength for multibyte content", async () => {
    await setup();
    const key = "multibyte-test.html";
    const content = "<html>안녕하세요</html>"; // Korean chars are 3 bytes each
    const result = await store.putArtifact(key, content);
    expect(result.sizeBytes).toBe(Buffer.byteLength(content, "utf8"));
    expect(result.sizeBytes).toBeGreaterThan(content.length); // more bytes than chars
  });
});
