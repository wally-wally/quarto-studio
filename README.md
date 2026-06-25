# Quarto Studio

Quarto Studio는 QMD 문서를 작성하고, SQLite에 저장한 뒤 Quarto CLI로 HTML 미리보기를 렌더링하는 Next.js 기반 MVP입니다. 현재 목표는 로컬에서 문서 작성, 저장, 렌더링 흐름을 빠르게 검증하는 것입니다.

## 요구 사항

- Node.js 24 (`.nvmrc` 기준)
- pnpm 9.15.9 (`package.json`의 `packageManager` 기준)
- Quarto CLI
  - 실제 렌더링은 `quarto render index.qmd --to html` 명령으로 수행됩니다.
  - `quarto --version`이 동작하지 않으면 렌더 버튼 사용 시 실패합니다.
  - 설치 방법은 Quarto 공식 문서의 운영체제별 설치 가이드를 따르세요.

## 설정

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24
pnpm install
cp .env.example .env.local
```

주요 환경 변수:

| 변수 | 기본 예시 | 설명 |
| --- | --- | --- |
| `QUARTO_STUDIO_DB_PATH` | `./data/quarto-studio.db` | 문서 메타데이터와 QMD 원문을 저장할 SQLite DB 경로 |
| `QUARTO_RENDER_TIMEOUT_MS` | `15000` | Quarto 렌더 프로세스 제한 시간(ms) |

## 로컬 렌더링 사전 작업

일반 QMD 문서를 HTML로 렌더링하려면 Quarto CLI만 있으면 됩니다.

```bash
quarto --version
```

문서 안의 Python 또는 R 코드 청크를 실제로 실행하려면 `pnpm dev`를 실행하는 서버 환경에 언어별 런타임과 패키지가 추가로 필요합니다. 패키지를 설치한 뒤에는 기존 dev server를 종료하고 같은 셸 환경에서 다시 실행하세요.

### Python 코드 실행

Python 실행형 청크인 `{python}`은 Jupyter 기반 kernel을 사용합니다. 프로젝트 전용 가상 환경을 만들고 필요한 패키지를 설치하는 방식을 권장합니다.

````bash
python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install jupyter pyyaml matplotlib pandas numpy

quarto check jupyter
````

`matplotlib`, `pandas`, `numpy`는 예제와 데이터 분석 문서에서 자주 쓰는 패키지입니다. 문서에서 다른 Python 패키지를 import한다면 같은 가상 환경에 추가로 설치해야 합니다.

### R 코드 실행

R 실행형 청크인 `{r}`은 로컬에 `Rscript`와 Quarto R 렌더링 패키지가 있어야 합니다. macOS Homebrew 환경에서는 다음처럼 준비할 수 있습니다.

````bash
brew install r

Rscript -e 'install.packages(c("knitr", "rmarkdown", "ggplot2"), repos="https://cloud.r-project.org")'

quarto check knitr
````

`knitr`와 `rmarkdown`은 Quarto가 R 문서를 실행/렌더링할 때 필요하고, `ggplot2`는 예제 차트 렌더링에 필요합니다. 문서에서 다른 R 패키지를 사용한다면 `install.packages()`로 추가 설치하세요.

### dev server 재시작

Python 가상 환경 또는 R 설치 상태는 `pnpm dev` 프로세스가 실행될 때의 PATH와 런타임 환경을 따릅니다. 패키지 설치 후에는 같은 셸에서 dev server를 다시 시작하세요.

```bash
source .venv/bin/activate # Python 실행형 문서를 테스트할 때

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24

pnpm dev
```

## 실행

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000`을 열어 사용합니다. 운영 빌드는 다음처럼 확인할 수 있습니다.

```bash
pnpm build
pnpm start
```

## 검증

```bash
quarto --version || true
pnpm verify
git diff --check
```

`pnpm verify`는 lint, typecheck, test, build를 순서대로 실행합니다. Quarto CLI가 없어도 일반 빌드 검증은 통과할 수 있지만, 앱에서 실제 문서 렌더링을 실행하려면 Quarto CLI가 반드시 필요합니다.

## 렌더 정책

렌더링 시 임시 디렉토리에 `index.qmd`와 `_quarto.yml`을 만들고, Quarto CLI로 HTML을 생성합니다. 코드 실행 여부는 문서의 `executeCode` 값으로 제어됩니다.

| `executeCode` | `_quarto.yml` 설정 | 의미 |
| --- | --- | --- |
| `false` | `execute.eval: false` | 코드 블록을 실행하지 않고 렌더링 |
| `true` | `execute.eval: true` | 코드 블록 실행을 허용하고 렌더링 |

새 문서는 기본적으로 코드 실행이 꺼진 상태로 시작합니다. 코드 실행을 켜면 문서 안의 코드가 로컬 환경에서 실행될 수 있으므로 신뢰할 수 있는 내용에만 사용하세요.

## 현재 MVP 제한

- 로컬 단일 사용자 흐름을 전제로 하며 인증과 권한 관리는 없습니다.
- SQLite 파일 기반 저장소만 지원합니다.
- Quarto CLI 설치 여부와 실행 환경은 앱이 자동으로 준비하지 않습니다.
- HTML 렌더링 미리보기 중심이며 PDF, Word 등 다른 출력 포맷은 아직 지원하지 않습니다.
- 렌더링은 서버의 임시 디렉토리에서 수행되며, 외부 파일 참조나 긴 실행 작업은 환경에 따라 실패할 수 있습니다.
- 협업 편집, 버전 관리, 문서 가져오기/내보내기 기능은 아직 없습니다.
