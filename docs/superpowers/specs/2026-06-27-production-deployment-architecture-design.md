# Quarto Studio 프로덕션 배포 아키텍처 설계

## 목표

로컬 단일 사용자 MVP인 Quarto Studio를, **인증된 다중 사용자가 사용하는 배포 가능한 서비스**로 만든다. 핵심은 두 가지다.

1. **렌더링을 웹에서 분리한다.** Quarto 실행(Python/R/Julia 코드 청크 포함)을 웹 서버 프로세스에서 떼어내, 격리된 별도 렌더 워커가 수행하게 한다.
2. **차트의 한글 폰트 깨짐을 해결한다.** matplotlib·ggplot2·Plots.jl이 그리는 차트의 한글 라벨이 두부(□)로 깨지는 문제를 렌더 환경에서 근본적으로 없앤다.

이 문서는 목표 아키텍처 **전체**를 다루되, 한 번에 구현하지 않고 단계별 마일스톤(Phase 0~4)으로 순차 구현한다.

## 배경: 현재 아키텍처

- **웹**: Next.js 16(App Router) + Server Actions, `better-sqlite3` 로컬 파일 DB(`data/quarto-studio.db`).
- **렌더링**: `renderDocumentToHtml`이 OS 임시 디렉토리에 `index.qmd` + `_quarto.yml`을 쓰고, **웹 서버와 같은 프로세스/머신에서** `quarto render index.qmd --to html`를 `spawn`한 뒤, `embed-resources: true`로 생성된 self-contained HTML을 읽어 반환한다. (`src/lib/quarto/render.ts`, `runtime.ts`, `project.ts`)
- **코드 실행**: Python(jupyter)·R(knitr)·Julia(IJulia)·OJS(브라우저)가 모두 웹 서버 머신의 로컬 런타임에 의존한다.
- **제약**: 단일 사용자, 인증 없음, SQLite 전용, "코드 실행은 신뢰 가능한 내용만"이라는 신뢰 전제.

문제는 두 가지로 압축된다: **렌더가 웹과 한 몸**이고, **코드 실행이 신뢰 전제**다. 프로덕션화는 이 둘을 푸는 일이다.

## 확정된 결정

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 신뢰 모델 | 인증된 다중 사용자, 부분 신뢰 코드 | 컨테이너 단위 격리 + 사용자별 자원 쿼터가 필요한 수준 |
| 설계 범위 | 풀 프로덕션 스택 | 워커 분리 + 인증 + 멀티유저 데이터 + 스토리지 전체 |
| 배포 인프라 | 단일 VM + Docker Compose | 자가호스팅, 런타임 설치 용이, 초기 단계 적합, 이후 분리 가능 |
| 렌더 격리 | 렌더 1건마다 일회용 컨테이너 | 동시 렌더 상호 무간섭, 호스트/타 사용자 공격면 차단 |
| 큐 | Postgres 기반(`SKIP LOCKED`) | 별도 브로커 없이 부품 최소화 |
| DB | SQLite → Postgres | 멀티컨테이너 공유 접근 + 큐 세만틱상 사실상 강제(아래 참조) |
| 인증 | Auth.js(NextAuth v5) + Postgres 어댑터 | 단일 VM 자가호스팅과 정합, 세션도 Postgres |

### DB 전환이 강제되는 이유

1. Compose에서 web과 worker가 **별도 컨테이너**다. `better-sqlite3`는 인프로세스·동기 라이브러리라 다른 컨테이너가 같은 `.db` 파일을 열 수 없다. 볼륨 공유는 파일락이 깨지고 손상 위험이 크다. → 여러 컨테이너가 붙을 **네트워크 DB가 필수**.
2. 큐가 `FOR UPDATE SKIP LOCKED` / `LISTEN-NOTIFY`에 의존한다. 둘 다 SQLite에 없다.
3. 멀티유저 동시 쓰기는 SQLite의 단일 writer 모델에서 `SQLITE_BUSY`를 유발한다.

코드상 SQLite 접근은 `src/lib/db/connection.ts`와 `src/lib/documents/repository.ts` 두 파일에만 격리돼 있어, 엔진 교체 범위는 좁다. 유일한 잔물결은 동기 → 비동기 전환(repository 메서드가 `Promise` 반환 → `service.ts`에 `await` 추가).

## 목표 아키텍처

Docker Compose가 단일 VM 위에서 다음 서비스를 오케스트레이션한다.

- **Web (Next.js)** — 인증, 문서 CRUD, 렌더 "요청" 수신, 결과 서빙. **직접 Quarto를 실행하지 않는다.**
- **Postgres** — 문서·유저 데이터 + 잡큐를 겸한다.
- **렌더 워커** — 큐를 폴링/클레임하고, 렌더 1건마다 일회용 컨테이너를 띄워 실행한 뒤 결과를 스토리지에 저장하고 잡 상태를 갱신한다.
- **docker-socket-proxy** — 워커가 컨테이너를 띄우기 위한 Docker API 접근을 최소 엔드포인트로 제한한다.
- **일회용 렌더 컨테이너** — Quarto + Python/R/Julia + 한글 폰트가 구워진 이미지. 잡마다 생성·폐기.
- **스토리지** — self-contained 렌더 HTML 보관. 1차는 공유 볼륨, 이후 S3 호환으로 승격.

요청 흐름: `브라우저 → Web(렌더 요청) → Postgres(잡 등록) → 워커(클레임) → 일회용 컨테이너(실행) → 스토리지(저장) → 브라우저(상태 폴링 후 결과 조회)`.

## 섹션 1 — 렌더 파이프라인 & 격리

### 렌더 이미지 (`quarto-render`)

Debian-slim 기반에 다음을 굽는다. 각 런타임의 패키지는 **버전 핀이 박힌 매니페스트**(`requirements.txt` / `renv.lock` / `Project.toml`)로 정의해 리포에 커밋하고, 이미지는 그 매니페스트로 빌드한다. 즉 "이미지에 무엇이 들어 있는지"가 코드로 남고 재현 가능하다.

- Quarto CLI (버전 핀)
- Python venv: jupyter + 넉넉한 데이터과학 스택 — numpy, pandas, matplotlib, **altair, vega_datasets**, plotly, seaborn, scikit-learn, scipy, statsmodels 등
- R: knitr, rmarkdown, tidyverse(ggplot2 포함), showtext
- Julia: IJulia, Plots, DataFrames — 커널 이름(예: `julia-1.10`) 핀 고정
- 한글 폰트(섹션 5) 및 엔진별 폰트 기본 설정

런타임 3종이 모두 들어가 수 GB 이미지가 된다. 레이어 분리와 빌드 캐시로 관리한다. 사용자는 어떤 런타임/패키지도 직접 설치할 필요가 없어진다.

> PDF용 LaTeX/TinyTeX는 굽지 않는다 — PDF 출력은 현재 제외 범위라 이미지를 불필요하게 키울 이유가 없다. PDF를 도입하는 시점에 추가한다.

### 패키지 정책 (큐레이션 이미지)

현재 README/QUICKSTART의 고정 pip 목록(`jupyter pyyaml matplotlib pandas numpy`)은 본질적으로 불완전하다. 사용자가 무엇을 import할지(altair, plotly, seaborn…) 미리 알 수 없어, 목록을 늘려도 끝이 없다. 이미지로 옮긴다고 목록 자체가 사라지지는 않는다 — 세 갈래의 정책이 있다.

| 정책 | 내용 | 트레이드오프 |
| --- | --- | --- |
| **A. 큐레이션 이미지 (채택·시작점)** | 흔한 데이터과학 스택을 버전 핀 매니페스트로 넉넉히 베이크 | 단순·재현성·안전. 목록 밖 패키지는 여전히 실패하지만 대부분 커버. 새 패키지는 매니페스트 PR → 이미지 재빌드로 추가(검토·핀 보장) |
| B. 동적 설치 | 문서가 의존성을 선언 → 렌더 시 설치 | 유연하나 임의 코드 실행 + 네트워크 + 속도 + 공급망 리스크. **우리 설계의 `--network none` 기본값과 정면 충돌**(아래) |
| C. 하이브리드 | 기본 베이크 + 선언된 추가분만 격리 환경에서 설치 | 가장 유연·가장 복잡. 의존성 fetch와 코드 실행을 분리해야 함 |

**채택**: Phase 0은 **A(큐레이션 매니페스트)** 로 시작한다. `altair`·`vega_datasets`처럼 흔한 것은 지금 baseline에 포함한다.

**B/C의 핵심 제약**: 렌더 컨테이너를 `--network none`으로 격리하기로 했는데 `pip install`은 네트워크가 필요하다. 따라서 B는 단순히 "샌드박싱 필요"가 아니라 **격리 기본값과 충돌**한다. 동적/추가 설치를 도입하려면 "의존성 fetch(네트워크 허용, 단 사설/검증 미러로 한정 + 핀·해시 검증)" 단계와 "코드 실행(네트워크 차단)" 단계를 **분리**해야 한다 — fetch가 끝난 뒤 실행 단계는 여전히 네트워크 없이 돈다. 복잡도가 커서 후속 Phase로 둔다.

### 워커 ↔ 일회용 컨테이너 계약

기존 코드를 재사용한다.

- **입력**: `index.qmd` + `_quarto.yml`이 담긴 작업 디렉토리. 두 파일 생성은 현재 `src/lib/quarto/project.ts`의 `buildQuartoProjectFiles`를 그대로 재사용한다.
- **출력**: 성공 시 `index.html`, 실패 시 비정상 종료코드 + 로그.
- 바뀌는 것은 하나뿐 — `quarto render`가 웹 프로세스가 아니라 일회용 컨테이너 안에서 실행된다. 현재 `render.ts`·`runtime.ts`의 로직이 워커로 이동한다.

### 일회용 컨테이너 실행 옵션

워커가 잡 1건마다 다음 제약으로 컨테이너를 띄운다(`docker run --rm`).

```
--network none                 # 네트워크 차단(기본)
--read-only                    # 루트 파일시스템 읽기전용
--tmpfs /work:rw,size=512m     # 작업 디렉토리만 쓰기 가능
--user 1000:1000               # 비루트 실행
--cap-drop ALL
--security-opt no-new-privileges
--pids-limit 256
--memory 1g --cpus 1.5         # 자원 상한(VM 용량 ÷ 동시성으로 산정)
```

컨테이너 안에서 `quarto render index.qmd --to html`을 실행해 `/work/index.html`을 만든다. 워커가 이를 읽어 스토리지에 저장하고 잡을 완료 처리한 뒤, 컨테이너와 작업 디렉토리를 폐기한다.

### 도커 소켓 하드닝

워커가 컨테이너를 띄우려면 Docker API가 필요하다. 원시 `/var/run/docker.sock`를 워커에 마운트하면 호스트 루트 탈취 경로가 된다. 따라서 **docker-socket-proxy**(Tecnativa)를 앞에 두고 `containers/create·start·wait·remove·logs` 엔드포인트만 허용하고 나머지는 차단한다.

### 네트워크 정책

`--network none`을 기본값으로 둔다. 따라서 외부 데이터를 가져오는 코드 청크는 기본적으로 실패한다. 부분 신뢰 모델에 맞춰 기본 차단으로 가고, 문서별 "네트워크 허용" opt-in은 추후 별도 기능으로 둔다(이번 범위 제외).

## 섹션 2 — 비동기 잡 모델 & 큐

### 왜 비동기인가

코드 실행 렌더는 수초~수분이 걸린다. HTTP 요청/Server Action을 붙잡고 있을 수 없다. 그래서 `요청 → 잡 ID 발급 → 상태 폴링 → 완료 시 결과 조회` 흐름을 쓴다. 재시도·쿼터·가시성도 여기서 따라온다.

### 잡 상태머신

```
queued → running → (succeeded | failed | timed_out | canceled)
```

- `queued`: 웹이 렌더 요청 시 삽입.
- `running`: 워커가 클레임(`worker_id`, `claimed_at` 기록).
- 종료 상태: `finished_at`, `log`, 성공 시 `artifact_id` 저장.

### Postgres 큐 메커니즘

`render_jobs` 테이블이 큐를 겸한다. 워커는 다음으로 잡을 클레임한다.

```sql
UPDATE render_jobs SET status='running', worker_id=$1, claimed_at=now(), attempts=attempts+1
WHERE id = (
  SELECT id FROM render_jobs
  WHERE status='queued'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

- **즉시 깨우기**: 웹이 잡 삽입 후 `NOTIFY`, 워커가 `LISTEN`. 폴백으로 N초 폴링.
- **죽은 워커 회수**: `status='running' AND claimed_at < now() - interval '<timeout>'`인 잡을 sweep으로 `queued`로 되돌리거나(재시도 한도 내), 한도 초과 시 `timed_out`으로 종료.

### 타임아웃·재시도·쿼터

- **타임아웃**: 잡당 벽시계 제한(기본 60s, 설정 가능). 워커가 컨테이너를 kill하고 `timed_out` 처리.
- **재시도**: 인프라성 실패(컨테이너 기동 실패 등)는 백오프 자동 재시도(한도 내). 사용자 코드 오류는 재시도 없이 로그를 노출.
- **사용자별 동시 렌더 상한**: 한 사용자가 워커를 독점하지 못하도록 동시 `running` 상한(예 1~2건)을 둔다. 큐는 FIFO지만, 상한을 초과한 사용자의 잡은 클레임에서 건너뛰어 다른 사용자의 기아를 막는다(클레임 쿼리에 사용자별 running 카운트 조건 추가).

### 웹 ↔ 상태 조회

`getRenderJobAction(jobId)` Server Action 폴링으로 시작한다(현재 Server Action 스타일과 일치). SSE 스트리밍은 이후 개선으로 둔다.

## 섹션 3 — 데이터 모델 & 인증

### Postgres 스키마(목표)

```
users            -- Auth.js가 관리(users/accounts/sessions/verification_token)
  id, email(unique), name, image, created_at

documents
  id              uuid pk
  owner_id        uuid not null references users(id)
  title           text not null
  slug            text not null
  content         text not null
  execute_code    boolean not null default false
  latest_artifact_id uuid null references artifacts(id)  -- 현재 미리보기 포인터
  created_at, updated_at timestamptz
  unique(owner_id, slug)                                 -- slug는 사용자별 유니크

render_jobs       -- 큐 겸용
  id              uuid pk
  document_id     uuid not null references documents(id) on delete cascade
  requested_by    uuid not null references users(id)
  status          text not null default 'queued'
  content_snapshot text not null    -- 제출 시점 qmd(결정적 렌더)
  execute_code    boolean not null
  worker_id       text null
  attempts        int not null default 0
  log             text null
  artifact_id     uuid null references artifacts(id)
  created_at, claimed_at, finished_at timestamptz
  index (status, created_at)        -- 큐 클레임용
  index (document_id)

artifacts
  id              uuid pk
  document_id     uuid not null references documents(id) on delete cascade
  job_id          uuid references render_jobs(id)
  storage_key     text not null     -- 예: artifacts/{job_id}/index.html
  content_type    text not null default 'text/html'
  size_bytes      bigint
  created_at      timestamptz
```

현재 `documents` 테이블의 `rendered_html·render_status·render_error·rendered_at`는 제거한다. HTML은 `artifacts`(실제 바이트는 스토리지)로, 상태는 `render_jobs`로 이동한다. 이로써 지금 DB 파일이 12MB+로 부푼 원인(행에 self-contained HTML 통째 저장)이 근본 해소된다.

### 인증·인가

- **Auth.js(NextAuth v5) + Postgres 어댑터.** 세션도 Postgres에 저장.
- 1차 로그인은 OAuth(Google/GitHub) 권장(비밀번호 관리 회피). credentials 방식도 가능.
- 미들웨어로 보호 라우트를 막는다.
- 모든 문서/잡 쿼리는 `owner_id = session.user.id`로 스코프한다. 워커는 시스템 액터로서 owner 무관하게 잡을 읽지만, 사용자에게 데이터를 서빙하는 것은 항상 웹의 owner 검사를 거친다.

### 데이터 이관

기존 SQLite `documents`를 Postgres로 옮기는 1회성 스크립트를 둔다. 기존 문서는 owner가 없으므로 부트스트랩(관리자) 사용자에게 귀속시킨다. 인라인 `rendered_html`은 버리거나 artifacts로 옮긴다.

## 섹션 4 — 아티팩트 스토리지

- 렌더 출력은 단일 self-contained HTML(`embed-resources: true`)이며 수 MB(base64 이미지 포함)일 수 있다.
- **1차(단일 VM)**: 공유 Docker 볼륨에 `artifacts/{job_id}/index.html`로 저장(워커 쓰기, 웹 읽기). 메타는 `artifacts` 테이블.
- **이후**: S3 호환(MinIO/외부 S3)으로 승격. `storage_key` 추상화 덕에 드라이버 교체만으로 가능.
- **보존 정책**: 문서당 최신 N개만 유지하거나 TTL로 오래된 아티팩트를 정리(cron/sweep). 무한 증가 방지.
- **서빙 보안(중요)**: 렌더 HTML에는 사용자 JS(특히 OJS 청크)가 포함될 수 있다. 앱 대상 XSS를 막기 위해 미리보기는 **sandbox iframe** 또는 **분리된 오리진**으로 서빙한다.

## 섹션 5 — 한글 폰트

**원인**: matplotlib·ggplot2·Plots.jl의 기본 폰트에 한글 글리프가 없어 차트 라벨·제목이 두부(□)로 깨진다. HTML 텍스트 자체는 멀쩡하고 **래스터 차트 이미지만** 문제다.

렌더 이미지에 두 가지를 굽는다.

1. **폰트 설치**: `fonts-nanum`(나눔고딕/명조) + `fonts-noto-cjk`(Noto Sans CJK KR) 설치 후 `fc-cache -f`.
2. **엔진별 기본 설정 주입**(사용자가 문서에서 손대지 않아도 한글이 나오게):
   - **matplotlib(Python)**: `matplotlibrc`를 `MPLCONFIGDIR`에 구워 `font.family: NanumGothic`, `axes.unicode_minus: False`(마이너스 기호 깨짐 방지) 설정. 폰트 설치 후 matplotlib 폰트 캐시 갱신.
   - **R/ggplot2**: `showtext` 설치 + 사이트 `.Rprofile`/knitr 셋업에서 나눔 폰트를 등록하고 기본 디바이스 폰트로 지정.
   - **Julia/Plots.jl**: `startup.jl`에서 `default(fontfamily="NanumGothic")` 설정, GR이 폰트를 찾도록 fontconfig/`GKS_FONTPATH` 보장.
3. **검증**: 엔진별 "한글 제목 차트" 스모크 테스트(`.qmd`)를 이미지 빌드 CI에 포함해 두부가 없는지 확인.

이로써 사용자가 문서를 수정하지 않아도 한글 차트가 기본으로 동작한다.

## 보안 요약

- 일회용 컨테이너: 네트워크 차단(기본)·읽기전용 루트FS·tmpfs·비루트·cap-drop·pids/메모리/CPU 상한·시간 제한.
- docker-socket-proxy로 워커의 Docker API를 최소 엔드포인트로 제한.
- 미리보기 HTML은 sandbox iframe/분리 오리진으로 서빙(OJS 사용자 JS 격리).
- 모든 데이터 접근은 owner 스코프 인가.

## 비기능 요건 / 운영

- **자원 산정**: 워커 동시성 = floor(VM 메모리 ÷ 렌더당 메모리 상한). 기본값을 문서화.
- **관측성**: 잡 처리시간·큐 적체·실패율 메트릭, 워커/컨테이너 로그 수집.
- **백업**: Postgres 덤프 + 아티팩트 볼륨 스냅샷.

## 단계별 마일스톤

각 Phase는 독립적으로 배포·검증 가능하다.

- **Phase 0 — 렌더 이미지 + 폰트**: `quarto-render` 이미지 빌드(Quarto + 3런타임 + 한글 폰트 + 엔진 설정). 패키지는 버전 핀 매니페스트로 정의한 **큐레이션 baseline**(altair·vega_datasets 등 흔한 스택 포함). 예제 `.qmd`와 한글 차트로 독립 검증. **한글 폰트 통증과 "패키지 누락(altair 등)" 통증을 함께 즉시 해소**하고 이후 모든 단계의 전제가 된다.
- **Phase 1 — 워커 분리 + 큐**(단일 사용자 유지): Postgres 이전(documents), `render_jobs` 테이블, 워커 프로세스, 소켓프록시 경유 일회용 컨테이너 실행, 웹의 잡 제출·폴링. 비동기 파이프라인 E2E 검증.
- **Phase 2 — 아티팩트 스토리지**: 렌더 HTML을 DB → 볼륨으로, sandbox 서빙, 보존 정책.
- **Phase 3 — 인증 + 멀티유저**: Auth.js, owner 스코프 데이터, 사용자별 쿼터, 기존 문서 이관.
- **Phase 4 — 하드닝/운영**: 자원 튜닝, 관측, 백업, 네트워크 opt-in 등.

## 제외 범위 (이번 설계에서 다루지 않음)

- 협업 편집, 버전 관리, 문서 import/export.
- PDF·Word 등 HTML 외 출력 포맷.
- 문서별 네트워크 허용 opt-in(추후 기능).
- Kubernetes·오토스케일·다중 VM(트래픽 성장 시 별도 검토).
- 결제·과금.

## 추후 결정 필요

- 인증 1차 방식: OAuth(Google/GitHub) vs credentials — 구현 계획 단계에서 확정.
- 렌더당 자원 상한(메모리/CPU)과 워커 동시성의 구체 수치 — 대상 VM 사양 확정 후 산정.
- 스토리지 1차: 공유 볼륨으로 시작하되 MinIO 도입 시점.
- 큐레이션 baseline 패키지의 구체 목록·버전 — Phase 0에서 확정(매니페스트).
- 동적/추가 패키지 설치(정책 B/C) 도입 여부와 시점 — fetch/실행 분리 구조 필요, Phase 0 이후.
