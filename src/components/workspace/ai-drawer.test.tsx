import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiDrawer } from "./ai-drawer";
import type { ChatMessage } from "./use-ai-chat";

beforeEach(() => {
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "sk", model: "m" }, openai: { apiKey: "", model: "" } }),
  );
});

const baseProps = {
  open: true,
  onToggle: vi.fn(),
  isBusy: false,
  generating: false,
  onSend: vi.fn(),
  onStop: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe("AiDrawer (채팅)", () => {
  it("열려 있으면 헤더·작성기를 보여준다", () => {
    render(<AiDrawer {...baseProps} messages={[]} />);
    expect(screen.getByText("AI 작성")).toBeTruthy();
    expect(screen.getByLabelText("AI 메시지 입력")).toBeTruthy();
  });

  it("메시지를 렌더한다", () => {
    const messages: ChatMessage[] = [{ id: "1", role: "user", text: "안녕!" }];
    render(<AiDrawer {...baseProps} messages={messages} />);
    expect(screen.getByText("안녕!")).toBeTruthy();
  });

  it("닫혀 있으면 내용을 렌더하지 않는다", () => {
    render(<AiDrawer {...baseProps} open={false} messages={[]} />);
    expect(screen.queryByLabelText("AI 메시지 입력")).toBeNull();
  });
});
