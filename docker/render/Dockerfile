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

WORKDIR /work
