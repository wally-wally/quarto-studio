# 첨부 문서 텍스트 추출 서비스 분리 — 구현 계획

> **For agentic workers:** 본 계획은 `feature/convert` 브랜치에서 task 단위로 실행한다. 각 task는 독립적으로 테스트 가능한 산출물로 끝난다.

**Goal:** 웹 앱에서 `officeparser`(tesseract/canvas/WASM)를 제거하고, 문서 텍스트 추출을 `markitdown` 기반 FastAPI 사이드카로 분리한다.

**Architecture:** `convert/` 에 FastAPI 서비스(`POST /convert`) 추가. 웹은 `extract.ts` → `convert-client.ts` 를 통해 HTTP로 호출. `docx/pptx/openai-pdf` 만 서비스로 보내고 나머지(이미지·인라인텍스트·xlsx·anthropic-pdf)는 인프로세스 유지.

**Tech Stack:** Python 3.13 · FastAPI · uvicorn · markitdown[docx,pptx,pdf] · Next.js 16(웹) · vitest.

## Global Constraints

- `prepareAttachments(files: InputFile[], provider: AiProvider): Promise<PreparedPart[]>` 의 시그니처/반환 타입은 불변. `route.ts` 는 추출 실패 처리(502) 외에는 무변경.
- 웹 의존성에서 `officeparser` 제거, `xlsx`(SheetJS) 유지.
- 서비스는 비루트 실행·외부 포트 미노출·`enable_plugins=False`.
- 사용자 노출 에러 메시지는 한국어.
- `CONVERT_SERVICE_URL` 미설정 시 기본 `http://localhost:8000`.

---

### Task 1: convert 사이드카 서비스 (FastAPI + markitdown)

**Files:**
- Create: `convert/app/__init__.py`
- Create: `convert/app/main.py`
- Create: `convert/requirements.txt`
- Create: `convert/Dockerfile`
- Create: `convert/.dockerignore`
- Create: `convert/README.md`

**Interfaces:**
- Produces: `POST /convert` (multipart field `file`) → `{ "text": string }`; `GET /health` → `{ "status": "ok" }`.

- [ ] **Step 1: `convert/requirements.txt`**

```
fastapi==0.116.1
uvicorn[standard]==0.34.0
python-multipart==0.0.20
markitdown[docx,pptx,pdf]==0.1.6
```

- [ ] **Step 2: `convert/app/__init__.py`** (빈 파일)

- [ ] **Step 3: `convert/app/main.py`**

```python
import os
import tempfile
from contextlib import suppress

from fastapi import FastAPI, File, HTTPException, UploadFile
from markitdown import MarkItDown

# 웹이 첨부 총합 5MB를 강제하지만 서비스도 자체 방어선을 둔다.
MAX_BYTES = int(os.environ.get("CONVERT_MAX_BYTES", str(12 * 1024 * 1024)))

app = FastAPI(title="quarto-studio convert", version="1.0.0")
_md = MarkItDown(enable_plugins=False)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/convert")
def convert(file: UploadFile = File(...)) -> dict:
    # 동기 def → FastAPI가 스레드풀에서 실행(블로킹 변환이 이벤트 루프를 막지 않음).
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다.")

    suffix = os.path.splitext(file.filename or "")[1].lower()
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        result = _md.convert(tmp_path)
        text = (result.text_content or "").strip() if result else ""
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="문서 변환에 실패했습니다.") from exc
    finally:
        if tmp_path:
            with suppress(OSError):
                os.remove(tmp_path)

    return {"text": text}
```

- [ ] **Step 4: `convert/Dockerfile`**

```dockerfile
FROM python:3.13-slim AS base
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app

# 비루트 실행
RUN useradd --system --uid 1001 convert && chown -R convert /app
USER convert

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 5: `convert/.dockerignore`**

```
__pycache__/
*.pyc
.venv/
venv/
.pytest_cache/
```

- [ ] **Step 6: `convert/README.md`** — 목적/엔드포인트/로컬 기동(`uvicorn app.main:app --port 8000`) 요약.

- [ ] **Step 7: 서비스 스모크 (실제 변환)**

```bash
cd convert && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
# uvicorn 백그라운드 기동 후 실제 docx 변환으로 {"text": ...} 확인. 비어있지 않아야 PASS.
```
extras(`[docx,pptx,pdf]`) 설치가 실패하면 `markitdown[all]==0.1.6` 으로 폴백.

- [ ] **Step 8: Commit** `feat(convert): markitdown 기반 문서 텍스트 추출 사이드카 서비스`

---

### Task 2: 웹 추출 클라이언트 + extract.ts 리팩터 + officeparser 제거

**Files:**
- Create: `src/lib/ai/convert-client.ts`
- Create: `src/lib/ai/convert-client.test.ts`
- Modify: `src/lib/ai/extract.ts` (officeparser 제거)
- Modify: `src/lib/ai/extract.test.ts` (officeparser 모킹 → convert-client 모킹)
- Modify: `src/app/api/ai/generate/route.ts` (추출 실패 502)
- Modify: `package.json` (officeparser 제거), `pnpm-lock.yaml`

**Interfaces:**
- Produces: `extractTextViaService(bytes: Uint8Array, filename: string): Promise<string>`
- Consumes (Task 1): `POST {CONVERT_SERVICE_URL}/convert` → `{ text }`

- [ ] **Step 1: `convert-client.test.ts` (실패 테스트 먼저)**

```ts
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
});
```

- [ ] **Step 2: 테스트 실패 확인** `pnpm test -- convert-client` → FAIL(모듈 없음).

- [ ] **Step 3: `convert-client.ts`**

```ts
// 첨부 문서(docx/pptx/pdf) 텍스트 추출을 전담 사이드카 서비스에 위임한다.
// 웹 이미지에 무거운 파서(OCR/canvas/WASM)를 번들하지 않기 위한 분리다.
const DEFAULT_URL = "http://localhost:8000";

export async function extractTextViaService(bytes: Uint8Array, filename: string): Promise<string> {
  const baseUrl = process.env.CONVERT_SERVICE_URL ?? DEFAULT_URL;
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);

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
```

- [ ] **Step 4: 테스트 통과 확인** `pnpm test -- convert-client` → PASS.

- [ ] **Step 5: `extract.ts` 리팩터** — `officeparser`/`toBuffer` 제거, 서비스 호출로 교체.

```ts
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
```

- [ ] **Step 6: `extract.test.ts` 갱신** — officeparser 모킹을 convert-client 모킹으로 교체.

```ts
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
```

- [ ] **Step 7: `route.ts` 추출 실패 처리** — `const parts = await prepareAttachments(...)` 를 try/catch로 교체.

```ts
  let parts: Awaited<ReturnType<typeof prepareAttachments>>;
  try {
    parts = await prepareAttachments(files, provider);
  } catch (error) {
    console.error("[ai/generate] attachment extraction failed:", error);
    return Response.json(
      { error: "첨부파일 텍스트 추출에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }
```

- [ ] **Step 8: `package.json` 에서 `officeparser` 제거 후 lockfile 갱신** `pnpm install`.

- [ ] **Step 9: 전체 검증** `pnpm verify` (lint·typecheck·test·build) → PASS.

- [ ] **Step 10: Commit** `refactor(convert): 문서 추출을 사이드카로 위임 + officeparser 제거`

---

### Task 3: docker-compose / 환경설정 / 문서 배선

**Files:**
- Modify: `docker-compose.yml` (convert 서비스 + web 연결)
- Modify: `.dockerignore` (`convert/` 추가)
- Modify: `.env.example` (`CONVERT_SERVICE_URL`)

- [ ] **Step 1: `docker-compose.yml` 에 convert 서비스 추가**

```yaml
  # 첨부 문서(docx/pptx/pdf) → 텍스트 변환 사이드카. 내부 네트워크 전용.
  convert:
    build:
      context: ./convert
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped
```

- [ ] **Step 2: `web` 서비스에 환경변수/의존성 추가**

```yaml
    environment:
      DATABASE_URL: postgres://quarto:quarto@postgres:5432/quarto_studio
      ARTIFACT_DIR: /artifacts
      CONVERT_SERVICE_URL: http://convert:8000
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      convert:
        condition: service_healthy
```

- [ ] **Step 3: `.dockerignore` 에 `convert/` 추가** (web/worker 빌드 컨텍스트에서 제외)

- [ ] **Step 4: `.env.example` 에 추가**

```
# 첨부 문서(docx/pptx/pdf) 텍스트 추출 사이드카 URL (로컬 기본값)
CONVERT_SERVICE_URL=http://localhost:8000
```

- [ ] **Step 5: `docker compose config` 로 컴포즈 유효성 확인** (가능 시).

- [ ] **Step 6: Commit** `chore(convert): docker-compose·env·dockerignore 배선`

---

### Task 4: 최종 검증 + 브랜치 리뷰 + MR

- [ ] **Step 1: `pnpm verify` 재실행** → PASS.
- [ ] **Step 2: 계약 통합 점검** — 기동된 convert 서비스에 `extractTextViaService` 실제 호출(노드 일회성 스크립트)로 end-to-end 확인.
- [ ] **Step 3: 전체 브랜치 코드 리뷰 서브에이전트** 디스패치 → Critical/Important 수정.
- [ ] **Step 4: push + MR 작성/갱신** (`feature/convert` → `main`).
