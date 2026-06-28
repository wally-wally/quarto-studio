// src/components/workspace/ai-message-list.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiMessageList } from "./ai-message-list";
import type { ChatMessage } from "./use-ai-chat";

// jsdom does not implement Element.prototype.scrollIntoView — add no-op stub
Element.prototype.scrollIntoView = () => {};

describe("AiMessageList", () => {
  it("메시지가 없으면 빈 상태 안내를 보여준다", () => {
    render(<AiMessageList messages={[]} generating={false} />);
    expect(screen.getByText(/만들고 싶은/)).toBeTruthy();
  });

  it("user/assistant 메시지를 렌더한다", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "안녕!" },
      { id: "2", role: "assistant", text: "안녕하세요!" },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText("안녕!")).toBeTruthy();
    expect(screen.getByText("안녕하세요!")).toBeTruthy();
  });

  it("편집이 적용된 어시스턴트 메시지에 수정 칩을 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "고쳤어요", edited: "edit" },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/문서 수정됨/)).toBeTruthy();
  });

  it("전체 작성 칩과 일부 실패 주석을 구분해 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "작성", edited: "write" },
      { id: "3", role: "assistant", text: "일부", edited: "edit", editFailed: true },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/문서 작성됨/)).toBeTruthy();
    expect(screen.getByText(/일부 편집 미적용/)).toBeTruthy();
  });

  it("usage가 있으면 턴별 사용량을 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "답", usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.002, elapsedMs: 1200 } },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/토큰/)).toBeTruthy();
  });
});
