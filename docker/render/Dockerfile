FROM debian:bookworm-slim

ARG QUARTO_VERSION=1.6.43
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gdebi-core fontconfig \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL -o /tmp/quarto.deb \
      "https://github.com/quarto-dev/quarto-cli/releases/download/v${QUARTO_VERSION}/quarto-${QUARTO_VERSION}-linux-${ARCH}.deb" \
    && gdebi -n /tmp/quarto.deb \
    && rm /tmp/quarto.deb \
    && quarto --version

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
RUN mkdir -p /opt/mpl && chmod 777 /opt/mpl

# --- R ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      r-base r-base-dev \
      libcurl4-openssl-dev libssl-dev libxml2-dev \
      libfontconfig1-dev libfreetype6-dev libpng-dev libjpeg-dev libtiff5-dev \
      libuv1-dev \
    && rm -rf /var/lib/apt/lists/*
COPY install-r-packages.R /tmp/install-r-packages.R
RUN Rscript /tmp/install-r-packages.R \
    && quarto check knitr

# --- Julia ---
ARG JULIA_VERSION=1.10.4
ENV JULIA_DEPOT_PATH=/opt/julia-depot
ENV JULIA_PROJECT=/opt/julia-env
ENV PATH="/opt/julia/bin:$PATH"
RUN set -eux; \
    deb_arch="$(dpkg --print-architecture)"; \
    case "$deb_arch" in \
      amd64) jl_arch=x86_64; jl_dir=x64 ;; \
      arm64) jl_arch=aarch64; jl_dir=aarch64 ;; \
      *) echo "unsupported arch: $deb_arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://julialang-s3.julialang.org/bin/linux/${jl_dir}/1.10/julia-${JULIA_VERSION}-linux-${jl_arch}.tar.gz" \
      | tar -xz -C /opt; \
    mv "/opt/julia-${JULIA_VERSION}" /opt/julia; \
    julia --version
COPY julia/Project.toml julia/Manifest.toml /opt/julia-env/
# pkg.julialang.org 대신 GitHub 직접 접근으로 레지스트리 다운로드
ENV JULIA_PKG_SERVER=""
RUN julia -e 'using Pkg; Pkg.Registry.add("General"); Pkg.resolve(); Pkg.instantiate(); Pkg.precompile()' \
    && julia -e 'using IJulia; IJulia.installkernel("Julia")' \
    && chmod -R a+rX /opt/julia-depot

# --- Korean fonts + engine config ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-nanum fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
# Julia Plots(GR)는 폰트를 "<이름>.ttf" 파일명으로 찾는다. Noto Sans CJK KR은 .ttc라
# 이름으로 못 찾고, NanumGothic은 .ttf지만 U+2212(−)가 없어 음수 축이 깨진다.
# 한글+U+2212를 모두 가진 Noto KR을 단독 .ttf로 추출해 GR이 로드하게 한다.
COPY conf/extract-noto-kr.py /tmp/extract-noto-kr.py
RUN python3 /tmp/extract-noto-kr.py
COPY conf/matplotlibrc /opt/mpl/matplotlibrc
COPY conf/Rprofile.site /etc/R/Rprofile.site
COPY conf/fonts-local.conf /etc/fonts/local.conf
COPY conf/startup.jl /opt/julia-depot/config/startup.jl
# 폰트 캐시 갱신 후, matplotlib 폰트 캐시를 (모든 한글 폰트 설치 후) 미리 구워 이미지에 베이크한다.
# 안 구우면 매 렌더가 일회용 컨테이너에서 캐시를 처음부터 재빌드하다 간헐적으로 NanumGothic을
# 누락해 DejaVu Sans로 폴백(한글 글리프 깨짐 + 경고 대량)했다. 빌드 시 한 번 굽고
# NanumGothic이 캐시에 등록됐는지 단언해, 폴백을 결정적으로 제거한다(+ 렌더 시 재빌드 없음).
RUN fc-cache -f \
    && rm -rf /opt/mpl/fontlist-*.json \
    && fc-list | grep -i nanum \
    && test -f /usr/share/fonts/truetype/noto-kr/NotoSansKR.ttf \
    && python3 -c "import matplotlib.pyplot as plt; fig, ax = plt.subplots(); ax.set_title('한글'); fig.canvas.draw()" \
    && python3 -c "import glob, json; from matplotlib.font_manager import findfont, FontProperties; f = findfont(FontProperties(family='NanumGothic')); assert f.endswith('NanumGothic.ttf'), f; c = glob.glob('/opt/mpl/fontlist-*.json')[0]; names = {e['name'] for e in json.load(open(c))['ttflist']}; assert 'NanumGothic' in names, 'NanumGothic missing from baked mpl cache'; print('baked mpl font cache OK:', c, len(names), 'fonts')"

# UTF-8 로케일: R의 멀티바이트(한글) 그래픽 렌더에 필수.
# 기본 POSIX 로케일에서는 한글이 두부/유니코드 escape로 깨진다.
# LC_ALL 대신 LC_CTYPE만 고정 — 문자 인코딩(렌더)에 필요한 카테고리만 강제하고,
# collation 등 다른 카테고리는 런타임에서 재정의 가능하게 둔다.
ENV LANG=C.UTF-8 LC_CTYPE=C.UTF-8

WORKDIR /work
