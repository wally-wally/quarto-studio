"use client";

import { useRef, useState } from "react";
import { Paperclip, Sparkles, X } from "lucide-react";
import { getActiveCredentials, loadSettings } from "@/lib/ai/settings";
import {
  validatePrompt,
  validateAttachments,
  MAX_PROMPT_LENGTH,
  MAX_ATTACHMENTS,
  MAX_TOTAL_BYTES,
  ALLOWED_EXTENSIONS,
} from "@/lib/ai/validation";

export type AiGenerationHandlers = {
  onStart: () => void;
  onChunk: (full: string) => void;
  onFinish: () => void;
  onError: () => void;
  onRevert: () => void;
};

export type AiDrawerProps = {
  open: boolean;
  onToggle: () => void;
  isBusy: boolean;
  onOpenSettings: () => void;
  handlers: AiGenerationHandlers;
};

const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function AiDrawer({ open, onToggle, isBusy, onOpenSettings, handlers }: AiDrawerProps) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

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
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
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
    setFinished(false);
    setGenerating(true);
    handlers.onStart();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fd = new FormData();
      fd.set("provider", creds.provider);
      fd.set("model", creds.model);
      fd.set("prompt", prompt);
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        body: fd,
        headers: { "x-provider-key": creds.apiKey },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `생성에 실패했습니다 (${res.status})`);
      }
      if (!res.body) {
        throw new Error("응답 스트림을 읽을 수 없습니다.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        handlers.onChunk(accumulated);
      }
      handlers.onFinish();
      setFinished(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        handlers.onFinish();
        setFinished(true);
      } else {
        handlers.onError();
        setError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleRevert() {
    handlers.onRevert();
    setFinished(false);
  }

  return (
    <div className={`ai-drawer ${open ? "open" : ""}`}>
      <button type="button" className="ai-drawer-toggle" aria-expanded={open} onClick={onToggle}>
        <Sparkles size={14} aria-hidden="true" />
        AI 작성
      </button>

      {open && (
        <div className="ai-drawer-body">
          <label className="ai-field">
            <span className="ai-field-label">AI 프롬프트</span>
            <textarea
              aria-label="AI 프롬프트"
              className="ai-prompt"
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              disabled={generating}
              placeholder="어떤 문서를 만들지 설명해주세요. (예: iris 데이터로 산점도와 설명이 있는 보고서)"
              onChange={(e) => setPrompt(e.target.value)}
            />
            <span className="ai-counter">
              {prompt.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
            </span>
          </label>

          <div className="ai-attachments">
            <label className="ai-attach-button">
              <Paperclip size={14} aria-hidden="true" />
              첨부
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
            <span className="ai-attach-meta">
              {files.length} / {MAX_ATTACHMENTS}개 · {formatMB(totalBytes)} / {formatMB(MAX_TOTAL_BYTES)} MB
            </span>
          </div>

          {files.length > 0 && (
            <ul className="ai-chip-list">
              {files.map((file, index) => (
                <li className="ai-chip" key={`${file.name}-${file.size}-${index}`}>
                  <span className="ai-chip-name">{file.name}</span>
                  <span className="ai-chip-size">{formatMB(file.size)}MB</span>
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

          <div className="ai-actions">
            {generating ? (
              <button type="button" className="ghost-button" onClick={handleStop}>
                중단
              </button>
            ) : (
              <button type="button" className="primary-button" disabled={isBusy} onClick={handleGenerate}>
                <Sparkles size={14} aria-hidden="true" />
                생성
              </button>
            )}
            {finished && !generating && (
              <button type="button" className="ghost-button" onClick={handleRevert}>
                되돌리기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
