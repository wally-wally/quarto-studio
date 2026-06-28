import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiDrawer, type AiGenerationHandlers } from "./ai-drawer";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/ai/settings";

function makeHandlers(): AiGenerationHandlers {
  return { onStart: vi.fn(), onChunk: vi.fn(), onFinish: vi.fn(), onError: vi.fn(), onRevert: vi.fn() };
}

// 응답은 NDJSON 프레임이다: {type:"delta",text} / {type:"done",usage,provider,model}
function ndjsonResponse(frames: object[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(new TextEncoder().encode(JSON.stringify(f) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

const doneFrame = (inputTokens: number, outputTokens: number) => ({
  type: "done",
  usage: { inputTokens, outputTokens },
  provider: "anthropic",
  model: "claude-sonnet-4-6",
});

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AiDrawer", () => {
  it("키가 없으면 생성 시 설정 안내를 보여준다", () => {
    saveSettings(DEFAULT_SETTINGS); // apiKey: ""
    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={makeHandlers()} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서 만들어줘" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    expect(screen.getByText(/API 키/)).toBeInTheDocument();
  });

  it("키가 있으면 delta 프레임을 onChunk로 누적 전달한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ndjsonResponse([{ type: "delta", text: "---\n" }, { type: "delta", text: "title: x\n" }, doneFrame(10, 20)]),
    );

    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서 만들어줘" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(handlers.onStart).toHaveBeenCalled();
    expect(handlers.onChunk).toHaveBeenLastCalledWith("---\ntitle: x\n");
  });

  it("완료 후 사용량(토큰·비용·시간)을 표시한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    // sonnet 4.6: $3/$15 per 1M. 1000 입력 + 500 출력 = 0.003 + 0.0075 = $0.0105
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ndjsonResponse([{ type: "delta", text: "본문" }, doneFrame(1000, 500)]),
    );

    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));

    const usage = await screen.findByLabelText("생성 사용량");
    expect(usage).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument(); // 총 토큰
    expect(screen.getByText("$0.0105")).toBeInTheDocument(); // 추정 비용
    expect(screen.getByText(/초/)).toBeInTheDocument(); // 소요 시간
  });

  it("생성 완료 후 되돌리기 버튼이 onRevert를 호출한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ndjsonResponse([{ type: "delta", text: "abc" }, doneFrame(5, 5)]));

    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(handlers.onRevert).toHaveBeenCalled();
  });

  it("스트림 오류 시 onError를 호출한다(onFinish 아님)", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    const errorStream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "delta", text: "부분" }) + "\n"));
        c.error(new Error("boom"));
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(errorStream, { status: 200 }));
    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(handlers.onFinish).not.toHaveBeenCalled();
  });
});
