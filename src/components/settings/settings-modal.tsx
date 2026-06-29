"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadSettings,
  saveSettings,
  RECOMMENDED_MODELS,
  type AiProvider,
  type AiSettings,
} from "@/lib/ai/settings";

const PROVIDER_ORDER: AiProvider[] = ["aihub", "anthropic", "openai"];
const PROVIDER_LABELS: Record<AiProvider, string> = {
  aihub: "AI Hub",
  anthropic: "Anthropic",
  openai: "OpenAI",
};
const KEY_PLACEHOLDERS: Record<AiProvider, string> = {
  aihub: "AI Hub API 키",
  anthropic: "sk-ant-...",
  openai: "sk-...",
};

type ModelOption = { value: string; label: string };

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SettingsModalContent onClose={onClose} />;
}

function SettingsModalContent({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AiSettings>(() => loadSettings());
  const [showKey, setShowKey] = useState(false);
  // AI Hub 모델은 /v1/models에서 동적으로 불러온다.
  const [aihubModels, setAihubModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Esc로 모달 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const provider = settings.provider;
  const config = settings[provider];

  const fetchAihubModels = useCallback(async (apiKey: string) => {
    if (!apiKey) return;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/ai/models", { headers: { "x-provider-key": apiKey } });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "모델 목록을 불러오지 못했습니다.");
      setAihubModels(Array.isArray(body?.models) ? (body.models as ModelOption[]) : []);
    } catch (e) {
      setAihubModels([]);
      setModelsError(e instanceof Error ? e.message : "모델 목록을 불러오지 못했습니다.");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // 시작 시 저장된 프로바이더가 AI Hub면 모델을 한 번 불러온다.
  // (effect 본문에서 곧장 setState를 호출하지 않도록 다음 틱으로 미룬다.)
  useEffect(() => {
    const s = loadSettings();
    if (s.provider !== "aihub" || !s.aihub.apiKey) return;
    const id = setTimeout(() => void fetchAihubModels(s.aihub.apiKey), 0);
    return () => clearTimeout(id);
  }, [fetchAihubModels]);

  function setProvider(next: AiProvider) {
    setSettings((s) => ({ ...s, provider: next }));
    // AI Hub 탭으로 처음 전환할 때 키가 있으면 자동으로 모델을 불러온다.
    if (next === "aihub" && settings.aihub.apiKey && aihubModels.length === 0) {
      void fetchAihubModels(settings.aihub.apiKey);
    }
  }
  function setConfig(patch: Partial<{ apiKey: string; model: string }>) {
    setSettings((s) => ({ ...s, [provider]: { ...s[provider], ...patch } }));
  }
  function handleSave() {
    saveSettings(settings);
    onClose();
  }

  // AI Hub는 동적 목록을 쓰되, 저장된(현재 선택) 모델이 목록에 없으면 옵션으로 보존한다.
  const modelOptions = useMemo<ModelOption[]>(() => {
    if (provider !== "aihub") return RECOMMENDED_MODELS[provider];
    const opts = [...aihubModels];
    if (config.model && !opts.some((o) => o.value === config.model)) {
      opts.unshift({ value: config.model, label: config.model });
    }
    return opts;
  }, [provider, aihubModels, config.model]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI 설정"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>AI 설정</h2>
        </div>

        <div className="settings-segment settings-segment-3" role="tablist" aria-label="프로바이더">
          {PROVIDER_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={provider === p}
              className={`settings-tab ${provider === p ? "active" : ""}`}
              onClick={() => setProvider(p)}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        <label className="ai-field">
          <span className="ai-field-label">API 키</span>
          <div className="settings-key-row">
            <input
              aria-label="API 키"
              className="auth-input"
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              placeholder={KEY_PLACEHOLDERS[provider]}
              onChange={(e) => setConfig({ apiKey: e.target.value })}
            />
            <button
              type="button"
              className="ghost-button"
              aria-label="API 키 표시 전환"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? "숨기기" : "표시"}
            </button>
          </div>
        </label>

        <label className="ai-field">
          <span className="ai-field-label">모델</span>
          <div className="settings-key-row">
            <select
              aria-label="모델"
              className="auth-input"
              value={config.model}
              onChange={(e) => setConfig({ model: e.target.value })}
            >
              {modelOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {provider === "aihub" && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => void fetchAihubModels(config.apiKey)}
                disabled={modelsLoading || !config.apiKey}
              >
                {modelsLoading ? "불러오는 중…" : "새로고침"}
              </button>
            )}
          </div>
        </label>

        {provider === "aihub" && modelsError && <p className="settings-error">{modelsError}</p>}
        {provider === "aihub" && !config.apiKey && (
          <p className="settings-note">API 키를 입력하고 새로고침하면 모델 목록을 불러옵니다.</p>
        )}

        <p className="settings-note">
          API 키는 이 브라우저에만 저장되며 서버에 보관되지 않습니다. 생성 요청 시에만 사용됩니다.
        </p>

        <div className="ai-actions">
          <button type="button" className="primary-button" onClick={handleSave}>
            저장
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
