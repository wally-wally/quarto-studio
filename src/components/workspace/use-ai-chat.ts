import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { getActiveCredentials, loadSettings, type AiProvider } from "@/lib/ai/settings";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { applyToolFrame, streamDocumentToView, commitStreamedWrite } from "./apply-edits-to-editor";
import { WRITE_TOOL } from "@/lib/ai/tools";

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
  | { type: "doc-stream"; text: string }
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
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
      const history = [...messagesRef.current, userMsg].map((m) => ({ role: m.role, text: m.text }));
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
      // 스트리밍되던 write_document의 작성 전 스냅샷(완료·중단 시 한 번의 undo 스텝으로 커밋).
      let writeSnapshot: string | null = null;

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
          } else if (frame.type === "doc-stream") {
            // write_document 인자가 생성되는 대로 에디터에 라이브로 써 내려간다.
            const view = editorViewRef.current;
            if (view) {
              if (writeSnapshot === null) writeSnapshot = view.state.doc.toString();
              streamDocumentToView(view, frame.text);
              setAiEditedThisSession(true);
            }
          } else if (frame.type === "tool") {
            const view = editorViewRef.current;
            if (frame.name === WRITE_TOOL && writeSnapshot !== null && view) {
              // 스트리밍으로 써온 write를 한 번의 undo 스텝으로 커밋한다.
              const content = (frame.input as { content?: unknown }).content;
              const finalContent = typeof content === "string" ? content : view.state.doc.toString();
              commitStreamedWrite(view, writeSnapshot, finalContent);
              writeSnapshot = null;
              setAiEditedThisSession(true);
              patchMessage(assistantId, { edited: "write", editFailed: typeof content !== "string" });
            } else {
              // edit_document, 또는 스트리밍되지 않은 write → 기존 원자적 적용.
              const r = view
                ? applyToolFrame(view, { name: frame.name, input: frame.input })
                : { kind: "edit" as const, failed: true };
              setAiEditedThisSession(true);
              patchMessage(assistantId, { edited: r.kind, editFailed: r.failed });
            }
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
          // 중단: 스트리밍 중이던 write가 있으면 지금까지를 한 스텝으로 커밋해 undo 가능하게 만든다.
          const view = editorViewRef.current;
          if (writeSnapshot !== null && view) {
            commitStreamedWrite(view, writeSnapshot, view.state.doc.toString());
            writeSnapshot = null;
          }
          // 부분 텍스트와 이미 적용된 편집은 유지하고 pending만 해제.
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
    [getContent, editorViewRef, patchMessage],
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
