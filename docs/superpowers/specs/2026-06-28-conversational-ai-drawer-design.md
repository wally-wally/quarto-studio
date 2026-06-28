# Quarto Studio 대화형 AI 드로어 설계

## 목표

지금의 AI 드로어는 프롬프트 1회 입력 → **항상 완전한 `.qmd` 문서 1개를 생성해 에디터를 교체**하는 단발 도구다(시스템 프롬프트가 그렇게 강제). "안녕!" 같은 잡담에도 문서가 써진다. 이를 **대화형 채팅**으로 바꿔, 사용자와 AI가 메시지를 주고받고 — AI가 **문서를 만들거나 고쳐야 한다고 판단할 때만** 에디터에 반영하게 한다. 반영은 가능하면 **부분 편집**(현재 문서의 일부 치환), 빈/새 문서면 **전체 작성**으로 한다.

## 포함 범위

- AI 드로어를 **채팅 UI**로 전환: 메시지 목록(스크롤) + 하단 작성기(composer). 기존 단일 `생성` 버튼·`되돌리기` 버튼 제거.
- **도구 호출(tool calling)** 기반 편집: 모델에 `edit_document`(부분 치환)·`write_document`(전체 작성) 두 도구를 노출. 도구 호출이 없으면 순수 잡담(에디터 불변), 호출이 오면 **클라이언트가** 에디터에 적용.
- **부분 편집 우선**: 모델은 매 턴 현재 문서 전문을 컨텍스트로 받고, 가능한 곳은 부분 치환, 빈/새 문서는 전체 작성.
- **휘발성 대화**: 대화는 클라이언트 메모리에만 보관. 문서 전환·새로고침 시 소멸. DB 변경 없음.
- **네이티브 실행취소**: AI 편집도 CodeMirror 트랜잭션으로 적용 → `Cmd/Ctrl+Z`로 되돌림.
- 스트리밍 엔드포인트를 `/api/ai/generate` → **`/api/ai/chat`** 으로 이전(메시지+현재 문서+도구).
- 첨부파일(메시지별), 사용량(턴별 토큰·비용·시간), 이탈 가드는 새 모델에 맞춰 유지.

## 제외 범위

- **대화 영속화**(DB 저장·문서별 스레드·다기기 동기화). 이번엔 휘발성 메모리만. 스키마/마이그레이션을 만들지 않는다.
- **에이전트 멀티스텝 루프**(도구 결과를 모델에 되먹여 추가 추론). 도구는 클라이언트 실행이며 한 턴은 "텍스트 + 도구호출 0~N개" 후 종료한다.
- **과거 턴 첨부의 재전송/보관**. 각 첨부는 보낸 턴에서만 모델에 전달되고, history에는 텍스트(채팅)만 남는다.
- **부분 편집의 최소 범위 트랜잭션**(커서·스크롤 보존 최적화). 이번엔 도구 호출당 전체 문서 1회 교체 = undo 1스텝. 최소 범위 교체는 후속 과제.
- **history 길이 상한·요약**. 문서+history를 매 턴 통째로 보내며, 토큰 상한 관리는 후속 과제로 메모만 둔다.
- **편집 충돌 자동 머지/퍼지 매칭**. `find` 정확 매칭 실패는 스킵+안내 후 다음 턴 재시도로 처리한다.

## 확정된 결정

- **메커니즘**: 도구 호출(접근 A). `edit_document` / `write_document`. **클라이언트 실행**(서버는 스키마만 노출, 실행 안 함, 도구 결과 되먹임 없음).
- **편집 방식**: 부분 편집 우선. 모델은 매 턴 현재 문서 전문을 봄. 빈/새 문서는 전체 작성.
- **대화 보관**: 휘발성(메모리). 문서 전환·새로고침 시 소멸.
- **되돌리기**: 네이티브 에디터 undo(Cmd+Z). 별도 `되돌리기` 버튼·단일 `생성` 버튼 제거.
- **엔드포인트**: `/api/ai/chat`(기존 `/api/ai/generate` 대체).
- **사용량 표시**: 완료된 어시스턴트 메시지 하단에 턴별로. 누적 합산은 하지 않음(YAGNI).
- **연동 라이브러리**: 기존 그대로 Vercel AI SDK(`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai`). 새 의존성 없음.

## 아키텍처와 데이터 흐름

```
[채팅 드로어]  대화 history(메모리) + 새 user 메시지(+첨부)
     │  multipart/form-data POST, 키는 x-provider-key 헤더
     │  필드: provider, model, messages(JSON: {role,text}[]), document(현재 에디터 전문), files
     ▼
[/api/ai/chat]  인증(getCurrentUser) → 서버 재검증 → 첨부 추출
     │           → 시스템 프롬프트(+현재 문서 블록) + history 메시지 구성
     │           → streamText({ model, system, messages, tools, providerOptions, abortSignal })
     │              tools: edit_document / write_document (zod 스키마, execute 미정의 → 호출 후 정지)
     ▼  fullStream 소비 → NDJSON 프레임
[채팅 클라이언트]  reader로 프레임 읽기
     │   delta → 어시스턴트 말풍선에 텍스트 누적
     │   tool  → applyEdits로 현재 문서에 반영(CodeMirror 트랜잭션) + "✎ 수정됨" 칩 + aiEditedThisSession=true
     │   done  → 마무리 + 턴별 사용량 기록
     ▼
[QuartoWorkspace]  draft.content 갱신 / 이탈 가드 / 문서 전환 시 대화 초기화
```

핵심 원칙:
- **도구는 클라이언트가 실행한다.** 서버는 `edit_document`·`write_document` 스키마만 모델에 노출하고 실행하지 않는다. 모델이 도구를 호출하면 그 호출을 클라이언트로 흘려보내 에디터에 적용한다. 도구 결과를 모델에 되먹이지 않으므로 한 턴은 "텍스트 + 도구호출 0~N개" 후 종료한다(AI SDK에서 `execute` 미정의 도구는 호출 후 멈춘다 — 구현 시 v6 동작 확인).
- **문서는 매 턴 전문을 새로 보낸다.** history에는 채팅 텍스트만 싣고 과거 편집 diff는 싣지 않는다. 모델은 항상 최신 문서를 보므로 history가 가볍고 부분 편집 앵커가 최신 상태 기준이 된다.

## 스트리밍 프로토콜 (NDJSON)

기존 NDJSON을 확장한다. 한 줄당 하나의 JSON 프레임:

| 프레임 | 의미 |
| --- | --- |
| `{type:"delta", text}` | 어시스턴트 채팅 텍스트 조각 |
| `{type:"tool", name, input}` | 입력이 완성된 도구 호출 1건(`name`: `"edit_document"`\|`"write_document"`, `input`: 아래 스키마). 순서대로 0~N개 |
| `{type:"done", usage, provider, model}` | 종료 + 사용량 |
| (에러) | `controller.error()`로 스트림 종료 → 클라이언트 `reader.read()` reject → 에러 처리 |

서버는 `result.fullStream`을 직접 소비한다: `text-delta`→`delta`, `tool-call`(입력 완성)→`tool`, `finish`→`usage` 누적, `error`→`controller.error()`. (v6 `fullStream`의 tool-call 파트 필드명 `input`/`args`는 구현 시 확인해 `input`으로 정규화한다.)

## 도구 스키마

서버가 zod로 정의해 `streamText({ tools })`로 노출한다(`src/lib/ai/tools.ts`).

```ts
// 현재 문서의 일부를 치환한다(부분 편집). 여러 편집을 한 번에.
edit_document: {
  edits: Array<{
    find: string;     // 현재 문서에 그대로 존재하는 정확한 문자열(충분히 구체적으로)
    replace: string;  // find를 대체할 문자열(삭제는 빈 문자열)
  }>;
}

// 문서 전체를 작성/교체한다(빈 문서·새 문서·전면 재작성).
write_document: {
  content: string;  // 완전한 .qmd 본문(YAML 프런트매터로 시작)
}
```

`toolChoice`는 `auto`. 모델이 잡담만 할 때는 도구를 호출하지 않는다.

## 편집 적용 & 실행취소

- **순수 로직** `src/lib/quarto/apply-edits.ts`:
  - `applyEdits(content: string, edits: {find,replace}[]) → { content: string, results: {find, ok}[] }`.
  - 각 편집을 **현재 작업 문자열에서 순차로** 적용한다(앞선 치환이 뒤 편집에 반영됨). 각 `find`의 **첫 일치**를 `replace`로 치환한다. `find`가 비었거나 일치가 없으면 그 편집은 스킵하고 `ok:false`로 기록한다.
- **에디터 반영** `src/components/workspace/apply-edits-to-editor.ts`:
  - `edit_document`: `applyEdits`로 새 전문을 만든 뒤 CodeMirror 트랜잭션 **1회**로 전체 문서를 교체한다(`changes: {from:0, to:doc.length, insert: next}`) = undo **1스텝**.
  - `write_document`: 동일 경로로 `content` 전문 교체.
  - 적용은 **현재(라이브) 에디터 내용** 기준이다. 스트리밍 도중 사용자가 직접 입력했어도 그 시점의 내용에 대해 `find`를 찾는다.
- **실패 처리**: `results`에 `ok:false`가 있으면 어시스턴트 말풍선에 옅은 `일부 편집 미적용` 주석을 단다. 모델은 다음 턴에 최신 문서를 받아 새 앵커로 재시도한다.
- **되돌리기**: 위 트랜잭션은 CodeMirror undo 히스토리에 쌓이므로 `Cmd/Ctrl+Z`로 되돌린다(문서별 undo 격리는 기존 작업으로 확보됨). 별도 되돌리기 버튼은 두지 않는다.

## 시스템 프롬프트 — 대화형 + 도구 계약

`src/lib/ai/system-prompt.ts`를 재작성한다. 지원 라이브러리는 기존 `supported-libraries.ts` **단일 출처**에서 주입한다.

- 역할: **Quarto 문서 작성 대화 도우미**. 사용자와 자연스럽게 대화한다(한국어).
- **편집 판단**: 인사·질문·잡담에는 도구를 호출하지 말고 그냥 답한다. 문서를 만들거나 고쳐야 할 때만 도구를 호출한다.
- **도구 사용 규칙**:
  - 문서가 비었거나 처음 만들 때, 또는 전면 재작성이 필요할 때 → `write_document(content)`(완전한 `.qmd`, 프런트매터 포함, 코드펜스로 전체를 감싸지 말 것).
  - 기존 문서의 일부만 바꿀 때 → `edit_document(edits)`로 부분 치환. `find`는 현재 문서에 **그대로** 있는 충분히 구체적인 문자열로 잡는다.
  - 도구 호출과 함께 사용자에게 무엇을 했는지 짧게 말한다(예: "제목을 바꿨어요").
- **현재 문서 컨텍스트**: 매 턴 현재 문서 전문이 시스템 컨텍스트로 주어진다(라벨된 블록). 도구의 `find`/판단은 이 최신 내용을 기준으로 한다.
- **지원 범위 계약**(기존 유지, 소프트 제약): 언어는 Python/R/Julia, 라이브러리는 `supported-libraries.ts` 목록만. 올바른 Quarto 실행 청크 문법(```` ```{python} ````/`#|` 셀 옵션). 타깃 포맷은 Quarto → HTML.
- 첨부가 있으면 "첨부 자료를 근거로 작성/수정하라"는 지시를 덧붙인다.

## 서버 Route Handler `/api/ai/chat`

- 파일: `src/app/api/ai/chat/route.ts`. `export const maxDuration = 60`, Node 런타임. (기존 `generate/route.ts`는 제거/이전.)
- **요청**: `multipart/form-data`. 필드 `provider`, `model`, `messages`(JSON 문자열: `{role:"user"|"assistant", text:string}[]`, 새 user 메시지 포함), `document`(현재 에디터 전문). 파일은 `files`(복수, 최신 user 메시지의 첨부). 키는 `x-provider-key` 헤더.
- **처리 순서**:
  1. `getCurrentUser()` 인증. 없으면 401.
  2. `x-provider-key` 확인. 없으면 400. `provider`·`model` 검증.
  3. `messages` 파싱·검증: 비어 있지 않은 배열, 마지막은 `role:"user"`, 각 `text` 길이는 기존 프롬프트 한도(≤20,000자) 적용. 첨부 개수·크기·확장자 재검증(기존 `validation.ts`).
  4. 첨부를 기존 `extract.ts` 경로로 처리(이미지→비전 파트, 텍스트→인라인, 바이너리→추출, PDF→프로바이더 조건부).
  5. AI SDK 메시지 구성: 시스템 프롬프트(+현재 `document` 블록) + history를 `{role, content}`로 매핑. 최신 user 메시지의 `content`에 텍스트 + 첨부 파트를 싣는다.
  6. `streamText({ model: resolveModel(...), system, messages, tools, toolChoice:"auto", providerOptions: buildProviderOptions(...), maxOutputTokens, abortSignal: req.signal, onError })`.
  7. `fullStream`을 NDJSON으로 송출(위 프로토콜).
- **에러 처리**: 프리플라이트(인증·키·검증)는 JSON + 상태코드 즉시 반환. 스트림 중 오류는 `onError` 로깅 + `controller.error()`로 종료.

## 컴포넌트 / 파일 변경

**신규 파일**
- `src/lib/quarto/apply-edits.ts` — 순수 `applyEdits`.
- `src/lib/ai/tools.ts` — `edit_document`/`write_document` zod 스키마.
- `src/app/api/ai/chat/route.ts` — 채팅 스트리밍 라우트.
- `src/components/workspace/apply-edits-to-editor.ts` — `applyEdits` 결과를 CodeMirror 트랜잭션으로 반영(+`write_document` 전체 교체).
- `src/components/workspace/use-ai-chat.ts` — 채팅 훅: `messages` 상태, `send()`, NDJSON 읽기 루프, `tool`→적용기 호출, `aiEditedThisSession`·사용량·에러·중단.
- `src/components/workspace/ai-message-list.tsx` — 메시지 목록(말풍선/스트리밍/편집 칩/에러/빈 상태).
- `src/components/workspace/ai-composer.tsx` — 입력창(Enter 전송/Shift+Enter 줄바꿈) + 첨부 + 전송/중단 + 카운터/검증.

**수정 파일**
- `src/lib/ai/system-prompt.ts` — 대화형 + 도구 계약으로 재작성.
- `src/components/workspace/ai-drawer.tsx` — 폼 → 채팅 셸(헤더 + `AiMessageList` + `AiComposer`).
- `src/components/workspace/quarto-workspace.tsx` — `use-ai-chat` 배선, 이탈 가드를 `aiEditedThisSession` 기준으로, 문서 전환 시 대화 초기화.
- `src/components/workspace/editor-pane.tsx` — 편집 적용을 위해 `editorViewRef`를 채팅 훅에 전달.
- `src/app/globals.css` — 채팅 말풍선·작성기 Deep Navy IDE 스타일.

**제거 파일**
- `src/app/api/ai/generate/route.ts`(+테스트) — `chat`으로 이전.
- `src/components/workspace/use-ai-generation.ts`(+테스트) — `use-ai-chat`로 대체.
- `src/components/workspace/stream-into-editor.ts`(+테스트) — 전체 문자 스트리밍 로직은 편집이 원자적으로 적용되며 불필요.

## UI 설계

드로어는 우측 슬라이드인 패널 유지(헤더: ✨ "AI 작성" + 닫기 X). 본문만 세로 플렉스 채팅으로.

- **메시지 목록(스크롤, flex:1)**:
  - user: 우측 정렬 말풍선. assistant: 좌측 정렬, 텍스트 스트리밍.
  - 편집 적용 시 말풍선 하단 인라인 칩 `✎ 문서 수정됨`(전체작성은 `📝 문서 작성됨`). 일부 실패 시 옅은 `일부 편집 미적용` 주석. 에러 시 에러문구 + `다시 시도`.
  - 빈 상태 안내: *"문서에 대해 묻거나, 만들고 싶은 걸 말해보세요."*
  - 스트리밍 중 stick-to-bottom.
- **작성기(하단 고정)**: 자동 높이 textarea(Enter 전송/Shift+Enter 줄바꿈) + 첨부 버튼·칩(메시지별, 전송 후 비움) + 글자 수 카운터 + 전송 버튼(스트리밍 중 **중단**). API 키 없으면 인라인 에러 + `설정 열기`.
- **사용량**: 완료된 어시스턴트 메시지 하단에 작게(턴별 토큰·비용·시간).
- **접근성**: 버튼은 명시적 `aria-label`. 스트리밍 중 전송 비활성(in-flight 1건).

## 오류 처리

| 상황 | 동작 |
| --- | --- |
| API 키 미설정 | 작성기에 인라인 오류 + `설정 열기`(전송 버튼은 활성) |
| 미인증 401 / 첨부 추출 502 | 어시스턴트 말풍선 에러 표시(기존 처리 유지) |
| 스트림 중 오류 | 어시스턴트 말풍선 에러 + `다시 시도`, user 메시지는 history에 유지 |
| 도구 input 불량(빈 find/빈 content)·find 미일치 | 해당 편집만 스킵 + `일부 편집 미적용` 주석 → 다음 턴 최신 문서로 재시도 |
| 사용자 "중단" | fetch abort, 이미 적용된 편집 유지(undo 가능), 부분 텍스트 보존, 입력 재활성 |
| 스트리밍 중 문서 전환 | 드로어 key 리마운트로 abort + 대화 초기화 |
| 이탈(LNB 이동/F5) with `aiEditedThisSession` | 경고: *"AI가 편집한 내용이 있습니다. 떠나면 실행취소(Cmd+Z) 기록이 사라집니다."* 확인 시 이동, 취소 시 유지 |

## 테스트 전략

Vitest + React Testing Library. 프로바이더 네트워크 호출은 모킹(AI SDK `MockLanguageModel`/`simulateReadableStream`).

- **`applyEdits` 순수 유닛**: 단일 치환, 다중 순차 치환(앞 치환이 뒤에 반영), 미일치 스킵(`ok:false`), 빈 `find` 스킵, 첫 일치만 치환.
- **`apply-edits-to-editor`**: `edit_document` 결과가 트랜잭션 1회 전체 교체(=undo 1스텝), `write_document` 전체 교체(jsdom view mock).
- **`system-prompt`**: 대화형 지시·도구 사용 규칙·지원 라이브러리 목록 포함 단언.
- **`/api/ai/chat` 라우트**: 미인증 401, 키 없음 400, 잘못된 `messages` 400, 해피패스 스트림(`delta`/`tool`/`done` 프레임), tool-call이 `tool` 프레임으로 송출, 에러 경로(`controller.error`).
- **`use-ai-chat` 훅**: 전송→`delta` 누적이 어시스턴트 메시지에 반영, `tool` 프레임→적용기 호출 + `aiEditedThisSession` 세팅, `done`→사용량 기록, 에러·중단, 빈 입력 검증.
- **컴포넌트**: 목록이 user/assistant 말풍선 렌더 + 편집 칩 표시, 작성기 Enter 전송/Shift+Enter 줄바꿈/한도·키 검증.
- **workspace**: `aiEditedThisSession`이면 이탈 가드 발동, 문서 전환 시 대화·플래그 초기화.
