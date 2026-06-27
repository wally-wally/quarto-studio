"use client";

import { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  RECOMMENDED_MODELS,
  type AiProvider,
  type AiSettings,
} from "@/lib/ai/settings";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SettingsModalContent onClose={onClose} />;
}

function SettingsModalContent({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AiSettings>(() => loadSettings());
  const [showKey, setShowKey] = useState(false);

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

  function setProvider(next: AiProvider) {
    setSettings((s) => ({ ...s, provider: next }));
  }
  function setConfig(patch: Partial<{ apiKey: string; model: string }>) {
    setSettings((s) => ({ ...s, [provider]: { ...s[provider], ...patch } }));
  }
  function handleSave() {
    saveSettings(settings);
    onClose();
  }

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

        <div className="settings-segment" role="tablist" aria-label="프로바이더">
          {(["anthropic", "openai"] as AiProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={provider === p}
              className={`settings-tab ${provider === p ? "active" : ""}`}
              onClick={() => setProvider(p)}
            >
              {p === "anthropic" ? "Anthropic" : "OpenAI"}
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
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
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
          <select
            aria-label="모델"
            className="auth-input"
            value={config.model}
            onChange={(e) => setConfig({ model: e.target.value })}
          >
            {RECOMMENDED_MODELS[provider].map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <p className="settings-note">
          API 키는 이 브라우저에만 저장되며 서버에 보관되지 않습니다. 생성 요청 시에만 사용됩니다.
        </p>

        <div className="ai-actions">
          <button type="button" className="primary-button" onClick={handleSave}>
            저장
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
