# Phase 0 — 렌더 이미지 + 한글 폰트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quarto + Python/R/Julia 런타임과 한글 폰트, 큐레이션 패키지 매니페스트를 모두 구운 결정적(deterministic) `quarto-render` Docker 이미지를 만들고, 예제 `.qmd`와 한글 차트로 검증한다.

**Architecture:** `debian:bookworm-slim` 위에 Quarto CLI → Python venv → R → Julia → 한글 폰트/엔진 설정을 레이어로 쌓는다. 패키지는 버전 핀 매니페스트(`requirements.txt` / `install-r-packages.R` + PPM 스냅샷 / `Project.toml`+`Manifest.toml`)로 정의한다. 검증은 이미지 안에서 `quarto render`로 스모크 `.qmd`와 14개 예제를 렌더해 종료코드와 한글 차트 깨짐 여부를 확인한다. 이 단계는 Next.js 앱·워커·Postgres와 무관하며, 이미지 단독으로 동작·검증된다.

**Tech Stack:** Docker, Quarto CLI, Python(venv/pip), R(PPM 스냅샷), Julia(Pkg/IJulia), matplotlib·ggplot2·Plots.jl, fontconfig, fonts-nanum/fonts-noto-cjk.

## Global Constraints

- 이미지 베이스는 `debian:bookworm-slim`로 핀 고정한다.
- 모든 런타임 패키지는 **버전 핀 매니페스트**로 정의하고, "동작 확인 → 잠금(lock)" 순서로 락 파일을 커밋한다.
- 언어별 **정규 커널 이름은 하나**다: Python=`python3`, Julia=`julia-1.10`. 문서(예제·템플릿)는 이 이름만 사용하고 머신 종속 식별자를 넣지 않는다.
- 격리 옵션(`--network none`, 비루트, tmpfs 등)은 Phase 0 범위가 아니다(워커가 적용하는 Phase 1). Phase 0은 이미지를 root로 빌드·검증한다.
- PDF용 LaTeX/TinyTeX는 굽지 않는다(PDF는 제외 범위).
- 한글 차트는 사용자가 문서를 수정하지 않아도 기본 동작해야 한다(엔진 기본 폰트 베이크).
- 모든 작업 산출물은 `docker/render/` 아래에 둔다(앱 소스와 분리).
- 빌드 태그는 `quarto-render:dev`를 사용한다.

---

### Task 1: 이미지 스캐폴드 + Quarto + Markdown 렌더 검증

**Files:**
- Create: `docker/render/Dockerfile`
- Create: `docker/render/smoke/md.qmd`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `quarto-render:dev` 이미지(Quarto CLI 포함), 이후 모든 Task가 이 `Dockerfile`에 레이어를 추가한다. 렌더 검증 명령 패턴을 확립한다.

- [ ] **Step 1: 스모크 문서(실패 테스트) 작성**

`docker/render/smoke/md.qmd`:

```markdown
---
title: "Markdown smoke"
format: html
---

# 안녕하세요

순수 마크다운 렌더 확인. **굵게** _기울임_.

$$ E = mc^2 $$
```

- [ ] **Step 2: 이미지가 없어 렌더가 실패함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render md.qmd --to html
```
Expected: FAIL — `Unable to find image 'quarto-render:dev'` (아직 빌드 전).

- [ ] **Step 3: Dockerfile 작성(베이스 + Quarto)**

`docker/render/Dockerfile`:

```dockerfile
FROM debian:bookworm-slim

ARG QUARTO_VERSION=1.6.43
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gdebi-core fontconfig \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/quarto.deb \
      "https://github.com/quarto-dev/quarto-cli/releases/download/v${QUARTO_VERSION}/quarto-${QUARTO_VERSION}-linux-amd64.deb" \
    && gdebi -n /tmp/quarto.deb \
    && rm /tmp/quarto.deb \
    && quarto --version

WORKDIR /work
```

> `QUARTO_VERSION`은 https://github.com/quarto-dev/quarto-cli/releases 의 최신 안정판으로 확인 후 조정 가능. 값이 실재하는지 확인하고 빌드한다.

- [ ] **Step 4: 렌더 출력 무시 설정 추가**

`.gitignore` 끝에 추가:

```
docker/render/smoke/*.html
docker/render/smoke/*_files/
docker/render/smoke/.quarto/
docker/render/**/index_files/
```

- [ ] **Step 5: 이미지 빌드**

Run:
```bash
docker build -t quarto-render:dev docker/render
```
Expected: 성공, 마지막에 `quarto --version`이 버전 출력.

- [ ] **Step 6: Markdown 렌더가 통과함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render md.qmd --to html && ls docker/render/smoke/md.html
```
Expected: PASS — 종료코드 0, `docker/render/smoke/md.html` 생성.

- [ ] **Step 7: 커밋**

```bash
git add docker/render/Dockerfile docker/render/smoke/md.qmd .gitignore
git commit -m "$(printf 'feat: 렌더 이미지 스캐폴드와 Quarto 설치\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Python 큐레이션 스택 (altair 포함) + 매니페스트 잠금

**Files:**
- Create: `docker/render/requirements.in`
- Create: `docker/render/requirements.txt`
- Create: `docker/render/smoke/py-altair.qmd`
- Modify: `docker/render/Dockerfile`

**Interfaces:**
- Consumes: Task 1의 `Dockerfile`(베이스 + Quarto).
- Produces: 이미지 안 `/opt/venv`의 Python + `python3` 커널 + 데이터과학 스택. `requirements.txt`(잠금)는 재현 가능한 빌드의 소스.

- [ ] **Step 1: 사용자가 겪은 altair 케이스를 스모크 테스트로 작성(실패)**

`docker/render/smoke/py-altair.qmd`:

```markdown
---
title: "Python altair smoke"
format: html
jupyter: python3
---

```{python}
import altair as alt
from vega_datasets import data
source = data.iowa_electricity()
alt.Chart(source).mark_area(opacity=0.3).encode(
  x="year:T",
  y=alt.Y("net_generation:Q").stack(None),
  color="source:N",
)
```
```

- [ ] **Step 2: 현재 이미지에 altair가 없어 렌더가 실패함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render py-altair.qmd --to html
```
Expected: FAIL — `No module named 'altair'` (또는 `jupyter` 미설치).

- [ ] **Step 3: 느슨한 매니페스트(requirements.in) 작성**

`docker/render/requirements.in`:

```
jupyter
jupyter-cache
pyyaml
numpy
pandas
matplotlib
altair
vega_datasets
plotly
seaborn
scikit-learn
scipy
statsmodels
```

- [ ] **Step 4: 임시로 requirements.txt를 느슨한 목록으로 채움**

처음엔 잠금 전이므로 `requirements.in` 내용을 그대로 복사해 `docker/render/requirements.txt`로 둔다(이후 Step 8에서 동결 버전으로 교체).

```bash
cp docker/render/requirements.in docker/render/requirements.txt
```

- [ ] **Step 5: Dockerfile에 Python 레이어 추가**

`docker/render/Dockerfile`의 `WORKDIR /work` **앞에** 다음 블록을 삽입:

```dockerfile
# --- Python ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
ENV MPLCONFIGDIR=/opt/mpl
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && quarto check jupyter
```

- [ ] **Step 6: 재빌드**

Run:
```bash
docker build -t quarto-render:dev docker/render
```
Expected: 성공, `quarto check jupyter`가 Python/Jupyter 정상 인식.

- [ ] **Step 7: altair 스모크가 통과함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render py-altair.qmd --to html && ls docker/render/smoke/py-altair.html
```
Expected: PASS — 종료코드 0, HTML 생성.

- [ ] **Step 8: 동결(lock)해서 requirements.txt를 핀 버전으로 교체**

Run:
```bash
docker run --rm quarto-render:dev pip freeze > docker/render/requirements.txt
docker build -t quarto-render:dev docker/render
```
Expected: 재빌드 성공(핀 버전으로 재현). `requirements.txt`에 `altair==...` 등 버전이 박힘.

- [ ] **Step 9: 커밋**

```bash
git add docker/render/requirements.in docker/render/requirements.txt docker/render/smoke/py-altair.qmd docker/render/Dockerfile
git commit -m "$(printf 'feat: Python 큐레이션 스택과 altair 매니페스트 잠금\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: R 스택 + ggplot 렌더 검증

**Files:**
- Create: `docker/render/install-r-packages.R`
- Create: `docker/render/smoke/r-ggplot.qmd`
- Modify: `docker/render/Dockerfile`

**Interfaces:**
- Consumes: Task 2까지의 `Dockerfile`.
- Produces: 이미지 안 R + knitr/rmarkdown/ggplot2/showtext/sysfonts. PPM 날짜 스냅샷으로 버전 핀.

- [ ] **Step 1: ggplot 스모크 테스트 작성(실패)**

`docker/render/smoke/r-ggplot.qmd`:

```markdown
---
title: "R ggplot smoke"
format: html
---

```{r}
library(ggplot2)
ggplot(mpg, aes(displ, hwy, colour = class)) +
  geom_point() +
  labs(title = "Engine displacement vs highway mpg")
```
```

- [ ] **Step 2: R이 없어 렌더가 실패함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render r-ggplot.qmd --to html
```
Expected: FAIL — R/`knitr` 미설치로 실패.

- [ ] **Step 3: R 패키지 설치 스크립트 작성(PPM 스냅샷으로 핀)**

`docker/render/install-r-packages.R`:

```r
options(
  repos = c(CRAN = "https://packagemanager.posit.co/cran/2026-06-01"),
  Ncpus = max(1L, parallel::detectCores())
)
install.packages(c(
  "knitr", "rmarkdown", "ggplot2", "dplyr", "tidyr", "readr",
  "showtext", "sysfonts"
))
```

> 날짜 스냅샷(`2026-06-01`)이 패키지 버전을 고정한다. 소스 빌드라 시간이 걸리지만 1회성이다.

- [ ] **Step 4: Dockerfile에 R 레이어 추가**

`WORKDIR /work` 앞에 삽입:

```dockerfile
# --- R ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      r-base r-base-dev \
      libcurl4-openssl-dev libssl-dev libxml2-dev \
      libfontconfig1-dev libfreetype6-dev libpng-dev libjpeg-dev libtiff5-dev \
    && rm -rf /var/lib/apt/lists/*
COPY install-r-packages.R /tmp/install-r-packages.R
RUN Rscript /tmp/install-r-packages.R \
    && quarto check knitr
```

- [ ] **Step 5: 재빌드**

Run:
```bash
docker build -t quarto-render:dev docker/render
```
Expected: 성공, `quarto check knitr` 정상.

- [ ] **Step 6: ggplot 스모크가 통과함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render r-ggplot.qmd --to html && ls docker/render/smoke/r-ggplot.html
```
Expected: PASS — 종료코드 0, HTML 생성.

- [ ] **Step 7: 커밋**

```bash
git add docker/render/install-r-packages.R docker/render/smoke/r-ggplot.qmd docker/render/Dockerfile
git commit -m "$(printf 'feat: R 스택과 ggplot 렌더 검증\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Julia + 커널 핀(julia-1.10) + Plots 렌더 검증

**Files:**
- Create: `docker/render/julia/Project.toml`
- Create: `docker/render/julia/Manifest.toml`
- Create: `docker/render/smoke/jl-plots.qmd`
- Modify: `docker/render/Dockerfile`

**Interfaces:**
- Consumes: Task 3까지의 `Dockerfile`.
- Produces: 이미지 안 Julia 1.10 + IJulia 커널 **`julia-1.10`**(정규 이름) + Plots/DataFrames. `Manifest.toml`로 핀.

- [ ] **Step 1: Julia Plots 스모크 테스트 작성(실패) — 정규 커널 이름 사용**

`docker/render/smoke/jl-plots.qmd`:

```markdown
---
title: "Julia Plots smoke"
format: html
jupyter: julia-1.10
---

```{julia}
using Plots
gr()
plot(1:10, (1:10).^2, title = "Quadratic", legend = false)
```
```

- [ ] **Step 2: Julia가 없어 렌더가 실패함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render jl-plots.qmd --to html
```
Expected: FAIL — `kernel 'julia-1.10' not found`.

- [ ] **Step 3: Julia 환경 매니페스트 작성**

`docker/render/julia/Project.toml`:

```toml
[deps]
IJulia = "7073ff75-c697-5162-941a-fcdaad2a7d2a"
Plots = "91a5bcdd-55d7-5caf-9e0b-520d859cae80"
DataFrames = "a93c6f00-e57d-5684-b7b6-d8193f3e46c0"
```

`docker/render/julia/Manifest.toml`은 빈 파일로 생성(Step 6에서 채워 잠금):

```bash
mkdir -p docker/render/julia && : > docker/render/julia/Manifest.toml
```

- [ ] **Step 4: Dockerfile에 Julia 레이어 추가**

`WORKDIR /work` 앞에 삽입:

```dockerfile
# --- Julia ---
ARG JULIA_VERSION=1.10.4
ENV JULIA_DEPOT_PATH=/opt/julia-depot
ENV JULIA_PROJECT=/opt/julia-env
ENV PATH="/opt/julia/bin:$PATH"
RUN curl -fsSL "https://julialang-s3.julialang.org/bin/linux/x64/1.10/julia-${JULIA_VERSION}-linux-x86_64.tar.gz" \
      | tar -xz -C /opt \
    && mv /opt/julia-${JULIA_VERSION} /opt/julia \
    && julia --version
COPY julia/Project.toml julia/Manifest.toml /opt/julia-env/
RUN julia -e 'using Pkg; Pkg.instantiate(); Pkg.precompile()' \
    && julia -e 'using IJulia; IJulia.installkernel("Julia")' \
    && chmod -R a+rX /opt/julia-depot
```

> IJulia를 Julia 1.10에 설치하면 커널 이름이 자동으로 `julia-1.10`이 된다. `JULIA_PROJECT` 환경변수 덕에 커널도 같은 프로젝트(Plots 포함)를 쓴다.

- [ ] **Step 5: 재빌드 후 커널 이름이 julia-1.10인지 확인**

Run:
```bash
docker build -t quarto-render:dev docker/render
docker run --rm quarto-render:dev jupyter kernelspec list
```
Expected: 목록에 `julia-1.10` 과 `python3` 표시.

- [ ] **Step 6: Manifest.toml 동결(lock)해서 재현 고정**

Run:
```bash
docker run --rm quarto-render:dev cat /opt/julia-env/Manifest.toml > docker/render/julia/Manifest.toml
docker build -t quarto-render:dev docker/render
```
Expected: 비어있던 `Manifest.toml`이 핀 내용으로 채워지고 재빌드 성공.

- [ ] **Step 7: Plots 스모크가 통과함을 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render jl-plots.qmd --to html && ls docker/render/smoke/jl-plots.html
```
Expected: PASS — 종료코드 0, HTML 생성.

- [ ] **Step 8: 커밋**

```bash
git add docker/render/julia/Project.toml docker/render/julia/Manifest.toml docker/render/smoke/jl-plots.qmd docker/render/Dockerfile
git commit -m "$(printf 'feat: Julia 1.10 런타임과 julia-1.10 커널 핀\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: 한글 폰트 + 엔진별 폰트 설정 (no-tofu)

**Files:**
- Create: `docker/render/conf/matplotlibrc`
- Create: `docker/render/conf/Rprofile.site`
- Create: `docker/render/conf/fonts-local.conf`
- Create: `docker/render/smoke/ko-matplotlib.qmd`
- Create: `docker/render/smoke/ko-ggplot.qmd`
- Create: `docker/render/smoke/ko-plots.qmd`
- Modify: `docker/render/Dockerfile`

**Interfaces:**
- Consumes: Task 4까지의 `Dockerfile`.
- Produces: 이미지에 나눔/Noto CJK 폰트 + 엔진 기본 폰트 설정. 한글 차트가 사용자 수정 없이 동작.

- [ ] **Step 1: 엔진별 한글 차트 스모크 3종 작성(실패: 두부)**

`docker/render/smoke/ko-matplotlib.qmd`:

```markdown
---
title: "matplotlib 한글 smoke"
format: html
jupyter: python3
---

```{python}
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.plot([1, 2, 3], [1, 4, 9])
ax.set_title("한글 제목 테스트")
ax.set_xlabel("가로축")
ax.set_ylabel("세로축")
```
```

`docker/render/smoke/ko-ggplot.qmd`:

```markdown
---
title: "ggplot 한글 smoke"
format: html
---

```{r}
library(ggplot2)
ggplot(mpg, aes(displ, hwy)) +
  geom_point() +
  labs(title = "한글 제목 테스트", x = "배기량", y = "연비")
```
```

`docker/render/smoke/ko-plots.qmd`:

```markdown
---
title: "Plots 한글 smoke"
format: html
jupyter: julia-1.10
---

```{julia}
using Plots
gr()
plot(1:10, (1:10).^2, title = "한글 제목 테스트", xlabel = "가로축", ylabel = "세로축", legend = false)
```
```

- [ ] **Step 2: 폰트 설치 전 matplotlib 두부 경고가 나는지 확인**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render ko-matplotlib.qmd --to html 2>&1 | grep -i "missing from font" || echo "NO-WARNING(예상과 다름)"
```
Expected: `missing from font` 경고 출력(한글 글리프 없음 = 두부 상태 확인).

- [ ] **Step 3: matplotlibrc 작성**

`docker/render/conf/matplotlibrc`:

```
font.family: NanumGothic
axes.unicode_minus: False
```

- [ ] **Step 4: R Rprofile.site 작성(showtext로 sans=나눔)**

`docker/render/conf/Rprofile.site`:

```r
local({
  nanum <- "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"
  if (file.exists(nanum) &&
      requireNamespace("sysfonts", quietly = TRUE) &&
      requireNamespace("showtext", quietly = TRUE)) {
    sysfonts::font_add(family = "sans", regular = nanum)
    sysfonts::font_add(family = "NanumGothic", regular = nanum)
    showtext::showtext_auto()
  }
})
```

- [ ] **Step 5: fontconfig 기본 sans-serif를 나눔으로(GR/Julia용)**

`docker/render/conf/fonts-local.conf`:

```xml
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <alias>
    <family>sans-serif</family>
    <prefer><family>NanumGothic</family></prefer>
  </alias>
</fontconfig>
```

- [ ] **Step 6: Dockerfile에 폰트 레이어 추가**

`WORKDIR /work` 앞에 삽입:

```dockerfile
# --- Korean fonts + engine config ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-nanum fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
COPY conf/matplotlibrc /opt/mpl/matplotlibrc
COPY conf/Rprofile.site /etc/R/Rprofile.site
COPY conf/fonts-local.conf /etc/fonts/local.conf
RUN fc-cache -f \
    && rm -rf /opt/mpl/fontlist-*.json \
    && fc-list | grep -i nanum
```

> `rm fontlist-*.json`은 matplotlib 폰트 캐시를 비워 새 폰트를 다시 스캔하게 한다.

- [ ] **Step 7: 재빌드**

Run:
```bash
docker build -t quarto-render:dev docker/render
```
Expected: 성공, 빌드 로그에 `NanumGothic` 폰트 경로 출력(`fc-list | grep nanum`).

- [ ] **Step 8: matplotlib 두부 경고가 사라졌는지 확인(자동 신호)**

Run:
```bash
docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
  quarto render ko-matplotlib.qmd --to html 2>&1 | grep -i "missing from font" && echo "STILL-TOFU(실패)" || echo "OK-NO-TOFU"
```
Expected: `OK-NO-TOFU` (한글 글리프 경고 없음).

- [ ] **Step 9: ggplot/Plots 한글 차트 렌더 + 육안 확인(최종 게이트)**

Run:
```bash
for f in ko-ggplot ko-plots; do
  docker run --rm -v "$PWD/docker/render/smoke:/work" -w /work quarto-render:dev \
    quarto render $f.qmd --to html && echo "$f OK"
done
open docker/render/smoke/ko-matplotlib.html docker/render/smoke/ko-ggplot.html docker/render/smoke/ko-plots.html
```
Expected: 3개 모두 종료코드 0. 브라우저에서 차트 제목·축의 한글이 **□가 아니라 또렷하게** 보임. (자동 grep은 matplotlib에만 신뢰 가능하므로 ggplot/Plots는 육안이 최종 기준.)

> ggplot/Plots에서 여전히 두부가 보이면: ggplot은 `Rprofile.site`의 sans 등록 경로/`showtext_auto()`를, Plots는 `fonts-local.conf` 반영 여부를 점검하고, 필요 시 스모크 문서에 `default(fontfamily="NanumGothic")`(Julia)를 폴백으로 명시.

- [ ] **Step 10: 커밋**

```bash
git add docker/render/conf docker/render/smoke/ko-*.qmd docker/render/Dockerfile
git commit -m "$(printf 'feat: 한글 폰트와 엔진별 기본 폰트 설정(no-tofu)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: 예제 커널 이름 정규화 + 전체 예제 렌더 검증 스크립트

**Files:**
- Modify: `examples/13-julia-basics.qmd`
- Modify: `examples/14-julia-plots.qmd`
- Create: `docker/render/verify.sh`
- Modify: `README.md` (렌더 검증 방법 한 줄 추가)

**Interfaces:**
- Consumes: Task 5까지 완성된 `quarto-render:dev` 이미지.
- Produces: 14개 예제를 이미지로 렌더 검증하는 `verify.sh`. 예제가 정규 커널 이름(`julia-1.10`)을 사용.

- [ ] **Step 1: 정규화 회귀 가드로 verify 스크립트 작성**

`docker/render/verify.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-quarto-render:dev}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXAMPLES="$ROOT/examples"

# 머신 종속 커널 이름이 예제에 남아 있지 않은지 가드 (julia-1.10만 허용)
if grep -RnE '^jupyter:[[:space:]]*julia-' "$EXAMPLES" | grep -v 'julia-1.10'; then
  echo "FAIL: 비정규 Julia 커널 이름이 예제에 있음 (julia-1.10만 허용)"
  exit 1
fi

fail=0
for f in "$EXAMPLES"/*.qmd; do
  name="$(basename "$f")"
  tmp="$(mktemp -d)"
  cp "$f" "$tmp/"
  if docker run --rm -v "$tmp:/work" -w /work "$IMAGE" \
       quarto render "$name" --to html >"$tmp/log.txt" 2>&1; then
    echo "PASS  $name"
  else
    echo "FAIL  $name"
    tail -n 20 "$tmp/log.txt"
    fail=1
  fi
  rm -rf "$tmp"
done
exit $fail
```

```bash
chmod +x docker/render/verify.sh
```

- [ ] **Step 2: 정규화 전 verify가 Julia 예제에서 실패함을 확인**

Run:
```bash
docker/render/verify.sh
```
Expected: FAIL — 가드가 `examples/13-julia-basics.qmd`·`14-julia-plots.qmd`의 `jupyter: julia-1.12`를 잡아냄.

- [ ] **Step 3: 예제 13/14를 정규 커널 이름으로 수정**

`examples/13-julia-basics.qmd`와 `examples/14-julia-plots.qmd`의 front matter에서:

```
jupyter: julia-1.12
```
를 다음으로 변경:
```
jupyter: julia-1.10
```

`examples/13-julia-basics.qmd`의 본문 안내 문구도 정정한다. 기존:
```
`jupyter` 키의 커널 이름은 설치된 버전에 맞춰 조정하세요(예: `julia-1.10`).
```
변경:
```
`jupyter` 키의 커널 이름은 렌더 이미지의 정규 커널 `julia-1.10`을 사용합니다.
```

- [ ] **Step 4: 전체 예제 렌더가 통과함을 확인**

Run:
```bash
docker/render/verify.sh
```
Expected: PASS — 14개 모두 `PASS`, 종료코드 0. (01~03 markdown/수식/mermaid, 04~07 python, 08~10 R, 11~12 ojs, 13~14 julia.)

> OJS(11~12)는 브라우저 실행이라 Quarto CLI만으로 렌더된다. 코드 실행 예제(04~10,13~14)는 이미지 런타임으로 실행된다.

- [ ] **Step 5: README에 검증 방법 한 줄 추가**

`README.md`의 "예제 문서" 섹션 끝에 추가:

```markdown
렌더 이미지로 전체 예제를 한 번에 검증하려면: `docker build -t quarto-render:dev docker/render && docker/render/verify.sh`
```

- [ ] **Step 6: 커밋**

```bash
git add examples/13-julia-basics.qmd examples/14-julia-plots.qmd docker/render/verify.sh README.md
git commit -m "$(printf 'feat: 예제 커널 이름 정규화와 전체 렌더 검증 스크립트\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage (스펙 → 태스크):**
- 렌더 이미지(Quarto+3런타임) → Task 1~4 ✓
- 큐레이션 패키지 매니페스트(altair 등, 버전 핀) → Task 2(py), Task 3(R/PPM), Task 4(Julia/Manifest) ✓
- 한글 폰트 + 엔진별 설정 + 검증 → Task 5 ✓
- 실행 환경 핀(커널 이름 `julia-1.10`/`python3`) → Task 4 + Task 6 가드 ✓
- 템플릿·예제 정규화 → Task 6(예제 13/14). `createDefaultContent`는 커널을 명시하지 않으므로(확인됨) 수정 불필요 ✓
- 독립 검증(예제·한글 차트) → Task 5 Step 9, Task 6 verify.sh ✓
- PDF/LaTeX 제외 → Dockerfile에 TinyTeX 미포함 ✓
- 격리는 Phase 1 범위 → Phase 0에서 다루지 않음(Global Constraints 명시) ✓

**Placeholder scan:** "TBD"/"적절히 처리" 류 없음. `QUARTO_VERSION`/`JULIA_VERSION`/PPM 날짜는 실재 확인 가능한 핀 값(placeholder 아님).

**Type/이름 일관성:** 이미지 태그 `quarto-render:dev`, 정규 커널 `julia-1.10`·`python3`, 경로 `docker/render/...`가 전 태스크에서 일치. verify.sh 가드와 Task 4 커널 이름 일치.
