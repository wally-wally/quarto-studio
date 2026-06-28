// src/components/workspace/ai-composer.tsx
"use client";

import { useState } from "react";
import { Paperclip, Send, Square, X } from "lucide-react";
import { getActiveCredentials, loadSettings } from "@/lib/ai/settings";
import {
  validatePrompt,
  validateAttachments,
  MAX_PROMPT_LENGTH,
  MAX_ATTACHMENTS,
  ALLOWED_EXTENSIONS,
} from "@/lib/ai/validation";

const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function AiComposer({
  generating,
  isBusy,
  onSend,
  onStop,
  onOpenSettings,
}: {
  generating: boolean;
  isBusy: boolean;
  onSend: (prompt: string, files: File[]) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)];
    const check = validateAttachments(next.map((f) => ({ name: f.name, size: f.size })));
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((cur) => cur.filter((_, i) => i !== index));
  }

  function submit() {
    const creds = getActiveCredentials(loadSettings());
    if (!creds.apiKey) {
      setError("설정에서 API 키를 입력하세요.");
      return;
    }
    const promptCheck = validatePrompt(prompt);
    if (!promptCheck.ok) {
      setError(promptCheck.error);
      return;
    }
    const attachmentCheck = validateAttachments(files.map((f) => ({ name: f.name, size: f.size })));
    if (!attachmentCheck.ok) {
      setError(attachmentCheck.error);
      return;
    }
    setError(null);
    onSend(prompt, files);
    setPrompt("");
    setFiles([]);
  }

  return (
    <div className="ai-composer">
      {files.length > 0 && (
        <ul className="ai-chip-list">
          {files.map((file, index) => (
            <li className="ai-chip" key={`${file.name}-${file.size}-${index}`}>
              <span className="ai-chip-name">{file.name}</span>
              <span className="ai-chip-size">{formatSize(file.size)}</span>
              <button
                type="button"
                aria-label={`${file.name} 제거`}
                className="ai-chip-remove"
                disabled={generating}
                onClick={() => removeFile(index)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="ai-error" role="alert">
          {error}{" "}
          <button type="button" className="ai-link" onClick={onOpenSettings}>
            설정 열기
          </button>
        </p>
      )}
      <div className="ai-composer-row">
        <label className="ai-attach-button">
          <Paperclip size={14} aria-hidden="true" />
          <input
            type="file"
            aria-label="파일 첨부"
            hidden
            multiple
            accept={ACCEPT}
            disabled={generating}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          aria-label="AI 메시지 입력"
          className="ai-composer-input"
          value={prompt}
          maxLength={MAX_PROMPT_LENGTH}
          disabled={generating}
          placeholder="메시지를 입력하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {generating ? (
          <button type="button" className="ai-send-button" aria-label="중단" onClick={onStop}>
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="ai-send-button"
            aria-label="전송"
            disabled={isBusy}
            onClick={submit}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <span className="ai-attach-meta">
        {files.length} / {MAX_ATTACHMENTS}개
      </span>
    </div>
  );
}
