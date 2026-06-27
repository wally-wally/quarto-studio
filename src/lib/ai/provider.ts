import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, JSONValue } from "ai";
import type { AiProvider } from "./settings";

// 공식 REST 엔드포인트를 명시한다. @ai-sdk/anthropic@4.0.0의 기본 baseURL이 `/v1`을
// 누락해 `https://api.anthropic.com/messages`로 404가 나므로(실측), 명시적으로 지정한다.
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function resolveModel(provider: AiProvider, apiKey: string, model: string): LanguageModel {
  if (provider === "openai") {
    return createOpenAI({ apiKey, baseURL: OPENAI_BASE_URL })(model);
  }
  return createAnthropic({ apiKey, baseURL: ANTHROPIC_BASE_URL })(model);
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
