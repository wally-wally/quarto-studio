import { useCallback, useRef, useState } from "react";
import type { AiGenerationHandlers } from "./ai-drawer";

export function useAiGeneration(
  getContent: () => string,
  setContent: (content: string) => void,
): { generating: boolean; handlers: AiGenerationHandlers } {
  const [generating, setGenerating] = useState(false);
  const snapshotRef = useRef<string | null>(null);

  const onStart = useCallback(() => {
    snapshotRef.current = getContent();
    setGenerating(true);
  }, [getContent]);

  const onChunk = useCallback((full: string) => {
    setContent(full);
  }, [setContent]);

  const onFinish = useCallback(() => {
    setGenerating(false);
  }, []);

  const onError = useCallback(() => {
    setGenerating(false);
    if (snapshotRef.current !== null) setContent(snapshotRef.current);
  }, [setContent]);

  const onRevert = useCallback(() => {
    if (snapshotRef.current !== null) setContent(snapshotRef.current);
  }, [setContent]);

  return { generating, handlers: { onStart, onChunk, onFinish, onError, onRevert } };
}
