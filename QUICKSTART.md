# Quarto Studio QUICKSTART (AI 실행용)

이 문서는 **AI 에이전트가 단독으로 읽고, 사전 준비부터 로컬 웹 페이지 실행까지 수행**하기 위한 지침이다. 사람의 추가 설명 없이 이 문서만으로 `http://localhost:3000`이 떠야 한다.

> [!IMPORTANT]
> 각 단계마다 **검증 명령**이 있다. 검증을 통과하지 못하면 다음 단계로 넘어가지 말고, 해당 단계의 트러블슈팅을 먼저 처리한다.

## 목표

1. 필수 도구(Node.js 24, pnpm, Quarto CLI)를 확인·설치한다.
2. 의존성과 환경 변수를 준비한다.
3. (선택) Python / R 코드 청크 실행 환경을 준비한다.
4. dev server를 띄우고 `http://localhost:3000` 응답을 확인한다.

## 사전 조건

- macOS 환경, 셸은 `zsh` 또는 `bash`.
- Homebrew(`brew`)가 설치되어 있으면 Quarto·R 설치가 간단하다. 없으면 공식 설치 파일을 사용한다.
- 작업 디렉토리는 이 저장소 루트(`quarto-studio`)다. 모든 명령은 루트에서 실행한다.

---

## Step 1. 필수 도구 확인

먼저 현재 상태를 한 번에 점검한다. 아래 블록을 실행해 무엇이 빠졌는지 파악한다.

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "node: $(node -v 2>/dev/null || echo MISSING)"
echo "pnpm: $(pnpm -v 2>/dev/null || echo MISSING)"
echo "quarto: $(quarto --version 2>/dev/null || echo MISSING)"
```

판단 기준:

| 도구 | 요구 버전 | 빠졌을 때 진행 |
| --- | --- | --- |
| Node.js | 24 (`.nvmrc` 기준) | Step 1-A |
| pnpm | 9.15.9 (`package.json`의 `packageManager`) | Step 1-B |
| Quarto CLI | 설치되어 동작 | Step 1-C |

### Step 1-A. Node.js 24

`nvm`이 있으면 저장소의 `.nvmrc`를 따라 설치·전환한다.

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install   # .nvmrc(24)를 읽어 설치
nvm use
node -v       # v24.x 확인
```

> [!NOTE]
> `nvm`이 없으면 [nvm 설치 가이드](https://github.com/nvm-sh/nvm#installing-and-updating)로 먼저 설치하거나, 시스템에 Node.js 24를 직접 설치한다.

### Step 1-B. pnpm

`package.json`이 `packageManager: pnpm@9.15.9`로 고정한다. Corepack으로 맞추는 것을 권장한다.

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm -v   # 9.15.9 확인
```

### Step 1-C. Quarto CLI

실제 렌더링은 `quarto render index.qmd --to html`로 수행되므로 **Quarto CLI가 없으면 앱의 렌더 기능이 실패한다.**

```bash
# Homebrew가 있으면
brew install --cask quarto

# 없으면 공식 다운로드 페이지에서 OS별 설치 파일 사용:
# https://quarto.org/docs/download/
```

**검증:**

```bash
quarto --version
```

버전 문자열이 출력되면 통과다.

---

## Step 2. 의존성 · 환경 변수 준비

루트에서 다음을 실행한다.

```bash
pnpm install
cp .env.example .env.local
```

`.env.local`의 주요 환경 변수는 기본값으로 둬도 로컬 실행에 충분하다.

| 변수 | 기본 예시 | 설명 |
| --- | --- | --- |
| `QUARTO_STUDIO_DB_PATH` | `./data/quarto-studio.db` | 문서 메타데이터·QMD 원문을 저장할 SQLite DB 경로 |
| `QUARTO_RENDER_TIMEOUT_MS` | `15000` | Quarto 렌더 프로세스 제한 시간(ms) |

**검증:**

```bash
test -d node_modules && echo "deps: OK" || echo "deps: MISSING"
test -f .env.local && echo "env: OK" || echo "env: MISSING"
```

둘 다 `OK`면 통과다.

---

## Step 3. (선택) 코드 청크 실행 환경

일반 QMD를 HTML로 렌더링하는 데는 **Step 2까지로 충분**하다. 문서 안의 `{python}`, `{r}`, `{julia}` 코드 청크를 **실제로 실행**하려는 경우에만 이 단계를 진행한다.

언어별 런타임 필요 여부는 다음과 같다.

| 청크 | 엔진 | 서버 런타임 필요 | 준비 단계 |
| --- | --- | --- | --- |
| `{python}` | jupyter | ✅ | Step 3-A |
| `{r}` | knitr | ✅ | Step 3-B |
| `{julia}` | jupyter(IJulia) | ✅ | Step 3-C |
| `{ojs}` | 브라우저 | ❌ (Quarto CLI만) | 불필요 |

> [!NOTE]
> 코드 청크 실행은 dev server 프로세스의 PATH·런타임을 따른다. 이 단계를 진행했다면 **Step 4에서 dev server를 같은 셸에서 시작**해야 한다. `{ojs}` 청크는 브라우저에서 실행되므로 이 단계가 필요 없다.

### Step 3-A. Python 코드 실행

`{python}` 청크는 Jupyter 기반 kernel을 사용한다. 프로젝트 전용 가상 환경을 권장한다.

```bash
python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install jupyter pyyaml matplotlib pandas numpy

quarto check jupyter
```

`matplotlib`, `pandas`, `numpy`는 예제·데이터 분석 문서에서 자주 쓴다. 문서가 다른 패키지를 import하면 같은 가상 환경에 추가 설치한다.

### Step 3-B. R 코드 실행

`{r}` 청크는 `Rscript`와 Quarto R 렌더링 패키지가 필요하다. macOS Homebrew 기준:

```bash
brew install r

Rscript -e 'install.packages(c("knitr", "rmarkdown", "ggplot2"), repos="https://cloud.r-project.org")'

quarto check knitr
```

`knitr`·`rmarkdown`은 R 문서 실행/렌더링에, `ggplot2`는 예제 차트에 필요하다. 다른 R 패키지는 `install.packages()`로 추가한다.

### Step 3-C. Julia 코드 실행

`{julia}` 청크는 Julia 런타임과 Jupyter 커널(IJulia)이 필요하다. macOS Homebrew 기준:

```bash
brew install julia

# IJulia 커널과 차트 패키지 설치
julia -e 'using Pkg; Pkg.add(["IJulia", "Plots"])'

quarto check jupyter
```

> [!NOTE]
> 문서 front matter의 `jupyter` 값(예: `julia-1.10`)은 설치된 Julia 버전에 맞춰야 한다. 설치된 커널 목록은 `jupyter kernelspec list`로 확인한다.

`IJulia`는 Julia 청크 실행에, `Plots`는 예제 차트 렌더링에 필요하다. 다른 Julia 패키지는 `Pkg.add()`로 추가한다.

### Observable JS (`{ojs}`) — 준비 불필요

`{ojs}` 청크는 브라우저에서 실행되므로 **서버 측 런타임 설치가 필요 없다.** Step 1의 Quarto CLI만 있으면 렌더링된다. `Plot`, `d3` 등은 Observable 런타임에 기본 포함되어 별도 import도 필요 없다.

---

## Step 4. 로컬 웹 페이지 실행

Step 3을 진행했다면 **같은 셸**에서 환경을 활성화한 뒤 실행한다.

```bash
# Step 3-A를 했다면 Python 가상 환경 활성화
source .venv/bin/activate

# Node 24 보장
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use

pnpm dev
```

`http://localhost:3000`에서 앱을 사용한다.

**검증 (다른 터미널에서):**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

`200`이 출력되면 로컬 실행 성공이다.

> [!TIP]
> 백그라운드로 dev server를 띄웠다면, 위 `curl` 검증 후 로그에 컴파일 에러가 없는지 확인한다.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 렌더 버튼이 실패한다 | Quarto CLI 미설치 | Step 1-C 수행 후 `quarto --version` 확인 |
| `pnpm: command not found` | pnpm 미설치/미활성 | Step 1-B의 Corepack 명령 실행 |
| Node 버전 불일치 빌드 오류 | Node 24 아님 | `nvm use`로 24 전환 |
| `{python}` 청크 실행 실패 | 가상 환경이 dev server에 없음 | `.venv` 활성화 후 **같은 셸에서** `pnpm dev` 재시작 |
| `{r}` 청크 실행 실패 | `Rscript` 또는 R 패키지 없음 | Step 3-B 수행 후 `quarto check knitr` 통과 확인 |
| 포트 3000 사용 중 | 다른 프로세스 점유 | 기존 프로세스 종료 후 재시작 |

> [!WARNING]
> 코드 실행을 켠 문서는 로컬에서 임의 코드를 실행한다. 새 문서는 기본적으로 코드 실행이 꺼져 있으므로, **신뢰할 수 있는 문서에서만 코드 실행을 켠다.**

## 전체 검증 (선택)

빌드·테스트까지 한 번에 확인하려면:

```bash
quarto --version || true
pnpm verify        # lint → typecheck → test → build 순차 실행
git diff --check
```

`pnpm verify`는 Quarto CLI가 없어도 통과할 수 있지만, 앱에서 실제 문서 렌더링을 실행하려면 Quarto CLI가 반드시 필요하다.
