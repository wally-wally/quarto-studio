// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/db/connection", () => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/storage/artifact-store", () => ({
  artifactStore: {
    getArtifact: vi.fn(),
    putArtifact: vi.fn(),
    deleteArtifact: vi.fn(),
  },
}));

import { getSql } from "@/lib/db/connection";
import { artifactStore } from "@/lib/storage/artifact-store";

const mockGetSql = vi.mocked(getSql);
const mockGetArtifact = vi.mocked(artifactStore.getArtifact);

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/preview/${id}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /preview/[id]", () => {
  it("Found: returns 200 with HTML body and correct Content-Type", async () => {
    const id = "artifact-uuid-1";
    const storageKey = "abc123.html";
    const htmlContent = "<html><body>Hello World</body></html>";

    const mockSql = vi.fn().mockResolvedValue([{ storage_key: storageKey }]);
    mockGetSql.mockReturnValue(mockSql as unknown as ReturnType<typeof getSql>);
    mockGetArtifact.mockResolvedValue(htmlContent);

    const response = await GET(makeRequest(id), makeParams(id));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toBe(htmlContent);
  });

  it("Not found in DB: returns 404 when DB has no matching row", async () => {
    const id = "nonexistent-uuid";

    const mockSql = vi.fn().mockResolvedValue([]);
    mockGetSql.mockReturnValue(mockSql as unknown as ReturnType<typeof getSql>);

    const response = await GET(makeRequest(id), makeParams(id));

    expect(response.status).toBe(404);
  });

  it("File missing from storage: returns 404 when store returns null", async () => {
    const id = "artifact-uuid-2";
    const storageKey = "missing-file.html";

    const mockSql = vi.fn().mockResolvedValue([{ storage_key: storageKey }]);
    mockGetSql.mockReturnValue(mockSql as unknown as ReturnType<typeof getSql>);
    mockGetArtifact.mockResolvedValue(null);

    const response = await GET(makeRequest(id), makeParams(id));

    expect(response.status).toBe(404);
  });

  it("CSP header present on 200 response", async () => {
    const id = "artifact-uuid-3";
    const storageKey = "csp-test.html";
    const htmlContent = "<html><body>CSP test</body></html>";

    const mockSql = vi.fn().mockResolvedValue([{ storage_key: storageKey }]);
    mockGetSql.mockReturnValue(mockSql as unknown as ReturnType<typeof getSql>);
    mockGetArtifact.mockResolvedValue(htmlContent);

    const response = await GET(makeRequest(id), makeParams(id));

    expect(response.status).toBe(200);
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("sandbox allow-scripts");
    // Quarto embed-resources는 CSS를 data:text/css 링크로 임베드한다.
    // style-src/script-src에 data: 가 있어야 테마·하이라이트가 적용된다(회귀 방지).
    expect(csp).toMatch(/style-src[^;]*\bdata:/);
    expect(csp).toMatch(/script-src[^;]*\bdata:/);
    // 렌더된 아티팩트는 외부 폰트 CDN을 쓰지 않으므로 jsdelivr CDN을 허용하지 않는다(회귀 방지).
    expect(csp).not.toContain("cdn.jsdelivr.net");
  });

  it("X-Content-Type-Options nosniff header on 200 response", async () => {
    const id = "artifact-uuid-4";
    const storageKey = "nosniff-test.html";
    const htmlContent = "<html><body>Nosniff test</body></html>";

    const mockSql = vi.fn().mockResolvedValue([{ storage_key: storageKey }]);
    mockGetSql.mockReturnValue(mockSql as unknown as ReturnType<typeof getSql>);
    mockGetArtifact.mockResolvedValue(htmlContent);

    const response = await GET(makeRequest(id), makeParams(id));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
