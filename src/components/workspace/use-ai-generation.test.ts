import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiGeneration } from "./use-ai-generation";

function setup(initial: string) {
  let content = initial;
  const setContent = vi.fn((c: string) => {
    content = c;
  });
  const hook = renderHook(() => useAiGeneration(() => content, setContent));
  return { hook, setContent, getContent: () => content };
}

describe("useAiGeneration", () => {
  it("onStart는 generating을 true로 만든다", () => {
    const { hook } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    expect(hook.result.current.generating).toBe(true);
  });

  it("onChunk는 누적 문자열로 setContent를 호출한다", () => {
    const { hook, setContent } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onChunk("부분 텍스트"));
    expect(setContent).toHaveBeenLastCalledWith("부분 텍스트");
  });

  it("onError는 스냅샷으로 복원하고 generating을 끈다", () => {
    const { hook, setContent } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onChunk("중간"));
    act(() => hook.result.current.handlers.onError());
    expect(setContent).toHaveBeenLastCalledWith("원본");
    expect(hook.result.current.generating).toBe(false);
  });

  it("onRevert는 스냅샷으로 복원한다", () => {
    const { hook, setContent } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onChunk("새 내용"));
    act(() => hook.result.current.handlers.onFinish());
    act(() => hook.result.current.handlers.onRevert());
    expect(setContent).toHaveBeenLastCalledWith("원본");
  });
});

describe("useAiGeneration pendingRevert / resetGeneration", () => {
  it("초기엔 pendingRevert가 false다", () => {
    const { hook } = setup("원본");
    expect(hook.result.current.pendingRevert).toBe(false);
  });

  it("생성(onStart→onFinish)이 끝나면 pendingRevert가 true가 된다", () => {
    const { hook } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    expect(hook.result.current.pendingRevert).toBe(false);
    act(() => hook.result.current.handlers.onFinish());
    expect(hook.result.current.pendingRevert).toBe(true);
  });

  it("onRevert는 pendingRevert를 false로 되돌린다", () => {
    const { hook } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onFinish());
    act(() => hook.result.current.handlers.onRevert());
    expect(hook.result.current.pendingRevert).toBe(false);
  });

  it("resetGeneration은 미확정 작성분 상태를 초기화한다", () => {
    const { hook } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onFinish());
    expect(hook.result.current.pendingRevert).toBe(true);
    act(() => hook.result.current.resetGeneration());
    expect(hook.result.current.pendingRevert).toBe(false);
  });

  it("세션 무효화(resetGeneration) 후 중단된 생성의 늦은 onFinish는 pendingRevert를 켜지 않는다", () => {
    const { hook } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.resetGeneration()); // 문서 전환으로 세션 무효화
    act(() => hook.result.current.handlers.onFinish()); // 중단된 생성의 늦은 완료
    expect(hook.result.current.pendingRevert).toBe(false);
  });
});
