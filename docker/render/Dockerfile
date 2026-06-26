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
RUN julia -e 'using Pkg; Pkg.Registry.add("General"); Pkg.resolve(); Pkg.instantiate(); Pkg.precompile()' \
    && julia -e 'using IJulia; IJulia.installkernel("Julia")' \
    && chmod -R a+rX /opt/julia-depot

# --- Korean fonts + engine config ---
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-nanum fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
COPY conf/matplotlibrc /opt/mpl/matplotlibrc
COPY conf/Rprofile.site /etc/R/Rprofile.site
COPY conf/fonts-local.conf /etc/fonts/local.conf
COPY conf/startup.jl /opt/julia-depot/config/startup.jl
RUN fc-cache -f \
    && rm -rf /opt/mpl/fontlist-*.json \
    && fc-list | grep -i nanum

# UTF-8 로케일: R의 멀티바이트(한글) 그래픽 렌더에 필수.
# 기본 POSIX 로케일에서는 한글이 두부/유니코드 escape로 깨진다.
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

WORKDIR /work
