import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import { applyEdits } from "@/lib/quarto/apply-edits";
import { EDIT_TOOL, WRITE_TOOL, type EditDocumentInput, type WriteDocumentInput } from "@/lib/ai/tools";

export type ToolFrame = { name: string; input: unknown };
export type ApplyResult = { kind: "edit" | "write"; failed: boolean };

/**
 * write_document 스트리밍 중, 지금까지의 부분 문서를 라이브로 반영한다.
 * undo 히스토리에는 남기지 않는다(addToHistory:false) — 중간 타이핑 단계가 Cmd+Z로
 * 하나씩 되돌려지지 않게. 최종 커밋은 commitStreamedWrite에서 한 스텝으로 처리한다.
 * 끝까지 따라가도록 selection을 문서 끝에 두고 스크롤한다.
 */
export function streamDocumentToView(view: EditorView, content: string): void {
  const current = view.state.doc.toString();
  if (content === current) return;
  const isAppend = content.startsWith(current);
  view.dispatch({
    changes: isAppend
      ? { from: current.length, insert: content.slice(current.length) }
      : { from: 0, to: current.length, insert: content },
    selection: { anchor: content.length },
    annotations: Transaction.addToHistory.of(false),
    scrollIntoView: true,
  });
}

/**
 * 스트리밍 완료 시 한 번의 undo 스텝으로 커밋한다.
 * 스냅샷(작성 전)으로 history 없이 되돌린 뒤, 최종본을 history와 함께 적용 →
 * 사용자가 Cmd+Z 한 번이면 AI 작성분 전체가 스냅샷으로 되돌아간다.
 */
export function commitStreamedWrite(view: EditorView, snapshot: string, finalContent: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: snapshot },
    annotations: Transaction.addToHistory.of(false),
  });
  view.dispatch({ changes: { from: 0, to: snapshot.length, insert: finalContent } });
}

/**
 * 모델의 도구 호출(tool 프레임)을 에디터에 반영한다.
 * - write_document: 문서 전체를 트랜잭션 1회로 교체(undo 1스텝).
 * - edit_document: applyEdits로 부분 치환한 새 전문을 트랜잭션 1회로 교체.
 * 변경은 일반 dispatch라 CodeMirror undo 히스토리에 쌓여 Cmd+Z로 되돌릴 수 있다.
 * 프로그램 dispatch는 readOnly 상태에서도 적용된다(readOnly는 사용자 입력만 막음).
 */
export function applyToolFrame(view: EditorView, frame: ToolFrame): ApplyResult {
  if (frame.name === WRITE_TOOL) {
    const content = (frame.input as WriteDocumentInput)?.content;
    if (typeof content !== "string") return { kind: "write", failed: true };
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    return { kind: "write", failed: false };
  }

  if (frame.name === EDIT_TOOL) {
    const edits = (frame.input as EditDocumentInput)?.edits;
    if (!Array.isArray(edits) || edits.length === 0) return { kind: "edit", failed: true };
    const current = view.state.doc.toString();
    const { content, results } = applyEdits(current, edits);
    if (content !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
    return { kind: "edit", failed: results.some((r) => !r.ok) };
  }

  // 알 수 없는 도구
  return { kind: "edit", failed: true };
}
