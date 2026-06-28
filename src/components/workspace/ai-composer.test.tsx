// src/components/workspace/ai-composer.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiComposer } from "./ai-composer";

beforeEach(() => {
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "sk", model: "m" }, openai: { apiKey: "", model: "" } }),
  );
});

const baseProps = { generating: false, isBusy: false, onStop: vi.fn(), onOpenSettings: vi.fn() };

describe("AiComposer", () => {
  it("Enter로 전송하고 입력을 비운다", () => {
    const onSend = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} />);
    const ta = screen.getByLabelText("AI 메시지 입력") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "안녕!" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("안녕!", []);
    expect(ta.value).toBe("");
  });

  it("Shift+Enter는 전송하지 않는다", () => {
    const onSend = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} />);
    const ta = screen.getByLabelText("AI 메시지 입력");
    fireEvent.change(ta, { target: { value: "여러\n줄" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("빈 입력은 전송하지 않는다", () => {
    const onSend = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} />);
    const ta = screen.getByLabelText("AI 메시지 입력");
    fireEvent.change(ta, { target: { value: "   " } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("API 키가 없으면 전송 대신 안내 에러와 설정 링크를 보여준다", () => {
    window.localStorage.setItem(
      "quarto-studio:ai-settings",
      JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "", model: "m" }, openai: { apiKey: "", model: "" } }),
    );
    const onSend = vi.fn();
    const onOpenSettings = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} onOpenSettings={onOpenSettings} />);
    const ta = screen.getByLabelText("AI 메시지 입력");
    fireEvent.change(ta, { target: { value: "안녕" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("설정 열기"));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("generating이면 전송 대신 중단 버튼을 보여준다", () => {
    render(<AiComposer {...baseProps} generating onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    expect(baseProps.onStop).toHaveBeenCalled();
  });
});
