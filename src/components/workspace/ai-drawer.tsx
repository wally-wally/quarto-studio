"use client";

import { Sparkles, X } from "lucide-react";
import { AiMessageList } from "./ai-message-list";
import { AiComposer } from "./ai-composer";
import type { ChatMessage } from "./use-ai-chat";

export type AiDrawerProps = {
  open: boolean;
  onToggle: () => void;
  isBusy: boolean;
  generating: boolean;
  messages: ChatMessage[];
  onSend: (prompt: string, files: File[]) => void;
  onStop: () => void;
  onOpenSettings: () => void;
};

export function AiDrawer({
  open,
  onToggle,
  isBusy,
  generating,
  messages,
  onSend,
  onStop,
  onOpenSettings,
}: AiDrawerProps) {
  return (
    <div className={`ai-drawer ${open ? "open" : ""}`}>
      {open && (
        <>
          <div className="ai-drawer-header">
            <Sparkles size={15} className="ai-drawer-icon" aria-hidden="true" />
            <span className="ai-drawer-title">AI 작성</span>
            <button
              type="button"
              className="ai-drawer-close"
              aria-label="AI 작성 닫기"
              onClick={onToggle}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="ai-drawer-body">
            <AiMessageList messages={messages} generating={generating} />
            <AiComposer
              generating={generating}
              isBusy={isBusy}
              onSend={onSend}
              onStop={onStop}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </>
      )}
    </div>
  );
}
