export type AiProvider = "aihub" | "anthropic" | "openai";
export type ProviderConfig = { apiKey: string; model: string };
export type AiSettings = {
  provider: AiProvider;
  aihub: ProviderConfig;
  anthropic: ProviderConfig;
  openai: ProviderConfig;
};

export const RECOMMENDED_MODELS: Record<AiProvider, { label: string; value: string }[]> = {
  // AI Hub는 /v1/models에서 모델을 동적으로 불러오므로 정적 폴백을 두지 않는다.
  aihub: [],
  anthropic: [
    { label: "Claude Opus 4.8", value: "claude-opus-4-8" },
    { label: "Claude Sonnet 5", value: "claude-sonnet-5" },
    { label: "Claude Haiku 4.5", value: "claude-haiku-4-5" },
  ],
  openai: [
    { label: "GPT-5.5 Pro", value: "gpt-5.5-pro" },
    { label: "GPT-5.5", value: "gpt-5.5" },
    { label: "GPT-5.4 Pro", value: "gpt-5.4-pro" },
    { label: "GPT-5.4", value: "gpt-5.4" },
    { label: "GPT-5.4 mini", value: "gpt-5.4-mini" },
    { label: "GPT-5.4 nano", value: "gpt-5.4-nano" },
  ],
};

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "anthropic",
  aihub: { apiKey: "", model: "claude-sonnet" },
  anthropic: { apiKey: "", model: "claude-sonnet-5" },
  openai: { apiKey: "", model: "gpt-5.5" },
};

const STORAGE_KEY = "quarto-studio:ai-settings";

export function loadSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      provider:
        parsed.provider === "openai" || parsed.provider === "aihub" ? parsed.provider : "anthropic",
      aihub: { ...DEFAULT_SETTINGS.aihub, ...parsed.aihub },
      anthropic: { ...DEFAULT_SETTINGS.anthropic, ...parsed.anthropic },
      openai: { ...DEFAULT_SETTINGS.openai, ...parsed.openai },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AiSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getActiveCredentials(settings: AiSettings): ProviderConfig & { provider: AiProvider } {
  const config = settings[settings.provider];
  return { provider: settings.provider, apiKey: config.apiKey, model: config.model };
}
