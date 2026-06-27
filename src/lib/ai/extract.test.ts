import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

// 문서 추출은 convert 사이드카 호출(convert-client)로 위임된다 — 바이너리 픽스처 없이 모킹.
vi.mock("./convert-client", () => ({
  extractTextViaService: vi.fn().mockResolvedValue("문서에서 추출된 텍스트"),
}));

import { extractTextViaService } from "./convert-client";
import { prepareAttachments, MAX_EXTRACTED_CHARS } from "./extract";

const enc = (s: string) => new TextEncoder().encode(s);
const mockExtract = extractTextViaService as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockExtract.mockResolvedValue("문서에서 추출된 텍스트");
});

describe("prepareAttachments", () => {
  it("텍스트 파일은 인라인 text 파트가 된다", async () => {
    const parts = await prepareAttachments([{ name: "note.md", bytes: enc("# 제목") }], "anthropic");
    expect(parts).toEqual([{ kind: "text", name: "note.md", text: "# 제목" }]);
  });

  it("이미지 파일은 image 파트(mediaType 포함)가 된다", async () => {
    const parts = await prepareAttachments([{ name: "a.png", bytes: new Uint8Array([1, 2, 3]) }], "anthropic");
    expect(parts[0]).toMatchObject({ kind: "image", name: "a.png", mediaType: "image/png" });
  });

  it("xlsx는 시트를 CSV 텍스트로 추출한다(인프로세스)", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["이름", "값"], ["가", 1]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parts = await prepareAttachments([{ name: "d.xlsx", bytes: new Uint8Array(out) }], "anthropic");
    expect(parts[0].kind).toBe("text");
    expect((parts[0] as { text: string }).text).toContain("이름");
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("PDF는 anthropic이면 네이티브 pdf 파트(서비스 미호출)", async () => {
    const parts = await prepareAttachments([{ name: "r.pdf", bytes: new Uint8Array([1]) }], "anthropic");
    expect(parts[0].kind).toBe("pdf");
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("PDF는 openai이면 서비스로 텍스트 추출", async () => {
    const parts = await prepareAttachments([{ name: "r.pdf", bytes: new Uint8Array([1]) }], "openai");
    expect(parts[0]).toMatchObject({ kind: "text", name: "r.pdf" });
    expect((parts[0] as { text: string }).text).toBe("문서에서 추출된 텍스트");
    expect(mockExtract).toHaveBeenCalledOnce();
  });

  it("docx/pptx는 서비스로 추출한다", async () => {
    const parts = await prepareAttachments(
      [{ name: "a.docx", bytes: new Uint8Array([1]) }, { name: "b.pptx", bytes: new Uint8Array([2]) }],
      "anthropic",
    );
    expect(parts.every((p) => p.kind === "text")).toBe(true);
    expect(mockExtract).toHaveBeenCalledTimes(2);
    expect((parts[0] as { text: string }).text).toBe("문서에서 추출된 텍스트");
  });

  it("추출 텍스트가 상한을 넘으면 잘라낸다", async () => {
    mockExtract.mockResolvedValueOnce("x".repeat(MAX_EXTRACTED_CHARS + 100));
    const parts = await prepareAttachments([{ name: "big.docx", bytes: new Uint8Array([1]) }], "anthropic");
    const text = (parts[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS + 20);
    expect(text).toContain("이하 생략");
  });
});
