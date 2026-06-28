import { EditorView } from "@codemirror/view";
import { applyEdits } from "@/lib/quarto/apply-edits";
import { EDIT_TOOL, WRITE_TOOL, type EditDocumentInput, type WriteDocumentInput } from "@/lib/ai/tools";

export type ToolFrame = { name: string; input: unknown };
export type ApplyResult = { kind: "edit" | "write"; failed: boolean };

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
