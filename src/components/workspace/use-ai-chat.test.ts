import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAiChat } from "./use-ai-chat";

vi.mock("./apply-edits-to-editor", () => ({
  applyToolFrame: vi.fn(() => ({ kind: "edit", failed: false })),
  streamDocumentToView: vi.fn(),
  commitStreamedWrite: vi.fn(),
}));
import { applyToolFrame, streamDocumentToView, commitStreamedWrite } from "./apply-edits-to-editor";
const mockApply = vi.mocked(applyToolFrame);
const mockStream = vi.mocked(streamDocumentToView);
const mockCommit = vi.mocked(commitStreamedWrite);

function ndjsonResponse(frames: object[]): Response {
  const body = frames.map((f) => JSON.stringify(f) + "\n").join("");
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(body));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

const editorRef = { current: { state: { doc: { toString: () => "현재 문서" } } } as never };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({
      provider: "anthropic",
      anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" },
      openai: { apiKey: "", model: "" },
    }),
  );
});

describe("useAiChat", () => {
  it("delta 프레임을 assistant 메시지에 누적하고 done에서 usage를 기록한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "delta", text: "안녕" },
          { type: "delta", text: "하세요!" },
          { type: "done", usage: { inputTokens: 10, outputTokens: 4 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("안녕!", []);
    });
    const msgs = result.current.messages;
    expect(msgs[0]).toMatchObject({ role: "user", text: "안녕!" });
    const assistant = msgs[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.text).toBe("안녕하세요!");
    expect(assistant.pending).toBeFalsy();
    expect(assistant.usage?.inputTokens).toBe(10);
    // 잡담이므로 도구 미호출 → 에디터 변경 없음
    expect(mockApply).not.toHaveBeenCalled();
    expect(result.current.aiEditedThisSession).toBe(false);
    vi.unstubAllGlobals();
  });

  it("tool 프레임이 오면 applyToolFrame을 호출하고 aiEditedThisSession을 켠다", async () => {
    mockApply.mockReturnValueOnce({ kind: "write", failed: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "delta", text: "문서를 만들었어요." },
          { type: "tool", name: "write_document", input: { content: "# 새 문서" } },
          { type: "done", usage: { inputTokens: 5, outputTokens: 9 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("iris 보고서 만들어줘", []);
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(result.current.aiEditedThisSession).toBe(true);
    expect(result.current.messages[1].edited).toBe("write");
    vi.unstubAllGlobals();
  });

  it("doc-stream은 라이브로 streamDocumentToView, write 완료 시 commitStreamedWrite로 커밋한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "delta", text: "문서를 만들게요." },
          { type: "doc-stream", text: "# 제" },
          { type: "doc-stream", text: "# 제목" },
          { type: "tool", name: "write_document", input: { content: "# 제목" } },
          { type: "done", usage: { inputTokens: 2, outputTokens: 8 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("문서 만들어줘", []);
    });
    expect(mockStream).toHaveBeenCalled();
    expect(mockStream).toHaveBeenLastCalledWith(expect.anything(), "# 제목");
    expect(mockCommit).toHaveBeenCalledTimes(1); // 완료 시 한 번의 undo 스텝으로 커밋
    expect(mockApply).not.toHaveBeenCalled(); // write 스트리밍 경로는 applyToolFrame 미사용
    expect(result.current.aiEditedThisSession).toBe(true);
    expect(result.current.messages[1].edited).toBe("write");
    vi.unstubAllGlobals();
  });

  it("스트림 reader가 reject하면 assistant 메시지를 error로 표시한다", async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "delta", text: "부분" }) + "\n"));
        c.error(new Error("stream fail"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(failing, { status: 200 })),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("뭔가", []);
    });
    await waitFor(() => expect(result.current.messages[1].error).toBe(true));
    vi.unstubAllGlobals();
  });

  it("키가 없으면 전송하지 않고 안내 에러 메시지를 남긴다", async () => {
    window.localStorage.setItem(
      "quarto-studio:ai-settings",
      JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "", model: "m" }, openai: { apiKey: "", model: "" } }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("안녕", []);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages.some((m) => m.role === "assistant" && m.error)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("resetChat은 메시지와 aiEditedThisSession을 초기화한다", async () => {
    mockApply.mockReturnValueOnce({ kind: "edit", failed: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "tool", name: "edit_document", input: { edits: [{ find: "a", replace: "b" }] } },
          { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("a를 b로", []);
    });
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.aiEditedThisSession).toBe(true);
    act(() => result.current.resetChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.aiEditedThisSession).toBe(false);
    vi.unstubAllGlobals();
  });
});
