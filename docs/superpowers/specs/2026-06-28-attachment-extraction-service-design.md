# 첨부 문서 텍스트 추출 서비스 분리 설계

> 상태: 승인됨 (자율 실행) · 작성일 2026-06-28 · 브랜치 `feature/convert`

## 배경 / 문제

AI 작성 기능은 첨부 문서(`docx`, `pptx`, `pdf`)에서 텍스트를 추출해 프롬프트에 주입한다.
현재는 웹 앱(Next.js) 프로세스 안에서 [`officeparser`](src/lib/ai/extract.ts)로 추출한다.

`officeparser@7`은 다음 무거운 의존성을 끌어온다:

- `tesseract.js` (OCR, WASM)
- `@napi-rs/canvas` (네이티브 바이너리)
- 기타 WASM 런타임

이 때문에 **웹 배포 이미지(`Dockerfile.web` standalone 번들)가 불필요하게 커진다.** AI 작성 기능에서
실제로 필요한 것은 "오피스 문서 → 평문 텍스트" 변환뿐인데, OCR/이미지 처리 스택까지 함께 배포된다.

## 목표

- 웹 이미지에서 `officeparser`(및 그 무거운 전이 의존성)를 **완전히 제거**한다.
- 문서 텍스트 추출을 **독립 마이크로서비스**로 분리하고, 웹 앱은 HTTP로 호출한다.
- 추출 품질은 동등하거나 더 나아야 한다(마크다운 구조 보존).
- `prepareAttachments(files, provider)` 의 **공개 시그니처와 반환 계약은 그대로 유지**한다(호출부 `route.ts` 무변경).

## 비목표 (YAGNI)

- 이미지 OCR. 이미지는 지금처럼 모델에 **네이티브 이미지**로 전달한다(추출 안 함).
- 추출 결과 캐싱/영속화. 첨부는 일회성이다.
- 인증/요금제. 서비스는 내부 네트워크 전용이다.

## 접근 방식

### 추출 엔진: `markitdown`

[Microsoft `markitdown`](https://github.com/microsoft/markitdown)은 다양한 오피스/문서 포맷을
마크다운으로 변환하는 파이썬 라이브러리다. `docx`/`pptx`/`pdf`/`xlsx` 등을 단일 API로 처리하고,
표·제목 등 구조를 보존해 LLM 입력에 적합하다.

필요한 포맷만 설치해 이미지를 가볍게 유지한다: `markitdown[docx,pptx,pdf]`
(전체 `[all]` 은 오디오 전사·유튜브·Azure 등 불필요 의존성을 포함하므로 사용하지 않는다).

### 서비스: FastAPI 사이드카

`convert/` 디렉터리에 작은 FastAPI 앱을 둔다.

```
POST /convert   (multipart: file)  ->  { "text": "<추출된 텍스트>" }
GET  /health                        ->  { "status": "ok" }
```

- 업로드 바이트를 올바른 확장자 suffix의 임시 파일에 쓰고 `MarkItDown().convert(path)` 호출
  (path 기반 변환이 markitdown에서 가장 안정적인 코드 경로다).
- 변환 엔드포인트는 **동기 `def`** 로 정의 → FastAPI가 스레드풀에서 실행하므로
  블로킹 변환이 이벤트 루프를 막지 않는다.
- 방어적 상한: 빈 파일 400, 과대 파일 413, 변환 실패 500(상세는 숨기고 로깅).
- 비루트 사용자로 실행. 외부 포트 미노출(컴포즈 내부 네트워크 전용).

### 웹 앱 변경 (`src/lib/ai`)

- 신규 `convert-client.ts`: `extractTextViaService(bytes, filename) -> Promise<string>`
  - `CONVERT_SERVICE_URL`(기본 `http://localhost:8000`) 의 `/convert` 로 `multipart` POST.
  - 연결 실패/비 2xx 시 **사용자 친화적 한국어 에러**를 던진다.
- `extract.ts`: `officeparser` 임포트 제거. 추출 분기를 다음과 같이 바꾼다.

| 첨부 종류 | 처리 |
|---|---|
| 이미지(png/jpg/gif/bmp) | 네이티브 image 파트 (변경 없음) |
| 인라인 텍스트(md/txt/html/json/csv) | 그대로 텍스트 파트 (변경 없음) |
| `xlsx` | **SheetJS(`xlsx`) 유지** — 순수 JS·경량이라 이미지 부담이 없고, 서비스 장애와 무관하게 동작 |
| `pdf` + Anthropic | 네이티브 pdf 파트 (변경 없음) |
| `pdf` + OpenAI | **convert 서비스**로 텍스트 추출 |
| `docx` / `pptx` | **convert 서비스**로 텍스트 추출 |

- `route.ts`: `prepareAttachments` 호출을 try/catch로 감싸 추출 실패 시 **502 + 명확한 메시지** 반환.

> `xlsx`(SheetJS)를 굳이 서비스로 옮기지 않는 이유: 무게 문제의 원인은 `officeparser`이고
> SheetJS는 순수 JS·경량이다. 인프로세스로 두면 네트워크 왕복이 없고 서비스 장애에도 견딘다.
> 즉 "무거운 경로(docx/pptx/pdf)만 분리"하는 최소·외과적 변경이다.

### 배포 (`docker-compose.yml`)

- `convert` 서비스 추가(`build: ./convert`, healthcheck 포함, 포트 미노출).
- `web` 에 `CONVERT_SERVICE_URL=http://convert:8000` 주입, `depends_on: convert (healthy)`.
- 루트 `.dockerignore` 에 `convert/` 추가 → web/worker 빌드 컨텍스트에서 파이썬 서비스 제외.

## 데이터 흐름

```
브라우저 첨부 → /api/ai/generate (multipart)
   → prepareAttachments(files, provider)
        ├─ 이미지/인라인텍스트/xlsx/anthropic-pdf : 인프로세스 (변경 없음)
        └─ docx/pptx/openai-pdf : extractTextViaService()
               → POST convert:8000/convert (multipart)
               → markitdown → { text }
   → streamText(...) 프롬프트에 주입
```

## 검증 전략

- **서비스 스모크**: 파이썬 venv에 `requirements.txt` 설치 → uvicorn 기동 →
  실제 `.docx`/`.pdf` 를 `curl`/노드 클라이언트로 변환해 텍스트 확인.
- **단위 테스트**:
  - `convert-client.test.ts` — 전역 `fetch` 모킹(성공/연결실패/비2xx).
  - `extract.test.ts` — `convert-client` 모킹으로 기존 케이스 유지(분기·트렁케이트).
- **전체**: `pnpm verify`(lint·typecheck·test·build) 통과.
- **계약 통합 점검**: 기동된 서비스에 대해 `extractTextViaService` 를 실제 호출하는 일회성 노드 스크립트로 end-to-end 확인.

## 영향 / 마이그레이션

- 웹 의존성에서 `officeparser` 제거(lockfile 갱신). `xlsx` 는 유지.
- 운영에는 `convert` 서비스가 필요하다(컴포즈에 포함). 로컬 `pnpm dev` 시에는 별도 기동 또는
  `CONVERT_SERVICE_URL` 로 기동된 인스턴스를 가리킨다.
- `docx`/`pptx`/`pdf` 첨부가 있는데 서비스가 없으면 502(명확한 메시지). 그 외 기능은 영향 없음.
