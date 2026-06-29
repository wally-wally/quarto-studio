import { describe, it, expect } from "vitest";
import { buildProviderOptions, resolveModel } from "./provider";

describe("buildProviderOptions", () => {
  it("openai는 reasoningEffort medium", () => {
    expect(buildProviderOptions("openai", "gpt-5.5")).toEqual({ openai: { reasoningEffort: "medium" } });
  });
  it("adaptive 지원 Anthropic 모델은 adaptive thinking을 쓴다(Opus 4.8 포함)", () => {
    expect(buildProviderOptions("anthropic", "claude-opus-4-8")).toEqual({ anthropic: { thinking: { type: "adaptive" } } });
    expect(buildProviderOptions("anthropic", "claude-sonnet-4-6")).toEqual({ anthropic: { thinking: { type: "adaptive" } } });
  });
  it("adaptive 미지원 모델(haiku)은 thinking을 설정하지 않는다", () => {
    expect(buildProviderOptions("anthropic", "claude-haiku-4-5")).toEqual({});
  });
  it("aihub는 모델별 옵션을 보내지 않는다(혼합 모델셋이라 빈 객체)", () => {
    expect(buildProviderOptions("aihub", "claude-sonnet")).toEqual({});
    expect(buildProviderOptions("aihub", "gpt-5")).toEqual({});
  });
});

describe("resolveModel", () => {
  it("키/모델로 모델 객체를 만든다(네트워크 호출 없음)", () => {
    expect(resolveModel("anthropic", "sk-test", "claude-sonnet-4-6")).toBeTruthy();
    expect(resolveModel("openai", "sk-test", "gpt-5.2")).toBeTruthy();
    expect(resolveModel("aihub", "sk-test", "claude-sonnet")).toBeTruthy();
  });
});
