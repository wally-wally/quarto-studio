import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "./settings-modal";
import { loadSettings } from "@/lib/ai/settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("SettingsModal", () => {
  it("열림 상태에서 키를 입력·저장하면 localStorage에 반영된다", () => {
    const onClose = vi.fn();
    render(<SettingsModal open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("API 키"), { target: { value: "sk-anthropic-1" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(loadSettings().anthropic.apiKey).toBe("sk-anthropic-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("닫힘 상태면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<SettingsModal open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
