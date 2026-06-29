import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "./settings-modal";
import { loadSettings } from "@/lib/ai/settings";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("Esc 키로 모달이 닫힌다", () => {
    const onClose = vi.fn();
    render(<SettingsModal open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("모델 select로 모델을 바꿔 저장하면 반영된다", () => {
    render(<SettingsModal open onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("모델"), { target: { value: "claude-opus-4-8" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(loadSettings().anthropic.model).toBe("claude-opus-4-8");
  });

  it("프로바이더 탭은 AI Hub·Anthropic·OpenAI 순서로 렌더된다", () => {
    render(<SettingsModal open onClose={vi.fn()} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["AI Hub", "Anthropic", "OpenAI"]);
  });

  it("AI Hub 탭에서 키 입력 후 새로고침하면 /api/ai/models로 모델을 불러온다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { value: "claude-sonnet", label: "claude-sonnet" },
          { value: "gpt-5", label: "gpt-5" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "AI Hub" }));
    fireEvent.change(screen.getByLabelText("API 키"), { target: { value: "hub-key" } });
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

    expect(await screen.findByRole("option", { name: "gpt-5" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/models", {
      headers: { "x-provider-key": "hub-key" },
    });
  });

  it("AI Hub 모델을 골라 저장하면 aihub 설정에 반영된다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ value: "gpt-5", label: "gpt-5" }] }),
      }),
    );
    render(<SettingsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "AI Hub" }));
    fireEvent.change(screen.getByLabelText("API 키"), { target: { value: "hub-key" } });
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await screen.findByRole("option", { name: "gpt-5" });

    fireEvent.change(screen.getByLabelText("모델"), { target: { value: "gpt-5" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const saved = loadSettings();
    expect(saved.provider).toBe("aihub");
    expect(saved.aihub).toEqual({ apiKey: "hub-key", model: "gpt-5" });
  });
});
