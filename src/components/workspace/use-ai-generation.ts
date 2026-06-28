import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import type { AiGenerationHandlers } from "./ai-drawer";
import { writeStreamedDoc, resetStickyStream } from "./stream-into-editor";

export function useAiGeneration(
  getContent: () => string,
  setContent: (content: string) => void,
  editorViewRef?: RefObject<EditorView | null>,
): { generating: boolean; handlers: AiGenerationHandlers } {
  const [generating, setGenerating] = useState(false);
  const snapshotRef = useRef<string | null>(null);

  const onStart = useCallback(() => {
    snapshotRef.current = getContent();
    // 새 생성 시작 시 바닥 추적을 재개한다(이전 생성에서 위로 스크롤해 꺼졌을 수 있음).
    const view = editorViewRef?.current;
    if (view) resetStickyStream(view);
    setGenerating(true);
  }, [getContent, editorViewRef]);

  const onChunk = useCallback((full: string) => {
    // 에디터 뷰가 있으면 직접 append + 바닥 추적으로 반영한다(스크롤 튐 방지).
    // 뷰의 onChange가 상위 상태(draft.content)도 동기화하므로 setContent 중복 호출은 불필요.
    const view = editorViewRef?.current;
    if (view) {
      writeStreamedDoc(view, full);
    } else {
      setContent(full);
    }
  }, [setContent, editorViewRef]);

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
