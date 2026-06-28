import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import type { AiGenerationHandlers } from "./ai-drawer";
import { writeStreamedDoc, resetStickyStream } from "./stream-into-editor";

export function useAiGeneration(
  getContent: () => string,
  setContent: (content: string) => void,
  editorViewRef?: RefObject<EditorView | null>,
): {
  generating: boolean;
  // 생성이 끝났지만 아직 '되돌리기'하지 않은 미확정 작성분이 있는지.
  pendingRevert: boolean;
  // 문서 전환 등으로 AI 세션을 무효화한다(스냅샷·미확정 플래그 초기화).
  resetGeneration: () => void;
  handlers: AiGenerationHandlers;
} {
  const [generating, setGenerating] = useState(false);
  const [pendingRevert, setPendingRevert] = useState(false);
  const snapshotRef = useRef<string | null>(null);
  // 현재 활성 생성 세션 여부. 문서 전환으로 중단된 생성의 늦은 onFinish가
  // pendingRevert를 다시 켜는 레이스를 막는 게이트.
  const activeRef = useRef(false);

  const onStart = useCallback(() => {
    snapshotRef.current = getContent();
    activeRef.current = true;
    setPendingRevert(false);
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
    // 세션이 유효할 때만 미확정 상태로 표시(전환으로 무효화됐으면 무시).
    if (activeRef.current) setPendingRevert(true);
  }, []);

  const onError = useCallback(() => {
    activeRef.current = false;
    setGenerating(false);
    setPendingRevert(false);
    if (snapshotRef.current !== null) setContent(snapshotRef.current);
  }, [setContent]);

  const onRevert = useCallback(() => {
    activeRef.current = false;
    setPendingRevert(false);
    if (snapshotRef.current !== null) setContent(snapshotRef.current);
  }, [setContent]);

  const resetGeneration = useCallback(() => {
    activeRef.current = false;
    snapshotRef.current = null;
    setPendingRevert(false);
  }, []);

  return {
    generating,
    pendingRevert,
    resetGeneration,
    handlers: { onStart, onChunk, onFinish, onError, onRevert },
  };
}
