import { EditorView } from "@codemirror/view";

// 바닥에서 이 픽셀 이내면 "바닥에 있다"고 본다(줄 높이 약간의 여유).
const BOTTOM_THRESHOLD_PX = 32;

function isScrolledToBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
}

/**
 * 스트리밍으로 들어오는 누적 텍스트(full)를 에디터 뷰에 직접 반영한다.
 *
 * - 제어형 value 교체(문서 전체 교체)는 매 청크마다 스크롤을 위/아래로 튕기게 한다.
 *   대신 '늘어난 부분만' append 해서 위쪽 내용과 스크롤 위치를 흔들지 않는다.
 * - 사용자가 바닥에 머물러 있었으면 새 줄을 따라 계속 바닥으로 스크롤(채팅 스트리밍처럼).
 *   중간을 읽고 있었으면 현재 스크롤/선택을 그대로 둔다(강제 이동 없음).
 */
export function writeStreamedDoc(view: EditorView, full: string): void {
  const current = view.state.doc.toString();
  if (full === current) return;

  const atBottom = isScrolledToBottom(view.scrollDOM);
  // 누적 텍스트는 append-only로 자라므로, 가능한 한 뒤에만 덧붙인다.
  const isAppend = full.startsWith(current);

  view.dispatch({
    changes: isAppend
      ? { from: current.length, insert: full.slice(current.length) }
      : { from: 0, to: current.length, insert: full },
    // 바닥을 따라갈 때만 커서를 끝으로 옮기고 끝을 화면에 보이게 한다.
    // 중간을 읽고 있을 땐 선택/스크롤을 건드리지 않는다.
    selection: atBottom ? { anchor: full.length } : undefined,
    effects: atBottom ? EditorView.scrollIntoView(full.length, { y: "end" }) : undefined,
    scrollIntoView: false,
  });
}
