# Quarto Studio

Quarto Studio는 QMD 문서를 작성·저장하고 Quarto로 HTML 미리보기를 렌더링하는 Next.js 앱이다.
렌더는 **Daytona의 격리된 일회용 sandbox**에서 수행되고, 데이터는 **Postgres**에 저장되며, **세션 인증 기반 다중 사용자**를 지원한다. Python/R/Julia 차트의 **한글 폰트 깨짐**도 렌더 스냅샷에서 해결돼 있다.

> 처음이라면 **[QUICKSTART.md](QUICKSTART.md)** 한 문서로 로컬 구동까지 끝낼 수 있다.

## 예시 화면

![Python 실행형 차트 예제](images/example01.png)

![R 실행형 ggplot 예제](images/example02.png)

## 아키텍처

```mermaid
flowchart LR
  B["브라우저"]
  subgraph host["로컬 머신 / 단일 VM (Docker)"]
    W["web · Next.js<br/>:3000"]
    PG[("Postgres<br/>documents · render_jobs<br/>artifacts · users · sessions")]
    WK["worker · tsx<br/>render-worker"]
    AR[["아티팩트 스토리지<br/>ARTIFACT_DIR"]]
    CV["convert · FastAPI<br/>:8000<br/>docx/pptx/pdf→텍스트"]
  end
  subgraph daytona["Daytona (관리형, 호스트 밖)"]
    RC["일회용 ephemeral sandbox<br/>스냅샷 DAYTONA_SNAPSHOT<br/>Quarto + Py/R/Julia + 한글폰트"]
  end
  W <-->|"문서·잡·세션"| PG
  WK -->|"잡 클레임<br/>FOR UPDATE SKIP LOCKED"| PG
  WK -->|"Daytona API<br/>networkBlockAll"| RC
  RC -->|"index.html"| AR
  W -->|"/preview/:id"| AR
  W -->|"AI docx/pptx/pdf 첨부 추출"| CV
  B -->|"작성 · 렌더 요청"| W
  B -->|"미리보기 iframe"| W
```

- **web**은 문서를 Postgres에 저장하고, 렌더 요청을 `render_jobs` 큐에 넣는다.
- **worker**는 큐에서 잡을 집어(`FOR UPDATE SKIP LOCKED`) Daytona API로 일회용 sandbox를 생성해 렌더시키고, 결과 HTML을 아티팩트로 저장한다.
- 코드 청크는 호스트가 아니라 **Daytona sandbox 안에서** 실행된다(격리: `networkBlockAll`로 외부 통신 차단, 잡당 ephemeral sandbox, 스냅샷 기준 2 vCPU/2GiB/10GiB 리소스 상한).
- **convert**는 AI 작성에 첨부한 docx/pptx/pdf를 텍스트로 변환하는 사이드카다(markitdown 기반). 이미지·텍스트·xlsx·Anthropic PDF는 web 인프로세스로 처리한다.

## 빠른 시작

가장 간단한 경로(풀스택 Compose):

```bash
export DAYTONA_API_KEY=<Daytona API 키>            # 렌더용 — 최초 1회 app.daytona.io에서 발급
docker compose up --build                          # postgres + migrate + web + worker + convert
# http://localhost:3000 → 회원가입 → 작성 → Render
```

렌더용 Daytona 스냅샷(`DAYTONA_SNAPSHOT`, 기본 `quarto-render-1`)이 아직 없다면 먼저
`./scripts/daytona-snapshot.sh` 로 생성한다. 코드 수정용 개발 모드(핫 리로드), 시드, 트러블슈팅 등
전체 절차는 **[QUICKSTART.md](QUICKSTART.md)** 참고.

## 요구 사항

| 항목 | 필요 | 비고 |
| --- | --- | --- |
| **Docker Desktop** | 항상 | DB·web·worker 컨테이너 구동 |
| **Daytona API 키** | 항상 | 렌더 실행(Daytona 관리형 sandbox)에 필수 |
| **Node.js 24** (`.nvmrc`) | 개발 모드 | `nvm install && nvm use` |
| **pnpm 9.15.9** | 개발 모드 | `corepack prepare pnpm@9.15.9 --activate` |
| **Python 3.13+** | 개발 모드 + AI에 docx/pptx/pdf 첨부 시 | convert 사이드카용(`convert/` venv). Compose 경로는 불필요 |

> 호스트에 Python/R/Julia/Quarto를 **따로 설치하지 않는다.** 전부 Daytona 렌더 스냅샷(`docker/render/` 기반) 안에 있다.

## 주요 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://quarto:quarto@localhost:5432/quarto_studio` | Postgres 접속 문자열 |
| `ARTIFACT_DIR` | `./data/artifacts` | 렌더된 HTML 아티팩트 저장 위치(web·worker 공유) |
| `QUARTO_RENDER_TIMEOUT_MS` | `60000` | 렌더 프로세스 제한 시간(ms) |
| `DAYTONA_API_KEY` | (비밀 — git 커밋 금지) | Daytona API 키 |
| `DAYTONA_SNAPSHOT` | `quarto-render-1` | 워커가 사용할 Daytona 스냅샷 이름 |
| `CONVERT_SERVICE_URL` | `http://localhost:8000` | AI 첨부(docx/pptx/pdf) 텍스트 추출 사이드카 URL |

Compose 환경에서는 위 값들이 서비스에 맞게 자동 주입된다(예: `DATABASE_URL`의 호스트가 `postgres`).
단, Compose는 `.env.local`이 아니라 `.env`/셸 export를 읽으므로 `DAYTONA_API_KEY`는 별도로 넘겨야 한다
(자세한 내용은 [QUICKSTART.md](QUICKSTART.md) 참고).

## 렌더 이미지 / Daytona 스냅샷

`docker/render/`는 Quarto + Python(venv) + R(PPM 스냅샷) + Julia 1.10 + 한글 폰트를 담은 이미지 정의다.
실제 렌더는 이 정의로 만든 **Daytona 스냅샷**(`DAYTONA_SNAPSHOT`) 위에서 수행되며, 로컬 Docker 빌드는
이미지 자체를 검증할 때만 필요하다.

```bash
# 로컬 검증(선택, docker/render/ 수정 시)
docker build -t quarto-render:dev docker/render
docker/render/verify.sh    # examples/ 14종 실제 렌더 검증
docker/render/smoke.sh     # 한글 폰트 회귀(no-tofu) 점검

# Daytona 스냅샷 생성/갱신 + 검증
./scripts/daytona-snapshot.sh <버전>   # 서버사이드 빌드 (예: quarto-render-2)
pnpm smoke:daytona                     # docker/render/smoke/의 qmd 7종으로 스냅샷 검증
```

한글 폰트는 단순 폰트 누락이 아니라 **POSIX 로케일** 문제였고, 이미지에서 `LANG`/`LC_CTYPE`를 UTF-8로 고정하고 엔진별(matplotlib·ggplot2·Plots) 기본 폰트를 `NanumGothic`으로 설정해 해결했다.

## 예제 문서

`examples/`에 Markdown/Python/R/Observable JS/Julia `.qmd` 예제가 있다.

| 분류 | 파일 | 코드 실행 |
| --- | --- | --- |
| Markdown (기본/수식/Mermaid) | `01`~`03` | 불필요 |
| Python (기본/pandas/차트) | `04`~`07` | 필요 |
| R (기본/ggplot/분포 차트) | `08`~`10` | 필요 |
| Observable JS (인터랙티브/Plot) | `11`~`12` | 불필요(브라우저 실행) |
| Julia (기본/Plots 차트) | `13`~`14` | 필요 |

로그인한 사용자 계정에 시드하려면 `SEED_USER_EMAIL`을 지정해 `scripts/seed-examples.mjs`를 실행한다(절차는 QUICKSTART 참고).

## 렌더 정책

렌더 시 Daytona 일회용 sandbox에 `index.qmd`와 `_quarto.yml`을 업로드하고, `quarto render`를 수행한다. 코드 실행 여부는 문서의 `executeCode` 값으로 제어된다.

| `executeCode` | `_quarto.yml` | 의미 |
| --- | --- | --- |
| `false` (기본) | `execute.eval: false` | 코드 미실행 렌더 |
| `true` | `execute.eval: true` | 코드 실행 허용 렌더 |

새 문서는 코드 실행이 꺼진 채 시작한다. 켜면 Daytona sandbox 안에서 문서의 코드가 실행되므로 신뢰할 수 있는 내용에만 사용한다.

## 검증 / 배포

```bash
pnpm verify        # lint → typecheck → test → build
```

배포·백업·보안 하드닝 절차는 **[docs/DEPLOY.md](docs/DEPLOY.md)** 참고.

## 현재 상태 / 한계

- HTML 미리보기 중심이며 PDF/Word 등 다른 출력 포맷은 아직 미지원.
- web·worker는 단일 VM + Docker Compose 단일 노드 구성을 전제로 한다(수평 확장은 별도 작업). 렌더 자체는 Daytona가 관리형으로 격리·확장한다.
- 협업 동시 편집, 문서 가져오기/내보내기는 아직 없다.
