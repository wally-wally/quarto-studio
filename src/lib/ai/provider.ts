import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, JSONValue } from "ai";
import type { AiProvider } from "./settings";

export function resolveModel(provider: AiProvider, apiKey: string, model: string): LanguageModel {
  if (provider === "openai") {
    return createOpenAI({ apiKey })(model);
  }
  return createAnthropic({ apiKey })(model);
}

// 추론 effort는 medium 고정. 프로바이더별 표현이 다르다:
// - OpenAI: reasoningEffort "medium" (추론 모델에 적용, 그 외엔 무시됨).
// - Anthropic: extended thinking을 medium 예산으로 활성화. thinking(추론) 토큰은
//   텍스트 스트림에서 제외되므로 에디터에는 최종 본문만 스트리밍된다.
//   선택한 모델이 thinking을 지원하지 않으면 이 블록을 비활성화한다.
export const ANTHROPIC_THINKING_BUDGET = 4_096;

export function buildProviderOptions(provider: AiProvider): Record<string, Record<string, JSONValue>> {
  if (provider === "openai") {
    return { openai: { reasoningEffort: "medium" } };
  }
  return { anthropic: { thinking: { type: "enabled", budgetTokens: ANTHROPIC_THINKING_BUDGET } } };
}
