import { describe, it, expect } from "vitest";
import { buildProviderOptions, resolveModel } from "./provider";

describe("buildProviderOptions", () => {
  it("openai는 reasoningEffort medium", () => {
    expect(buildProviderOptions("openai")).toEqual({ openai: { reasoningEffort: "medium" } });
  });
  it("anthropic은 thinking 예산을 활성화한다", () => {
    const opts = buildProviderOptions("anthropic") as { anthropic: { thinking: { type: string; budgetTokens: number } } };
    expect(opts.anthropic.thinking.type).toBe("enabled");
    expect(opts.anthropic.thinking.budgetTokens).toBeGreaterThan(0);
  });
});

describe("resolveModel", () => {
  it("키/모델로 모델 객체를 만든다(네트워크 호출 없음)", () => {
    expect(resolveModel("anthropic", "sk-test", "claude-sonnet-4-6")).toBeTruthy();
    expect(resolveModel("openai", "sk-test", "gpt-5.2")).toBeTruthy();
  });
});
