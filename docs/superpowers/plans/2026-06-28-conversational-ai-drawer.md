# 대화형 AI 드로어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 드로어를 단발 `.qmd` 생성기에서 대화형 채팅으로 바꿔, 잡담엔 답만 하고 문서가 필요할 때만 도구 호출(`edit_document` 부분 치환 / `write_document` 전체 작성)로 에디터에 반영한다.

**Architecture:** 모델에 두 도구를 노출하되 **서버는 실행하지 않고**(클라이언트 실행) `fullStream`의 `tool-call` 파트를 NDJSON `tool` 프레임으로 흘려보낸다. 클라이언트는 그 프레임을 CodeMirror 트랜잭션으로 적용한다(= 네이티브 Cmd+Z로 되돌림). 대화는 휘발성(메모리)이며 매 턴 현재 문서 전문을 컨텍스트로 보낸다. Tasks 1~7은 기존 흐름을 유지한 채 **순수 추가**이고, Task 8에서 워크스페이스를 새 흐름으로 **원자적 교체**한다.

**Tech Stack:** Next.js 16 App Router, Vercel AI SDK v7(`ai@^7.0.3`), `@ai-sdk/anthropic@^4`/`@ai-sdk/openai@^4`, CodeMirror(`@uiw/react-codemirror@^4`, `@codemirror/view`/`state`), Vitest + React Testing Library.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-06-28-conversational-ai-drawer-design.md`. 작업 브랜치: `feature/ai-editor`.
- **도구는 클라이언트 실행** — AI SDK 도구를 `execute` 없이 정의한다(`tool()` + `jsonSchema()` from `"ai"`, **zod 추가 금지**). 단일 스텝이므로 도구 호출 후 스트림이 종료된다.
- **도구 이름은 정확히** `edit_document`, `write_document`. NDJSON 프레임은 정확히 `{type:"delta",text}` / `{type:"tool",name,input}` / `{type:"done",usage,provider,model}`, 에러는 `controller.error()`.
- **BYOK**: API 키는 `localStorage["quarto-studio:ai-settings"]`에서 읽어 `x-provider-key` 헤더로만 전달, 서버 저장 금지.
- **검증 한도**(`src/lib/ai/validation.ts`): 프롬프트 ≤ 20,000자, 첨부 ≤ 10개, 합계 ≤ 10MB, `ALLOWED_EXTENSIONS`만.
- **휘발성 대화** — DB·마이그레이션 변경 없음. 문서 전환·새로고침 시 대화 소멸.
- **TDD**: 각 Task는 실패 테스트 → 구현 → 통과 → 커밋. 매 Task 종료 시 `pnpm typecheck`·`pnpm test` 그린 유지.
- 커밋은 한국어 conventional, 마지막 줄 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Tasks 1~7은 기존 `/api/ai/generate`·`use-ai-generation`·구 `ai-drawer`를 건드리지 않는다(앱은 구 흐름으로 계속 동작). Task 8에서 제거·교체.

---

## File Structure

**신규**
- `src/lib/quarto/apply-edits.ts` — 순수 `applyEdits(content, edits)`.
- `src/lib/quarto/apply-edits.test.ts`
- `src/lib/ai/tools.ts` — `edit_document`/`write_document` 스키마 + 이름 상수.
- `src/lib/ai/tools.test.ts`
- `src/app/api/ai/chat/route.ts` — 채팅 스트리밍 라우트(메시지+문서+도구).
- `src/app/api/ai/chat/route.test.ts`
- `src/components/workspace/apply-edits-to-editor.ts` — `tool` 프레임을 CodeMirror에 적용.
- `src/components/workspace/apply-edits-to-editor.test.ts`
- `src/components/workspace/use-ai-chat.ts` — 채팅 훅(`ChatMessage` 타입 포함).
- `src/components/workspace/use-ai-chat.test.ts`
- `src/components/workspace/ai-message-list.tsx`
- `src/components/workspace/ai-message-list.test.tsx`
- `src/components/workspace/ai-composer.tsx`
- `src/components/workspace/ai-composer.test.tsx`

**수정**
- `src/lib/ai/system-prompt.ts` — `buildChatSystemPrompt` 추가(Task 3) → 구 `buildSystemPrompt` 제거(Task 8).
- `src/lib/ai/system-prompt.test.ts`
- `src/components/workspace/ai-drawer.tsx` — 채팅 셸로 재작성(Task 8).
- `src/components/workspace/ai-drawer.test.tsx`
- `src/components/workspace/editor-pane.tsx` — 프롭 교체(Task 8).
- `src/components/workspace/quarto-workspace.tsx` — `useAiChat` 배선(Task 8).
- `src/components/workspace/quarto-workspace.test.tsx`
- `src/app/globals.css` — 채팅 말풍선·작성기 스타일(Task 7).

**제거(Task 8)**
- `src/app/api/ai/generate/route.ts`(+`route.test.ts`)
- `src/components/workspace/use-ai-generation.ts`(+`use-ai-generation.test.ts`)
- `src/components/workspace/stream-into-editor.ts`(+`stream-into-editor.test.ts`)

---

## Task 1: `applyEdits` 순수 함수

**Files:**
- Create: `src/lib/quarto/apply-edits.ts`
- Test: `src/lib/quarto/apply-edits.test.ts`

**Interfaces:**
- Produces: `applyEdits(content: string, edits: { find: string; replace: string }[]): { content: string; results: { find: string; ok: boolean }[] }`. 각 편집을 현재 작업 문자열에서 순차 적용(첫 일치 치환). `find`가 비었거나 일치가 없으면 스킵·`ok:false`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/quarto/apply-edits.test.ts
import { describe, it, expect } from "vitest";
import { applyEdits } from "./apply-edits";

describe("applyEdits", () => {
  it("단일 치환: 첫 일치를 replace로 바꾼다", () => {
    const r = applyEdits("제목: 옛날\n본문", [{ find: "옛날", replace: "새날" }]);
    expect(r.content).toBe("제목: 새날\n본문");
    expect(r.results).toEqual([{ find: "옛날", ok: true }]);
  });

  it("다중 편집: 순차로 적용되며 앞 치환이 뒤 편집에 반영된다", () => {
    const r = applyEdits("A B C", [
      { find: "A", replace: "X" },
      { find: "X B", replace: "Y" },
    ]);
    expect(r.content).toBe("Y C");
    expect(r.results.every((x) => x.ok)).toBe(true);
  });

  it("첫 일치만 치환한다(이후 동일 문자열은 유지)", () => {
    const r = applyEdits("foo foo", [{ find: "foo", replace: "bar" }]);
    expect(r.content).toBe("bar foo");
  });

  it("일치가 없으면 스킵하고 ok:false로 기록한다", () => {
    const r = applyEdits("hello", [{ find: "없는문자열", replace: "x" }]);
    expect(r.content).toBe("hello");
    expect(r.results).toEqual([{ find: "없는문자열", ok: false }]);
  });

  it("빈 find는 스킵한다(전체 머리에 삽입되는 사고 방지)", () => {
    const r = applyEdits("hello", [{ find: "", replace: "x" }]);
    expect(r.content).toBe("hello");
    expect(r.results).toEqual([{ find: "", ok: false }]);
  });

  it("성공/실패가 섞이면 성공분만 반영한다", () => {
    const r = applyEdits("a b", [
      { find: "a", replace: "A" },
      { find: "zzz", replace: "Z" },
      { find: "b", replace: "B" },
    ]);
    expect(r.content).toBe("A B");
    expect(r.results.map((x) => x.ok)).toEqual([true, false, true]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/quarto/apply-edits.test.ts`
Expected: FAIL — `applyEdits` is not defined / 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/lib/quarto/apply-edits.ts

export type DocEdit = { find: string; replace: string };
export type EditResult = { find: string; ok: boolean };

/**
 * content에 edits를 순차로 적용한다. 각 edit는 현재 작업 문자열에서 find의 첫 일치를
 * replace로 치환한다. find가 비었거나 일치가 없으면 그 edit는 스킵하고 ok:false로 기록한다.
 * 순차 적용이므로 앞선 치환 결과가 뒤 edit의 탐색 대상이 된다.
 */
export function applyEdits(
  content: string,
  edits: DocEdit[],
): { content: string; results: EditResult[] } {
  let working = content;
  const results: EditResult[] = [];
  for (const edit of edits) {
    if (!edit.find) {
      results.push({ find: edit.find, ok: false });
      continue;
    }
    const at = working.indexOf(edit.find);
    if (at === -1) {
      results.push({ find: edit.find, ok: false });
      continue;
    }
    working = working.slice(0, at) + edit.replace + working.slice(at + edit.find.length);
    results.push({ find: edit.find, ok: true });
  }
  return { content: working, results };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/quarto/apply-edits.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/quarto/apply-edits.ts src/lib/quarto/apply-edits.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 부분 편집 순수 함수 applyEdits

find/replace 순차 치환(첫 일치), 미일치·빈 find는 스킵+ok:false.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 도구 스키마 `tools.ts`

**Files:**
- Create: `src/lib/ai/tools.ts`
- Test: `src/lib/ai/tools.test.ts`

**Interfaces:**
- Consumes: `tool`, `jsonSchema` from `"ai"`.
- Produces:
  - `EDIT_TOOL = "edit_document"`, `WRITE_TOOL = "write_document"` (string 상수).
  - `chatTools` — `streamText({ tools })`에 넘길 객체. 키는 위 이름, 값은 `tool({ description, inputSchema })`(execute 없음 = 클라이언트 실행).
  - 타입 `EditDocumentInput = { edits: { find: string; replace: string }[] }`, `WriteDocumentInput = { content: string }`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/ai/tools.test.ts
import { describe, it, expect } from "vitest";
import { chatTools, EDIT_TOOL, WRITE_TOOL } from "./tools";

describe("chatTools", () => {
  it("도구 이름 상수가 정확하다", () => {
    expect(EDIT_TOOL).toBe("edit_document");
    expect(WRITE_TOOL).toBe("write_document");
  });

  it("두 도구를 정확한 키로 노출한다", () => {
    expect(Object.keys(chatTools).sort()).toEqual(["edit_document", "write_document"]);
  });

  it("도구는 execute가 없다(클라이언트 실행)", () => {
    expect((chatTools[EDIT_TOOL] as { execute?: unknown }).execute).toBeUndefined();
    expect((chatTools[WRITE_TOOL] as { execute?: unknown }).execute).toBeUndefined();
  });

  it("각 도구가 설명과 inputSchema를 가진다", () => {
    expect(chatTools[EDIT_TOOL].description).toBeTruthy();
    expect(chatTools[EDIT_TOOL].inputSchema).toBeDefined();
    expect(chatTools[WRITE_TOOL].description).toBeTruthy();
    expect(chatTools[WRITE_TOOL].inputSchema).toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/ai/tools.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/lib/ai/tools.ts
import { tool, jsonSchema } from "ai";

export const EDIT_TOOL = "edit_document";
export const WRITE_TOOL = "write_document";

export type EditDocumentInput = { edits: { find: string; replace: string }[] };
export type WriteDocumentInput = { content: string };

// execute를 정의하지 않는다 → AI SDK가 서버에서 실행하지 않고 tool-call 파트만 방출한다.
// 단일 스텝이므로 도구 호출 후 스트림이 종료되고, 클라이언트가 에디터에 적용한다.
export const chatTools = {
  [EDIT_TOOL]: tool({
    description:
      "현재 문서에서 정확히 일치하는 문자열을 찾아 치환한다(부분 편집). 기존 문서의 일부만 바꿀 때 사용. 여러 편집을 한 번에 넘길 수 있다. find는 현재 문서에 그대로 존재하는, 충분히 구체적인 문자열이어야 한다.",
    inputSchema: jsonSchema<EditDocumentInput>({
      type: "object",
      additionalProperties: false,
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              find: { type: "string", description: "현재 문서에 그대로 존재하는 정확한 문자열" },
              replace: { type: "string", description: "find를 대체할 문자열(삭제는 빈 문자열)" },
            },
            required: ["find", "replace"],
          },
        },
      },
      required: ["edits"],
    }),
  }),
  [WRITE_TOOL]: tool({
    description:
      "문서 전체를 작성하거나 교체한다. 문서가 비었거나 처음 만들 때, 또는 전면 재작성이 필요할 때 사용.",
    inputSchema: jsonSchema<WriteDocumentInput>({
      type: "object",
      additionalProperties: false,
      properties: {
        content: { type: "string", description: "완전한 .qmd 본문(YAML 프런트매터로 시작)" },
      },
      required: ["content"],
    }),
  }),
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/ai/tools.test.ts && pnpm typecheck`
Expected: PASS (4 tests), 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/tools.ts src/lib/ai/tools.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 채팅 편집 도구 스키마(edit_document/write_document)

execute 없는 클라이언트 실행 도구. jsonSchema 사용(zod 미추가).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 대화형 시스템 프롬프트 `buildChatSystemPrompt`

**Files:**
- Modify: `src/lib/ai/system-prompt.ts` (구 `buildSystemPrompt` 유지, 새 함수 추가 — 구 흐름 보존)
- Test: `src/lib/ai/system-prompt.test.ts` (기존 테스트 유지, 새 describe 추가)

**Interfaces:**
- Consumes: `formatSupportedLibraries` from `./supported-libraries`.
- Produces: `buildChatSystemPrompt(options: { hasAttachments?: boolean; document?: string }): string`. 대화형 역할 + 도구 사용 규칙 + 지원 범위 계약 + 현재 문서 블록을 포함.

- [ ] **Step 1: 실패 테스트 작성 (기존 파일에 describe 추가)**

```ts
// src/lib/ai/system-prompt.test.ts 에 아래 describe를 추가(기존 import에 buildChatSystemPrompt 추가)
import { buildChatSystemPrompt } from "./system-prompt";

describe("buildChatSystemPrompt", () => {
  it("대화형 역할과 '잡담엔 도구 호출 금지' 규칙을 담는다", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("대화");
    expect(p).toContain("도구");
    // 인사/잡담에는 도구를 호출하지 말라는 취지의 지시가 있어야 한다
    expect(p).toMatch(/인사|잡담/);
  });

  it("두 도구 이름과 사용 시점을 안내한다", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("write_document");
    expect(p).toContain("edit_document");
  });

  it("지원 라이브러리 계약을 포함한다", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("Python");
    expect(p).toContain("matplotlib");
  });

  it("현재 문서를 라벨된 블록으로 주입한다", () => {
    const p = buildChatSystemPrompt({ document: "# 내 문서\n본문" });
    expect(p).toContain("현재 문서");
    expect(p).toContain("# 내 문서");
  });

  it("빈 문서면 '비어 있음'을 알린다", () => {
    const p = buildChatSystemPrompt({ document: "" });
    expect(p).toContain("비어 있");
  });

  it("첨부가 있으면 첨부 근거 지시를 덧붙인다", () => {
    const p = buildChatSystemPrompt({ hasAttachments: true });
    expect(p).toContain("첨부");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/ai/system-prompt.test.ts`
Expected: FAIL — `buildChatSystemPrompt` is not exported.

- [ ] **Step 3: 구현 (기존 `buildSystemPrompt`는 그대로 두고 아래 함수 추가)**

```ts
// src/lib/ai/system-prompt.ts 끝에 추가
export function buildChatSystemPrompt(
  options: { hasAttachments?: boolean; document?: string } = {},
): string {
  const { hasAttachments = false, document } = options;
  const lines = [
    "당신은 Quarto Studio의 문서 작성 대화 도우미입니다. 사용자와 한국어로 자연스럽게 대화합니다.",
    "",
    "## 편집 판단",
    "- 인사·질문·잡담에는 도구를 호출하지 말고 그냥 대화로 답하세요.",
    "- 문서를 새로 만들거나 고쳐야 할 때만 도구를 호출하세요.",
    "- 도구를 호출할 때는 사용자에게 무엇을 했는지 한국어로 짧게 함께 말하세요(예: \"제목을 바꿨어요\").",
    "",
    "## 도구 사용 규칙",
    "- write_document(content): 문서가 비었거나 처음 만들 때, 또는 전면 재작성이 필요할 때. content는 완전한 .qmd 본문이며 YAML 프런트매터(---)로 시작합니다. 전체를 코드펜스로 감싸지 마세요.",
    "- edit_document(edits): 기존 문서의 일부만 바꿀 때. 각 edit의 find는 아래 '현재 문서'에 그대로 존재하는, 충분히 구체적인 문자열이어야 합니다(잘못 잡으면 적용되지 않습니다).",
    "",
    "## 지원 언어/라이브러리 (이 목록만 사용)",
    "- 언어: Python, R, Julia.",
    formatSupportedLibraries(),
    "- 위 목록에 없는 라이브러리나 언어는 사용하지 마세요.",
    "",
    "## Quarto 문법",
    "- 실행 청크는 ```{python}, ```{r}, ```{julia} 형식. 셀 옵션은 \"#| key: value\".",
    "- 타깃 포맷은 Quarto → HTML. 프런트매터에 title 포함, 필요하면 toc: true.",
  ];
  if (hasAttachments) {
    lines.push(
      "",
      "## 첨부 자료",
      "- 사용자가 제공한 첨부 자료를 근거로 문서를 작성/수정하세요.",
    );
  }
  lines.push(
    "",
    "## 현재 문서",
    document && document.trim().length > 0
      ? "아래는 사용자가 편집 중인 현재 문서 전문입니다. edit_document의 find는 이 내용을 기준으로 잡으세요.\n```\n" +
          document +
          "\n```"
      : "현재 문서는 비어 있습니다. 문서를 만들 때는 write_document를 사용하세요.",
  );
  return lines.join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/ai/system-prompt.test.ts`
Expected: PASS (기존 + 새 6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/system-prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 대화형 시스템 프롬프트 buildChatSystemPrompt

잡담엔 답만/필요 시 도구 호출, 현재 문서 블록 주입, 지원 범위 계약 유지.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `/api/ai/chat` 스트리밍 라우트 (추가)

**Files:**
- Create: `src/app/api/ai/chat/route.ts`
- Test: `src/app/api/ai/chat/route.test.ts`

**Interfaces:**
- Consumes: `streamText` from `"ai"`; `resolveModel`, `buildProviderOptions` from `@/lib/ai/provider`; `buildChatSystemPrompt` (Task 3); `chatTools` (Task 2); `prepareAttachments`, `InputFile` from `@/lib/ai/extract`; `validatePrompt`, `validateAttachments` from `@/lib/ai/validation`; `getCurrentUser` from `@/lib/auth/session`.
- 요청 필드: `provider`, `model`, `messages`(JSON `{role:"user"|"assistant", text:string}[]`, 마지막은 user), `document`. 파일은 `files`(복수). 키는 `x-provider-key` 헤더.
- 응답: NDJSON `{type:"delta",text}` / `{type:"tool",name,input}` / `{type:"done",usage,provider,model}`, 에러는 `controller.error()`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/app/api/ai/chat/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  resolveModel: vi.fn(() => ({ mock: true })),
  buildProviderOptions: vi.fn(() => ({})),
}));
vi.mock("ai", () => ({
  // tool/jsonSchema는 tools.ts가 import하므로 패스스루로 모킹한다.
  tool: (def: unknown) => def,
  jsonSchema: (schema: unknown) => schema,
  streamText: vi.fn(() => ({
    fullStream: (async function* () {
      yield { type: "text-delta", id: "t1", text: "제목을 바꿀게요." };
      yield {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "edit_document",
        input: { edits: [{ find: "옛", replace: "새" }] },
      };
      yield { type: "finish", totalUsage: { inputTokens: 10, outputTokens: 5 } };
    })(),
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
  return new Request("http://localhost/api/ai/chat", { method: "POST", body: fd, headers });
}

const validFields = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  document: "# 옛 제목",
  messages: JSON.stringify([{ role: "user", text: "제목을 새 제목으로 바꿔줘" }]),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ id: "u1", email: "a@b.c", name: null });
});

describe("POST /api/ai/chat", () => {
  it("미인증이면 401", async () => {
    mockUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    expect(res.status).toBe(401);
  });

  it("키 헤더가 없으면 400", async () => {
    const res = await POST(makeRequest({ fields: validFields }));
    expect(res.status).toBe(400);
  });

  it("messages가 비었으면 400", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: { ...validFields, messages: "[]" } }));
    expect(res.status).toBe(400);
  });

  it("마지막 메시지가 user가 아니면 400", async () => {
    const res = await POST(
      makeRequest({
        key: "sk",
        fields: { ...validFields, messages: JSON.stringify([{ role: "assistant", text: "안녕하세요" }]) },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("해피패스: delta·tool·done 프레임을 NDJSON으로 스트리밍한다", async () => {
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain("제목을 바꿀게요.");
    expect(text).toContain('"type":"tool"');
    expect(text).toContain('"name":"edit_document"');
    expect(text).toContain('"type":"done"');

    // 시스템 프롬프트에 현재 문서가 주입되고, 도구가 넘겨진다
    const arg = mockStreamText.mock.calls[0][0] as {
      system: string;
      tools: Record<string, unknown>;
      messages: { role: string }[];
    };
    expect(arg.system).toContain("# 옛 제목");
    expect(Object.keys(arg.tools).sort()).toEqual(["edit_document", "write_document"]);
    expect(arg.messages[arg.messages.length - 1].role).toBe("user");
  });

  it("스트림 중 error 파트가 오면 응답 스트림이 에러로 종료된다", async () => {
    mockStreamText.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: "text-delta", id: "t1", text: "부분" };
        yield { type: "error", error: new Error("provider 401") };
      })(),
    } as unknown as ReturnType<typeof streamText>);
    const res = await POST(makeRequest({ key: "sk", fields: validFields }));
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    await expect(
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value);
        }
      })(),
    ).rejects.toThrow();
    expect(text).toContain("부분");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/app/api/ai/chat/route.test.ts`
Expected: FAIL — `./route` 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/app/api/ai/chat/route.ts
import { streamText } from "ai";
import type { ModelMessage, UserContent } from "ai";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveModel, buildProviderOptions } from "@/lib/ai/provider";
import { buildChatSystemPrompt } from "@/lib/ai/system-prompt";
import { chatTools } from "@/lib/ai/tools";
import { prepareAttachments, type InputFile } from "@/lib/ai/extract";
import { validatePrompt, validateAttachments } from "@/lib/ai/validation";
import type { AiProvider } from "@/lib/ai/settings";

export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 16_000;

type ChatTurn = { role: "user" | "assistant"; text: string };

function parseMessages(raw: string): ChatTurn[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    for (const m of parsed) {
      if ((m?.role !== "user" && m?.role !== "assistant") || typeof m?.text !== "string") return null;
    }
    if (parsed[parsed.length - 1].role !== "user") return null;
    return parsed as ChatTurn[];
  } catch {
    return null;
  }
}

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
  const providerRaw = String(form.get("provider") ?? "");
  if (providerRaw !== "anthropic" && providerRaw !== "openai") {
    return Response.json({ error: "지원하지 않는 프로바이더입니다." }, { status: 400 });
  }
  const provider: AiProvider = providerRaw as AiProvider;
  const model = String(form.get("model") ?? "");
  if (!model) {
    return Response.json({ error: "모델이 지정되지 않았습니다." }, { status: 400 });
  }

  const turns = parseMessages(String(form.get("messages") ?? ""));
  if (!turns) {
    return Response.json({ error: "대화 메시지가 올바르지 않습니다." }, { status: 400 });
  }
  const lastUserText = turns[turns.length - 1].text;
  const promptCheck = validatePrompt(lastUserText);
  if (!promptCheck.ok) {
    return Response.json({ error: promptCheck.error }, { status: 400 });
  }

  const document = String(form.get("document") ?? "");

  const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
  const attachmentCheck = validateAttachments(fileEntries.map((f) => ({ name: f.name, size: f.size })));
  if (!attachmentCheck.ok) {
    return Response.json({ error: attachmentCheck.error }, { status: 400 });
  }

  const files: InputFile[] = await Promise.all(
    fileEntries.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  let parts: Awaited<ReturnType<typeof prepareAttachments>>;
  try {
    parts = await prepareAttachments(files, provider);
  } catch (error) {
    console.error("[ai/chat] attachment extraction failed:", error);
    return Response.json(
      { error: "첨부파일 텍스트 추출에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  // 마지막 user 메시지에만 첨부를 싣는다. 이전 턴은 채팅 텍스트만(과거 첨부는 보관하지 않음).
  const lastContent: UserContent = [{ type: "text", text: lastUserText }];
  for (const part of parts) {
    if (part.kind === "text") {
      lastContent.push({ type: "text", text: `\n\n[첨부: ${part.name}]\n${part.text}` });
    } else if (part.kind === "image") {
      lastContent.push({ type: "file", mediaType: part.mediaType, data: part.bytes, filename: part.name });
    } else {
      lastContent.push({ type: "file", mediaType: "application/pdf", data: part.bytes, filename: part.name });
    }
  }

  const messages: ModelMessage[] = turns.slice(0, -1).map((t) => ({ role: t.role, content: t.text }));
  messages.push({ role: "user", content: lastContent });

  const result = streamText({
    model: resolveModel(provider, apiKey, model),
    system: buildChatSystemPrompt({ hasAttachments: parts.length > 0, document }),
    messages,
    tools: chatTools,
    providerOptions: buildProviderOptions(provider, model),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error("[ai/chat] stream error:", error);
    },
  });

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, frame: object) =>
    controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            send(controller, { type: "delta", text: part.text });
          } else if (part.type === "tool-call") {
            send(controller, { type: "tool", name: part.toolName, input: part.input });
          } else if (part.type === "finish") {
            usage = {
              inputTokens: part.totalUsage.inputTokens ?? 0,
              outputTokens: part.totalUsage.outputTokens ?? 0,
            };
          } else if (part.type === "error") {
            controller.error(
              part.error instanceof Error ? part.error : new Error("AI 응답 중 오류가 발생했습니다."),
            );
            return;
          }
        }
        send(controller, { type: "done", usage, provider, model });
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error("AI 응답 중 오류가 발생했습니다."));
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/app/api/ai/chat/route.test.ts && pnpm typecheck`
Expected: PASS (7 tests). 만약 `part.input`/`part.toolName` 타입 오류가 나면 `fullStream` 파트 유니온에서 `tool-call` 판별 후 접근하는 것이므로 정상이어야 한다 — 오류 시 `@vitest-environment node`와 `ai` 모킹이 패스스루(tool/jsonSchema)인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/ai/chat/route.ts src/app/api/ai/chat/route.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): /api/ai/chat 스트리밍 라우트(메시지+문서+도구)

fullStream의 text-delta/tool-call/finish를 NDJSON delta/tool/done으로 송출.
현재 문서를 시스템 프롬프트에 주입, 마지막 user 턴에만 첨부.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 에디터 편집 적용기 `apply-edits-to-editor`

**Files:**
- Create: `src/components/workspace/apply-edits-to-editor.ts`
- Test: `src/components/workspace/apply-edits-to-editor.test.ts`

**Interfaces:**
- Consumes: `EditorView` from `@codemirror/view`; `applyEdits` (Task 1); `EDIT_TOOL`, `WRITE_TOOL`, `EditDocumentInput`, `WriteDocumentInput` (Task 2).
- Produces: `applyToolFrame(view: EditorView, frame: { name: string; input: unknown }): { kind: "edit" | "write"; failed: boolean }`. `write_document`은 전체 교체, `edit_document`은 `applyEdits` 결과를 트랜잭션 1회로 교체. 알 수 없는 도구/빈 입력은 `failed:true`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/components/workspace/apply-edits-to-editor.test.ts
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyToolFrame } from "./apply-edits-to-editor";

function makeView(doc: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc }) });
}

describe("applyToolFrame", () => {
  it("write_document는 문서 전체를 교체한다", () => {
    const view = makeView("옛 내용");
    const r = applyToolFrame(view, { name: "write_document", input: { content: "# 새 문서\n본문" } });
    expect(view.state.doc.toString()).toBe("# 새 문서\n본문");
    expect(r).toEqual({ kind: "write", failed: false });
  });

  it("edit_document는 부분 치환을 트랜잭션 1회로 반영한다", () => {
    const view = makeView("제목: 옛날\n본문");
    const r = applyToolFrame(view, {
      name: "edit_document",
      input: { edits: [{ find: "옛날", replace: "새날" }] },
    });
    expect(view.state.doc.toString()).toBe("제목: 새날\n본문");
    expect(r).toEqual({ kind: "edit", failed: false });
  });

  it("edit_document에서 일치하지 않는 find가 있으면 failed:true", () => {
    const view = makeView("hello");
    const r = applyToolFrame(view, {
      name: "edit_document",
      input: { edits: [{ find: "zzz", replace: "x" }] },
    });
    expect(view.state.doc.toString()).toBe("hello");
    expect(r).toEqual({ kind: "edit", failed: true });
  });

  it("edit_document 트랜잭션은 undo 1스텝으로 되돌릴 수 있다", () => {
    const view = makeView("foo");
    applyToolFrame(view, { name: "edit_document", input: { edits: [{ find: "foo", replace: "bar" }] } });
    expect(view.state.doc.toString()).toBe("bar");
    // @codemirror/commands의 undo는 history 확장이 필요하므로, 여기선 변경 자체만 검증한다.
    // (네이티브 undo 동작은 Task 8 통합 + 수동 스모크에서 확인.)
  });

  it("알 수 없는 도구나 빈 입력은 failed:true로 처리한다", () => {
    const view = makeView("hello");
    const r = applyToolFrame(view, { name: "unknown_tool", input: {} });
    expect(view.state.doc.toString()).toBe("hello");
    expect(r.failed).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/components/workspace/apply-edits-to-editor.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/components/workspace/apply-edits-to-editor.ts
import { EditorView } from "@codemirror/view";
import { applyEdits } from "@/lib/quarto/apply-edits";
import { EDIT_TOOL, WRITE_TOOL, type EditDocumentInput, type WriteDocumentInput } from "@/lib/ai/tools";

export type ToolFrame = { name: string; input: unknown };
export type ApplyResult = { kind: "edit" | "write"; failed: boolean };

/**
 * 모델의 도구 호출(tool 프레임)을 에디터에 반영한다.
 * - write_document: 문서 전체를 트랜잭션 1회로 교체(undo 1스텝).
 * - edit_document: applyEdits로 부분 치환한 새 전문을 트랜잭션 1회로 교체.
 * 변경은 일반 dispatch라 CodeMirror undo 히스토리에 쌓여 Cmd+Z로 되돌릴 수 있다.
 * 프로그램 dispatch는 readOnly 상태에서도 적용된다(readOnly는 사용자 입력만 막음).
 */
export function applyToolFrame(view: EditorView, frame: ToolFrame): ApplyResult {
  if (frame.name === WRITE_TOOL) {
    const content = (frame.input as WriteDocumentInput)?.content;
    if (typeof content !== "string") return { kind: "write", failed: true };
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    return { kind: "write", failed: false };
  }

  if (frame.name === EDIT_TOOL) {
    const edits = (frame.input as EditDocumentInput)?.edits;
    if (!Array.isArray(edits) || edits.length === 0) return { kind: "edit", failed: true };
    const current = view.state.doc.toString();
    const { content, results } = applyEdits(current, edits);
    if (content !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
    return { kind: "edit", failed: results.some((r) => !r.ok) };
  }

  // 알 수 없는 도구
  return { kind: "edit", failed: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/components/workspace/apply-edits-to-editor.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/components/workspace/apply-edits-to-editor.ts src/components/workspace/apply-edits-to-editor.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 도구 프레임 → 에디터 적용기 applyToolFrame

write_document 전체 교체 / edit_document 부분 치환을 트랜잭션 1회로 반영.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 채팅 훅 `use-ai-chat`

**Files:**
- Create: `src/components/workspace/use-ai-chat.ts`
- Test: `src/components/workspace/use-ai-chat.test.ts`

**Interfaces:**
- Consumes: `applyToolFrame` (Task 5); `getActiveCredentials`, `loadSettings` from `@/lib/ai/settings`; `estimateCostUsd` from `@/lib/ai/pricing`; `EditorView` from `@codemirror/view`.
- Produces:
  - `type ChatMessage = { id: string; role: "user" | "assistant"; text: string; pending?: boolean; edited?: "edit" | "write"; editFailed?: boolean; error?: boolean; usage?: { inputTokens: number; outputTokens: number; costUsd: number | null; elapsedMs: number } | null }`.
  - `useAiChat(getContent: () => string, editorViewRef: RefObject<EditorView | null>): { messages: ChatMessage[]; generating: boolean; aiEditedThisSession: boolean; send: (prompt: string, files: File[]) => Promise<void>; stop: () => void; resetChat: () => void }`.
- 동작: `send`는 user 메시지 + pending assistant 메시지를 추가하고 `/api/ai/chat`로 POST. NDJSON `delta`→assistant text 누적, `tool`→`applyToolFrame` 호출 + `edited`/`editFailed` 표시 + `aiEditedThisSession=true`, `done`→usage·pending 해제. 에러→assistant.error. `stop`은 abort. `resetChat`은 abort + 메시지/플래그 초기화.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/components/workspace/use-ai-chat.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAiChat } from "./use-ai-chat";

vi.mock("./apply-edits-to-editor", () => ({
  applyToolFrame: vi.fn(() => ({ kind: "edit", failed: false })),
}));
import { applyToolFrame } from "./apply-edits-to-editor";
const mockApply = vi.mocked(applyToolFrame);

function ndjsonResponse(frames: object[]): Response {
  const body = frames.map((f) => JSON.stringify(f) + "\n").join("");
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(body));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

const editorRef = { current: { state: { doc: { toString: () => "현재 문서" } } } as never };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({
      provider: "anthropic",
      anthropic: { apiKey: "sk-test", model: "claude-sonnet-4-6" },
      openai: { apiKey: "", model: "" },
    }),
  );
});

describe("useAiChat", () => {
  it("delta 프레임을 assistant 메시지에 누적하고 done에서 usage를 기록한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "delta", text: "안녕" },
          { type: "delta", text: "하세요!" },
          { type: "done", usage: { inputTokens: 10, outputTokens: 4 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("안녕!", []);
    });
    const msgs = result.current.messages;
    expect(msgs[0]).toMatchObject({ role: "user", text: "안녕!" });
    const assistant = msgs[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.text).toBe("안녕하세요!");
    expect(assistant.pending).toBeFalsy();
    expect(assistant.usage?.inputTokens).toBe(10);
    // 잡담이므로 도구 미호출 → 에디터 변경 없음
    expect(mockApply).not.toHaveBeenCalled();
    expect(result.current.aiEditedThisSession).toBe(false);
    vi.unstubAllGlobals();
  });

  it("tool 프레임이 오면 applyToolFrame을 호출하고 aiEditedThisSession을 켠다", async () => {
    mockApply.mockReturnValueOnce({ kind: "write", failed: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "delta", text: "문서를 만들었어요." },
          { type: "tool", name: "write_document", input: { content: "# 새 문서" } },
          { type: "done", usage: { inputTokens: 5, outputTokens: 9 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("iris 보고서 만들어줘", []);
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(result.current.aiEditedThisSession).toBe(true);
    expect(result.current.messages[1].edited).toBe("write");
    vi.unstubAllGlobals();
  });

  it("스트림 reader가 reject하면 assistant 메시지를 error로 표시한다", async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "delta", text: "부분" }) + "\n"));
        c.error(new Error("stream fail"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(failing, { status: 200 })),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("뭔가", []);
    });
    await waitFor(() => expect(result.current.messages[1].error).toBe(true));
    vi.unstubAllGlobals();
  });

  it("키가 없으면 전송하지 않고 안내 에러 메시지를 남긴다", async () => {
    window.localStorage.setItem(
      "quarto-studio:ai-settings",
      JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "", model: "m" }, openai: { apiKey: "", model: "" } }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("안녕", []);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages.some((m) => m.role === "assistant" && m.error)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("resetChat은 메시지와 aiEditedThisSession을 초기화한다", async () => {
    mockApply.mockReturnValueOnce({ kind: "edit", failed: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "tool", name: "edit_document", input: { edits: [{ find: "a", replace: "b" }] } },
          { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, provider: "anthropic", model: "claude-sonnet-4-6" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat(() => "현재 문서", editorRef));
    await act(async () => {
      await result.current.send("a를 b로", []);
    });
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.aiEditedThisSession).toBe(true);
    act(() => result.current.resetChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.aiEditedThisSession).toBe(false);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/components/workspace/use-ai-chat.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/components/workspace/use-ai-chat.ts
import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { getActiveCredentials, loadSettings, type AiProvider } from "@/lib/ai/settings";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { applyToolFrame } from "./apply-edits-to-editor";

export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  elapsedMs: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  edited?: "edit" | "write";
  editFailed?: boolean;
  error?: boolean;
  usage?: ChatUsage | null;
};

type StreamFrame =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number }; provider?: AiProvider; model?: string };

let counter = 0;
function newId(): string {
  counter += 1;
  return `m-${counter}-${Math.round(performance.now())}`;
}

export function useAiChat(
  getContent: () => string,
  editorViewRef: RefObject<EditorView | null>,
): {
  messages: ChatMessage[];
  generating: boolean;
  aiEditedThisSession: boolean;
  send: (prompt: string, files: File[]) => Promise<void>;
  stop: () => void;
  resetChat: () => void;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [aiEditedThisSession, setAiEditedThisSession] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (prompt: string, files: File[]) => {
      const creds = getActiveCredentials(loadSettings());
      const userMsg: ChatMessage = { id: newId(), role: "user", text: prompt };
      const assistantId = newId();

      if (!creds.apiKey) {
        setMessages((cur) => [
          ...cur,
          userMsg,
          { id: assistantId, role: "assistant", text: "설정에서 API 키를 입력해주세요.", error: true },
        ]);
        return;
      }

      // history는 새 user 메시지를 포함해 직전 대화 텍스트만 보낸다.
      const history = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }));
      const document = getContent();

      setMessages((cur) => [
        ...cur,
        userMsg,
        { id: assistantId, role: "assistant", text: "", pending: true },
      ]);
      setGenerating(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = performance.now();

      try {
        const fd = new FormData();
        fd.set("provider", creds.provider);
        fd.set("model", creds.model);
        fd.set("messages", JSON.stringify(history));
        fd.set("document", document);
        for (const f of files) fd.append("files", f);

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          body: fd,
          headers: { "x-provider-key": creds.apiKey },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `요청에 실패했습니다 (${res.status})`);
        }
        if (!res.body) throw new Error("응답 스트림을 읽을 수 없습니다.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        const collected = { usage: null as { inputTokens: number; outputTokens: number } | null };

        const handleFrame = (line: string) => {
          if (!line) return;
          const frame = JSON.parse(line) as StreamFrame;
          if (frame.type === "delta") {
            accumulated += frame.text;
            patchMessage(assistantId, { text: accumulated });
          } else if (frame.type === "tool") {
            const view = editorViewRef.current;
            const r = view
              ? applyToolFrame(view, { name: frame.name, input: frame.input })
              : { kind: "edit" as const, failed: true };
            setAiEditedThisSession(true);
            patchMessage(assistantId, { edited: r.kind, editFailed: r.failed });
          } else if (frame.type === "done") {
            collected.usage = frame.usage;
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            handleFrame(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
          }
        }
        handleFrame(buffer.trim());

        const usage = collected.usage;
        patchMessage(assistantId, {
          pending: false,
          usage: usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                costUsd: estimateCostUsd(creds.provider, creds.model, usage),
                elapsedMs: performance.now() - startedAt,
              }
            : null,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          // 사용자가 중단: 부분 텍스트와 이미 적용된 편집은 유지하고 pending만 해제.
          patchMessage(assistantId, { pending: false });
        } else {
          patchMessage(assistantId, {
            pending: false,
            error: true,
            text: e instanceof Error ? e.message : "응답 중 오류가 발생했습니다.",
          });
        }
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    [messages, getContent, editorViewRef, patchMessage],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setGenerating(false);
    setAiEditedThisSession(false);
  }, []);

  return { messages, generating, aiEditedThisSession, send, stop, resetChat };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/components/workspace/use-ai-chat.test.ts && pnpm typecheck`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/components/workspace/use-ai-chat.ts src/components/workspace/use-ai-chat.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 채팅 훅 useAiChat

메시지 상태/스트리밍 읽기/도구 프레임 적용/aiEditedThisSession/중단·초기화.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 채팅 프레젠테이션 컴포넌트 (메시지 목록 + 작성기) + 스타일

**Files:**
- Create: `src/components/workspace/ai-message-list.tsx`, `src/components/workspace/ai-message-list.test.tsx`
- Create: `src/components/workspace/ai-composer.tsx`, `src/components/workspace/ai-composer.test.tsx`
- Modify: `src/app/globals.css` (채팅 말풍선·작성기 스타일 추가)

**Interfaces:**
- Consumes: `ChatMessage` (Task 6); `loadSettings`, `getActiveCredentials` from `@/lib/ai/settings`; `validatePrompt`, `validateAttachments`, 한도 상수 from `@/lib/ai/validation`; `formatUsd`, `formatDuration` from `@/lib/ai/pricing`.
- Produces:
  - `AiMessageList({ messages, generating }: { messages: ChatMessage[]; generating: boolean })`.
  - `AiComposer({ generating, isBusy, onSend, onStop, onOpenSettings }: { generating: boolean; isBusy: boolean; onSend: (prompt: string, files: File[]) => void; onStop: () => void; onOpenSettings: () => void })`.

- [ ] **Step 1: 메시지 목록 실패 테스트 작성**

```tsx
// src/components/workspace/ai-message-list.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiMessageList } from "./ai-message-list";
import type { ChatMessage } from "./use-ai-chat";

describe("AiMessageList", () => {
  it("메시지가 없으면 빈 상태 안내를 보여준다", () => {
    render(<AiMessageList messages={[]} generating={false} />);
    expect(screen.getByText(/만들고 싶은/)).toBeTruthy();
  });

  it("user/assistant 메시지를 렌더한다", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "안녕!" },
      { id: "2", role: "assistant", text: "안녕하세요!" },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText("안녕!")).toBeTruthy();
    expect(screen.getByText("안녕하세요!")).toBeTruthy();
  });

  it("편집이 적용된 어시스턴트 메시지에 수정 칩을 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "고쳤어요", edited: "edit" },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/문서 수정됨/)).toBeTruthy();
  });

  it("전체 작성 칩과 일부 실패 주석을 구분해 보여준다", () => {
    const messages: ChatMessage[] = [
      { id: "2", role: "assistant", text: "작성", edited: "write" },
      { id: "3", role: "assistant", text: "일부", edited: "edit", editFailed: true },
    ];
    render(<AiMessageList messages={messages} generating={false} />);
    expect(screen.getByText(/문서 작성됨/)).toBeTruthy();
    expect(screen.getByText(/일부 편집 미적용/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 메시지 목록 테스트 실패 확인**

Run: `pnpm test src/components/workspace/ai-message-list.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 메시지 목록 구현**

```tsx
// src/components/workspace/ai-message-list.tsx
"use client";

import { useEffect, useRef } from "react";
import { Pencil, FileText } from "lucide-react";
import { formatUsd, formatDuration } from "@/lib/ai/pricing";
import type { ChatMessage } from "./use-ai-chat";

export function AiMessageList({
  messages,
  generating,
}: {
  messages: ChatMessage[];
  generating: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // 새 메시지/스트리밍 갱신 시 바닥으로(채팅 stick-to-bottom).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, generating]);

  if (messages.length === 0) {
    return (
      <div className="ai-chat-empty">
        <p>문서에 대해 묻거나, 만들고 싶은 걸 말해보세요.</p>
      </div>
    );
  }

  return (
    <div className="ai-chat-list">
      {messages.map((m) => (
        <div key={m.id} className={`ai-msg ai-msg-${m.role}`}>
          <div className={`ai-bubble ${m.error ? "ai-bubble-error" : ""}`}>
            {m.text || (m.pending ? "…" : "")}
          </div>
          {m.edited === "write" && (
            <span className="ai-edit-chip">
              <FileText size={12} aria-hidden="true" /> 문서 작성됨
            </span>
          )}
          {m.edited === "edit" && (
            <span className="ai-edit-chip">
              <Pencil size={12} aria-hidden="true" /> 문서 수정됨
            </span>
          )}
          {m.editFailed && <span className="ai-edit-warn">일부 편집 미적용</span>}
          {m.usage && (
            <span className="ai-msg-usage">
              {(m.usage.inputTokens + m.usage.outputTokens).toLocaleString()} 토큰 ·{" "}
              {m.usage.costUsd === null ? "—" : formatUsd(m.usage.costUsd)} ·{" "}
              {formatDuration(m.usage.elapsedMs)}
            </span>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 4: 메시지 목록 테스트 통과 확인**

Run: `pnpm test src/components/workspace/ai-message-list.test.tsx`
Expected: PASS (4 tests). (jsdom에 `scrollIntoView`가 없으면 no-op이라 무해 — 필요 시 테스트 setup에 `Element.prototype.scrollIntoView = () => {}` 추가.)

- [ ] **Step 5: 작성기 실패 테스트 작성**

```tsx
// src/components/workspace/ai-composer.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiComposer } from "./ai-composer";

beforeEach(() => {
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "sk", model: "m" }, openai: { apiKey: "", model: "" } }),
  );
});

const baseProps = { generating: false, isBusy: false, onStop: vi.fn(), onOpenSettings: vi.fn() };

describe("AiComposer", () => {
  it("Enter로 전송하고 입력을 비운다", () => {
    const onSend = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} />);
    const ta = screen.getByLabelText("AI 메시지 입력") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "안녕!" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("안녕!", []);
    expect(ta.value).toBe("");
  });

  it("Shift+Enter는 전송하지 않는다", () => {
    const onSend = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} />);
    const ta = screen.getByLabelText("AI 메시지 입력");
    fireEvent.change(ta, { target: { value: "여러\n줄" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("빈 입력은 전송하지 않는다", () => {
    const onSend = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} />);
    const ta = screen.getByLabelText("AI 메시지 입력");
    fireEvent.change(ta, { target: { value: "   " } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("API 키가 없으면 전송 대신 안내 에러와 설정 링크를 보여준다", () => {
    window.localStorage.setItem(
      "quarto-studio:ai-settings",
      JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "", model: "m" }, openai: { apiKey: "", model: "" } }),
    );
    const onSend = vi.fn();
    const onOpenSettings = vi.fn();
    render(<AiComposer {...baseProps} onSend={onSend} onOpenSettings={onOpenSettings} />);
    const ta = screen.getByLabelText("AI 메시지 입력");
    fireEvent.change(ta, { target: { value: "안녕" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("설정 열기"));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("generating이면 전송 대신 중단 버튼을 보여준다", () => {
    render(<AiComposer {...baseProps} generating onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    expect(baseProps.onStop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: 작성기 테스트 실패 확인**

Run: `pnpm test src/components/workspace/ai-composer.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 7: 작성기 구현**

```tsx
// src/components/workspace/ai-composer.tsx
"use client";

import { useState } from "react";
import { Paperclip, Send, Square, X } from "lucide-react";
import { getActiveCredentials, loadSettings } from "@/lib/ai/settings";
import {
  validatePrompt,
  validateAttachments,
  MAX_PROMPT_LENGTH,
  MAX_ATTACHMENTS,
  ALLOWED_EXTENSIONS,
} from "@/lib/ai/validation";

const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function AiComposer({
  generating,
  isBusy,
  onSend,
  onStop,
  onOpenSettings,
}: {
  generating: boolean;
  isBusy: boolean;
  onSend: (prompt: string, files: File[]) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    setFiles((cur) => cur.filter((_, i) => i !== index));
  }

  function submit() {
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
    onSend(prompt, files);
    setPrompt("");
    setFiles([]);
  }

  return (
    <div className="ai-composer">
      {files.length > 0 && (
        <ul className="ai-chip-list">
          {files.map((file, index) => (
            <li className="ai-chip" key={`${file.name}-${file.size}-${index}`}>
              <span className="ai-chip-name">{file.name}</span>
              <span className="ai-chip-size">{formatSize(file.size)}</span>
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
      <div className="ai-composer-row">
        <label className="ai-attach-button">
          <Paperclip size={14} aria-hidden="true" />
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
        <textarea
          aria-label="AI 메시지 입력"
          className="ai-composer-input"
          value={prompt}
          maxLength={MAX_PROMPT_LENGTH}
          disabled={generating}
          placeholder="메시지를 입력하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {generating ? (
          <button type="button" className="ai-send-button" aria-label="중단" onClick={onStop}>
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="ai-send-button"
            aria-label="전송"
            disabled={isBusy}
            onClick={submit}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <span className="ai-attach-meta">
        {files.length} / {MAX_ATTACHMENTS}개
      </span>
    </div>
  );
}
```

- [ ] **Step 8: 작성기 테스트 통과 확인**

Run: `pnpm test src/components/workspace/ai-composer.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 9: 스타일 추가 (globals.css)**

`src/app/globals.css`의 기존 `.ai-drawer-body { ... }`(약 1367행) 정의 바로 아래에 다음 블록을 추가한다. (기존 `.ai-chip*`, `.ai-attach*`, `.ai-error`, `.ai-link`는 재사용한다.)

```css
/* 대화형 채팅 */
.ai-chat-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.ai-chat-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--fg-subtle); font-size: 13px; padding: 16px; }
.ai-msg { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
.ai-msg-user { align-items: flex-end; }
.ai-msg-assistant { align-items: flex-start; }
.ai-bubble { max-width: 88%; padding: 8px 11px; border-radius: 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.ai-msg-user .ai-bubble { background: var(--accent-dim); color: var(--fg); border-bottom-right-radius: 4px; }
.ai-msg-assistant .ai-bubble { background: var(--bg-active); color: var(--fg); border-bottom-left-radius: 4px; }
.ai-bubble-error { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
.ai-edit-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--accent); }
.ai-edit-warn { font-size: 11px; color: var(--fg-subtle); }
.ai-msg-usage { font-size: 10px; color: var(--fg-subtle); font-family: var(--font-mono); }
.ai-composer { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 8px; }
.ai-composer-row { display: flex; align-items: flex-end; gap: 6px; }
.ai-composer-input { flex: 1; min-height: 38px; max-height: 140px; resize: none; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input); color: var(--fg); font-family: inherit; font-size: 13px; line-height: 1.5; }
.ai-composer-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); outline: none; }
.ai-composer-input::placeholder { color: var(--fg-subtle); }
.ai-send-button { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex-shrink: 0; border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
.ai-send-button:disabled { opacity: 0.5; cursor: not-allowed; }
```

> 참고: 토큰명(`--bg-input` 등)은 기존 `globals.css`의 사용 패턴을 따른다. 정의되지 않은 토큰이 있으면 `.ai-prompt`(약 1383행)에서 쓰는 토큰으로 맞춘다.

- [ ] **Step 10: 전체 컴포넌트 테스트 + 타입 확인**

Run: `pnpm test src/components/workspace/ai-message-list.test.tsx src/components/workspace/ai-composer.test.tsx && pnpm typecheck`
Expected: PASS (9 tests).

- [ ] **Step 11: 커밋**

```bash
git add src/components/workspace/ai-message-list.tsx src/components/workspace/ai-message-list.test.tsx src/components/workspace/ai-composer.tsx src/components/workspace/ai-composer.test.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(ai): 채팅 메시지 목록 + 작성기 컴포넌트

말풍선/편집 칩/턴별 사용량, Enter 전송·Shift+Enter 줄바꿈·키 검증.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 워크스페이스 통합 교체 (드로어·에디터패널·워크스페이스 + 구 파일 제거)

**Files:**
- Modify: `src/components/workspace/ai-drawer.tsx`, `src/components/workspace/ai-drawer.test.tsx`
- Modify: `src/components/workspace/editor-pane.tsx`
- Modify: `src/components/workspace/quarto-workspace.tsx`, `src/components/workspace/quarto-workspace.test.tsx`
- Modify: `src/lib/ai/system-prompt.ts`, `src/lib/ai/system-prompt.test.ts` (구 `buildSystemPrompt` 제거)
- Remove: `src/app/api/ai/generate/route.ts`, `src/app/api/ai/generate/route.test.ts`
- Remove: `src/components/workspace/use-ai-generation.ts`, `src/components/workspace/use-ai-generation.test.ts`
- Remove: `src/components/workspace/stream-into-editor.ts`, `src/components/workspace/stream-into-editor.test.ts`

**Interfaces:**
- Consumes: `useAiChat`, `ChatMessage` (Task 6); `AiMessageList`, `AiComposer` (Task 7).
- `AiDrawer` 새 프롭: `{ open: boolean; onToggle: () => void; isBusy: boolean; generating: boolean; messages: ChatMessage[]; onSend: (prompt: string, files: File[]) => void; onStop: () => void; onOpenSettings: () => void }`.
- `EditorPane` 프롭 변경: 기존 `aiHandlers: AiGenerationHandlers` 제거 → `generating: boolean`, `messages: ChatMessage[]`, `onSendAi: (prompt: string, files: File[]) => void`, `onStopAi: () => void` 추가(`aiDrawerOpen`, `onToggleAiDrawer`, `onOpenSettings`, `onEditorReady`는 유지).

- [ ] **Step 1: `ai-drawer.tsx` 채팅 셸로 재작성**

```tsx
// src/components/workspace/ai-drawer.tsx
"use client";

import { Sparkles, X } from "lucide-react";
import { AiMessageList } from "./ai-message-list";
import { AiComposer } from "./ai-composer";
import type { ChatMessage } from "./use-ai-chat";

export type AiDrawerProps = {
  open: boolean;
  onToggle: () => void;
  isBusy: boolean;
  generating: boolean;
  messages: ChatMessage[];
  onSend: (prompt: string, files: File[]) => void;
  onStop: () => void;
  onOpenSettings: () => void;
};

export function AiDrawer({
  open,
  onToggle,
  isBusy,
  generating,
  messages,
  onSend,
  onStop,
  onOpenSettings,
}: AiDrawerProps) {
  return (
    <div className={`ai-drawer ${open ? "open" : ""}`}>
      {open && (
        <>
          <div className="ai-drawer-header">
            <Sparkles size={15} className="ai-drawer-icon" aria-hidden="true" />
            <span className="ai-drawer-title">AI 작성</span>
            <button
              type="button"
              className="ai-drawer-close"
              aria-label="AI 작성 닫기"
              onClick={onToggle}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="ai-drawer-body">
            <AiMessageList messages={messages} generating={generating} />
            <AiComposer
              generating={generating}
              isBusy={isBusy}
              onSend={onSend}
              onStop={onStop}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `editor-pane.tsx` 프롭 교체**

`src/components/workspace/editor-pane.tsx`에서 `AiGenerationHandlers` import와 `aiHandlers` 프롭을 제거하고 채팅 프롭으로 바꾼다. 변경 후 전체 파일:

```tsx
// src/components/workspace/editor-pane.tsx
import { Play, Sparkles } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import CodeEditor from "./code-editor";
import { AiDrawer } from "./ai-drawer";
import type { ChatMessage } from "./use-ai-chat";

type EditorPaneProps = {
  documentId: string;
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  isBusy: boolean;
  aiDrawerOpen: boolean;
  generating: boolean;
  messages: ChatMessage[];
  onSendAi: (prompt: string, files: File[]) => void;
  onStopAi: () => void;
  onToggleAiDrawer: () => void;
  onOpenSettings: () => void;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onExecuteCodeChange: (value: boolean) => void;
  onRender: () => void;
  onEditorReady?: (view: EditorView) => void;
};

export function EditorPane({
  documentId,
  title,
  slug,
  content,
  executeCode,
  isBusy,
  aiDrawerOpen,
  generating,
  messages,
  onSendAi,
  onStopAi,
  onToggleAiDrawer,
  onOpenSettings,
  onTitleChange,
  onSlugChange,
  onContentChange,
  onExecuteCodeChange,
  onRender,
  onEditorReady,
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
            <span className={`seg-item ${aiDrawerOpen ? "active" : ""}`}>
              <Sparkles size={14} aria-hidden="true" />
              AI 작성
            </span>
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
      <CodeEditor
        key={`editor-${documentId}`}
        value={content}
        onChange={onContentChange}
        readOnly={isBusy}
        onCreateEditor={onEditorReady}
      />
      <AiDrawer
        key={`drawer-${documentId}`}
        open={aiDrawerOpen}
        onToggle={onToggleAiDrawer}
        isBusy={isBusy}
        generating={generating}
        messages={messages}
        onSend={onSendAi}
        onStop={onStopAi}
        onOpenSettings={onOpenSettings}
      />
    </section>
  );
}
```

- [ ] **Step 3: `quarto-workspace.tsx` 배선 교체**

`src/components/workspace/quarto-workspace.tsx`에서 다음을 바꾼다.

(a) import 교체:
```tsx
// 변경 전: import { useAiGeneration } from "./use-ai-generation";
import { useAiChat } from "./use-ai-chat";
```

(b) 훅 사용부(약 55~66행) 교체:
```tsx
  // 변경 전: setDraftContent + useAiGeneration(...) + aiDirty(generating || pendingRevert)
  const editorViewRef = useRef<EditorView | null>(null);
  const { messages, generating, aiEditedThisSession, send: sendAi, stop: stopAi, resetChat } =
    useAiChat(() => draft.content, editorViewRef);
  // 생성 중이거나 AI가 이번 세션에 편집한 뒤면 '미확정' 상태 — 이탈 가드 대상.
  const aiDirty = generating || aiEditedThisSession;
```
> `setDraftContent`(기존 `useAiGeneration`의 2번째 인자)는 더 이상 필요 없다 — 도구 적용이 `view.dispatch`로 이뤄지고 CodeMirror의 `onChange`가 `onContentChange`(draft.content)를 동기화한다. 해당 `useCallback` 정의를 제거한다.

(c) 문서 전환 초기화 effect(약 217~219행) 교체:
```tsx
  // 변경 전: useEffect(() => { resetGeneration(); }, [draft.id, resetGeneration]);
  useEffect(() => {
    resetChat();
  }, [draft.id, resetChat]);
```

(d) `handleSelectDocument`의 확인 문구(약 271~279행) 교체:
```tsx
    if (
      aiDirty &&
      !window.confirm(
        "AI가 편집한 내용이 있습니다. 다른 문서로 이동하면 실행취소(Cmd+Z) 기록이 사라집니다. 계속할까요?",
      )
    ) {
      return;
    }
```

(e) `<EditorPane .../>`에 넘기던 `aiHandlers={aiHandlers}`를 제거하고 채팅 프롭으로 교체:
```tsx
        <EditorPane
          documentId={draft.id}
          title={draft.title}
          slug={draft.slug}
          content={draft.content}
          executeCode={draft.executeCode}
          isBusy={paneBusy}
          aiDrawerOpen={aiDrawerOpen}
          generating={generating}
          messages={messages}
          onSendAi={sendAi}
          onStopAi={stopAi}
          onToggleAiDrawer={() => setAiDrawerOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
          onTitleChange={(title) => setDraft((current) => ({ ...current, title }))}
          onSlugChange={(slug) => setDraft((current) => ({ ...current, slug }))}
          onContentChange={(content) => setDraft((current) => ({ ...current, content }))}
          onExecuteCodeChange={(executeCode) => setDraft((current) => ({ ...current, executeCode }))}
          onRender={handleRender}
          onEditorReady={(view) => {
            editorViewRef.current = view;
          }}
        />
```
> `beforeunload` effect(약 223~231행)와 `paneBusy`(`isPending || isRendering || generating`)는 그대로 둔다. `aiDirty`만 의미가 바뀐다.

- [ ] **Step 4: 구 파일 제거 + 시스템 프롬프트 정리**

```bash
git rm src/app/api/ai/generate/route.ts src/app/api/ai/generate/route.test.ts
git rm src/components/workspace/use-ai-generation.ts src/components/workspace/use-ai-generation.test.ts
git rm src/components/workspace/stream-into-editor.ts src/components/workspace/stream-into-editor.test.ts
```

`src/lib/ai/system-prompt.ts`에서 구 `buildSystemPrompt`를 제거한다(이제 사용처 없음 — `chat` 라우트는 `buildChatSystemPrompt` 사용). `src/lib/ai/system-prompt.test.ts`에서 `buildSystemPrompt` 관련 describe를 제거하고 `buildChatSystemPrompt` describe만 남긴다.

> 확인: `grep -rn "buildSystemPrompt\b" src` 결과가 없어야 한다(있다면 그 사용처도 정리).

- [ ] **Step 5: `ai-drawer.test.tsx` 재작성**

```tsx
// src/components/workspace/ai-drawer.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiDrawer } from "./ai-drawer";
import type { ChatMessage } from "./use-ai-chat";

beforeEach(() => {
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "sk", model: "m" }, openai: { apiKey: "", model: "" } }),
  );
});

const baseProps = {
  open: true,
  onToggle: vi.fn(),
  isBusy: false,
  generating: false,
  onSend: vi.fn(),
  onStop: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe("AiDrawer (채팅)", () => {
  it("열려 있으면 헤더·작성기를 보여준다", () => {
    render(<AiDrawer {...baseProps} messages={[]} />);
    expect(screen.getByText("AI 작성")).toBeTruthy();
    expect(screen.getByLabelText("AI 메시지 입력")).toBeTruthy();
  });

  it("메시지를 렌더한다", () => {
    const messages: ChatMessage[] = [{ id: "1", role: "user", text: "안녕!" }];
    render(<AiDrawer {...baseProps} messages={messages} />);
    expect(screen.getByText("안녕!")).toBeTruthy();
  });

  it("닫혀 있으면 내용을 렌더하지 않는다", () => {
    render(<AiDrawer {...baseProps} open={false} messages={[]} />);
    expect(screen.queryByLabelText("AI 메시지 입력")).toBeNull();
  });
});
```

- [ ] **Step 6: `quarto-workspace.test.tsx` 업데이트**

기존 워크스페이스 테스트에서 AI 관련 단언을 새 모델에 맞춘다. 구체적으로:
- "문서 이동 시 드로어 닫힘/프롬프트 초기화" 테스트: 생성 트리거를 `생성` 버튼 → **AI 메시지 입력(textarea)에 입력 후 Enter**로 바꾸고, fetch 모킹은 NDJSON(`{type:"tool",...}` + `{type:"done",...}`)으로 바꾼다.
- "미확정 AI 작성분 이동 확인" 테스트: 편집을 발생시키는 흐름(아래)으로 트리거하고, `window.confirm` 문구가 새 문구로 바뀌었으므로 확인/취소 동작만 검증(문구 텍스트 단언은 제거하거나 새 문구로).

새/갱신 테스트 예시(파일 상단 mock 포함):
```tsx
// quarto-workspace.test.tsx 에서 fetch + 적용기 모킹 패턴
vi.mock("./apply-edits-to-editor", () => ({ applyToolFrame: vi.fn(() => ({ kind: "write", failed: false })) }));

function ndjson(frames: object[]): Response {
  const body = frames.map((f) => JSON.stringify(f) + "\n").join("");
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
  });
  return new Response(stream, { status: 200 });
}

// afterEach: vi.unstubAllGlobals(); window.localStorage.clear();
```
```tsx
it("AI가 편집한 뒤 다른 문서로 이동하면 확인을 거친다", async () => {
  window.localStorage.setItem(
    "quarto-studio:ai-settings",
    JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "sk", model: "claude-sonnet-4-6" }, openai: { apiKey: "", model: "" } }),
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjson([
    { type: "delta", text: "문서를 만들었어요." },
    { type: "tool", name: "write_document", input: { content: "# 새 문서" } },
    { type: "done", usage: { inputTokens: 1, outputTokens: 1 }, provider: "anthropic", model: "claude-sonnet-4-6" },
  ])));
  // ... 워크스페이스 렌더 → AI 작성 토글 → textarea 입력 → Enter → "문서 작성됨" 대기 →
  //     다른 문서 선택 → window.confirm 호출됨(취소 시 이동 안 함, 확인 시 이동) 검증
});
```
> 정확한 셀렉터·헬퍼는 기존 `quarto-workspace.test.tsx`의 렌더 헬퍼를 그대로 쓰고, 위 모킹만 교체한다. 구 `생성`/`되돌리기` 버튼을 찾던 단언은 제거한다.

- [ ] **Step 7: 전체 타입·테스트·린트 확인**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: PASS — 구 파일 참조 잔존(`useAiGeneration`/`stream-into-editor`/`buildSystemPrompt`/`/api/ai/generate`)이 없어야 하며 모든 테스트 그린.
확인 보조: `grep -rn "useAiGeneration\|stream-into-editor\|ai/generate\|buildSystemPrompt\b\|AiGenerationHandlers" src` → 결과 없음.

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ai): AI 드로어를 대화형 채팅으로 전환(통합)

useAiChat 배선, 드로어/에디터패널 채팅 프롭, 이탈 가드 aiEditedThisSession 기준.
구 단발 생성 경로 제거(generate 라우트·use-ai-generation·stream-into-editor·buildSystemPrompt).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 전체 검증 + 수동 스모크

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 검증**

Run: `pnpm verify`
Expected: lint·typecheck·test·build 모두 PASS.

- [ ] **Step 2: 로컬 앱 기동**

```bash
# postgres(컨테이너) + 워커 + dev 서버가 떠 있어야 한다.
docker compose up -d postgres
ANTHROPIC_API_KEY 등 환경은 BYOK라 불필요(설정 모달에서 키 입력).
pnpm dev   # 별도 터미널에서 pnpm worker (렌더 스모크용, 선택)
```

- [ ] **Step 3: 수동 스모크 (브라우저)**

설정 모달에서 Anthropic 키 입력 후, AI 작성 드로어를 열고 아래를 확인한다(스펙의 성공 기준):
1. **"안녕!"** 전송 → 채팅으로만 답하고 **에디터는 그대로**(도구 미호출). ✅
2. **"iris 데이터로 산점도 보고서 만들어줘"** → 채팅에 짧은 설명 + `📝 문서 작성됨` 칩 + 에디터에 `.qmd` 채워짐(write_document). ✅
3. **"제목을 '붓꽃 분석'으로 바꿔줘"** → `✎ 문서 수정됨` 칩 + 에디터 제목만 바뀜(edit_document). ✅
4. **Cmd/Ctrl+Z** → 직전 AI 편집이 되돌려짐. ✅
5. 편집 후 **LNB에서 다른 문서 선택** → "실행취소 기록이 사라집니다" 확인창 → 취소 시 유지, 확인 시 이동. **F5**도 동일 경고. ✅
6. 문서 전환 후 드로어 재오픈 → **대화 비어 있음**(휘발성). ✅
7. (선택) 렌더 → 미리보기 정상. ✅

- [ ] **Step 4: 최종 상태 메모**

수동 스모크 결과를 PR 본문/요약에 기록한다(실패 항목이 있으면 systematic-debugging으로 처리). 코드 변경 없음.

---

## Self-Review (작성자 체크 — 기록용)

- **Spec coverage**: 도구 호출(T2/T4/T5) · 부분 편집 우선(T1/T5, 현재 문서 주입 T3/T4) · 휘발성 대화(T6 resetChat, T8 문서전환 초기화) · 네이티브 undo(T5 트랜잭션, 되돌리기 버튼 제거 T8) · 엔드포인트 이전(T4 추가/T8 제거) · 채팅 UI(T7/T8) · 사용량 턴별(T6/T7) · 이탈 가드(T8) · 첨부 메시지별(T6/T7) · 에러 처리(T4/T6/T7) · 테스트(각 Task) — 스펙 항목 모두 매핑됨.
- **Placeholder scan**: 모든 코드 스텝에 완전한 코드 포함. T8 Step 6만 기존 테스트 헬퍼 재사용을 전제로 모킹 교체를 서술(완전 신규 코드가 아닌 기존 파일 갱신이라 해당 부분은 패턴+예시 제공).
- **Type consistency**: `ChatMessage`(T6) → 모든 컴포넌트/프롭 동일 사용. `applyToolFrame(view, {name,input})`(T5) → 훅(T6)에서 동일 시그니처 호출. 도구 이름 상수 `EDIT_TOOL`/`WRITE_TOOL`(T2) → T4/T5에서 재사용. NDJSON 프레임 `delta`/`tool`/`done` → 라우트(T4)·훅(T6) 일치.
