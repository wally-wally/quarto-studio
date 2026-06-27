import { describe, it, expect, vi, afterEach } from "vitest";
import { extractTextViaService } from "./convert-client";

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
  vi.restoreAllMocks();
});

describe("extractTextViaService", () => {
  it("성공 시 서비스가 반환한 text를 돌려준다", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "추출됨" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    await expect(extractTextViaService(new Uint8Array([1]), "a.docx")).resolves.toBe("추출됨");
  });

  it("연결 실패 시 사용자 친화적 에러를 던진다", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    await expect(extractTextViaService(new Uint8Array([1]), "a.docx")).rejects.toThrow("연결할 수 없습니다");
  });

  it("비 2xx 응답이면 상태코드를 포함한 에러를 던진다", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(extractTextViaService(new Uint8Array([1]), "a.docx")).rejects.toThrow("500");
  });

  it("2xx지만 본문이 JSON이 아니면 사용자 친화적 에러를 던진다", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>not json</html>", { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(extractTextViaService(new Uint8Array([1]), "a.docx")).rejects.toThrow("해석할 수 없습니다");
  });

  it("업로드 multipart 본문에 원본 바이트·파일명을 담는다", async () => {
    let captured: FormData | null = null;
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      captured = init.body as FormData;
      return Promise.resolve(
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;

    await extractTextViaService(new Uint8Array([7, 8, 9]), "doc.docx");

    const file = captured!.get("file") as File;
    expect(file.name).toBe("doc.docx");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([7, 8, 9]);
  });
});
