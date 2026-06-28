import type { AiProvider } from "./settings";

export type TokenUsage = { inputTokens: number; outputTokens: number };

type Rate = { input: number; output: number }; // 1M 토큰당 USD

// 모델별 요금(1M 토큰당 USD). 기준일 2026-06.
// 표시 비용은 추정치이며, 요율 변동 시 이 표만 갱신하면 된다.
const PRICING: Record<AiProvider, Record<string, Rate>> = {
  anthropic: {
    "claude-opus-4-8": { input: 5, output: 25 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-haiku-4-5": { input: 1, output: 5 },
  },
  openai: {
    "gpt-5.5-pro": { input: 30, output: 180 },
    "gpt-5.5": { input: 5, output: 30 },
    "gpt-5.4-pro": { input: 30, output: 180 },
    "gpt-5.4": { input: 2.5, output: 15 },
    "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  },
};

// 요금표에 모델이 없으면 null(비용은 "—"로 표기).
export function estimateCostUsd(provider: AiProvider, model: string, usage: TokenUsage): number | null {
  const rate = PRICING[provider]?.[model];
  if (!rate) return null;
  return (usage.inputTokens / 1_000_000) * rate.input + (usage.outputTokens / 1_000_000) * rate.output;
}

export function formatUsd(cost: number): string {
  if (cost <= 0) return "$0";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}분 ${rest}초`;
}
