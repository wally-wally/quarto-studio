import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, getActiveCredentials, DEFAULT_SETTINGS } from "./settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("settings", () => {
  it("저장값이 없으면 기본값을 반환한다", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("저장 후 로드하면 라운드트립된다", () => {
    const next = {
      ...DEFAULT_SETTINGS,
      provider: "openai" as const,
      openai: { apiKey: "sk-test", model: "gpt-5.2" },
    };
    saveSettings(next);
    expect(loadSettings()).toEqual(next);
  });

  it("getActiveCredentials는 활성 프로바이더 자격을 고른다", () => {
    const settings = {
      provider: "openai" as const,
      anthropic: { apiKey: "ant", model: "claude-sonnet-4-6" },
      openai: { apiKey: "oai", model: "gpt-5.2" },
    };
    expect(getActiveCredentials(settings)).toEqual({ provider: "openai", apiKey: "oai", model: "gpt-5.2" });
  });

  it("깨진 JSON이면 기본값으로 폴백한다", () => {
    window.localStorage.setItem("quarto-studio:ai-settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
