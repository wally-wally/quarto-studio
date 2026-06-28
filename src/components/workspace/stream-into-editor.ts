import { EditorView } from "@codemirror/view";

// 바닥에서 이 픽셀 이내면 "바닥에 있다"고 본다(줄 높이 약간의 여유).
const BOTTOM_THRESHOLD_PX = 32;

const states = new WeakMap<EditorView, { stuck: boolean }>();

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

// 뷰별 stuck 상태를 보장하고, 최초 1회 스크롤 리스너를 붙인다.
//
// 핵심: stuck은 오직 '스크롤 이벤트'로만 토글한다. 문서가 자라는 것은 scrollTop을
// 바꾸지 않아 스크롤 이벤트가 발생하지 않으므로, 빠른 스트리밍에서 높이 측정이
// 잠깐 뒤처져도 추적이 끊기지 않는다. (매 청크마다 atBottom을 재측정하면 이 측정
// 지연 때문에 바닥에 있어도 false가 나와 추적이 간헐적으로 멈추는 버그가 있었다.)
function ensure(view: EditorView): { stuck: boolean } {
  const existing = states.get(view);
  if (existing) return existing;

  const s = { stuck: true };
  states.set(view, s);

  let lastTop = view.scrollDOM.scrollTop;
  view.scrollDOM.addEventListener(
    "scroll",
    () => {
      const el = view.scrollDOM;
      const top = el.scrollTop;
      if (distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX) {
        s.stuck = true; // 바닥에 도달/유지 → 추적
      } else if (top < lastTop - 1) {
        // 사용자가 위로 스크롤 → 추적 해제. 우리의 프로그램 스크롤은 top을 줄이지
        // 않으므로(끝으로 내려감) 오탐하지 않는다. 짧게 착지해도 top이 줄지 않으면 유지.
        s.stuck = false;
      }
      lastTop = top;
    },
    { passive: true },
  );
  return s;
}

// 생성 시작 시 호출: 바닥 추적을 재개한다.
export function resetStickyStream(view: EditorView): void {
  ensure(view).stuck = true;
}

/**
 * 스트리밍 누적 텍스트(full)를 에디터 뷰에 직접 반영한다.
 *
 * - 늘어난 부분만 append 해서 위쪽 내용·스크롤 위치를 흔들지 않는다.
 * - 추적 중(stuck)이면 새 줄을 따라 바닥으로 스크롤(채팅 스트리밍처럼),
 *   사용자가 위로 스크롤해 추적을 끈 상태면 위치를 그대로 둔다.
 */
export function writeStreamedDoc(view: EditorView, full: string): void {
  const current = view.state.doc.toString();
  if (full === current) return;

  const s = ensure(view);
  const isAppend = full.startsWith(current);

  view.dispatch({
    changes: isAppend
      ? { from: current.length, insert: full.slice(current.length) }
      : { from: 0, to: current.length, insert: full },
    selection: s.stuck ? { anchor: full.length } : undefined,
    effects: s.stuck ? EditorView.scrollIntoView(full.length, { y: "end" }) : undefined,
    scrollIntoView: false,
  });
}
