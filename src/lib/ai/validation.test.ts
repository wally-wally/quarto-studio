import { describe, it, expect } from "vitest";
import {
  getExtension,
  isAllowedExtension,
  validatePrompt,
  validateAttachments,
  MAX_PROMPT_LENGTH,
  MAX_ATTACHMENTS,
  MAX_TOTAL_BYTES,
} from "./validation";

describe("getExtension / isAllowedExtension", () => {
  it("확장자를 소문자로 뽑는다", () => {
    expect(getExtension("Report.PDF")).toBe("pdf");
    expect(getExtension("noext")).toBe("");
  });
  it("허용 목록을 판별한다", () => {
    expect(isAllowedExtension("a.png")).toBe(true);
    expect(isAllowedExtension("a.exe")).toBe(false);
  });
});

describe("validatePrompt", () => {
  it("빈 프롬프트를 거부한다", () => {
    expect(validatePrompt("   ").ok).toBe(false);
  });
  it("최대 길이를 초과하면 거부한다", () => {
    expect(validatePrompt("a".repeat(MAX_PROMPT_LENGTH + 1)).ok).toBe(false);
    expect(validatePrompt("a".repeat(MAX_PROMPT_LENGTH)).ok).toBe(true);
  });
});

describe("validateAttachments", () => {
  it("개수 초과를 거부한다", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({ name: `f${i}.txt`, size: 1 }));
    expect(validateAttachments(files).ok).toBe(false);
  });
  it("정확히 10개는 통과한다", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({ name: `f${i}.txt`, size: 1 }));
    expect(validateAttachments(files).ok).toBe(true);
  });
  it("허용 외 확장자를 거부한다", () => {
    expect(validateAttachments([{ name: "a.exe", size: 1 }]).ok).toBe(false);
  });
  it("총합 상한(MAX_TOTAL_BYTES) 초과를 거부한다", () => {
    expect(validateAttachments([{ name: "a.csv", size: MAX_TOTAL_BYTES + 1 }]).ok).toBe(false);
  });
  it("정상 입력을 통과시킨다", () => {
    expect(validateAttachments([{ name: "a.csv", size: 10 }, { name: "b.png", size: 20 }]).ok).toBe(true);
  });
});
