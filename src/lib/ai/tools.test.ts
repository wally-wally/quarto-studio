import { describe, it, expect } from "vitest";
import { chatTools, EDIT_TOOL, WRITE_TOOL } from "./tools";

describe("chatTools", () => {
  it("도구 이름 상수가 정확하다", () => {
    expect(EDIT_TOOL).toBe("edit_document");
    expect(WRITE_TOOL).toBe("write_document");
  });

  it("두 도구를 정확한 키로 노출한다", () => {
    expect(Object.keys(chatTools).sort()).toEqual(["edit_document", "write_document"]);
  });

  it("도구는 execute가 없다(클라이언트 실행)", () => {
    expect((chatTools[EDIT_TOOL] as { execute?: unknown }).execute).toBeUndefined();
    expect((chatTools[WRITE_TOOL] as { execute?: unknown }).execute).toBeUndefined();
  });

  it("각 도구가 설명과 inputSchema를 가진다", () => {
    expect(chatTools[EDIT_TOOL].description).toBeTruthy();
    expect(chatTools[EDIT_TOOL].inputSchema).toBeDefined();
    expect(chatTools[WRITE_TOOL].description).toBeTruthy();
    expect(chatTools[WRITE_TOOL].inputSchema).toBeDefined();
  });
});
