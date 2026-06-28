import { describe, it, expect } from "vitest";
import { applyEdits } from "./apply-edits";

describe("applyEdits", () => {
  it("단일 치환: 첫 일치를 replace로 바꾼다", () => {
    const r = applyEdits("제목: 옛날\n본문", [{ find: "옛날", replace: "새날" }]);
    expect(r.content).toBe("제목: 새날\n본문");
    expect(r.results).toEqual([{ find: "옛날", ok: true }]);
  });

  it("다중 편집: 순차로 적용되며 앞 치환이 뒤 편집에 반영된다", () => {
    const r = applyEdits("A B C", [
      { find: "A", replace: "X" },
      { find: "X B", replace: "Y" },
    ]);
    expect(r.content).toBe("Y C");
    expect(r.results.every((x) => x.ok)).toBe(true);
  });

  it("첫 일치만 치환한다(이후 동일 문자열은 유지)", () => {
    const r = applyEdits("foo foo", [{ find: "foo", replace: "bar" }]);
    expect(r.content).toBe("bar foo");
  });

  it("일치가 없으면 스킵하고 ok:false로 기록한다", () => {
    const r = applyEdits("hello", [{ find: "없는문자열", replace: "x" }]);
    expect(r.content).toBe("hello");
    expect(r.results).toEqual([{ find: "없는문자열", ok: false }]);
  });

  it("빈 find는 스킵한다(전체 머리에 삽입되는 사고 방지)", () => {
    const r = applyEdits("hello", [{ find: "", replace: "x" }]);
    expect(r.content).toBe("hello");
    expect(r.results).toEqual([{ find: "", ok: false }]);
  });

  it("성공/실패가 섞이면 성공분만 반영한다", () => {
    const r = applyEdits("a b", [
      { find: "a", replace: "A" },
      { find: "zzz", replace: "Z" },
      { find: "b", replace: "B" },
    ]);
    expect(r.content).toBe("A B");
    expect(r.results.map((x) => x.ok)).toEqual([true, false, true]);
  });
});
