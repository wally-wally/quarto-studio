import { describe, it, expect } from "vitest";
import { estimateCostUsd, formatUsd, formatDuration } from "./pricing";

describe("estimateCostUsd", () => {
  it("Anthropic 모델 비용을 입력·출력 요율로 계산한다", () => {
    // sonnet 4.6: $3/$15 per 1M. 1M 입력 + 1M 출력 = 3 + 15 = 18
    expect(estimateCostUsd("anthropic", "claude-sonnet-4-6", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(18);
  });

  it("OpenAI 모델 비용을 계산한다", () => {
    // gpt-5.5: $5/$30 per 1M. 입력 100k($0.5) + 출력 50k($1.5) = 2
    expect(estimateCostUsd("openai", "gpt-5.5", { inputTokens: 100_000, outputTokens: 50_000 })).toBeCloseTo(2, 6);
  });

  it("요금표에 없는 모델은 null을 반환한다", () => {
    expect(estimateCostUsd("openai", "gpt-unknown", { inputTokens: 1000, outputTokens: 1000 })).toBeNull();
  });
});

describe("formatUsd", () => {
  it("0 이하는 $0", () => {
    expect(formatUsd(0)).toBe("$0");
  });
  it("아주 작은 값은 <$0.0001", () => {
    expect(formatUsd(0.00005)).toBe("<$0.0001");
  });
  it("1달러 미만은 소수 4자리", () => {
    expect(formatUsd(0.0042)).toBe("$0.0042");
  });
  it("1달러 이상은 소수 2자리", () => {
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("formatDuration", () => {
  it("1분 미만은 초(소수 1자리)", () => {
    expect(formatDuration(12_340)).toBe("12.3초");
  });
  it("1분 이상은 분·초", () => {
    expect(formatDuration(65_000)).toBe("1분 5초");
  });
});
