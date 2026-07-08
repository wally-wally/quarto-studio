# Quarto Studio QUICKSTART

이 문서만 따라 하면 로컬에서 `http://localhost:3000`이 뜨고, 회원가입 → 문서 작성 → 렌더까지 동작한다.

> [!IMPORTANT]
> 이 프로젝트는 더 이상 "호스트에 Python/R/Julia/Quarto를 설치"하지 않는다.
> 코드 청크(`{python}` `{r}` `{julia}`)는 **Daytona의 관리형 sandbox 안에서** 실행된다(로컬에 렌더 이미지를 빌드/구동하지 않는다).
> 호스트에 필요한 건 **Docker**(web·worker·Postgres 자체 구동용)와 **Daytona API 키** 뿐이고, 개발 모드에서만 추가로 Node.js·pnpm이 필요하다.

## 구성 한눈에

| 컴포넌트 | 역할 | 어디서 도나 |
| --- | --- | --- |
| **web** (Next.js) | 문서 작성 UI, 인증, 잡 큐잉, 미리보기 서빙 | `:3000` |
| **Postgres** | 문서·렌더 잡·아티팩트·사용자·세션 저장 | `:5432` |
| **worker** | 큐에서 잡을 집어 Daytona sandbox에서 렌더 실행 | 백그라운드 |
| **convert** (FastAPI) | AI 작성의 docx/pptx/pdf 첨부 → 텍스트 추출 사이드카 | `:8000` |
| **Daytona sandbox** | Quarto + Python/R/Julia + 한글 폰트 (스냅샷 `DAYTONA_SNAPSHOT`) | 잡마다 일회용 ephemeral sandbox (Daytona 관리형, 호스트 밖) |

---

## Step 0. 사전 조건

| 도구 | 필요 경로 | 확인 |
| --- | --- | --- |
| **Docker Desktop** (실행 중) | A·B 공통 | `docker info` |
| **Daytona API 키** (`.env.local`의 `DAYTONA_API_KEY`) | A·B 공통 — 렌더 실행에 필수 | [app.daytona.io](https://app.daytona.io)에서 발급 |
| **Node.js 24** (`.nvmrc`) | B(개발)만 | `node -v` |
| **pnpm 9.15.9** | B(개발)만 | `pnpm -v` |
| **Python 3.13+** | B(개발)에서 AI에 docx/pptx/pdf 첨부할 때만 | `python3 -V` |

```bash
docker info >/dev/null 2>&1 && echo "docker: OK" || echo "docker: Docker Desktop을 먼저 실행"
```

> [!NOTE]
> 호스트 Node가 24가 아니어도 대부분 동작하지만(엔진 경고만 뜸), 네이티브 모듈 이슈를 피하려면 `.nvmrc` 기준 Node 24 권장. `nvm`이 있으면 `nvm install && nvm use`.

### 완전히 새 머신이라면 (호스트에 아무것도 없을 때)

> **그냥 돌리기(경로 A)** 만 할 거면 호스트에 필요한 건 **Docker + git + Daytona API 키** 뿐이다. Node·pnpm·Python·R·Julia·Quarto는 전부 Daytona sandbox(스냅샷) 안에 있으므로 호스트엔 설치하지 않는다. 아래 Node/pnpm은 **개발 모드(경로 B)** 에서만 필요하다.

**macOS**

```bash
xcode-select --install                       # git (Command Line Tools)

brew install --cask docker                   # Docker Desktop
open -a Docker                               # 앱을 한 번 실행 → 메뉴바 고래 아이콘 안정되면 준비됨

# (개발 모드만) Node 24 + pnpm
brew install nvm                             # 안내대로 셸 설정(.zshrc) 후
nvm install 24 && nvm use 24                 # 또는: brew install node@24
corepack enable && corepack prepare pnpm@9.15.9 --activate
```

**Linux (Ubuntu/Debian)**

```bash
sudo apt-get update && sudo apt-get install -y git

curl -fsSL https://get.docker.com | sh       # Docker Engine + Compose v2
sudo usermod -aG docker "$USER"              # 로그아웃→로그인 후 sudo 없이 docker

# (개발 모드만) Node 24 + pnpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
# 셸 재시작 후:
nvm install 24 && nvm use 24
corepack enable && corepack prepare pnpm@9.15.9 --activate
```

> Windows는 **Docker Desktop + WSL2** 위에서 위 Linux 절차를 따른다. 서버(VM) 배포는 백업·보안까지 정리된 **[docs/DEPLOY.md](docs/DEPLOY.md)** 참고.

**저장소 받기 (공통)**

```bash
git clone <레포 URL> quarto-studio && cd quarto-studio
```

> [!NOTE]
> **디스크/리소스:** 렌더는 Daytona sandbox(호스트 밖)에서 실행되므로 렌더 이미지 관련 로컬 디스크/메모리 여유는 필요 없다. 호스트 Docker는 web·worker·Postgres 컨테이너만 구동한다.

---

## Step 1. Daytona 설정 (A·B 공통, 최초 1회)

```bash
cp .env.example .env.local
# .env.local을 열어 DAYTONA_API_KEY=<발급받은 키> 를 채운다
```

> [!IMPORTANT]
> 렌더용 스냅샷(`DAYTONA_SNAPSHOT`, 기본값 `quarto-render-1`)이 아직 없다면 최초 1회
> `./scripts/daytona-snapshot.sh` 로 서버사이드 빌드해야 한다(수십 분 소요, Daytona 쪽에서 진행되므로
> 호스트 리소스는 쓰지 않는다). 이미 팀에서 만들어 둔 스냅샷을 쓴다면 이 단계는 건너뛰어도 된다.

**검증:**

```bash
pnpm smoke:daytona   # docker/render/smoke/의 qmd 7종을 스냅샷으로 렌더해 확인
```

`DAYTONA_API_KEY`가 없거나 스냅샷이 없으면 워커가 렌더를 실행하지 못해 잡이 실패한다.

---

## 경로 A — Docker Compose 풀스택 (가장 간단, 추천)

웹·DB·워커·마이그레이션을 한 번에 띄운다. 그냥 "돌려보고 싶다"면 이 경로.

> [!NOTE]
> Docker Compose는 `.env.local`이 아니라 `.env`(또는 셸에 export된 값)를 읽는다. `worker` 서비스는
> `DAYTONA_API_KEY`가 없으면 기동에 실패하므로, Step 1에서 채운 값을 `.env`로 복사하거나 셸에서
> export 한 뒤 아래 명령을 실행한다.

```bash
export DAYTONA_API_KEY=<Step 1에서 발급받은 키>   # 또는 .env.local을 .env로 복사
docker compose up --build
```

- `migrate`(one-shot)가 DB 스키마를 만들고 종료 → `web`(:3000) + `worker` + `convert`(:8000) 기동.
- `convert` 사이드카는 AI 작성의 docx/pptx/pdf 첨부 텍스트 추출용이며 `web`이 자동 연결한다(별도 설정 불필요).
- 처음 로그가 안정되면 브라우저에서 **`http://localhost:3000`** → **회원가입** → 문서 작성 → **Render**.

**검증 (다른 터미널):**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000   # 200/307이면 OK
```

**중지 / 정리:**

```bash
docker compose down        # 컨테이너만 내림 (데이터 볼륨 유지)
docker compose down -v     # 데이터(Postgres·아티팩트)까지 삭제
```

**(선택) 예제 문서 시드** — 회원가입을 먼저 한 뒤, 그 이메일로:

```bash
docker compose run --rm -e SEED_USER_EMAIL=you@example.com migrate \
  node scripts/seed-examples.mjs
```

---

## 경로 B — 개발 모드 (코드 수정 + 핫 리로드)

앱 코드를 고치며 작업할 때. web/worker는 호스트에서 직접 돌리고, Postgres만 컨테이너로 띄운다.

### B-1. Postgres 기동 + 의존성

```bash
docker compose up -d --wait postgres     # healthy까지 대기
pnpm install
cp .env.example .env.local               # 기본값이 localhost:5432라 그대로 OK
```

### B-2. 마이그레이션

```bash
export DATABASE_URL=postgres://quarto:quarto@localhost:5432/quarto_studio
pnpm migrate
```

> [!NOTE]
> `pnpm migrate` 와 `pnpm worker` 는 `.env.local` 을 자동으로 읽지 않는다(`next dev`만 자동 로드).
> 따라서 **이 두 명령을 실행하는 셸마다 `DATABASE_URL` 을 `export`** 해야 한다.

### B-3. web + worker 동시 실행 (터미널 2개)

```bash
# 터미널 1 — 웹 (.env.local 자동 로드)
pnpm dev

# 터미널 2 — 렌더 워커
export DATABASE_URL=postgres://quarto:quarto@localhost:5432/quarto_studio
export DAYTONA_API_KEY=<.env.local의 값>
pnpm worker
```

- `pnpm worker` 는 Daytona API를 호출해 잡마다 ephemeral sandbox를 만들어 렌더한다(호스트 Docker 소켓 불필요) → **Step 1의 `DAYTONA_API_KEY`/스냅샷이 준비돼 있어야 한다.**
- 브라우저 **`http://localhost:3000`** → 회원가입 → 작성 → Render → 워커 로그에 잡 처리, 미리보기에 결과.

**검증:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

**(선택) 예제 시드** — 회원가입한 이메일로:

```bash
export DATABASE_URL=postgres://quarto:quarto@localhost:5432/quarto_studio
export SEED_USER_EMAIL=you@example.com
node scripts/seed-examples.mjs
```

### B-4. (선택) convert 사이드카 — AI 첨부(docx/pptx/pdf) 추출

AI 작성에 **docx·pptx·pdf** 파일을 첨부할 때만 필요하다. (이미지·텍스트·xlsx·Anthropic PDF는 사이드카 없이 동작한다.)
없이 그 형식을 첨부하면 추출 단계에서 **502**가 난다.

```bash
# 터미널 3 — convert 서비스 (최초 1회만 venv 생성)
cd convert
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
```

- web은 `CONVERT_SERVICE_URL`(기본 `http://localhost:8000`)로 이 서비스를 찾는다. 미설정이면 기본값을 쓰므로 위처럼 8000 포트로 띄우면 된다. `pnpm dev` 재시작은 필요 없다(요청 시점에 URL을 읽는다).
- 헬스 체크: `curl -s localhost:8000/health` → `{"status":"ok"}`

---

## 렌더 이미지 / 한글 폰트 검증 (선택, 렌더 이미지를 직접 손볼 때만)

`docker/render/`를 수정해 새 스냅샷을 만들 때 쓰는 로컬 검증 도구다. 앱을 그냥 돌리는 데는 필요 없다.

```bash
docker build -t quarto-render:dev docker/render   # 로컬에서 이미지만 빌드해 검증(최초엔 수십 분)
docker/render/verify.sh    # examples/ 14종을 렌더 이미지로 실제 렌더
docker/render/smoke.sh     # 한글 폰트 회귀(no-tofu) + 엔진별 경고 점검
```

수정한 `docker/render/Dockerfile`을 실제 배포에 반영하려면 위 로컬 검증 후
`./scripts/daytona-snapshot.sh <새버전>` 으로 서버사이드 스냅샷을 만들고 `pnpm smoke:daytona`로
Daytona 쪽에서도 검증한 뒤 `DAYTONA_SNAPSHOT`을 교체한다.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `docker: Cannot connect ...` | Docker Desktop 미실행 | Docker Desktop 실행 후 `docker info` |
| 잡이 계속 `queued`/실패 | 워커 미실행 또는 `DAYTONA_API_KEY`/스냅샷 미준비 | 경로 A는 `worker` 로그 확인 / 경로 B는 `pnpm worker` 실행 + Step 1(API 키·스냅샷) 확인 |
| `DAYTONA_API_KEY 환경변수가 필요합니다` | worker 셸에 export 안 됨 | 해당 셸에서 `export DAYTONA_API_KEY=...` (경로 B) |
| `DATABASE_URL 환경변수가 필요합니다` | migrate/worker 셸에 export 안 됨 | 해당 셸에서 `export DATABASE_URL=...` |
| `:3000` 응답 없음 | web 미기동 / 컴파일 에러 | 경로 A `web` 로그, 경로 B `pnpm dev` 로그 확인 |
| AI 작성에 docx/pptx/pdf 첨부 시 **502** | convert 사이드카 미실행 | 경로 A는 `convert` 로그 / 경로 B는 **B-4**로 `:8000` 기동 후 재시도 |
| 포트 3000/5432 사용 중 | 다른 프로세스 점유 | 기존 프로세스 종료 또는 compose 포트 변경 |
| 엔진 경고 `wanted node >=24 <25` | 호스트 Node가 24 아님 | 경고일 뿐(동작함). 정확히는 `nvm use` 로 24 |
| 시드가 `사용자를 찾을 수 없습니다` | 해당 이메일 회원가입 전 | 브라우저에서 먼저 회원가입 후 시드 |

> [!WARNING]
> 코드 실행을 켠 문서는 Daytona의 일회용 sandbox 안에서 임의 코드를 실행한다(네트워크 완전 차단
> `networkBlockAll`, 잡 종료 시 sandbox 삭제, 자세한 격리 항목은 [docs/DEPLOY.md](docs/DEPLOY.md#보안--격리)
> 참고). 그래도 **신뢰할 수 있는 문서에서만** 코드 실행을 켜라.

## 전체 검증 (선택)

```bash
pnpm verify        # lint → typecheck → test → build
```
