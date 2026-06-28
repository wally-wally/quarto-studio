import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { writeStreamedDoc } from "./stream-into-editor";

// jsdom에는 레이아웃이 없어 scroll* 값이 모두 0이다 → 명시적으로 주입해 바닥 여부를 제어한다.
function setScrollMetrics(view: EditorView, m: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  for (const [k, value] of Object.entries(m)) {
    Object.defineProperty(view.scrollDOM, k, { value, configurable: true });
  }
}

// writeStreamedDoc가 만든 트랜잭션 spec을 가로채서(실제 적용도 함) 의도를 검증한다.
function captureSpecs(view: EditorView): TransactionSpec[] {
  const specs: TransactionSpec[] = [];
  const original = view.dispatch.bind(view);
  view.dispatch = ((spec: TransactionSpec) => {
    specs.push(spec);
    return original(spec);
  }) as EditorView["dispatch"];
  return specs;
}

let view: EditorView;

beforeEach(() => {
  view = new EditorView({ state: EditorState.create({ doc: "abc" }), parent: document.body });
});

afterEach(() => {
  view.destroy();
});

describe("writeStreamedDoc", () => {
  it("누적 텍스트가 기존을 확장하면 끝에만 append 한다", () => {
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(view.state.doc.toString()).toBe("abcDEF");
    expect(specs[0].changes).toEqual({ from: 3, insert: "DEF" });
  });

  it("기존 문서를 확장하지 않으면(분기) 전체를 교체한다", () => {
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "XYZ");
    expect(view.state.doc.toString()).toBe("XYZ");
    expect(specs[0].changes).toEqual({ from: 0, to: 3, insert: "XYZ" });
  });

  it("바닥에 있으면 커서를 끝으로 옮기고 끝을 스크롤해 보인다", () => {
    setScrollMetrics(view, { scrollHeight: 100, clientHeight: 50, scrollTop: 50 }); // 100-50-50=0 ≤ 32 → 바닥
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(specs[0].selection).toEqual({ anchor: 6 });
    expect(specs[0].effects).toBeDefined();
  });

  it("중간을 읽고 있으면 선택/스크롤을 건드리지 않는다", () => {
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 0 }); // 1000-0-50=950 > 32 → 바닥 아님
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(specs[0].selection).toBeUndefined();
    expect(specs[0].effects).toBeUndefined();
  });

  it("변화가 없으면 디스패치하지 않는다", () => {
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abc");
    expect(specs).toHaveLength(0);
  });
});
