import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  getActiveCredentials,
  DEFAULT_SETTINGS,
  RECOMMENDED_MODELS,
} from "./settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("settings", () => {
  it("저장값이 없으면 기본값을 반환한다", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("Anthropic 추천 모델 목록은 Sonnet 5를 포함하고 Sonnet 4.6은 제외한다", () => {
    const values = RECOMMENDED_MODELS.anthropic.map((m) => m.value);
    expect(values).toContain("claude-sonnet-5");
    expect(values).not.toContain("claude-sonnet-4-6");
  });

  it("Anthropic 기본 모델은 Sonnet 5다", () => {
    expect(DEFAULT_SETTINGS.anthropic.model).toBe("claude-sonnet-5");
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

  it("AI Hub 프로바이더 설정이 라운드트립된다", () => {
    const next = {
      ...DEFAULT_SETTINGS,
      provider: "aihub" as const,
      aihub: { apiKey: "hub-key", model: "gpt-5" },
    };
    saveSettings(next);
    expect(loadSettings()).toEqual(next);
  });

  it("getActiveCredentials는 활성 프로바이더 자격을 고른다", () => {
    const settings = {
      provider: "openai" as const,
      aihub: { apiKey: "hub", model: "claude-sonnet" },
      anthropic: { apiKey: "ant", model: "claude-sonnet-4-6" },
      openai: { apiKey: "oai", model: "gpt-5.2" },
    };
    expect(getActiveCredentials(settings)).toEqual({ provider: "openai", apiKey: "oai", model: "gpt-5.2" });
    expect(getActiveCredentials({ ...settings, provider: "aihub" })).toEqual({
      provider: "aihub",
      apiKey: "hub",
      model: "claude-sonnet",
    });
  });

  it("깨진 JSON이면 기본값으로 폴백한다", () => {
    window.localStorage.setItem("quarto-studio:ai-settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
