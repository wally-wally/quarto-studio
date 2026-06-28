// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  resolveModel: vi.fn(() => ({ mock: true })),
  buildProviderOptions: vi.fn(() => ({})),
}));
vi.mock("ai", () => ({
  // tool/jsonSchema는 tools.ts가 import하므로 패스스루로 모킹한다.
  tool: (def: unknown) => def,
  jsonSchema: (schema: unknown) => schema,
  // 라우트가 write_document 인자를 부분 파싱할 때 쓴다(테스트용 best-effort 추출).
  parsePartialJson: async (text: string) => {
    try {
      return { value: JSON.parse(text), state: "successful-parse" };
    } catch {
      const m = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)/);
      if (!m) return { value: undefined, state: "failed-parse" };
      let s = m[1];
      try {
        s = JSON.parse('"' + s + '"');
      } catch {
        /* 미완 이스케이프 무시 */
      }
      return { value: { content: s }, state: "repaired-parse" };
    }
  },
  streamText: vi.fn(() => ({
    fullStream: (async function* () {
      yield { type: "text-delta", id: "t1", text: "제목을 바꿀게요." };
      yield {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "edit_document",
        input: { edits: [{ find: "옛", replace: "새" }] },
      };
      yield { type: "finish", totalUsage: { inputTokens: 10, outputTokens: 5 } };
    })(),
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
  return new Request("http://localhost/api/ai/chat", { method: "POST", body: fd, headers });
}

const validFields = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  document: "# 옛 제목",
  messages: JSON.stringify([{ role: "user", text: "제목을 새 제목으로 바꿔줘" }]),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ id: "u1", email: "a@b.c", name: null });
});

describe("POST /api/ai/chat", () => {
  it("미인증이면 401", async () => {
    mockUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    expect(res.status).toBe(401);
  });

  it("키 헤더가 없으면 400", async () => {
    const res = await POST(makeRequest({ fields: validFields }));
    expect(res.status).toBe(400);
  });

  it("messages가 비었으면 400", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: { ...validFields, messages: "[]" } }));
    expect(res.status).toBe(400);
  });

  it("마지막 메시지가 user가 아니면 400", async () => {
    const res = await POST(
      makeRequest({
        key: "sk",
        fields: { ...validFields, messages: JSON.stringify([{ role: "assistant", text: "안녕하세요" }]) },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("해피패스: delta·tool·done 프레임을 NDJSON으로 스트리밍한다", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain("제목을 바꿀게요.");
    expect(text).toContain('"type":"tool"');
    expect(text).toContain('"name":"edit_document"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"inputTokens":10');
    expect(text).toContain('"outputTokens":5');

    // 시스템 프롬프트에 현재 문서가 주입되고, 도구가 넘겨진다
    const arg = mockStreamText.mock.calls[0][0] as {
      system: string;
      tools: Record<string, unknown>;
      messages: { role: string }[];
    };
    expect(arg.system).toContain("# 옛 제목");
    expect(Object.keys(arg.tools).sort()).toEqual(["edit_document", "write_document"]);
    expect(arg.messages[arg.messages.length - 1].role).toBe("user");
  });

  it("스트림 중 error 파트가 오면 응답 스트림이 에러로 종료된다", async () => {
    mockStreamText.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: "text-delta", id: "t1", text: "부분" };
        yield { type: "error", error: new Error("provider 401") };
      })(),
    } as unknown as ReturnType<typeof streamText>);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    await expect(
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value);
        }
      })(),
    ).rejects.toThrow();
    expect(text).toContain("부분");
  });

  it("write_document 인자를 doc-stream으로 흘리고, 완성 시 tool 프레임도 보낸다", async () => {
    mockStreamText.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: "text-delta", id: "t1", text: "문서를 만들게요." };
        yield { type: "tool-input-start", id: "w1", toolName: "write_document" };
        yield { type: "tool-input-delta", id: "w1", delta: '{"content":"# 제' };
        yield { type: "tool-input-delta", id: "w1", delta: '목"}' };
        yield { type: "tool-call", toolCallId: "w1", toolName: "write_document", input: { content: "# 제목" } };
        yield { type: "finish", totalUsage: { inputTokens: 3, outputTokens: 7 } };
      })(),
    } as unknown as ReturnType<typeof streamText>);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    const text = await res.text();
    expect(text).toContain('"type":"doc-stream"');
    expect(text).toContain("# 제목"); // 최종 부분까지 흐름
    expect(text).toContain('"type":"tool"');
    expect(text).toContain('"name":"write_document"');
    expect(text).toContain('"type":"done"');
  });
});
