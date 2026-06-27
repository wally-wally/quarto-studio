# Quarto Studio AI qmd 자동 작성 설계

## 목표

사용자가 자연어 프롬프트와 참고 파일을 주면, AI가 Quarto Studio가 **지원하는 언어·라이브러리 범위 안에서** 완전한 `.qmd` 문서를 작성하고, 그 결과를 **스트리밍으로 CodeMirror 에디터에 라이브하게 써 내려간다**. API 키는 사용자가 직접 입력하는 BYOK(Bring Your Own Key) 방식으로, Anthropic 또는 OpenAI를 선택해 사용한다.

## 포함 범위

- 상단바에서 여는 **설정 모달**: Anthropic/OpenAI 프로바이더 선택, API 키 입력, 모델 선택. 값은 브라우저 `localStorage`에만 저장한다.
- 에디터 패널 하단의 **접이식 AI 드로어**: 프롬프트 입력(최대 20,000자) + 첨부파일(최대 10개, 합계 최대 5MB).
- 첨부 가능 타입: 이미지(png, jpg, gif, bmp), 텍스트(md, txt, html, json, csv), 문서(xlsx, docx, pdf, pptx).
- 스트리밍 응답을 현재 문서 내용에 **교체 반영**하며 라이브 표시, 완료 후 **"이전 내용으로 되돌리기"** 제공.
- 스트리밍을 처리하는 서버 **Route Handler** (`/api/ai/generate`).
- 지원 범위를 강제하는 **시스템 프롬프트 계약**.

## 제외 범위

- API 키의 서버 DB 저장·암호화(이번엔 BYOK localStorage만). `user_settings` 테이블·암호화 유틸리티는 만들지 않는다.
- AI 출력이 실제로 지원 라이브러리만 썼는지에 대한 **하드 검증/정적 분석**(이번엔 프롬프트 기반 소프트 제약).
- 대화형 멀티턴 채팅·히스토리 보관(이번엔 단발 생성).
- 토큰 사용량·비용 표시, 사용량 쿼터.
- AI를 통한 부분 편집/리팩터(이번엔 문서 전체 생성·교체에 집중).

## 확정된 결정

- **키 저장**: 브라우저 `localStorage`(BYOK). 서버 DB에 저장하지 않는다. 생성 요청 시에만 헤더로 전달해 쓰고 버린다.
- **프롬프트 UI 위치**: 에디터 패널 하단 접이식 드로어.
- **생성 반영 방식**: 현재 열린 문서를 교체하며 라이브 스트리밍, 끝난 뒤 되돌리기 버튼 제공.
- **연동 라이브러리**: Vercel AI SDK v6(`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai`).
- **프롬프트 한도**: 20,000자. **첨부 한도**: 최대 10개, 합계 5MB.
- **PDF 처리**: 프로바이더 조건부 — Anthropic이면 네이티브 문서 입력, OpenAI면 서버 텍스트 추출.
- **지원 범위 강제**: 시스템 프롬프트(소프트 제약).
- **추론 effort**: `medium` 고정. 사용자 설정에 노출하지 않고 서버에서 고정하며, `streamText`의 `providerOptions`로 주입한다.

## 아키텍처와 데이터 흐름

```
[설정 모달]  키/모델 입력 → localStorage["quarto-studio:ai-settings"] (이 브라우저에만)
     │
[AI 드로어]  프롬프트(≤20,000자) + 첨부(≤10개, 합 ≤5MB) → "생성"
     │  multipart/form-data POST, 키는 x-provider-key 헤더
     ▼
[/api/ai/generate]  인증(getCurrentUser) → 서버 재검증 → 첨부 범주 분기/추출
     │              → 시스템 프롬프트 + user 메시지(parts) 구성
     │  Vercel AI SDK: createAnthropic|createOpenAI({ apiKey })(model)
     │              → streamText({ model, system, messages, abortSignal })
     ▼  result.toTextStreamResponse()  — 평문 UTF-8 텍스트 델타 스트림
[드로어 클라이언트]  response.body reader로 청크 읽어 누적 → onChunk(누적문자열)
     ▼
[QuartoWorkspace]  setDraft(content = 누적)  → CodeMirror 라이브 갱신
     ▼  완료 → 자동저장(1500ms 디바운스) / "↩ 이전 내용으로 되돌리기"
```

핵심 원칙: 에디터는 `draft.content`로 제어되는 controlled 컴포넌트이므로, **스트리밍 = 누적 문자열을 반복 set**으로 라이브 반영된다. 별도의 CodeMirror 명령형 API는 필요 없다.

## 설정 레이어 (BYOK)

상단바의 톱니(설정) 버튼으로 중앙 모달을 연다("별도 레이어" = 독립 모달).

`localStorage` 키 `quarto-studio:ai-settings`에 저장하는 형태:

```ts
type AiProvider = "anthropic" | "openai";

type AiSettings = {
  provider: AiProvider;                         // 현재 활성 프로바이더
  anthropic: { apiKey: string; model: string };
  openai:    { apiKey: string; model: string };
};
```

- **필드**: 프로바이더 선택(세그먼트 컨트롤), 프로바이더별 API 키 입력(`type=password` + 표시/숨김 토글), 모델 선택.
- **모델 선택**: "추천 모델" 드롭다운이 텍스트 필드를 채우되 **직접 입력도 허용**한다(하드코딩 목록이 낡지 않도록). 기본값은 Anthropic `claude-sonnet-4-6`(문서 생성 균형; Opus 4.8·Haiku 4.5도 추천 옵션). OpenAI 추천 모델 ID는 구현 시 현재 GA 기준으로 확정하고, 직접 입력 폴백을 둔다.
- **보안 고지**: 모달에 "API 키는 이 브라우저에만 저장되며 서버에 보관되지 않습니다. 생성 요청 시에만 사용됩니다."를 명시한다.
- **헬퍼**: `src/lib/ai/settings.ts`에 `loadSettings()`, `saveSettings()`, 활성 프로바이더의 `{ apiKey, model }`을 꺼내는 `getActiveCredentials()`를 둔다. 키가 비어 있으면 드로어의 생성 버튼은 비활성화된다.

## 첨부파일 처리

검증(클라이언트·서버 양쪽):

| 항목 | 한도 |
| --- | --- |
| 프롬프트 길이 | ≤ 20,000자 |
| 첨부 개수 | ≤ 10개 |
| 첨부 합계 크기 | ≤ 5MB (원본 바이트 기준) |
| 허용 확장자 | png, jpg/jpeg, gif, bmp, md, txt, html, json, csv, xlsx, docx, pdf, pptx |

타입별로 모델에 전달되는 방식이 다르다:

| 범주 | 확장자 | 전달 방식 |
| --- | --- | --- |
| 이미지(비전) | png, jpg, gif, bmp | AI SDK `file` 파트(이미지 mediaType)로 그대로 — 비전 입력 |
| 텍스트(직접 인라인) | md, txt, html, json, csv | UTF-8로 읽어 라벨된 텍스트 블록으로 인라인 |
| 추출 후 인라인 | xlsx, docx, pptx | 서버에서 텍스트 추출 후 인라인 (xlsx는 표를 CSV/마크다운으로, docx/pptx는 본문 텍스트) |
| PDF (조건부) | pdf | **Anthropic: 네이티브 `file` 파트(application/pdf)** / **OpenAI: 서버 텍스트 추출 → 인라인** |

설계 근거:
- Anthropic/OpenAI 채팅 입력은 xlsx·docx·pptx를 네이티브로 받지 못하므로 서버에서 텍스트를 추출한다.
- PDF는 Anthropic이 네이티브 문서 입력을 지원하므로(시각 요소 보존) 활성 프로바이더가 Anthropic일 때는 네이티브로 보낸다. OpenAI는 모델별 편차가 있어 텍스트 추출로 폴백한다.
- **추출 텍스트 상한**: 파일당 추출 텍스트에 상한(기본 약 100,000자)을 두고, 초과 시 잘라낸 뒤 "(이하 생략)"을 표기한다 — 컨텍스트 윈도우·비용 폭주 방지.
- 검증은 확장자 allowlist를 1차로, 바이너리 타입은 서버에서 매직바이트로 2차 확인한다. 클라이언트 검증은 UX용이며 서버 재검증을 신뢰의 기준으로 삼는다.

추출 모듈 `src/lib/ai/extract.ts`가 `{ name, ext, bytes }`를 받아 위 범주에 따라 텍스트(또는 비전/네이티브 파트 지시)를 돌려준다.

## 서버 Route Handler `/api/ai/generate`

- 파일: `src/app/api/ai/generate/route.ts`. `export const maxDuration = 60`, Node 런타임(기본). postgres 기반 인증과 AI SDK 모두 Node에서 동작한다.
- **요청**: `multipart/form-data` (base64 부풀림 회피). 필드 `provider`, `model`, `prompt`. 파일은 `files`(복수) 파트. API 키는 `x-provider-key` 헤더로 전달한다(본문·로그 노출 회피).
- **처리 순서**:
  1. `getCurrentUser()`로 인증. 없으면 401(앱 전반의 인증 규약과 일치).
  2. `x-provider-key` 헤더 확인. 없으면 400.
  3. 서버 재검증: 프롬프트 길이 ≤ 20,000, 첨부 개수 ≤ 10, 허용 확장자, 합계 ≤ 5MB. 위반 시 400(방어적 — 클라이언트를 신뢰하지 않는다).
  4. 첨부를 범주별로 처리(이미지→비전 파트, 텍스트→인라인, 바이너리→추출, PDF→프로바이더 조건부).
  5. 프로바이더 모델 생성: `provider === "anthropic" ? createAnthropic({ apiKey })(model) : createOpenAI({ apiKey })(model)`.
  6. 메시지 구성: 시스템 프롬프트 + user 메시지(`content` parts = 프롬프트 텍스트 + 첨부 파트들).
  7. `const result = streamText({ model, system, messages, abortSignal: req.signal, providerOptions })` — 추론 effort는 `medium` 고정으로 `providerOptions`에 주입한다. 프로바이더별 표현(OpenAI `reasoningEffort: "medium"` / Anthropic thinking budget 매핑)은 구현 계획에서 확정한다.
  8. `return result.toTextStreamResponse()` — 평문 UTF-8 텍스트 델타 스트림.
- **에러 처리**: 프리플라이트(인증·키·검증)는 JSON 본문 + 적절한 상태코드로 즉시 반환한다. 프로바이더 인증/쿼터 오류와 스트림 중 오류는 `streamText`의 `onError`로 서버 로깅하고, 클라이언트는 "생성 중 오류"를 표시한 뒤 자동으로 이전 내용으로 되돌린다.

## 시스템 프롬프트 — 지원 범위 계약

`src/lib/ai/system-prompt.ts`가 다음을 지시하는 시스템 프롬프트를 구성한다. 지원 목록은 `src/lib/ai/supported-libraries.ts` **단일 출처**에서 주입한다.

- **출력은 완전한 `.qmd` 문서만** — YAML 프런트매터 + Quarto 마크다운. 문서 전체를 코드펜스로 감싸지 말 것. 설명·머리말·꼬리말 금지(에디터에 그대로 들어가야 함).
- **타깃 포맷은 Quarto → HTML**.
- **지원 언어/라이브러리만 사용**:
  - Python: numpy, pandas, matplotlib, altair, vega_datasets, plotly, seaborn, scikit-learn, scipy, statsmodels.
  - R: knitr, rmarkdown, ggplot2, dplyr, tidyr, readr, showtext, sysfonts.
  - Julia: Plots, DataFrames.
- **올바른 Quarto 실행 청크 문법** 사용: ```` ```{python} ````/```` ```{r} ````/```` ```{julia} ````와 `#|` 셀 옵션(`#| echo`, `#| eval`, `#| label`, `#| fig-cap` 등).
- `docs/quarto-reference` 기반 핵심 문법 요약(프런트매터 옵션, 교차참조, callout, 그림/표, 셀 옵션)을 토큰 절약을 위해 압축해 포함한다.
- 첨부가 있으면 "첨부 자료를 근거로 작성하라"는 지시를 덧붙인다.
- 한계: 이는 **소프트 제약**이며 출력의 라이브러리 사용을 하드 검증하지 않는다.

## 에디터 스트리밍 주입

`QuartoWorkspace`(`draft` 소유)에 생성 컨트롤러를 두고 드로어에 콜백을 내려준다.

- **시작**: `preGenContentRef.current = draft.content`로 스냅샷, `generating = true`, 에디터 read-only. **기존 내용은 첫 청크 도착 전까지 유지**한다(생성 전 오류 시 무손실, 빈 화면 깜빡임 없음).
- **첫 청크**: `accumulated = chunk` → `setDraft(c => ({ ...c, content: accumulated }))`로 기존 내용을 일괄 교체.
- **이후 청크**: `accumulated += chunk` → 같은 방식으로 set.
- **완료**: `generating = false`, 잠금 해제. 기존 자동저장(1500ms)이 그대로 영속화. **"↩ 이전 내용으로 되돌리기"** 버튼 노출.
- **되돌리기**: `setDraft(c => ({ ...c, content: preGenContentRef.current }))`.
- 스트리밍 중에는 렌더·문서 전환을 비활성화한다(기존 `paneBusy` 잠금 패턴 재사용). 문서 전환/삭제 시도 시 생성을 먼저 `abort`한다.
- 드로어 클라이언트가 `fetch`로 `/api/ai/generate`를 호출하고 `response.body.getReader()` + `TextDecoder`로 델타를 디코드·누적해 `onChunk`를 호출한다. `AbortController`로 "중단" 버튼을 구현한다.

## UI 설계

- **상단바**: 기존 사용자/로그아웃 영역 옆에 톱니(설정) 아이콘 버튼(lucide `Settings`). `aria-label="AI 설정"`.
- **설정 모달**(`src/components/settings/settings-modal.tsx`): 프로바이더 세그먼트, 키 입력(표시/숨김), 모델 선택(드롭다운+직접입력), 저장/닫기, 보안 고지. Deep Navy IDE 토큰으로 스타일링.
- **AI 드로어**(`src/components/workspace/ai-drawer.tsx`): 에디터 툴바의 "✨ AI 작성"(lucide `Sparkles`) 토글로 열고 닫는다. 구성:
  - 프롬프트 textarea + 글자 수 카운터(`1234 / 20000`).
  - 첨부 버튼(`accept`에 허용 확장자) + 첨부 칩 목록(파일명·크기·삭제) + 총 용량 표시(`2.3 / 5 MB`)·개수 표시(`3 / 10`).
  - 생성 버튼(키 없음/빈 프롬프트/스트리밍 중/한도 초과 시 비활성) / 스트리밍 중 "중단" 버튼.
  - 인라인 상태·에러 영역, 완료 후 "되돌리기".
- **접근성**: 모달·드로어는 포커스 트랩과 Esc 닫기를 지원한다. 버튼은 명시적 `aria-label`을 가진다(기존 테스트 규약과 일치).

## 오류 처리

| 상황 | 동작 |
| --- | --- |
| API 키 미설정 | 드로어 생성 비활성 + "설정에서 API 키를 입력하세요" 힌트(설정 모달 링크) |
| 프롬프트 20,000자 초과 | 입력 하드캡 + 카운터 경고, 생성 비활성 |
| 첨부 개수/크기 초과 | 추가 차단 + 메시지, 생성 비활성(서버도 400으로 재차단) |
| 허용 외 확장자 | 첨부 거부 + 메시지(서버 400) |
| 프로바이더 401/쿼터 | 드로어에 한국어 오류 표시 + 자동 되돌리기(첫 청크 전이면 기존 내용 무변경) |
| 스트림 중 네트워크 오류 | 부분 내용 유지 + 오류 표시 + 되돌리기 제공 |
| 사용자가 "중단" | reader 정지, 부분 내용 유지 + 되돌리기 제공 |
| 스트리밍 중 문서 전환/삭제 | 생성을 먼저 abort한 뒤 전환 진행 |

## 의존성 및 파일 변경

**추가 의존성**:
- `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` (Vercel AI SDK v6).
- 첨부 추출: xlsx는 `xlsx`(SheetJS)로 표→CSV/마크다운. docx/pptx/pdf(OpenAI 경로) 텍스트 추출은 `officeparser`(docx·pptx·pdf 통합) 또는 `mammoth`+`pdf-parse`+pptx 언집 조합 — **정확한 라이브러리는 구현 계획에서 유지보수성·Next standalone 호환을 검증해 확정**한다.

**신규 파일**:
- `src/app/api/ai/generate/route.ts` — 스트리밍 라우트.
- `src/lib/ai/settings.ts` — `AiSettings` 타입 + localStorage 로드/저장 헬퍼.
- `src/lib/ai/validation.ts` — 프롬프트/첨부 검증(클라이언트·서버 공용).
- `src/lib/ai/supported-libraries.ts` — 지원 언어/라이브러리 단일 출처.
- `src/lib/ai/system-prompt.ts` — 지원 범위 계약 시스템 프롬프트.
- `src/lib/ai/extract.ts` — 첨부 범주 분기 + 바이너리 텍스트 추출.
- `src/components/settings/settings-modal.tsx` — BYOK 설정 모달.
- `src/components/workspace/ai-drawer.tsx` — 드로어 UI + 스트리밍 클라이언트.

**수정 파일**:
- `src/components/workspace/editor-pane.tsx` — 드로어 마운트, "✨ AI 작성" 툴바 버튼, 스트리밍 중 read-only.
- `src/components/workspace/quarto-workspace.tsx` — 생성 컨트롤러(스냅샷/되돌리기/잠금), 상단바 설정 버튼.
- `src/app/globals.css` — 드로어·모달 Deep Navy IDE 스타일.
- `package.json` — 의존성 추가.

## 테스트 전략

Vitest + React Testing Library. production source module을 직접 import한다. 프로바이더 네트워크 호출은 모킹하며 실제 호출하지 않는다.

- **검증 유닛**(`validation.ts`): 프롬프트 길이, 첨부 개수(≤10), 합계 크기(≤5MB), 확장자 allowlist, 경계값.
- **추출 유닛**(`extract.ts`): 샘플 xlsx/docx/pdf/pptx 픽스처 → 텍스트, 범주 분기(이미지/텍스트/추출/PDF 조건부), 추출 텍스트 상한 truncation.
- **설정 유닛**(`settings.ts`): localStorage 직렬화/역직렬화, `getActiveCredentials`.
- **라우트**(`/api/ai/generate`): 미인증 401, 키 없음 400, 초과/잘못된 타입 400, 해피패스 스트림(AI SDK `MockLanguageModel`/`simulateReadableStream`로 프로바이더 모킹).
- **컴포넌트**: 드로어 비활성 상태(키 없음/빈 프롬프트/한도 초과), 되돌리기가 이전 내용을 복원, 스트리밍이 누적 내용을 에디터에 반영(`fetch` ReadableStream 모킹), 설정 모달 저장/닫기.
