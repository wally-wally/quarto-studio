# AI qmd 자동 작성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 프롬프트와 참고 파일을 주면 AI가 Quarto Studio 지원 범위 안에서 완전한 `.qmd` 문서를 작성하고, 그 결과를 스트리밍으로 CodeMirror 에디터에 라이브하게 써 내려간다.

**Architecture:** 설정 모달에서 입력한 API 키를 브라우저 `localStorage`에 저장(BYOK)한다. 에디터 하단 접이식 드로어가 프롬프트·첨부를 받아 `multipart/form-data`로 스트리밍 Route Handler(`/api/ai/generate`)에 보내고, 키는 `x-provider-key` 헤더로 전달한다. 라우트는 Vercel AI SDK v6로 사용자 키 기반 프로바이더를 요청마다 만들어 `streamText`로 평문 텍스트를 스트리밍하고, 드로어 클라이언트가 청크를 누적해 `draft.content`에 반영한다(현재 문서 교체 + 되돌리기).

**Tech Stack:** Next.js 16(App Router, Route Handler), React 19, Vercel AI SDK v6(`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`), SheetJS(`xlsx`), `officeparser`, CodeMirror 6, Vitest + Testing Library.

## Global Constraints

- 프롬프트 최대 길이: **20,000자**.
- 첨부 최대 개수: **10개**, 합계 최대 **5MB**(원본 바이트 기준).
- 허용 확장자: `png, jpg, jpeg, gif, bmp, md, txt, html, json, csv, xlsx, docx, pdf, pptx`.
- API 키는 **서버 DB에 저장 금지**. `localStorage`에만 저장하고 요청 시 `x-provider-key` 헤더로만 전달한다.
- 추론 effort는 **medium 고정**. 사용자 설정에 노출하지 않고 서버 `providerOptions`로 주입한다.
- PDF는 **프로바이더 조건부**: Anthropic이면 네이티브 `file`(application/pdf), OpenAI면 서버 텍스트 추출.
- 지원 언어/라이브러리: Python(numpy, pandas, matplotlib, altair, vega_datasets, plotly, seaborn, scikit-learn, scipy, statsmodels), R(knitr, rmarkdown, ggplot2, dplyr, tidyr, readr, showtext, sysfonts), Julia(Plots, DataFrames). 시스템 프롬프트로만 강제(소프트 제약).
- 테스트는 colocated `*.test.ts(x)`. 라우트/노드 테스트는 파일 최상단에 `// @vitest-environment node`. `@` 별칭 → `src`.
- 커밋 메시지는 `feat(ai-write): …`/`test(ai-write): …` 형식, 마지막 줄에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 트레일러를 붙인다.
- 각 태스크 끝에서 `pnpm exec vitest run <해당 테스트 파일>`이 통과해야 하고, 전체 마무리(Task 12)에서 `pnpm verify`(lint+typecheck+test+build)가 통과해야 한다.

---

### Task 1: 지원 라이브러리 단일 출처

**Files:**
- Create: `src/lib/ai/supported-libraries.ts`
- Test: `src/lib/ai/supported-libraries.test.ts`

**Interfaces:**
- Produces: `PYTHON_LIBRARIES`, `R_LIBRARIES`, `JULIA_LIBRARIES`(readonly string 배열), `formatSupportedLibraries(): string`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ai/supported-libraries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PYTHON_LIBRARIES,
  R_LIBRARIES,
  JULIA_LIBRARIES,
  formatSupportedLibraries,
} from "./supported-libraries";

describe("supported-libraries", () => {
  it("핵심 라이브러리를 포함한다", () => {
    expect(PYTHON_LIBRARIES).toContain("pandas");
    expect(PYTHON_LIBRARIES).toContain("matplotlib");
    expect(R_LIBRARIES).toContain("ggplot2");
    expect(JULIA_LIBRARIES).toContain("Plots");
  });

  it("formatSupportedLibraries는 세 언어 줄과 라이브러리 이름을 담는다", () => {
    const text = formatSupportedLibraries();
    expect(text).toContain("Python:");
    expect(text).toContain("R:");
    expect(text).toContain("Julia:");
    expect(text).toContain("numpy");
    expect(text).toContain("DataFrames");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/lib/ai/supported-libraries.test.ts`
Expected: FAIL — "Cannot find module './supported-libraries'".

- [ ] **Step 3: 구현 작성**

`src/lib/ai/supported-libraries.ts`:

```ts
// Quarto Studio 렌더 이미지가 제공하는 언어/라이브러리의 단일 출처.
// 출처: docker/render/requirements.in, install-r-packages.R, julia/Project.toml.
export const PYTHON_LIBRARIES = [
  "numpy",
  "pandas",
  "matplotlib",
  "altair",
  "vega_datasets",
  "plotly",
  "seaborn",
  "scikit-learn",
  "scipy",
  "statsmodels",
] as const;

export const R_LIBRARIES = [
  "knitr",
  "rmarkdown",
  "ggplot2",
  "dplyr",
  "tidyr",
  "readr",
  "showtext",
  "sysfonts",
] as const;

export const JULIA_LIBRARIES = ["Plots", "DataFrames"] as const;

export function formatSupportedLibraries(): string {
  return [
    `- Python: ${PYTHON_LIBRARIES.join(", ")}`,
    `- R: ${R_LIBRARIES.join(", ")}`,
    `- Julia: ${JULIA_LIBRARIES.join(", ")}`,
  ].join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/lib/ai/supported-libraries.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/supported-libraries.ts src/lib/ai/supported-libraries.test.ts
git commit -m "feat(ai-write): 지원 언어·라이브러리 단일 출처 추가"
```

---

### Task 2: 시스템 프롬프트(지원 범위 계약)

**Files:**
- Create: `src/lib/ai/system-prompt.ts`
- Test: `src/lib/ai/system-prompt.test.ts`

**Interfaces:**
- Consumes: `formatSupportedLibraries`(Task 1).
- Produces: `buildSystemPrompt(options?: { hasAttachments?: boolean }): string`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ai/system-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("핵심 계약을 포함한다", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("format: html");
    expect(prompt).toContain("```{python}");
    expect(prompt).toContain("#|");
    expect(prompt).toContain("numpy");
    expect(prompt).toContain("YAML");
  });

  it("hasAttachments면 첨부 지침을 덧붙인다", () => {
    expect(buildSystemPrompt({ hasAttachments: true })).toContain("첨부");
    expect(buildSystemPrompt({ hasAttachments: false })).not.toContain("첨부 자료");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/lib/ai/system-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 작성**

`src/lib/ai/system-prompt.ts`:

```ts
import { formatSupportedLibraries } from "./supported-libraries";

export function buildSystemPrompt(options: { hasAttachments?: boolean } = {}): string {
  const { hasAttachments = false } = options;
  const lines = [
    "당신은 Quarto Studio의 문서 작성 도우미입니다.",
    "사용자 요청에 따라 완전한 하나의 Quarto 문서(.qmd)를 작성합니다.",
    "",
    "## 출력 규칙",
    "- 출력은 오직 .qmd 문서 본문만 포함합니다. YAML 프런트매터(---)로 시작합니다.",
    "- 문서 전체를 코드펜스(```)로 감싸지 마세요. 설명·머리말·꼬리말을 덧붙이지 마세요.",
    "- 출력 결과가 그대로 에디터에 들어가 Quarto로 HTML 렌더링됩니다.",
    "",
    "## 대상 포맷",
    "- format: html (Quarto HTML 출력).",
    "",
    "## 지원 언어/라이브러리 (이 목록만 사용)",
    "- 언어: Python, R, Julia.",
    formatSupportedLibraries(),
    "- 위 목록에 없는 라이브러리나 언어는 사용하지 마세요.",
    "",
    "## 코드 청크 문법",
    "- 실행 청크는 ```{python}, ```{r}, ```{julia} 형식을 사용합니다.",
    '- 셀 옵션은 청크 첫 줄들에 "#| key: value" 형식으로 씁니다',
    '  (예: "#| echo: true", "#| label: fig-plot", "#| fig-cap: 설명").',
    "",
    "## 작성 지침",
    "- 프런트매터에 title을 포함하고, 필요하면 toc: true 등 html 옵션을 둡니다.",
    "- 마크다운 본문과 코드 청크를 적절히 섞어 읽기 좋은 문서를 만듭니다.",
  ];
  if (hasAttachments) {
    lines.push(
      "",
      "## 첨부 자료",
      "- 사용자가 제공한 첨부 자료(텍스트·표·이미지·문서)를 근거로 문서를 작성하세요.",
    );
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/lib/ai/system-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/system-prompt.test.ts
git commit -m "feat(ai-write): 지원 범위 계약 시스템 프롬프트 추가"
```

---

### Task 3: 입력 검증(프롬프트·첨부)

**Files:**
- Create: `src/lib/ai/validation.ts`
- Test: `src/lib/ai/validation.test.ts`

**Interfaces:**
- Produces: 상수 `MAX_PROMPT_LENGTH=20000`, `MAX_ATTACHMENTS=10`, `MAX_TOTAL_BYTES=5*1024*1024`, `ALLOWED_EXTENSIONS`; 타입 `AttachmentMeta={name:string;size:number}`, `ValidationResult={ok:true}|{ok:false;error:string}`; 함수 `getExtension(name):string`, `isAllowedExtension(name):boolean`, `validatePrompt(prompt):ValidationResult`, `validateAttachments(files:AttachmentMeta[]):ValidationResult`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ai/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getExtension,
  isAllowedExtension,
  validatePrompt,
  validateAttachments,
  MAX_PROMPT_LENGTH,
  MAX_ATTACHMENTS,
} from "./validation";

describe("getExtension / isAllowedExtension", () => {
  it("확장자를 소문자로 뽑는다", () => {
    expect(getExtension("Report.PDF")).toBe("pdf");
    expect(getExtension("noext")).toBe("");
  });
  it("허용 목록을 판별한다", () => {
    expect(isAllowedExtension("a.png")).toBe(true);
    expect(isAllowedExtension("a.exe")).toBe(false);
  });
});

describe("validatePrompt", () => {
  it("빈 프롬프트를 거부한다", () => {
    expect(validatePrompt("   ").ok).toBe(false);
  });
  it("최대 길이를 초과하면 거부한다", () => {
    expect(validatePrompt("a".repeat(MAX_PROMPT_LENGTH + 1)).ok).toBe(false);
    expect(validatePrompt("a".repeat(MAX_PROMPT_LENGTH)).ok).toBe(true);
  });
});

describe("validateAttachments", () => {
  it("개수 초과를 거부한다", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({ name: `f${i}.txt`, size: 1 }));
    expect(validateAttachments(files).ok).toBe(false);
  });
  it("허용 외 확장자를 거부한다", () => {
    expect(validateAttachments([{ name: "a.exe", size: 1 }]).ok).toBe(false);
  });
  it("총 5MB 초과를 거부한다", () => {
    expect(validateAttachments([{ name: "a.csv", size: 5 * 1024 * 1024 + 1 }]).ok).toBe(false);
  });
  it("정상 입력을 통과시킨다", () => {
    expect(validateAttachments([{ name: "a.csv", size: 10 }, { name: "b.png", size: 20 }]).ok).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/lib/ai/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 작성**

`src/lib/ai/validation.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/lib/ai/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/validation.ts src/lib/ai/validation.test.ts
git commit -m "feat(ai-write): 프롬프트·첨부 입력 검증 모듈 추가"
```

---

### Task 4: 설정(localStorage BYOK)

**Files:**
- Create: `src/lib/ai/settings.ts`
- Test: `src/lib/ai/settings.test.ts`

**Interfaces:**
- Produces: 타입 `AiProvider="anthropic"|"openai"`, `ProviderConfig={apiKey:string;model:string}`, `AiSettings={provider:AiProvider;anthropic:ProviderConfig;openai:ProviderConfig}`; 상수 `DEFAULT_SETTINGS`, `RECOMMENDED_MODELS`; 함수 `loadSettings():AiSettings`, `saveSettings(s):void`, `getActiveCredentials(s):ProviderConfig&{provider:AiProvider}`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ai/settings.test.ts` (jsdom 기본 환경 — localStorage 사용 가능):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, getActiveCredentials, DEFAULT_SETTINGS } from "./settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("settings", () => {
  it("저장값이 없으면 기본값을 반환한다", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("저장 후 로드하면 라운드트립된다", () => {
    const next = {
      ...DEFAULT_SETTINGS,
      provider: "openai" as const,
      openai: { apiKey: "sk-test", model: "gpt-5.2" },
    };
    saveSettings(next);
    expect(loadSettings()).toEqual(next);
  });

  it("getActiveCredentials는 활성 프로바이더 자격을 고른다", () => {
    const settings = {
      provider: "openai" as const,
      anthropic: { apiKey: "ant", model: "claude-sonnet-4-6" },
      openai: { apiKey: "oai", model: "gpt-5.2" },
    };
    expect(getActiveCredentials(settings)).toEqual({ provider: "openai", apiKey: "oai", model: "gpt-5.2" });
  });

  it("깨진 JSON이면 기본값으로 폴백한다", () => {
    window.localStorage.setItem("quarto-studio:ai-settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/lib/ai/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 작성**

`src/lib/ai/settings.ts`:

```ts
export type AiProvider = "anthropic" | "openai";
export type ProviderConfig = { apiKey: string; model: string };
export type AiSettings = {
  provider: AiProvider;
  anthropic: ProviderConfig;
  openai: ProviderConfig;
};

export const RECOMMENDED_MODELS: Record<AiProvider, { label: string; value: string }[]> = {
  anthropic: [
    { label: "Claude Sonnet 4.6 (균형, 추천)", value: "claude-sonnet-4-6" },
    { label: "Claude Opus 4.8 (고품질)", value: "claude-opus-4-8" },
    { label: "Claude Haiku 4.5 (빠름)", value: "claude-haiku-4-5" },
  ],
  openai: [
    { label: "GPT-5.2", value: "gpt-5.2" },
    { label: "GPT-5", value: "gpt-5" },
  ],
};

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "anthropic",
  anthropic: { apiKey: "", model: "claude-sonnet-4-6" },
  openai: { apiKey: "", model: "gpt-5.2" },
};

const STORAGE_KEY = "quarto-studio:ai-settings";

export function loadSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      provider: parsed.provider === "openai" ? "openai" : "anthropic",
      anthropic: { ...DEFAULT_SETTINGS.anthropic, ...parsed.anthropic },
      openai: { ...DEFAULT_SETTINGS.openai, ...parsed.openai },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AiSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getActiveCredentials(settings: AiSettings): ProviderConfig & { provider: AiProvider } {
  const config = settings.provider === "openai" ? settings.openai : settings.anthropic;
  return { provider: settings.provider, apiKey: config.apiKey, model: config.model };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/lib/ai/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/settings.ts src/lib/ai/settings.test.ts
git commit -m "feat(ai-write): BYOK 설정 localStorage 헬퍼 추가"
```

---

### Task 5: 첨부 준비/추출

**Files:**
- Create: `src/lib/ai/extract.ts`
- Test: `src/lib/ai/extract.test.ts`
- Modify: `package.json` (의존성 `xlsx`, `officeparser` 추가)

**Interfaces:**
- Consumes: `getExtension`(Task 3), `AiProvider`(Task 4).
- Produces: 타입 `InputFile={name:string;bytes:Uint8Array}`, `PreparedPart`(아래 union); 상수 `MAX_EXTRACTED_CHARS=100000`; 함수 `prepareAttachments(files:InputFile[], provider:AiProvider):Promise<PreparedPart[]>`.
  - `PreparedPart = {kind:"text";name:string;text:string} | {kind:"image";name:string;mediaType:string;bytes:Uint8Array} | {kind:"pdf";name:string;bytes:Uint8Array}`.

- [ ] **Step 1: 의존성 추가**

Run:
```bash
pnpm add xlsx officeparser
```
Expected: `package.json`에 `xlsx`, `officeparser`가 추가된다. (둘 다 순수 JS·인메모리 파싱이라 Next standalone에서 동작.)

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/ai/extract.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

// officeparser(docx/pptx/pdf 텍스트 추출)는 바이너리 픽스처 없이 모킹한다.
vi.mock("officeparser", () => ({
  parseOfficeAsync: vi.fn().mockResolvedValue("문서에서 추출된 텍스트"),
}));

import { parseOfficeAsync } from "officeparser";
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
    expect(parseOfficeAsync).not.toHaveBeenCalled();
  });

  it("PDF는 openai이면 텍스트 추출 파트가 된다", async () => {
    const parts = await prepareAttachments([{ name: "r.pdf", bytes: new Uint8Array([1]) }], "openai");
    expect(parts[0]).toMatchObject({ kind: "text", name: "r.pdf" });
    expect(parseOfficeAsync).toHaveBeenCalledOnce();
  });

  it("docx/pptx는 officeparser로 추출한다", async () => {
    const parts = await prepareAttachments(
      [{ name: "a.docx", bytes: new Uint8Array([1]) }, { name: "b.pptx", bytes: new Uint8Array([2]) }],
      "anthropic",
    );
    expect(parts.every((p) => p.kind === "text")).toBe(true);
    expect(parseOfficeAsync).toHaveBeenCalledTimes(2);
  });

  it("추출 텍스트가 상한을 넘으면 잘라낸다", async () => {
    (parseOfficeAsync as ReturnType<typeof vi.fn>).mockResolvedValueOnce("x".repeat(MAX_EXTRACTED_CHARS + 100));
    const parts = await prepareAttachments([{ name: "big.docx", bytes: new Uint8Array([1]) }], "anthropic");
    const text = (parts[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS + 20);
    expect(text).toContain("이하 생략");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec vitest run src/lib/ai/extract.test.ts`
Expected: FAIL — `./extract` 모듈 없음.

- [ ] **Step 4: 구현 작성**

`src/lib/ai/extract.ts`:

```ts
import * as XLSX from "xlsx";
import { parseOfficeAsync } from "officeparser";
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

// officeparser는 ArrayBuffer를 받는다. Uint8Array view를 정확한 ArrayBuffer로 변환.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);
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
        const text = await parseOfficeAsync(toArrayBuffer(file.bytes));
        parts.push({ kind: "text", name: file.name, text: truncate(text) });
      }
    } else if (ext === "docx" || ext === "pptx") {
      const text = await parseOfficeAsync(toArrayBuffer(file.bytes));
      parts.push({ kind: "text", name: file.name, text: truncate(text) });
    }
    // 그 외 확장자는 검증 단계(validation)에서 이미 차단됨.
  }
  return parts;
}
```

> 참고: `officeparser`의 export가 named가 아니라 default라면 `import officeParser from "officeparser"; const { parseOfficeAsync } = officeParser;`로 조정한다. 설치 후 `node -e "console.log(Object.keys(require('officeparser')))"`로 확인할 수 있다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec vitest run src/lib/ai/extract.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add package.json pnpm-lock.yaml src/lib/ai/extract.ts src/lib/ai/extract.test.ts
git commit -m "feat(ai-write): 첨부 준비/추출 모듈(xlsx·officeparser) 추가"
```

---

### Task 6: 프로바이더 모델/옵션

**Files:**
- Create: `src/lib/ai/provider.ts`
- Test: `src/lib/ai/provider.test.ts`
- Modify: `package.json` (의존성 `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` 추가)

**Interfaces:**
- Consumes: `AiProvider`(Task 4).
- Produces: `resolveModel(provider, apiKey, model): LanguageModel`, `buildProviderOptions(provider): Record<string, unknown>`, 상수 `ANTHROPIC_THINKING_BUDGET`.

- [ ] **Step 1: 의존성 추가 및 버전 확인**

Run:
```bash
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai
node -e "console.log('ai', require('ai/package.json').version)"
```
Expected: `ai`가 설치된다. **주의:** 출력된 `ai` major 버전을 확인한다.
- major 6 → 본 계획대로 `result.toTextStreamResponse()` 사용(Task 7).
- major 7+ → Task 7에서 `createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) })` 대안을 사용(해당 주석 참조).

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/ai/provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildProviderOptions, resolveModel } from "./provider";

describe("buildProviderOptions", () => {
  it("openai는 reasoningEffort medium", () => {
    expect(buildProviderOptions("openai")).toEqual({ openai: { reasoningEffort: "medium" } });
  });
  it("anthropic은 thinking 예산을 활성화한다", () => {
    const opts = buildProviderOptions("anthropic") as { anthropic: { thinking: { type: string; budgetTokens: number } } };
    expect(opts.anthropic.thinking.type).toBe("enabled");
    expect(opts.anthropic.thinking.budgetTokens).toBeGreaterThan(0);
  });
});

describe("resolveModel", () => {
  it("키/모델로 모델 객체를 만든다(네트워크 호출 없음)", () => {
    expect(resolveModel("anthropic", "sk-test", "claude-sonnet-4-6")).toBeTruthy();
    expect(resolveModel("openai", "sk-test", "gpt-5.2")).toBeTruthy();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec vitest run src/lib/ai/provider.test.ts`
Expected: FAIL — `./provider` 모듈 없음.

- [ ] **Step 4: 구현 작성**

`src/lib/ai/provider.ts`:

```ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AiProvider } from "./settings";

export function resolveModel(provider: AiProvider, apiKey: string, model: string): LanguageModel {
  if (provider === "openai") {
    return createOpenAI({ apiKey })(model);
  }
  return createAnthropic({ apiKey })(model);
}

// 추론 effort는 medium 고정. 프로바이더별 표현이 다르다:
// - OpenAI: reasoningEffort "medium" (추론 모델에 적용, 그 외엔 무시됨).
// - Anthropic: extended thinking을 medium 예산으로 활성화. thinking 토큰은
//   toTextStreamResponse()가 무시하므로 에디터에는 최종 텍스트만 스트리밍된다.
//   선택한 모델이 thinking을 지원하지 않으면 이 블록을 비활성화한다.
export const ANTHROPIC_THINKING_BUDGET = 4_096;

export function buildProviderOptions(provider: AiProvider): Record<string, unknown> {
  if (provider === "openai") {
    return { openai: { reasoningEffort: "medium" } };
  }
  return { anthropic: { thinking: { type: "enabled", budgetTokens: ANTHROPIC_THINKING_BUDGET } } };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec vitest run src/lib/ai/provider.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add package.json pnpm-lock.yaml src/lib/ai/provider.ts src/lib/ai/provider.test.ts
git commit -m "feat(ai-write): AI SDK 프로바이더 모델/effort 옵션 모듈 추가"
```

---

### Task 7: 스트리밍 Route Handler

**Files:**
- Create: `src/app/api/ai/generate/route.ts`
- Test: `src/app/api/ai/generate/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`(`@/lib/auth/session`), `resolveModel`/`buildProviderOptions`(Task 6), `buildSystemPrompt`(Task 2), `prepareAttachments`/`InputFile`(Task 5), `validatePrompt`/`validateAttachments`(Task 3), `AiProvider`(Task 4), `streamText`(`ai`).
- Produces: `POST(req: Request): Promise<Response>`, `export const maxDuration = 60`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/ai/generate/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  resolveModel: vi.fn(() => ({ mock: true })),
  buildProviderOptions: vi.fn(() => ({})),
}));
vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toTextStreamResponse: () =>
      new Response("---\ntitle: 생성됨\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
  })),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { streamText } from "ai";
import { POST } from "./route";

const mockUser = vi.mocked(getCurrentUser);
const mockStreamText = vi.mocked(streamText);

function makeRequest(opts: { key?: string; fields?: Record<string, string>; files?: File[] }): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(opts.fields ?? {})) fd.set(k, v);
  for (const f of opts.files ?? []) fd.append("files", f);
  const headers: Record<string, string> = {};
  if (opts.key) headers["x-provider-key"] = opts.key;
  return new Request("http://localhost/api/ai/generate", { method: "POST", body: fd, headers });
}

const validFields = { provider: "anthropic", model: "claude-sonnet-4-6", prompt: "막대그래프 예제 문서 만들어줘" };

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ id: "u1", email: "a@b.c", name: null });
});

describe("POST /api/ai/generate", () => {
  it("미인증이면 401", async () => {
    mockUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    expect(res.status).toBe(401);
  });

  it("키 헤더가 없으면 400", async () => {
    const res = await POST(makeRequest({ fields: validFields }));
    expect(res.status).toBe(400);
  });

  it("빈 프롬프트면 400", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: { ...validFields, prompt: "   " } }));
    expect(res.status).toBe(400);
  });

  it("허용 외 확장자 첨부면 400", async () => {
    const bad = new File([new Uint8Array([1])], "x.exe", { type: "application/octet-stream" });
    const res = await POST(makeRequest({ key: "sk", fields: validFields, files: [bad] }));
    expect(res.status).toBe(400);
  });

  it("해피패스: streamText를 호출하고 텍스트를 스트리밍한다", async () => {
    const txt = new File([new TextEncoder().encode("참고: 매출 데이터")], "ref.txt", { type: "text/plain" });
    const res = await POST(makeRequest({ key: "sk", fields: validFields, files: [txt] }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("title: 생성됨");

    expect(mockStreamText).toHaveBeenCalledOnce();
    const arg = mockStreamText.mock.calls[0][0] as {
      system: string;
      messages: { role: string; content: { type: string; text?: string }[] }[];
    };
    expect(arg.system).toContain("Quarto");
    const userText = arg.messages[0].content.map((p) => p.text ?? "").join(" ");
    expect(userText).toContain("막대그래프");
    expect(userText).toContain("매출 데이터"); // 텍스트 첨부가 인라인됨
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/app/api/ai/generate/route.test.ts`
Expected: FAIL — `./route` 모듈 없음.

- [ ] **Step 3: 구현 작성**

`src/app/api/ai/generate/route.ts`:

```ts
import { streamText } from "ai";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveModel, buildProviderOptions } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { prepareAttachments, type InputFile } from "@/lib/ai/extract";
import { validatePrompt, validateAttachments } from "@/lib/ai/validation";
import type { AiProvider } from "@/lib/ai/settings";

export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 16_000;

type UserContentPart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; data: Uint8Array; filename?: string };

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const apiKey = req.headers.get("x-provider-key");
  if (!apiKey) {
    return Response.json({ error: "API 키가 필요합니다." }, { status: 400 });
  }

  const form = await req.formData();
  const provider: AiProvider = form.get("provider") === "openai" ? "openai" : "anthropic";
  const model = String(form.get("model") ?? "");
  const prompt = String(form.get("prompt") ?? "");

  if (!model) {
    return Response.json({ error: "모델이 지정되지 않았습니다." }, { status: 400 });
  }

  const promptCheck = validatePrompt(prompt);
  if (!promptCheck.ok) {
    return Response.json({ error: promptCheck.error }, { status: 400 });
  }

  const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
  const attachmentCheck = validateAttachments(fileEntries.map((f) => ({ name: f.name, size: f.size })));
  if (!attachmentCheck.ok) {
    return Response.json({ error: attachmentCheck.error }, { status: 400 });
  }

  const files: InputFile[] = await Promise.all(
    fileEntries.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  const parts = await prepareAttachments(files, provider);

  const content: UserContentPart[] = [{ type: "text", text: prompt }];
  for (const part of parts) {
    if (part.kind === "text") {
      content.push({ type: "text", text: `\n\n[첨부: ${part.name}]\n${part.text}` });
    } else if (part.kind === "image") {
      content.push({ type: "file", mediaType: part.mediaType, data: part.bytes, filename: part.name });
    } else {
      content.push({ type: "file", mediaType: "application/pdf", data: part.bytes, filename: part.name });
    }
  }

  const result = streamText({
    model: resolveModel(provider, apiKey, model),
    system: buildSystemPrompt({ hasAttachments: parts.length > 0 }),
    messages: [{ role: "user", content }],
    providerOptions: buildProviderOptions(provider),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error("[ai/generate] stream error:", error);
    },
  });

  // AI SDK v6: 평문 UTF-8 텍스트 델타 스트림.
  // v7+이면: import { createTextStreamResponse, toTextStream } from "ai";
  //          return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
  return result.toTextStreamResponse();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/app/api/ai/generate/route.test.ts`
Expected: PASS.
- 실패 1) `messages` 콘텐츠 타입 불일치 → `UserContentPart` union이 SDK user content 형태와 맞는지 확인(필요 시 `messages: [{ role: "user", content }] as Parameters<typeof streamText>[0]["messages"]` 캐스트).
- 실패 2) `extract`의 의존성(`xlsx`/`officeparser`) 로드가 테스트 환경에서 문제되면, 이 라우트 테스트 상단에 `vi.mock("@/lib/ai/extract", () => ({ prepareAttachments: vi.fn(async () => [{ kind: "text", name: "ref.txt", text: "매출 데이터" }]) }))`를 추가해 격리한다.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/ai/generate/route.ts src/app/api/ai/generate/route.test.ts
git commit -m "feat(ai-write): qmd 생성 스트리밍 Route Handler 추가"
```

---

### Task 8: AI 드로어 컴포넌트

**Files:**
- Create: `src/components/workspace/ai-drawer.tsx`
- Test: `src/components/workspace/ai-drawer.test.tsx`
- Modify: `src/app/globals.css` (드로어 스타일 추가)

**Interfaces:**
- Consumes: `loadSettings`/`getActiveCredentials`(Task 4), `validatePrompt`/`validateAttachments`(Task 3).
- Produces: `export type AiGenerationHandlers = { onStart:()=>void; onChunk:(full:string)=>void; onFinish:()=>void; onError:()=>void; onRevert:()=>void }`; `export function AiDrawer(props: AiDrawerProps)`.
  - `AiDrawerProps = { open:boolean; onToggle:()=>void; isBusy:boolean; onOpenSettings:()=>void; handlers:AiGenerationHandlers }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/workspace/ai-drawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiDrawer, type AiGenerationHandlers } from "./ai-drawer";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/ai/settings";

function makeHandlers(): AiGenerationHandlers {
  return { onStart: vi.fn(), onChunk: vi.fn(), onFinish: vi.fn(), onError: vi.fn(), onRevert: vi.fn() };
}

function streamingResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/plain" } });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AiDrawer", () => {
  it("키가 없으면 생성 시 설정 안내를 보여준다", () => {
    saveSettings(DEFAULT_SETTINGS); // apiKey: ""
    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={makeHandlers()} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서 만들어줘" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    expect(screen.getByText(/API 키/)).toBeInTheDocument();
  });

  it("키가 있으면 스트리밍 청크를 onChunk로 누적 전달한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamingResponse(["---\n", "title: x\n"]));

    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서 만들어줘" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(handlers.onStart).toHaveBeenCalled();
    expect(handlers.onChunk).toHaveBeenLastCalledWith("---\ntitle: x\n");
  });

  it("생성 완료 후 되돌리기 버튼이 onRevert를 호출한다", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" } });
    const handlers = makeHandlers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamingResponse(["abc"]));

    render(<AiDrawer open onToggle={vi.fn()} isBusy={false} onOpenSettings={vi.fn()} handlers={handlers} />);
    fireEvent.change(screen.getByLabelText("AI 프롬프트"), { target: { value: "문서" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(handlers.onRevert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/components/workspace/ai-drawer.test.tsx`
Expected: FAIL — `./ai-drawer` 모듈 없음.

- [ ] **Step 3: 구현 작성**

`src/components/workspace/ai-drawer.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Paperclip, Sparkles, X } from "lucide-react";
import { getActiveCredentials, loadSettings } from "@/lib/ai/settings";
import {
  validatePrompt,
  validateAttachments,
  MAX_PROMPT_LENGTH,
  MAX_ATTACHMENTS,
  MAX_TOTAL_BYTES,
  ALLOWED_EXTENSIONS,
} from "@/lib/ai/validation";

export type AiGenerationHandlers = {
  onStart: () => void;
  onChunk: (full: string) => void;
  onFinish: () => void;
  onError: () => void;
  onRevert: () => void;
};

type AiDrawerProps = {
  open: boolean;
  onToggle: () => void;
  isBusy: boolean;
  onOpenSettings: () => void;
  handlers: AiGenerationHandlers;
};

const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function AiDrawer({ open, onToggle, isBusy, onOpenSettings, handlers }: AiDrawerProps) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)];
    const check = validateAttachments(next.map((f) => ({ name: f.name, size: f.size })));
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    const creds = getActiveCredentials(loadSettings());
    if (!creds.apiKey) {
      setError("설정에서 API 키를 입력하세요.");
      return;
    }
    const promptCheck = validatePrompt(prompt);
    if (!promptCheck.ok) {
      setError(promptCheck.error);
      return;
    }
    const attachmentCheck = validateAttachments(files.map((f) => ({ name: f.name, size: f.size })));
    if (!attachmentCheck.ok) {
      setError(attachmentCheck.error);
      return;
    }

    setError(null);
    setFinished(false);
    setGenerating(true);
    handlers.onStart();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fd = new FormData();
      fd.set("provider", creds.provider);
      fd.set("model", creds.model);
      fd.set("prompt", prompt);
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        body: fd,
        headers: { "x-provider-key": creds.apiKey },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `생성에 실패했습니다 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        handlers.onChunk(accumulated);
      }
      handlers.onFinish();
      setFinished(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        handlers.onFinish();
        setFinished(true);
      } else {
        handlers.onError();
        setError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleRevert() {
    handlers.onRevert();
    setFinished(false);
  }

  return (
    <div className={`ai-drawer ${open ? "open" : ""}`}>
      <button type="button" className="ai-drawer-toggle" aria-expanded={open} onClick={onToggle}>
        <Sparkles size={14} aria-hidden="true" />
        AI 작성
      </button>

      {open && (
        <div className="ai-drawer-body">
          <label className="ai-field">
            <span className="ai-field-label">AI 프롬프트</span>
            <textarea
              aria-label="AI 프롬프트"
              className="ai-prompt"
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              disabled={generating}
              placeholder="어떤 문서를 만들지 설명해주세요. (예: iris 데이터로 산점도와 설명이 있는 보고서)"
              onChange={(e) => setPrompt(e.target.value)}
            />
            <span className="ai-counter">
              {prompt.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
            </span>
          </label>

          <div className="ai-attachments">
            <label className="ai-attach-button">
              <Paperclip size={14} aria-hidden="true" />
              첨부
              <input
                type="file"
                aria-label="파일 첨부"
                hidden
                multiple
                accept={ACCEPT}
                disabled={generating}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="ai-attach-meta">
              {files.length} / {MAX_ATTACHMENTS}개 · {formatMB(totalBytes)} / {formatMB(MAX_TOTAL_BYTES)} MB
            </span>
          </div>

          {files.length > 0 && (
            <ul className="ai-chip-list">
              {files.map((file, index) => (
                <li className="ai-chip" key={`${file.name}-${index}`}>
                  <span className="ai-chip-name">{file.name}</span>
                  <span className="ai-chip-size">{formatMB(file.size)}MB</span>
                  <button
                    type="button"
                    aria-label={`${file.name} 제거`}
                    className="ai-chip-remove"
                    disabled={generating}
                    onClick={() => removeFile(index)}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="ai-error" role="alert">
              {error}{" "}
              <button type="button" className="ai-link" onClick={onOpenSettings}>
                설정 열기
              </button>
            </p>
          )}

          <div className="ai-actions">
            {generating ? (
              <button type="button" className="ghost-button" onClick={handleStop}>
                중단
              </button>
            ) : (
              <button type="button" className="primary-button" disabled={isBusy} onClick={handleGenerate}>
                <Sparkles size={14} aria-hidden="true" />
                생성
              </button>
            )}
            {finished && !generating && (
              <button type="button" className="ghost-button" onClick={handleRevert}>
                되돌리기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/components/workspace/ai-drawer.test.tsx`
Expected: PASS.

- [ ] **Step 5: 드로어 스타일 추가**

`src/app/globals.css` 맨 끝에 추가:

```css
/* ── AI 드로어 ── */
.ai-drawer {
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
}
.ai-drawer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--fg-muted);
  font: inherit;
  cursor: pointer;
}
.ai-drawer-toggle:hover { color: var(--fg); }
.ai-drawer-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.ai-field { display: flex; flex-direction: column; gap: 4px; position: relative; }
.ai-field-label { font-size: 12px; color: var(--fg-subtle); }
.ai-prompt {
  width: 100%;
  min-height: 84px;
  resize: vertical;
  padding: 8px 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--fg);
  font: inherit;
}
.ai-counter { align-self: flex-end; font-size: 11px; color: var(--fg-subtle); }
.ai-attachments { display: flex; align-items: center; gap: 10px; }
.ai-attach-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--fg-muted);
  cursor: pointer;
}
.ai-attach-meta { font-size: 11px; color: var(--fg-subtle); }
.ai-chip-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: 12px;
}
.ai-chip-size { color: var(--fg-subtle); font-size: 11px; }
.ai-chip-remove { background: none; border: none; color: var(--fg-subtle); cursor: pointer; display: inline-flex; }
.ai-error { font-size: 12px; color: var(--danger); margin: 0; }
.ai-actions { display: flex; gap: 8px; }
.ai-link { background: none; border: none; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/workspace/ai-drawer.tsx src/components/workspace/ai-drawer.test.tsx src/app/globals.css
git commit -m "feat(ai-write): AI 드로어(프롬프트·첨부·스트리밍 클라이언트) 추가"
```

---

### Task 9: 설정 모달

**Files:**
- Create: `src/components/settings/settings-modal.tsx`
- Test: `src/components/settings/settings-modal.test.tsx`
- Modify: `src/app/globals.css` (모달 스타일 추가)

**Interfaces:**
- Consumes: `loadSettings`/`saveSettings`/`RECOMMENDED_MODELS`/타입(Task 4).
- Produces: `export function SettingsModal(props: { open:boolean; onClose:()=>void })`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/settings/settings-modal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "./settings-modal";
import { loadSettings } from "@/lib/ai/settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("SettingsModal", () => {
  it("열림 상태에서 키를 입력·저장하면 localStorage에 반영된다", () => {
    const onClose = vi.fn();
    render(<SettingsModal open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("API 키"), { target: { value: "sk-anthropic-1" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(loadSettings().anthropic.apiKey).toBe("sk-anthropic-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("닫힘 상태면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<SettingsModal open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/components/settings/settings-modal.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현 작성**

`src/components/settings/settings-modal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  loadSettings,
  saveSettings,
  RECOMMENDED_MODELS,
  type AiProvider,
  type AiSettings,
} from "@/lib/ai/settings";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setSettings(loadSettings());
      setShowKey(false);
    }
  }, [open]);

  if (!open || !settings) return null;

  const provider = settings.provider;
  const config = settings[provider];

  function setProvider(next: AiProvider) {
    setSettings((s) => (s ? { ...s, provider: next } : s));
  }
  function setConfig(patch: Partial<{ apiKey: string; model: string }>) {
    setSettings((s) => (s ? { ...s, [provider]: { ...s[provider], ...patch } } : s));
  }
  function handleSave() {
    if (settings) saveSettings(settings);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="AI 설정" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>AI 설정</h2>
          <button type="button" aria-label="닫기" className="ai-chip-remove" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="settings-segment" role="tablist" aria-label="프로바이더">
          {(["anthropic", "openai"] as AiProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={provider === p}
              className={`seg-item ${provider === p ? "active" : ""}`}
              onClick={() => setProvider(p)}
            >
              {p === "anthropic" ? "Anthropic" : "OpenAI"}
            </button>
          ))}
        </div>

        <label className="ai-field">
          <span className="ai-field-label">API 키</span>
          <div className="settings-key-row">
            <input
              aria-label="API 키"
              className="auth-input"
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              onChange={(e) => setConfig({ apiKey: e.target.value })}
            />
            <button type="button" className="ghost-button" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "숨기기" : "표시"}
            </button>
          </div>
        </label>

        <label className="ai-field">
          <span className="ai-field-label">모델</span>
          <select
            aria-label="추천 모델"
            className="auth-input"
            value=""
            onChange={(e) => {
              if (e.target.value) setConfig({ model: e.target.value });
            }}
          >
            <option value="">추천 모델 선택…</option>
            {RECOMMENDED_MODELS[provider].map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            aria-label="모델 이름"
            className="auth-input"
            value={config.model}
            onChange={(e) => setConfig({ model: e.target.value })}
          />
        </label>

        <p className="settings-note">
          API 키는 이 브라우저에만 저장되며 서버에 보관되지 않습니다. 생성 요청 시에만 사용됩니다.
        </p>

        <div className="ai-actions">
          <button type="button" className="primary-button" onClick={handleSave}>
            저장
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/components/settings/settings-modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: 모달 스타일 추가**

`src/app/globals.css` 맨 끝에 추가:

```css
/* ── 설정 모달 ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.settings-modal {
  width: min(440px, 92vw);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.settings-header { display: flex; align-items: center; justify-content: space-between; }
.settings-header h2 { margin: 0; font-size: 16px; color: var(--fg); }
.settings-segment { display: inline-flex; gap: 4px; background: var(--bg-base); border-radius: var(--radius-sm); padding: 3px; }
.settings-key-row { display: flex; gap: 6px; }
.settings-note { font-size: 11px; color: var(--fg-subtle); margin: 0; line-height: 1.5; }
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/settings/settings-modal.tsx src/components/settings/settings-modal.test.tsx src/app/globals.css
git commit -m "feat(ai-write): BYOK 설정 모달 추가"
```

---

### Task 10: 생성 컨트롤러 훅(스냅샷/교체/되돌리기)

**Files:**
- Create: `src/components/workspace/use-ai-generation.ts`
- Test: `src/components/workspace/use-ai-generation.test.ts`

**Interfaces:**
- Consumes: `AiGenerationHandlers`(Task 8).
- Produces: `useAiGeneration(getContent:()=>string, setContent:(c:string)=>void): { generating:boolean; handlers:AiGenerationHandlers }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/workspace/use-ai-generation.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiGeneration } from "./use-ai-generation";

function setup(initial: string) {
  let content = initial;
  const setContent = vi.fn((c: string) => {
    content = c;
  });
  const hook = renderHook(() => useAiGeneration(() => content, setContent));
  return { hook, setContent, getContent: () => content };
}

describe("useAiGeneration", () => {
  it("onStart는 generating을 true로 만든다", () => {
    const { hook } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    expect(hook.result.current.generating).toBe(true);
  });

  it("onChunk는 누적 문자열로 setContent를 호출한다", () => {
    const { hook, setContent } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onChunk("부분 텍스트"));
    expect(setContent).toHaveBeenLastCalledWith("부분 텍스트");
  });

  it("onError는 스냅샷으로 복원하고 generating을 끈다", () => {
    const { hook, setContent } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onChunk("중간"));
    act(() => hook.result.current.handlers.onError());
    expect(setContent).toHaveBeenLastCalledWith("원본");
    expect(hook.result.current.generating).toBe(false);
  });

  it("onRevert는 스냅샷으로 복원한다", () => {
    const { hook, setContent } = setup("원본");
    act(() => hook.result.current.handlers.onStart());
    act(() => hook.result.current.handlers.onChunk("새 내용"));
    act(() => hook.result.current.handlers.onFinish());
    act(() => hook.result.current.handlers.onRevert());
    expect(setContent).toHaveBeenLastCalledWith("원본");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/components/workspace/use-ai-generation.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현 작성**

`src/components/workspace/use-ai-generation.ts`:

```ts
import { useCallback, useRef, useState } from "react";
import type { AiGenerationHandlers } from "./ai-drawer";

export function useAiGeneration(
  getContent: () => string,
  setContent: (content: string) => void,
): { generating: boolean; handlers: AiGenerationHandlers } {
  const [generating, setGenerating] = useState(false);
  const snapshotRef = useRef<string | null>(null);

  const onStart = useCallback(() => {
    snapshotRef.current = getContent();
    setGenerating(true);
  }, [getContent]);

  const onChunk = useCallback((full: string) => {
    setContent(full);
  }, [setContent]);

  const onFinish = useCallback(() => {
    setGenerating(false);
  }, []);

  const onError = useCallback(() => {
    setGenerating(false);
    if (snapshotRef.current !== null) setContent(snapshotRef.current);
  }, [setContent]);

  const onRevert = useCallback(() => {
    if (snapshotRef.current !== null) setContent(snapshotRef.current);
  }, [setContent]);

  return { generating, handlers: { onStart, onChunk, onFinish, onError, onRevert } };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run src/components/workspace/use-ai-generation.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/workspace/use-ai-generation.ts src/components/workspace/use-ai-generation.test.ts
git commit -m "feat(ai-write): 생성 컨트롤러 훅(스냅샷·교체·되돌리기) 추가"
```

---

### Task 11: 워크스페이스 배선(드로어·설정·잠금)

**Files:**
- Modify: `src/components/workspace/editor-pane.tsx`
- Modify: `src/components/workspace/quarto-workspace.tsx`
- Test: `src/components/workspace/quarto-workspace.test.tsx` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `AiDrawer`/`AiGenerationHandlers`(Task 8), `SettingsModal`(Task 9), `useAiGeneration`(Task 10).
- Produces: 변경된 `EditorPane`(드로어·툴바 버튼 마운트), 변경된 `QuartoWorkspace`(설정 버튼·모달·생성 잠금).

- [ ] **Step 1: editor-pane에 드로어/툴바 버튼 배선**

`src/components/workspace/editor-pane.tsx` 전체를 아래로 교체:

```tsx
import { Play, Sparkles } from "lucide-react";
import CodeEditor from "./code-editor";
import { AiDrawer, type AiGenerationHandlers } from "./ai-drawer";

type EditorPaneProps = {
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  isBusy: boolean;
  aiDrawerOpen: boolean;
  generating: boolean;
  aiHandlers: AiGenerationHandlers;
  onToggleAiDrawer: () => void;
  onOpenSettings: () => void;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onExecuteCodeChange: (value: boolean) => void;
  onRender: () => void;
};

export function EditorPane({
  title,
  slug,
  content,
  executeCode,
  isBusy,
  aiDrawerOpen,
  generating,
  aiHandlers,
  onToggleAiDrawer,
  onOpenSettings,
  onTitleChange,
  onSlugChange,
  onContentChange,
  onExecuteCodeChange,
  onRender,
}: EditorPaneProps) {
  return (
    <section className="workspace-pane editor-pane" aria-label="QMD 에디터">
      <div className="pane-header">
        <div className="title-fields">
          <input
            aria-label="문서 제목"
            className="title-input"
            disabled={isBusy}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <input
            aria-label="문서 slug"
            className="slug-input"
            disabled={isBusy}
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
          />
        </div>
        <div className="pane-actions">
          <button
            type="button"
            aria-label="AI 작성 열기"
            aria-pressed={aiDrawerOpen}
            className="seg-control"
            onClick={onToggleAiDrawer}
          >
            <Sparkles size={16} aria-hidden="true" />
            AI 작성
          </button>
          <button
            aria-label="코드 실행"
            aria-checked={executeCode}
            className="seg-control"
            disabled={isBusy}
            role="switch"
            type="button"
            onClick={() => onExecuteCodeChange(!executeCode)}
          >
            <span className={`seg-item ${executeCode ? "active" : ""}`}>코드 실행</span>
            <span className={`seg-item ${executeCode ? "" : "active"}`}>미실행</span>
          </button>
          <button className="primary-button" type="button" onClick={onRender} disabled={isBusy}>
            <Play size={16} aria-hidden="true" />
            렌더
          </button>
        </div>
      </div>
      <CodeEditor value={content} onChange={onContentChange} readOnly={isBusy} />
      <AiDrawer
        open={aiDrawerOpen}
        onToggle={onToggleAiDrawer}
        isBusy={isBusy}
        onOpenSettings={onOpenSettings}
        handlers={aiHandlers}
      />
    </section>
  );
}
```

- [ ] **Step 2: quarto-workspace에 생성 훅·설정 모달·잠금 배선**

`src/components/workspace/quarto-workspace.tsx`를 다음과 같이 수정:

(a) import 추가 (파일 상단 import 블록):

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Settings } from "lucide-react";
import { SettingsModal } from "@/components/settings/settings-modal";
import { useAiGeneration } from "./use-ai-generation";
```

(b) `const [draft, setDraft] = useState(...)` 아래에 상태/훅 추가:

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const setDraftContent = useCallback((content: string) => {
    setDraft((current) => ({ ...current, content }));
  }, []);
  const { generating, handlers: aiHandlers } = useAiGeneration(() => draft.content, setDraftContent);
```

(c) `const paneBusy = isPending || isRendering;`를 다음으로 교체:

```tsx
  const paneBusy = isPending || isRendering || generating;
```

(d) 상단바의 로그아웃 `<form>` 앞에 설정 버튼 추가 (`.topbar-status` 안, `<form action={logoutAction}>` 바로 위):

```tsx
          <button
            type="button"
            aria-label="AI 설정"
            className="ghost-button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} aria-hidden="true" />
          </button>
```

(e) `<EditorPane ... />` 호출에 새 props 추가 (기존 props 유지, 아래를 함께 전달):

```tsx
          aiDrawerOpen={aiDrawerOpen}
          generating={generating}
          aiHandlers={aiHandlers}
          onToggleAiDrawer={() => setAiDrawerOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
```

(f) 최상위 `</main>` 직전(닫는 `)` 앞)에 모달 마운트:

```tsx
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
```

- [ ] **Step 3: 회귀 + 신규 케이스 테스트 추가**

기존 `src/components/workspace/quarto-workspace.test.tsx`는 `userEvent`·`screen`·`renderWorkspace()` 헬퍼를 쓰고 `./code-editor`를 textarea(aria-label="QMD content")로 모킹한다. 그 패턴을 그대로 따라, 기존 `describe(...)` 블록 안에 아래 두 테스트를 추가한다(`QuartoWorkspace`의 props는 바뀌지 않으므로 기존 케이스는 그대로 통과):

```tsx
  it("상단바의 AI 설정 버튼을 누르면 설정 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "AI 설정" }));
    expect(await screen.findByRole("dialog", { name: "AI 설정" })).toBeInTheDocument();
  });

  it("에디터 툴바의 AI 작성 버튼이 드로어를 토글한다", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "AI 작성 열기" }));
    expect(screen.getByLabelText("AI 프롬프트")).toBeInTheDocument();
  });
```

> 접근성 이름 확인: 툴바 버튼은 aria-label "AI 작성 열기"(드로어 내부 토글 "AI 작성"과 구분됨), 설정 버튼은 aria-label "AI 설정"(role=button), 설정 모달은 role=dialog·aria-label "AI 설정"이라 서로 충돌하지 않는다.

- [ ] **Step 4: 전체 워크스페이스 테스트 통과 확인**

Run: `pnpm exec vitest run src/components/workspace/quarto-workspace.test.tsx`
Expected: PASS (기존 케이스 + 신규 2건).

- [ ] **Step 5: 타입체크**

Run: `pnpm typecheck`
Expected: 통과(EditorPane 새 props가 모두 연결되어 있어야 함).

- [ ] **Step 6: 커밋**

```bash
git add src/components/workspace/editor-pane.tsx src/components/workspace/quarto-workspace.tsx src/components/workspace/quarto-workspace.test.tsx
git commit -m "feat(ai-write): 워크스페이스에 AI 드로어·설정 모달·생성 잠금 배선"
```

---

### Task 12: 전체 검증 + 수동 스모크

**Files:**
- 없음(검증 전용). 필요 시 사소한 수정만.

- [ ] **Step 1: 전체 검증 실행**

Run: `pnpm verify`
Expected: `lint` 0 errors, `typecheck` 통과, 전체 `test` 통과, `build`(standalone) 성공.
실패 시 해당 태스크로 돌아가 수정한다(특히 lint의 미사용 import, build의 서버/클라이언트 경계 오류 주의: `extract.ts`·`provider.ts`·`route.ts`는 서버에서만 import되어야 한다).

- [ ] **Step 2: 수동 스모크(개발 스택)**

```bash
# 터미널 A
pnpm dev
# 터미널 B (워커는 렌더 검증용; AI 생성만 볼 거면 생략 가능)
./node_modules/.bin/tsx --env-file=.env.local worker/render-worker.ts
```

확인 항목:
- [ ] 상단바 톱니(AI 설정) → 모달에서 Anthropic 키 입력·저장 → 새로고침 후에도 유지(localStorage).
- [ ] 에디터 툴바 "AI 작성" → 드로어 열림. 프롬프트에 "iris 데이터로 산점도 보고서 만들어줘" 입력.
- [ ] (선택) csv/png/xlsx/pdf 첨부 → 개수 `n/10`·용량 `x.x/5MB` 표시, 5MB·10개·허용 외 확장자 초과 시 차단.
- [ ] "생성" → 에디터에 qmd가 위에서부터 라이브로 채워짐. 스트리밍 중 에디터 read-only.
- [ ] 완료 후 "되돌리기" → 생성 전 내용으로 복원.
- [ ] 잘못된 키로 생성 → 드로어에 오류 표시 + 자동 되돌리기(기존 내용 유지).
- [ ] 생성된 qmd로 "렌더" → HTML 미리보기 정상(지원 라이브러리만 사용했는지 육안 확인).

- [ ] **Step 3: 최종 커밋(필요 시)**

검증 중 수정이 있었다면:
```bash
git add -A
git commit -m "fix(ai-write): 전체 검증 반영 수정"
```

---

## 구현 순서 요약

1. Task 1~4: 순수 로직(라이브러리 목록 · 시스템 프롬프트 · 검증 · 설정) — 의존성 없음, 빠르게.
2. Task 5~6: 추출(xlsx·officeparser) · 프로바이더(AI SDK) — 의존성 추가.
3. Task 7: 스트리밍 라우트 — 1~6을 조립.
4. Task 8~10: 드로어 UI · 설정 모달 · 생성 훅.
5. Task 11: 워크스페이스 배선.
6. Task 12: 전체 검증 + 스모크.
