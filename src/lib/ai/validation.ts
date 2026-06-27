export const MAX_PROMPT_LENGTH = 20_000;
export const MAX_ATTACHMENTS = 10;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "bmp",
  "md", "txt", "html", "json", "csv",
  "xlsx", "docx", "pdf", "pptx",
] as const;

export type AttachmentMeta = { name: string; size: number };
export type ValidationResult = { ok: true } | { ok: false; error: string };

export function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isAllowedExtension(name: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(getExtension(name));
}

export function validatePrompt(prompt: string): ValidationResult {
  // 빈 입력은 trim 후 판별(공백만 거부), 최대 길이는 raw length로 제한
  // (페이로드 크기 상한 목적 + 드로어 textarea maxLength와 일치)
  if (prompt.trim().length === 0) {
    return { ok: false, error: "프롬프트를 입력해주세요." };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, error: `프롬프트는 최대 ${MAX_PROMPT_LENGTH.toLocaleString()}자까지 입력할 수 있습니다.` };
  }
  return { ok: true };
}

export function validateAttachments(files: AttachmentMeta[]): ValidationResult {
  if (files.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.` };
  }
  for (const file of files) {
    if (!isAllowedExtension(file.name)) {
      return { ok: false, error: `지원하지 않는 파일 형식입니다: ${file.name}` };
    }
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return { ok: false, error: "첨부파일 총합은 최대 5MB까지 가능합니다." };
  }
  return { ok: true };
}
