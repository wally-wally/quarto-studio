# Quarto Studio QUICKSTART

이 문서만 따라 하면 로컬에서 `http://localhost:3000`이 뜨고, 회원가입 → 문서 작성 → 렌더까지 동작한다.

> [!IMPORTANT]
> 이 프로젝트는 더 이상 "호스트에 Python/R/Julia/Quarto를 설치"하지 않는다.
> 코드 청크(`{python}` `{r}` `{julia}`)는 **Docker 렌더 이미지(`quarto-render:dev`) 안에서** 실행된다.
> 호스트에 필요한 건 **Docker** 뿐이고, 개발 모드에서만 추가로 Node.js·pnpm이 필요하다.

## 구성 한눈에

| 컴포넌트 | 역할 | 어디서 도나 |
| --- | --- | --- |
| **web** (Next.js) | 문서 작성 UI, 인증, 잡 큐잉, 미리보기 서빙 | `:3000` |
| **Postgres** | 문서·렌더 잡·아티팩트·사용자·세션 저장 | `:5432` |
| **worker** | 큐에서 잡을 집어 일회용 렌더 컨테이너 실행 | 백그라운드 |
| **렌더 이미지** `quarto-render:dev` | Quarto + Python/R/Julia + 한글 폰트 | 잡마다 일회용 컨테이너 |

---

## Step 0. 사전 조건

| 도구 | 필요 경로 | 확인 |
| --- | --- | --- |
| **Docker Desktop** (실행 중) | A·B 공통 | `docker info` |
| **Node.js 24** (`.nvmrc`) | B(개발)만 | `node -v` |
| **pnpm 9.15.9** | B(개발)만 | `pnpm -v` |

```bash
docker info >/dev/null 2>&1 && echo "docker: OK" || echo "docker: Docker Desktop을 먼저 실행"
```

> [!NOTE]
> 호스트 Node가 24가 아니어도 대부분 동작하지만(엔진 경고만 뜸), 네이티브 모듈 이슈를 피하려면 `.nvmrc` 기준 Node 24 권장. `nvm`이 있으면 `nvm install && nvm use`.

### 완전히 새 머신이라면 (호스트에 아무것도 없을 때)

> **그냥 돌리기(경로 A)** 만 할 거면 호스트에 필요한 건 **Docker + git** 뿐이다. Node·pnpm·Python·R·Julia·Quarto는 전부 렌더 이미지 안에 있으므로 호스트엔 설치하지 않는다. 아래 Node/pnpm은 **개발 모드(경로 B)** 에서만 필요하다.

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
> **디스크/리소스:** 렌더 이미지가 ~5.5GB라 Docker에 **여유 공간 15GB+**, 메모리 **8GB+** 할당을 권장한다(첫 빌드 때 R/Julia 컴파일이 무겁다). Apple Silicon(arm64)에서도 렌더 이미지가 아키텍처를 자동 감지해 네이티브로 빌드된다(에뮬레이션 불필요).

---

## Step 1. 렌더 이미지 빌드 (A·B 공통, 최초 1회)

```bash
docker build -t quarto-render:dev docker/render
```

> [!WARNING]
> 이미지에 R/Julia/Python 패키지가 들어가 **약 5.5GB, 첫 빌드는 수십 분** 걸린다. 한 번 빌드하면 재사용된다.

**검증:**

```bash
docker images quarto-render:dev   # 한 줄이라도 나오면 OK
```

이미지 없이 렌더를 돌리면 워커가 `quarto-render:dev` 를 찾지 못해 잡이 실패한다.

---

## 경로 A — Docker Compose 풀스택 (가장 간단, 추천)

웹·DB·워커·마이그레이션을 한 번에 띄운다. 그냥 "돌려보고 싶다"면 이 경로.

```bash
docker compose up --build
```

- `migrate`(one-shot)가 DB 스키마를 만들고 종료 → `web`(:3000) + `worker` 기동.
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
pnpm worker
```

- `pnpm worker` 는 호스트 Docker 소켓으로 일회용 렌더 컨테이너(`quarto-render:dev`)를 띄운다 → **Step 1 이미지와 Docker가 떠 있어야 한다.**
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

---

## 렌더 이미지 / 한글 폰트 검증 (선택)

```bash
docker/render/verify.sh    # examples/ 14종을 렌더 이미지로 실제 렌더
docker/render/smoke.sh     # 한글 폰트 회귀(no-tofu) + 엔진별 경고 점검
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `docker: Cannot connect ...` | Docker Desktop 미실행 | Docker Desktop 실행 후 `docker info` |
| 잡이 계속 `queued`/실패 | 워커 미실행 또는 렌더 이미지 없음 | 경로 A는 `worker` 로그 확인 / 경로 B는 `pnpm worker` 실행 + Step 1 빌드 |
| `DATABASE_URL 환경변수가 필요합니다` | migrate/worker 셸에 export 안 됨 | 해당 셸에서 `export DATABASE_URL=...` |
| `:3000` 응답 없음 | web 미기동 / 컴파일 에러 | 경로 A `web` 로그, 경로 B `pnpm dev` 로그 확인 |
| 포트 3000/5432 사용 중 | 다른 프로세스 점유 | 기존 프로세스 종료 또는 compose 포트 변경 |
| 엔진 경고 `wanted node >=24 <25` | 호스트 Node가 24 아님 | 경고일 뿐(동작함). 정확히는 `nvm use` 로 24 |
| 시드가 `사용자를 찾을 수 없습니다` | 해당 이메일 회원가입 전 | 브라우저에서 먼저 회원가입 후 시드 |

> [!WARNING]
> 코드 실행을 켠 문서는 렌더 컨테이너 안에서 임의 코드를 실행한다(샌드박스: `--network none`, `--cap-drop ALL`, 메모리/CPU/PID 제한). 그래도 **신뢰할 수 있는 문서에서만** 코드 실행을 켜라.

## 전체 검증 (선택)

```bash
pnpm verify        # lint → typecheck → test → build
```
