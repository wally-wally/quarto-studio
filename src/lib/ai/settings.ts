export type AiProvider = "anthropic" | "openai";
export type ProviderConfig = { apiKey: string; model: string };
export type AiSettings = {
  provider: AiProvider;
  anthropic: ProviderConfig;
  openai: ProviderConfig;
};

export const RECOMMENDED_MODELS: Record<AiProvider, { label: string; value: string }[]> = {
  anthropic: [
    { label: "Claude Sonnet 4.6 (균형, 추천)", value: "claude-sonnet-4-6" },
    { label: "Claude Opus 4.8 (고품질)", value: "claude-opus-4-8" },
    { label: "Claude Haiku 4.5 (빠름)", value: "claude-haiku-4-5" },
  ],
  openai: [
    { label: "GPT-5.5 Pro", value: "gpt-5.5-pro" },
    { label: "GPT-5.5", value: "gpt-5.5" },
    { label: "GPT-5.4 Pro", value: "gpt-5.4-pro" },
    { label: "GPT-5.4", value: "gpt-5.4" },
    { label: "GPT-5.4 mini", value: "gpt-5.4-mini" },
  ],
};

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "anthropic",
  anthropic: { apiKey: "", model: "claude-sonnet-4-6" },
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
      provider: parsed.provider === "openai" ? "openai" : "anthropic",
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
  const config = settings.provider === "openai" ? settings.openai : settings.anthropic;
  return { provider: settings.provider, apiKey: config.apiKey, model: config.model };
}
