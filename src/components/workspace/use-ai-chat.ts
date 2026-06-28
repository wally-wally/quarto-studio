import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { getActiveCredentials, loadSettings, type AiProvider } from "@/lib/ai/settings";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { applyToolFrame } from "./apply-edits-to-editor";

export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  elapsedMs: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  edited?: "edit" | "write";
  editFailed?: boolean;
  error?: boolean;
  usage?: ChatUsage | null;
};

type StreamFrame =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number }; provider?: AiProvider; model?: string };

let counter = 0;
function newId(): string {
  counter += 1;
  return `m-${counter}-${Math.round(performance.now())}`;
}

export function useAiChat(
  getContent: () => string,
  editorViewRef: RefObject<EditorView | null>,
): {
  messages: ChatMessage[];
  generating: boolean;
  aiEditedThisSession: boolean;
  send: (prompt: string, files: File[]) => Promise<void>;
  stop: () => void;
  resetChat: () => void;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [aiEditedThisSession, setAiEditedThisSession] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (prompt: string, files: File[]) => {
      const creds = getActiveCredentials(loadSettings());
      const userMsg: ChatMessage = { id: newId(), role: "user", text: prompt };
      const assistantId = newId();

      if (!creds.apiKey) {
        setMessages((cur) => [
          ...cur,
          userMsg,
          { id: assistantId, role: "assistant", text: "설정에서 API 키를 입력해주세요.", error: true },
        ]);
        return;
      }

      // history는 새 user 메시지를 포함해 직전 대화 텍스트만 보낸다.
      const history = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }));
      const document = getContent();

      setMessages((cur) => [
        ...cur,
        userMsg,
        { id: assistantId, role: "assistant", text: "", pending: true },
      ]);
      setGenerating(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = performance.now();

      try {
        const fd = new FormData();
        fd.set("provider", creds.provider);
        fd.set("model", creds.model);
        fd.set("messages", JSON.stringify(history));
        fd.set("document", document);
        for (const f of files) fd.append("files", f);

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          body: fd,
          headers: { "x-provider-key": creds.apiKey },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `요청에 실패했습니다 (${res.status})`);
        }
        if (!res.body) throw new Error("응답 스트림을 읽을 수 없습니다.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        const collected = { usage: null as { inputTokens: number; outputTokens: number } | null };

        const handleFrame = (line: string) => {
          if (!line) return;
          const frame = JSON.parse(line) as StreamFrame;
          if (frame.type === "delta") {
            accumulated += frame.text;
            patchMessage(assistantId, { text: accumulated });
          } else if (frame.type === "tool") {
            const view = editorViewRef.current;
            const r = view
              ? applyToolFrame(view, { name: frame.name, input: frame.input })
              : { kind: "edit" as const, failed: true };
            setAiEditedThisSession(true);
            patchMessage(assistantId, { edited: r.kind, editFailed: r.failed });
          } else if (frame.type === "done") {
            collected.usage = frame.usage;
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            handleFrame(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
          }
        }
        handleFrame(buffer.trim());

        const usage = collected.usage;
        patchMessage(assistantId, {
          pending: false,
          usage: usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                costUsd: estimateCostUsd(creds.provider, creds.model, usage),
                elapsedMs: performance.now() - startedAt,
              }
            : null,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          // 사용자가 중단: 부분 텍스트와 이미 적용된 편집은 유지하고 pending만 해제.
          patchMessage(assistantId, { pending: false });
        } else {
          patchMessage(assistantId, {
            pending: false,
            error: true,
            text: e instanceof Error ? e.message : "응답 중 오류가 발생했습니다.",
          });
        }
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    [messages, getContent, editorViewRef, patchMessage],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setGenerating(false);
    setAiEditedThisSession(false);
  }, []);

  return { messages, generating, aiEditedThisSession, send, stop, resetChat };
}
