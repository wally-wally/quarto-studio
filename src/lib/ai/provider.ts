import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, JSONValue } from "ai";
import type { AiProvider } from "./settings";

// 공식 REST 엔드포인트를 명시한다. @ai-sdk/anthropic@4.0.0의 기본 baseURL이 `/v1`을
// 누락해 `https://api.anthropic.com/messages`로 404가 나므로(실측), 명시적으로 지정한다.
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
// AI Hub는 OpenAI 호환 게이트웨이. claude·gpt·gemini 등 모든 모델을 chat/completions로 받는다.
const AIHUB_BASE_URL = "https://ai-hub-gabia.gabia.com/v1";

export function resolveModel(provider: AiProvider, apiKey: string, model: string): LanguageModel {
  if (provider === "openai") {
    return createOpenAI({ apiKey, baseURL: OPENAI_BASE_URL })(model);
  }
  if (provider === "aihub") {
    // .chat()으로 /v1/chat/completions를 명시한다(기본 호출이 /responses로 갈 수 있어 고정).
    return createOpenAI({ apiKey, baseURL: AIHUB_BASE_URL }).chat(model);
  }
  return createAnthropic({ apiKey, baseURL: ANTHROPIC_BASE_URL })(model);
}

// 추론 effort는 medium 고정. 프로바이더별 표현이 다르다:
// - OpenAI: reasoningEffort "medium" (추론 모델에 적용, 그 외엔 무시됨).
// - Anthropic: adaptive thinking을 쓴다. (Opus 4.8/4.7은 고정 예산 budgetTokens를
//   400으로 거부하므로 adaptive로 통일.) thinking(추론) 토큰은 텍스트 스트림에서
//   제외되므로 에디터에는 최종 본문만 스트리밍된다. adaptive를 지원하지 않는
//   모델(haiku 등)은 thinking을 설정하지 않는다.
const ANTHROPIC_ADAPTIVE_THINKING_MODELS = new Set([
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
]);

export function buildProviderOptions(
  provider: AiProvider,
  model: string,
): Record<string, Record<string, JSONValue>> {
  if (provider === "openai") {
    return { openai: { reasoningEffort: "medium" } };
  }
  // AI Hub는 claude·gpt·gemini가 섞여 있어 모델별 옵션을 보내지 않는다(일부 모델 400 방지).
  if (provider === "aihub") {
    return {};
  }
  if (ANTHROPIC_ADAPTIVE_THINKING_MODELS.has(model)) {
    return { anthropic: { thinking: { type: "adaptive" } } };
  }
  return {};
}
