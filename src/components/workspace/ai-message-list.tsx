// src/components/workspace/ai-message-list.tsx
"use client";

import { useEffect, useRef } from "react";
import { Pencil, FileText, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatUsd, formatDuration } from "@/lib/ai/pricing";
import type { ChatMessage } from "./use-ai-chat";

// 에디터에 적용된 도구 작업 결과를 채팅에 또렷한 상태 줄로 알린다
// (모델이 말풍선에 따로 말하지 않아도 무슨 작업이 됐는지/실패했는지 보이게).
function ToolStatus({ edited, failed }: { edited: "edit" | "write"; failed?: boolean }) {
  const isWrite = edited === "write";
  const text = isWrite
    ? failed
      ? "문서를 작성하지 못했습니다."
      : "문서를 새로 작성했습니다."
    : failed
      ? "일부 편집을 적용하지 못했습니다 (해당 구간을 찾지 못함)."
      : "문서를 수정했습니다.";
  const Icon = failed ? AlertTriangle : isWrite ? FileText : Pencil;
  return (
    <span className={`ai-tool-status ${failed ? "ai-tool-status-warn" : ""}`}>
      <Icon size={12} aria-hidden="true" /> {text}
    </span>
  );
}

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
            {m.role === "assistant" && m.text && !m.error ? (
              // 어시스턴트 답변은 마크다운으로 렌더(원시 HTML은 비활성 — XSS 방지).
              <div className="ai-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
              </div>
            ) : (
              m.text || (m.pending ? "…" : "")
            )}
          </div>
          {m.edited && <ToolStatus edited={m.edited} failed={m.editFailed} />}
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
