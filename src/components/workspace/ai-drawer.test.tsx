import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiDrawer, type AiGenerationHandlers } from "./ai-drawer";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/ai/settings";

function makeHandlers(): AiGenerationHandlers {
  return { onStart: vi.fn(), onChunk: vi.fn(), onFinish: vi.fn(), onError: vi.fn(), onRevert: vi.fn() };
}

function streamingResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/plain" } });
}

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

  it("키가 있으면 스트리밍 청크를 onChunk로 누적 전달한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamingResponse(["---\n", "title: x\n"]));

    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서 만들어줘" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(handlers.onStart).toHaveBeenCalled();
    expect(handlers.onChunk).toHaveBeenLastCalledWith("---\ntitle: x\n");
  });

  it("생성 완료 후 되돌리기 버튼이 onRevert를 호출한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamingResponse(["abc"]));

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
        c.enqueue(new TextEncoder().encode("부분"));
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
