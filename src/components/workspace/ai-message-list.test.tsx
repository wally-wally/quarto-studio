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

  it("편집이 적용된 어시스턴트 메시지에 수정 상태 줄을 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "고쳤어요", edited: "edit" },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/문서를 수정했습니다/)).toBeTruthy();
  });

  it("작성 상태와 일부 실패 상태를 구분해 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "작성", edited: "write" },
      { id: "3", role: "assistant", text: "일부", edited: "edit", editFailed: true },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/문서를 새로 작성했습니다/)).toBeTruthy();
    expect(screen.getByText(/일부 편집을 적용하지 못했습니다/)).toBeTruthy();
  });

  it("usage가 있으면 턴별 사용량을 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "답", usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.002, elapsedMs: 1200 } },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/토큰/)).toBeTruthy();
  });

  it("어시스턴트 메시지를 마크다운으로 렌더한다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "## 제목\n\n**굵게** 그리고 `코드`\n\n- 항목1\n- 항목2" },
    ];
    const { container } = render(<AiMessageList messages={messages} generating={false} />);
    expect(container.querySelector("h2")?.textContent).toBe("제목");
    expect(container.querySelector("strong")?.textContent).toBe("굵게");
    expect(container.querySelector("code")?.textContent).toBe("코드");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    // 원시 마크다운 기호가 그대로 노출되지 않아야 한다
    expect(screen.queryByText("## 제목")).toBeNull();
  });

  it("사용자 메시지는 마크다운으로 렌더하지 않고 평문으로 둔다", () => {
    const messages: ChatMessage[] = [{ id: "1", role: "user", text: "## 평문 그대로" }];
    const { container } = render(<AiMessageList messages={messages} generating={false} />);
    expect(container.querySelector("h2")).toBeNull();
    expect(screen.getByText("## 평문 그대로")).toBeTruthy();
  });
});
