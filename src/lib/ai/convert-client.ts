// 첨부 문서(docx/pptx/pdf) 텍스트 추출을 전담 사이드카 서비스에 위임한다.
// 웹 이미지에 무거운 파서(OCR/canvas/WASM)를 번들하지 않기 위한 분리다.
const DEFAULT_URL = "http://localhost:8000";

export async function extractTextViaService(bytes: Uint8Array, filename: string): Promise<string> {
  const baseUrl = process.env.CONVERT_SERVICE_URL ?? DEFAULT_URL;
  // 일반 ArrayBuffer로 복사한다: Uint8Array<ArrayBufferLike>는 BlobPart로 바로 받지 못한다
  // (SharedArrayBuffer 모호성). 첨부 상한이 5MB라 복사 비용은 무시할 만하다.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/convert`, { method: "POST", body: form });
  } catch {
    throw new Error("문서 변환 서비스에 연결할 수 없습니다.");
  }
  if (!res.ok) {
    throw new Error(`문서 변환에 실패했습니다 (${res.status}).`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}
