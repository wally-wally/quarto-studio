// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/session";
import { GET } from "./route";

const mockUser = vi.mocked(getCurrentUser);

function makeReq(key?: string): Request {
  const headers: Record<string, string> = {};
  if (key) headers["x-provider-key"] = key;
  return new Request("http://localhost/api/ai/models", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockUser.mockResolvedValue({ id: "u1", email: "a@b.c", name: null });
});

describe("GET /api/ai/models", () => {
  it("미인증이면 401", async () => {
    mockUser.mockResolvedValue(null);
    const res = await GET(makeReq("k"));
    expect(res.status).toBe(401);
  });

  it("키 헤더가 없으면 400", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });

  it("data[]를 {value,label}로 매핑한다(id·display_name 우선) + Bearer 인증으로 호출", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "claude-sonnet", display_name: "claude-sonnet", owned_by: "anthropic" },
          { id: "gpt-5", display_name: "gpt-5", owned_by: "openai" },
          { id: "", display_name: "빈값" }, // value 없으면 제외
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(makeReq("hub-key"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toEqual([
      { value: "claude-sonnet", label: "claude-sonnet" },
      { value: "gpt-5", label: "gpt-5" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai-hub-gabia.gabia.com/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer hub-key" } }),
    );
  });

  it("문서상 model_name 필드도 fallback 처리한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ model_name: "minimax" }] }) }),
    );
    const res = await GET(makeReq("k"));
    const body = await res.json();
    expect(body.models).toEqual([{ value: "minimax", label: "minimax" }]);
  });

  it("상류가 401/403이면 401로 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const res = await GET(makeReq("bad"));
    expect(res.status).toBe(401);
  });

  it("상류 연결 실패면 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const res = await GET(makeReq("k"));
    expect(res.status).toBe(502);
  });
});
