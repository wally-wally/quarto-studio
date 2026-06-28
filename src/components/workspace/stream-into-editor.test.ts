import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { writeStreamedDoc, resetStickyStream } from "./stream-into-editor";

// jsdom에는 레이아웃이 없어 scroll* 값이 0이다 → 명시적으로 주입해 바닥 여부를 제어한다.
function setScrollMetrics(view: EditorView, m: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  for (const [k, value] of Object.entries(m)) {
    Object.defineProperty(view.scrollDOM, k, { value, configurable: true });
  }
}

function fireScroll(view: EditorView) {
  view.scrollDOM.dispatchEvent(new Event("scroll"));
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

describe("writeStreamedDoc — 문서 변경", () => {
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

  it("변화가 없으면 디스패치하지 않는다", () => {
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abc");
    expect(specs).toHaveLength(0);
  });
});

describe("writeStreamedDoc — 바닥 추적(stick-to-bottom)", () => {
  it("기본은 바닥을 추적한다(커서 끝 + 끝으로 스크롤)", () => {
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(specs[0].selection).toEqual({ anchor: 6 });
    expect(specs[0].effects).toBeDefined();
  });

  it("문서가 자라 바닥에서 멀어져도(스크롤 이벤트 없음) 추적을 유지한다", () => {
    // 회귀 테스트: 빠른 스트리밍에서 높이 측정이 뒤처져 metrics상 '바닥 아님'이어도,
    // 스크롤 이벤트가 없으면 추적이 풀리지 않아야 한다.
    writeStreamedDoc(view, "abcDEF");
    setScrollMetrics(view, { scrollHeight: 5000, clientHeight: 50, scrollTop: 100 }); // 바닥에서 멂, 그러나 이벤트 없음
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEFghi");
    expect(specs[0].selection).toEqual({ anchor: 9 });
    expect(specs[0].effects).toBeDefined();
  });

  it("사용자가 위로 스크롤하면 추적을 멈춘다", () => {
    resetStickyStream(view); // 리스너 부착, stuck=true, lastTop=0
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 300 });
    fireScroll(view); // lastTop=300 (바닥 아님, top 감소 아님 → 유지)
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 100 });
    fireScroll(view); // top(100) < 300-1 → 위로 스크롤 → stuck=false

    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(specs[0].selection).toBeUndefined();
    expect(specs[0].effects).toBeUndefined();
  });

  it("위로 스크롤로 멈춘 뒤 다시 바닥으로 오면 추적을 재개한다", () => {
    resetStickyStream(view);
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 300 });
    fireScroll(view);
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 100 });
    fireScroll(view); // stuck=false
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 950 });
    fireScroll(view); // 1000-950-50=0 ≤ 32 → stuck=true

    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(specs[0].selection).toEqual({ anchor: 6 });
    expect(specs[0].effects).toBeDefined();
  });

  it("resetStickyStream은 추적을 다시 켠다", () => {
    // 먼저 위로 스크롤해 끈다
    resetStickyStream(view);
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 300 });
    fireScroll(view);
    setScrollMetrics(view, { scrollHeight: 1000, clientHeight: 50, scrollTop: 100 });
    fireScroll(view); // stuck=false
    // 새 생성 시작처럼 리셋
    resetStickyStream(view);
    const specs = captureSpecs(view);
    writeStreamedDoc(view, "abcDEF");
    expect(specs[0].effects).toBeDefined();
  });
});
