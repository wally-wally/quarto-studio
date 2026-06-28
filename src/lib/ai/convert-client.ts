// 첨부 문서(docx/pptx/pdf) 텍스트 추출을 전담 사이드카 서비스에 위임한다.
// 웹 이미지에 무거운 파서(OCR/canvas/WASM)를 번들하지 않기 위한 분리다.
const DEFAULT_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 30_000;

export async function extractTextViaService(bytes: Uint8Array, filename: string): Promise<string> {
  const baseUrl = process.env.CONVERT_SERVICE_URL ?? DEFAULT_URL;
  const timeoutMs = Number(process.env.CONVERT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  // 일반 ArrayBuffer로 복사한다: Uint8Array<ArrayBufferLike>는 BlobPart로 바로 받지 못한다
  // (SharedArrayBuffer 모호성). 첨부 상한이 작아(총합 10MB) 복사 비용은 무시할 만하다.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);

  let res: Response;
  try {
    // 연결만 되고 멈추는 경우(병리적 문서 등)까지 막기 위해 타임아웃을 둔다(maxDuration 하위).
    res = await fetch(`${baseUrl}/convert`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // 연결 거부·타임아웃(AbortError) 모두 동일한 사용자 메시지로 처리.
    throw new Error("문서 변환 서비스에 연결할 수 없습니다.");
  }
  if (!res.ok) {
    throw new Error(`문서 변환에 실패했습니다 (${res.status}).`);
  }
  let data: { text?: string };
  try {
    data = (await res.json()) as { text?: string };
  } catch {
    throw new Error("문서 변환 서비스의 응답을 해석할 수 없습니다.");
  }
  return data.text ?? "";
}
