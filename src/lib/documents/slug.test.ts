import { describe, expect, it } from "vitest";
import { normalizeSlug } from "./slug";

describe("normalizeSlug", () => {
  it("영문 제목을 preview route에 사용할 slug로 바꾼다", () => {
    expect(normalizeSlug("Getting Started With Quarto!")).toBe(
      "getting-started-with-quarto"
    );
  });

  it("한글처럼 slug 문자로 남기기 어려운 제목은 fallback을 사용한다", () => {
    expect(normalizeSlug("문서 제목", "document-1")).toBe("document-1");
  });

  it("fallback도 비어 있으면 untitled를 사용한다", () => {
    expect(normalizeSlug("!!!", "")).toBe("untitled");
  });
});
