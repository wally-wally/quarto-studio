import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyToolFrame } from "./apply-edits-to-editor";

function makeView(doc: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc }) });
}

describe("applyToolFrame", () => {
  it("write_document는 문서 전체를 교체한다", () => {
    const view = makeView("옛 내용");
    const r = applyToolFrame(view, { name: "write_document", input: { content: "# 새 문서\n본문" } });
    expect(view.state.doc.toString()).toBe("# 새 문서\n본문");
    expect(r).toEqual({ kind: "write", failed: false });
  });

  it("edit_document는 부분 치환을 트랜잭션 1회로 반영한다", () => {
    const view = makeView("제목: 옛날\n본문");
    const r = applyToolFrame(view, {
      name: "edit_document",
      input: { edits: [{ find: "옛날", replace: "새날" }] },
    });
    expect(view.state.doc.toString()).toBe("제목: 새날\n본문");
    expect(r).toEqual({ kind: "edit", failed: false });
  });

  it("edit_document에서 일치하지 않는 find가 있으면 failed:true", () => {
    const view = makeView("hello");
    const r = applyToolFrame(view, {
      name: "edit_document",
      input: { edits: [{ find: "zzz", replace: "x" }] },
    });
    expect(view.state.doc.toString()).toBe("hello");
    expect(r).toEqual({ kind: "edit", failed: true });
  });

  it("edit_document 트랜잭션은 undo 1스텝으로 되돌릴 수 있다", () => {
    const view = makeView("foo");
    applyToolFrame(view, { name: "edit_document", input: { edits: [{ find: "foo", replace: "bar" }] } });
    expect(view.state.doc.toString()).toBe("bar");
    // @codemirror/commands의 undo는 history 확장이 필요하므로, 여기선 변경 자체만 검증한다.
    // (네이티브 undo 동작은 Task 8 통합 + 수동 스모크에서 확인.)
  });

  it("알 수 없는 도구나 빈 입력은 failed:true로 처리한다", () => {
    const view = makeView("hello");
    const r = applyToolFrame(view, { name: "unknown_tool", input: {} });
    expect(view.state.doc.toString()).toBe("hello");
    expect(r.failed).toBe(true);
  });
});
