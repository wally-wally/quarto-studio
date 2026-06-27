// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  resolveModel: vi.fn(() => ({ mock: true })),
  buildProviderOptions: vi.fn(() => ({})),
}));
vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue("---\n");
        c.enqueue("title: 생성됨\n");
        c.close();
      },
    }),
  })),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { streamText } from "ai";
import { POST } from "./route";

const mockUser = vi.mocked(getCurrentUser);
const mockStreamText = vi.mocked(streamText);

function makeRequest(opts: { key?: string; fields?: Record<string, string>; files?: File[] }): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(opts.fields ?? {})) fd.set(k, v);
  for (const f of opts.files ?? []) fd.append("files", f);
  const headers: Record<string, string> = {};
  if (opts.key) headers["x-provider-key"] = opts.key;
  return new Request("http://localhost/api/ai/generate", { method: "POST", body: fd, headers });
}

const validFields = { provider: "anthropic", model: "claude-sonnet-4-6", prompt: "막대그래프 예제 문서 만들어줘" };

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ id: "u1", email: "a@b.c", name: null });
});

describe("POST /api/ai/generate", () => {
  it("미인증이면 401", async () => {
    mockUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    expect(res.status).toBe(401);
  });

  it("키 헤더가 없으면 400", async () => {
    const res = await POST(makeRequest({ fields: validFields }));
    expect(res.status).toBe(400);
  });

  it("빈 프롬프트면 400", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: { ...validFields, prompt: "   " } }));
    expect(res.status).toBe(400);
  });

  it("허용 외 확장자 첨부면 400", async () => {
    const bad = new File([new Uint8Array([1])], "x.exe", { type: "application/octet-stream" });
    const res = await POST(makeRequest({ key: "sk", fields: validFields, files: [bad] }));
    expect(res.status).toBe(400);
  });

  it("모델이 없으면 400", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: { ...validFields, model: "" } }));
    expect(res.status).toBe(400);
  });

  it("지원하지 않는 프로바이더면 400", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: { ...validFields, provider: "gemini" } }));
    expect(res.status).toBe(400);
  });

  it("해피패스: streamText를 호출하고 텍스트를 스트리밍한다", async () => {
    const txt = new File([new TextEncoder().encode("참고: 매출 데이터")], "ref.txt", { type: "text/plain" });
    const res = await POST(makeRequest({ key: "sk", fields: validFields, files: [txt] }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("title: 생성됨");

    expect(mockStreamText).toHaveBeenCalledOnce();
    const arg = mockStreamText.mock.calls[0][0] as {
      system: string;
      messages: { role: string; content: { type: string; text?: string }[] }[];
    };
    expect(arg.system).toContain("Quarto");
    const userText = arg.messages[0].content.map((p) => p.text ?? "").join(" ");
    expect(userText).toContain("막대그래프");
    expect(userText).toContain("매출 데이터"); // 텍스트 첨부가 인라인됨
  });
});
