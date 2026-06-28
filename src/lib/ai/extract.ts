import * as XLSX from "xlsx";
import { extractTextViaService } from "./convert-client";
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
      // SheetJS는 순수 JS·경량이라 인프로세스로 유지(서비스 장애와 무관, 네트워크 왕복 없음).
      parts.push({ kind: "text", name: file.name, text: truncate(xlsxToText(file.bytes)) });
    } else if (ext === "pdf") {
      if (provider === "anthropic") {
        parts.push({ kind: "pdf", name: file.name, bytes: file.bytes });
      } else {
        const text = await extractTextViaService(file.bytes, file.name);
        parts.push({ kind: "text", name: file.name, text: truncate(text) });
      }
    } else if (ext === "docx" || ext === "pptx") {
      const text = await extractTextViaService(file.bytes, file.name);
      parts.push({ kind: "text", name: file.name, text: truncate(text) });
    }
    // 그 외 확장자는 검증 단계(validation)에서 이미 차단됨.
  }
  return parts;
}
