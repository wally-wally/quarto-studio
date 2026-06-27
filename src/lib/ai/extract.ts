import * as XLSX from "xlsx";
import { parseOffice } from "officeparser";
import { getExtension } from "./validation";
import type { AiProvider } from "./settings";

export type InputFile = { name: string; bytes: Uint8Array };

export type PreparedPart =
  | { kind: "text"; name: string; text: string }
  | { kind: "image"; name: string; mediaType: string; bytes: Uint8Array }
  | { kind: "pdf"; name: string; bytes: Uint8Array };

export const MAX_EXTRACTED_CHARS = 100_000;

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
};

const INLINE_TEXT_EXTS = new Set(["md", "txt", "html", "json", "csv"]);

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return text.slice(0, MAX_EXTRACTED_CHARS) + "\n…(이하 생략)";
}

// officeparser는 Buffer/Uint8Array를 받는다. Uint8Array view를 정확한 Buffer로 변환.
function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function xlsxToText(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((name) => `# 시트: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join("\n\n");
}

export async function prepareAttachments(files: InputFile[], provider: AiProvider): Promise<PreparedPart[]> {
  const parts: PreparedPart[] = [];
  for (const file of files) {
    const ext = getExtension(file.name);

    if (ext in IMAGE_MEDIA_TYPES) {
      parts.push({ kind: "image", name: file.name, mediaType: IMAGE_MEDIA_TYPES[ext], bytes: file.bytes });
    } else if (INLINE_TEXT_EXTS.has(ext)) {
      parts.push({ kind: "text", name: file.name, text: truncate(new TextDecoder().decode(file.bytes)) });
    } else if (ext === "xlsx") {
      parts.push({ kind: "text", name: file.name, text: truncate(xlsxToText(file.bytes)) });
    } else if (ext === "pdf") {
      if (provider === "anthropic") {
        parts.push({ kind: "pdf", name: file.name, bytes: file.bytes });
      } else {
        const text = (await parseOffice(toBuffer(file.bytes), { fileType: "pdf" })).toText();
        parts.push({ kind: "text", name: file.name, text: truncate(text) });
      }
    } else if (ext === "docx" || ext === "pptx") {
      const text = (await parseOffice(toBuffer(file.bytes), { fileType: ext })).toText();
      parts.push({ kind: "text", name: file.name, text: truncate(text) });
    }
    // 그 외 확장자는 검증 단계(validation)에서 이미 차단됨.
  }
  return parts;
}
