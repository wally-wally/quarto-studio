// src/components/workspace/ai-message-list.tsx
"use client";

import { useEffect, useRef } from "react";
import { Pencil, FileText } from "lucide-react";
import { formatUsd, formatDuration } from "@/lib/ai/pricing";
import type { ChatMessage } from "./use-ai-chat";

export function AiMessageList({
  messages,
  generating,
}: {
  messages: ChatMessage[];
  generating: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // 새 메시지/스트리밍 갱신 시 바닥으로(채팅 stick-to-bottom).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, generating]);

  if (messages.length === 0) {
    return (
      <div className="ai-chat-empty">
        <p>문서에 대해 묻거나, 만들고 싶은 걸 말해보세요.</p>
      </div>
    );
  }

  return (
    <div className="ai-chat-list">
      {messages.map((m) => (
        <div key={m.id} className={`ai-msg ai-msg-${m.role}`}>
          <div className={`ai-bubble ${m.error ? "ai-bubble-error" : ""}`}>
            {m.text || (m.pending ? "…" : "")}
          </div>
          {m.edited === "write" && (
            <span className="ai-edit-chip">
              <FileText size={12} aria-hidden="true" /> 문서 작성됨
            </span>
          )}
          {m.edited === "edit" && (
            <span className="ai-edit-chip">
              <Pencil size={12} aria-hidden="true" /> 문서 수정됨
            </span>
          )}
          {m.editFailed && <span className="ai-edit-warn">일부 편집 미적용</span>}
          {m.usage && (
            <span className="ai-msg-usage">
              {(m.usage.inputTokens + m.usage.outputTokens).toLocaleString()} 토큰 ·{" "}
              {m.usage.costUsd === null ? "—" : formatUsd(m.usage.costUsd)} ·{" "}
              {formatDuration(m.usage.elapsedMs)}
            </span>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
