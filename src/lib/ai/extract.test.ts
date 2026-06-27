import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

// officeparser(docx/pptx/pdf 텍스트 추출)는 바이너리 픽스처 없이 모킹한다.
// officeparser@7.2.2은 parseOfficeAsync 대신 parseOffice (async)를 named export 한다.
// parseOffice는 AST 객체를 반환하며, .toText()로 문자열을 추출한다.
vi.mock("officeparser", () => ({
  parseOffice: vi.fn().mockResolvedValue({ toText: () => "문서에서 추출된 텍스트" }),
}));

import { parseOffice } from "officeparser";
import { prepareAttachments, MAX_EXTRACTED_CHARS } from "./extract";

const enc = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prepareAttachments", () => {
  it("텍스트 파일은 인라인 text 파트가 된다", async () => {
    const parts = await prepareAttachments([{ name: "note.md", bytes: enc("# 제목") }], "anthropic");
    expect(parts).toEqual([{ kind: "text", name: "note.md", text: "# 제목" }]);
  });

  it("이미지 파일은 image 파트(mediaType 포함)가 된다", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const parts = await prepareAttachments([{ name: "a.png", bytes }], "anthropic");
    expect(parts[0]).toMatchObject({ kind: "image", name: "a.png", mediaType: "image/png" });
  });

  it("xlsx는 시트를 CSV 텍스트로 추출한다", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["이름", "값"], ["가", 1]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parts = await prepareAttachments([{ name: "d.xlsx", bytes: new Uint8Array(out) }], "anthropic");
    expect(parts[0].kind).toBe("text");
    expect((parts[0] as { text: string }).text).toContain("이름");
  });

  it("PDF는 anthropic이면 네이티브 pdf 파트가 된다", async () => {
    const parts = await prepareAttachments([{ name: "r.pdf", bytes: new Uint8Array([1]) }], "anthropic");
    expect(parts[0].kind).toBe("pdf");
    expect(parseOffice).not.toHaveBeenCalled();
  });

  it("PDF는 openai이면 텍스트 추출 파트가 된다", async () => {
    const parts = await prepareAttachments([{ name: "r.pdf", bytes: new Uint8Array([1]) }], "openai");
    expect(parts[0]).toMatchObject({ kind: "text", name: "r.pdf" });
    expect((parts[0] as { text: string }).text).toBe("문서에서 추출된 텍스트");
    expect(parseOffice).toHaveBeenCalledOnce();
  });

  it("docx/pptx는 officeparser로 추출한다", async () => {
    const parts = await prepareAttachments(
      [{ name: "a.docx", bytes: new Uint8Array([1]) }, { name: "b.pptx", bytes: new Uint8Array([2]) }],
      "anthropic",
    );
    expect(parts.every((p) => p.kind === "text")).toBe(true);
    expect(parseOffice).toHaveBeenCalledTimes(2);
    expect((parts[0] as { text: string }).text).toBe("문서에서 추출된 텍스트");
  });

  it("추출 텍스트가 상한을 넘으면 잘라낸다", async () => {
    (parseOffice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ toText: () => "x".repeat(MAX_EXTRACTED_CHARS + 100) });
    const parts = await prepareAttachments([{ name: "big.docx", bytes: new Uint8Array([1]) }], "anthropic");
    const text = (parts[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS + 20);
    expect(text).toContain("이하 생략");
  });
});
