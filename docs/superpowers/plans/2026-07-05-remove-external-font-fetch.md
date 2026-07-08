# 외부 폰트 CDN 의존 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 렌더 sandbox 안에서 외부 폰트(Pretendard CDN, cosmo 테마의 Google Fonts)를 fetch하려는 시도를 완전히 제거해, 네트워크 차단으로 인한 DNS 실패 지연을 없앤다.

**Architecture:** Docker 이미지/Daytona 스냅샷은 건드리지 않는다. `project.ts`가 생성하는 `_quarto.yml`에서 Pretendard `<link>`를 제거하고 시스템 폰트로 폴백하며, `theme: [custom.scss, cosmo]`로 바꿔 cosmo의 Google Fonts `@import`를 SCSS 단계에서 비활성화한다. `custom.scss`(고정 내용)는 `worker/daytona.ts`가 매 렌더마다 `index.qmd`/`_quarto.yml`과 함께 업로드한다.

**Tech Stack:** TypeScript, vitest, Quarto/Bootswatch SCSS 테마 시스템

**스펙:** `docs/superpowers/specs/2026-07-05-remove-external-font-fetch-design.md`

## Global Constraints

- Docker 이미지(`docker/render/Dockerfile`)와 Daytona 스냅샷은 이번 변경 대상이 아니다 — 재빌드 불필요
- 차트(matplotlib/ggplot2/Julia Plots) 폰트 파이프라인(Rprofile.site/matplotlibrc)은 건드리지 않는다 — 이번 변경과 무관
- `theme:` 리스트는 반드시 `[custom.scss, cosmo]` 순서(커스텀 scss가 먼저, 테마 이름이 나중) — 순서가 바뀌면 오버라이드가 적용되지 않음
- 주석은 기존 코드처럼 한국어. 커밋 메시지는 `type(scope): 한국어 요약` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 브랜치는 `feature/remove-external-font-fetch`(이미 체크아웃됨)

## File Structure

| 파일 | 작업 | 책임 |
|---|---|---|
| `src/lib/quarto/project.ts` | 수정 | Pretendard 제거, `CUSTOM_SCSS` 상수 export, `theme:` 변경 |
| `src/lib/quarto/project.test.ts` | 수정 | 기존 Pretendard 검증 테스트를 뒤집고 새 단언 추가 |
| `worker/daytona.ts` | 수정 | `custom.scss` 업로드 추가 |
| `worker/daytona.test.ts` | 수정 | 업로드 횟수/내용 단언 갱신 |

---

### Task 1: `project.ts` — Pretendard 제거 + SCSS 오버라이드 상수

**Files:**
- Modify: `src/lib/quarto/project.ts`
- Test: `src/lib/quarto/project.test.ts`

**Interfaces:**
- Produces (Task 2가 소비): `export const CUSTOM_SCSS: string` — `/*-- scss:rules --*/\n$web-font-path: false;\n` 내용

- [ ] **Step 1: 실패하는 테스트로 교체**

`src/lib/quarto/project.test.ts`의 import 줄(1-2번째 줄)을 교체:

```ts
import { describe, expect, it } from "vitest";
import { buildQuartoProjectFiles, buildQuartoRenderCommand, CUSTOM_SCSS } from "./project";
```

72-81번째 줄의 `"본문 폰트를 Pretendard CDN으로 주입한다(미리보기·다운로드 공통 산출물)"` 테스트를 다음으로 교체:

```ts
  it("Pretendard CDN을 쓰지 않고 시스템 폰트로 폴백한다(네트워크 차단 sandbox에서 fetch 실패 방지)", () => {
    const files = buildQuartoProjectFiles({ content: "# Hello", executeCode: false });

    expect(files.quartoYml).not.toContain("cdn.jsdelivr.net");
    expect(files.quartoYml).not.toContain("Pretendard");
    expect(files.quartoYml).toContain(
      '--bs-body-font-family: -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;',
    );
  });

  it("cosmo 테마의 Google Fonts import를 막기 위해 custom.scss를 theme 리스트 맨 앞에 둔다", () => {
    const files = buildQuartoProjectFiles({ content: "# Hello", executeCode: false });

    expect(files.quartoYml).toContain("theme: [custom.scss, cosmo]");
  });

  it("CUSTOM_SCSS는 $web-font-path를 false로 오버라이드하는 scss:rules 블록이다", () => {
    expect(CUSTOM_SCSS).toContain("/*-- scss:rules --*/");
    expect(CUSTOM_SCSS).toContain("$web-font-path: false;");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/quarto/project.test.ts`
Expected: FAIL — `CUSTOM_SCSS` export 없음, `theme: [custom.scss, cosmo]` 문자열 없음(현재는 `theme: cosmo`), Pretendard 문자열이 여전히 존재

- [ ] **Step 3: `project.ts` 수정**

`src/lib/quarto/project.ts`를 전체 다음 내용으로 교체:

```ts
type QuartoProjectInput = {
  content: string;
  executeCode: boolean;
};

const codeExecutionEngines = new Set(["python", "r"]);

// cosmo(Bootswatch) 테마는 기본으로 Google Fonts(fonts.googleapis.com)를 @import한다.
// 렌더 sandbox는 networkBlockAll이라 embed-resources가 이 리소스를 fetch하려다 DNS
// 실패로 매 렌더마다 지연을 유발한다. $web-font-path를 false로 오버라이드해 이 import
// 자체를 SCSS 컴파일 단계에서 없앤다. theme 리스트에서 이 파일이 테마 이름보다 앞에
// 와야 오버라이드가 적용된다(scss:rules는 테마의 defaults보다 뒤에 평가되어야 함).
export const CUSTOM_SCSS = "/*-- scss:rules --*/\n$web-font-path: false;\n";

function disableExecutableCodeChunks(content: string): string {
  return content
    .split("\n")
    .flatMap((line) => {
      const chunkHeader = line.match(
        /^(\s*)(`{3,}|~{3,})\{([A-Za-z][\w-]*)(?=[\s,}])[^}]*\}\s*$/,
      );

      if (!chunkHeader || !codeExecutionEngines.has(chunkHeader[3].toLowerCase())) {
        return [line];
      }

      return [line, `${chunkHeader[1]}#| eval: false`];
    })
    .join("\n");
}

export function buildQuartoProjectFiles(input: QuartoProjectInput) {
  // 코드 실행 시: 실행은 켜되(eval), 경고(matplotlib 글리프 경고 등 stderr UserWarning)는
  // 렌더된 문서 출력에 섞이지 않게 한다(warning: false). #| echo: false는 코드만 숨길 뿐
  // 경고는 별도 옵션이라, 보고서 산출물이 깔끔하도록 전역 기본으로 끈다.
  const executeConfig = input.executeCode
    ? ["execute:", "  eval: true", "  warning: false"]
    : [];

  return {
    indexQmd: input.executeCode
      ? input.content
      : disableExecutableCodeChunks(input.content),
    quartoYml: [
      "project:",
      "  type: default",
      "format:",
      "  html:",
      "    toc: true",
      "    theme: [custom.scss, cosmo]",
      "    embed-resources: true",
      // 넓은 코드 블록 + 복사 버튼 고정:
      //  1) Quarto 기본은 pre.sourceCode가 overflow:visible이라 넓은 코드가 페이지를 넓힌다.
      //     overflow-x:auto로 덮어 코드가 블록 '안에서' 가로 스크롤되게 한다.
      //  2) 복사 버튼을 스크롤되는 pre가 아니라 비스크롤 컨테이너(div.sourceCode) 기준으로
      //     고정해, 가로 스크롤 중에도 블록 우측 상단에 계속 머무르게 한다.
      "    include-in-header:",
      "      text: |",
      "        <script>",
      "        // 미리보기는 보안상 sandbox(allow-same-origin 없음)라 localStorage 접근이 막힌다.",
      "        // Quarto 번들 JS가 localStorage를 읽다 SecurityError를 던지므로, 무해한 no-op으로 가린다.",
      "        (function(){try{var s={getItem:function(){return null},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null},length:0};Object.defineProperty(window,'localStorage',{value:s,configurable:true});Object.defineProperty(window,'sessionStorage',{value:s,configurable:true});}catch(e){}})();",
      "        </script>",
      "        <style>",
      "        div.sourceCode { position: relative; }",
      "        div.sourceCode > pre.sourceCode { position: static; overflow-x: auto !important; }",
      "        </style>",
      // 본문 폰트는 시스템 한글 폰트로 폴백한다. 렌더 sandbox는 네트워크가 차단되어
      // 있어(networkBlockAll) 커스텀 웹폰트 CDN을 embed-resources가 fetch하면 DNS
      // 실패로 렌더가 지연된다(예전엔 Pretendard CDN을 썼음).
      "        <style>",
      '        :root { --bs-body-font-family: -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; }',
      "        body, h1, h2, h3, h4, h5, h6 { font-family: var(--bs-body-font-family); }",
      "        </style>",
      ...executeConfig,
      "",
    ].join("\n"),
  };
}

export function buildQuartoRenderCommand(): [string, string[]] {
  return ["quarto", ["render", "index.qmd", "--to", "html"]];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/quarto/project.test.ts`
Expected: PASS (전체 — 기존 테스트들도 Pretendard/폰트와 무관하므로 회귀 없음)

- [ ] **Step 5: 커밋**

```bash
pnpm typecheck && pnpm lint
git add src/lib/quarto/project.ts src/lib/quarto/project.test.ts
git commit -m "feat(render): Pretendard CDN 제거하고 시스템 폰트로 폴백, cosmo Google Fonts 비활성화

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `worker/daytona.ts` — `custom.scss` 업로드

**Files:**
- Modify: `worker/daytona.ts`
- Test: `worker/daytona.test.ts`

**Interfaces:**
- Consumes: Task 1의 `CUSTOM_SCSS` (from `../src/lib/quarto/project`)
- Produces: 없음(터미널 소비자) — 단, 이 태스크는 `runQuartoRender`의 업로드 파일 개수를 2개→3개로 바꾸므로, 기존 "성공" 테스트의 `uploadFile` 호출 횟수 단언을 함께 갱신해야 함

- [ ] **Step 1: 기존 테스트 갱신 + 새 단언 추가**

`worker/daytona.test.ts` 상단 import 줄(3번째 줄) 다음에 추가:

```ts
import { CUSTOM_SCSS } from "../src/lib/quarto/project";
```

"성공: 파일 업로드 → 렌더 → index.html 다운로드 → sandbox 삭제" 테스트(61-84번째 줄 부근) 안의 다음 두 줄:

```ts
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
```

를 다음으로 교체:

```ts
    expect(mocks.uploadFile).toHaveBeenCalledTimes(3);
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      Buffer.from(CUSTOM_SCSS, "utf8"),
      "/work/custom.scss",
    );
```

(같은 테스트 안의 `expect(mocks.uploadFile).toHaveBeenCalledTimes(2);` 딱 한 줄만 이 두 줄로 바뀌는 것 — 나머지 단언은 그대로 둔다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run worker/daytona.test.ts -t "성공: 파일 업로드"`
Expected: FAIL — 실제 업로드는 아직 2회뿐이라 `toHaveBeenCalledTimes(3)` 불일치, `/work/custom.scss` 업로드 호출도 없음

- [ ] **Step 3: `daytona.ts`에 업로드 추가**

`worker/daytona.ts` 상단 import(4번째 줄) 다음에 추가:

```ts
import { CUSTOM_SCSS } from "../src/lib/quarto/project";
```

`runQuartoRender` 함수 안, 두 개의 기존 `uploadFile` 호출(94-97번째 줄 부근) 바로 뒤에 한 줄 추가:

```ts
    await sandbox.fs.createFolder(WORK_DIR, "755");
    await sandbox.fs.uploadFile(Buffer.from(files.indexQmd, "utf8"), `${WORK_DIR}/index.qmd`);
    await sandbox.fs.uploadFile(Buffer.from(files.quartoYml, "utf8"), `${WORK_DIR}/_quarto.yml`);
    // cosmo 테마의 Google Fonts import를 SCSS 단계에서 비활성화(네트워크 차단 sandbox에서
    // embed-resources가 fetch를 시도하다 실패하며 렌더가 지연되는 것을 방지).
    await sandbox.fs.uploadFile(Buffer.from(CUSTOM_SCSS, "utf8"), `${WORK_DIR}/custom.scss`);
    if (signal?.aborted) return { kind: "canceled" };
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `pnpm vitest run worker/daytona.test.ts`
Expected: PASS (13개 전체 — 다른 테스트들은 업로드 횟수를 단언하지 않으므로 영향 없음)

- [ ] **Step 5: 전체 스위트 검증 후 커밋**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add worker/daytona.ts worker/daytona.test.ts
git commit -m "feat(render): custom.scss 업로드 추가 — cosmo Google Fonts 차단 적용

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 실 Daytona 대상 수동 검증

**Files:** 없음 (검증 전용, 코드 변경 없음)

**Interfaces:**
- Consumes: Task 1·2 전체

- [ ] **Step 1: 순수 마크다운 문서로 재측정**

`.env.local`의 `DAYTONA_API_KEY`/`DAYTONA_SNAPSHOT`을 로드한 뒤, 아래와 같은 임시 진단 스크립트를 스크래치 디렉토리(커밋 대상 아님)에 만들어 실행한다:

```ts
// 임시 진단: 코드 없는 순수 마크다운 문서의 executing 단계 시간을 재측정한다.
import { runQuartoRender } from "/Users/wally/Desktop/programming/quarto-studio/worker/daytona";
import { buildQuartoProjectFiles } from "/Users/wally/Desktop/programming/quarto-studio/src/lib/quarto/project";

const content = `---\ntitle: "마크다운만"\nformat:\n  html:\n    toc: true\n---\n\n# 순수 마크다운\n\n코드 셀 없이 텍스트만 있는 문서입니다.\n\n## 섹션 2\n\n여기도 그냥 텍스트입니다.\n`;

async function main() {
  const files = buildQuartoProjectFiles({ content, executeCode: true });
  const t0 = performance.now();
  const marks: Record<string, number> = {};

  const outcome = await runQuartoRender({
    jobId: "font-fix-verify",
    files,
    timeoutMs: 60_000,
    onPhaseChange: (phase) => {
      marks[phase] = performance.now() - t0;
      console.log(`[${(marks[phase] / 1000).toFixed(2)}s] phase → ${phase}`);
    },
  });

  const total = performance.now() - t0;
  console.log(`[${(total / 1000).toFixed(2)}s] 완료: ${outcome.kind}`);
  if (marks.executing !== undefined) {
    console.log(`executing 구간: ${((total - marks.executing) / 1000).toFixed(2)}s`);
  }
  if (outcome.kind === "success") {
    console.log(
      "pretendard/google fonts 문자열 잔존:",
      outcome.html.includes("cdn.jsdelivr.net") || outcome.html.includes("fonts.googleapis.com"),
    );
    console.log("fetch 실패 경고 잔존:", outcome.log.includes("Could not fetch resource"));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
```

Run: (API 키 로드 후) `npx tsx <스크립트 경로>`

Expected:
- `executing` 구간이 기존 측정치(13.8s)보다 유의미하게 짧아짐(정확한 목표 수치는 없음 — "fetch 재시도 지연이 사라진 만큼" 감소 확인이 목적)
- `pretendard/google fonts 문자열 잔존: false`
- `fetch 실패 경고 잔존: false`

- [ ] **Step 2: 로컬 dev 스택으로 실제 문서 렌더 확인**

로컬에서 `pnpm dev` + `pnpm worker`로 실제 UI를 통해 문서 하나를 렌더해, 본문 폰트가 시스템 한글 폰트로 정상 표시되는지(깨지지 않는지) 육안 확인한다.

- [ ] **Step 3: 진단 스크립트 삭제**

```bash
rm -f <Step 1에서 만든 스크립트 경로>
```
