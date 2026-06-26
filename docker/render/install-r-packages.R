options(
  repos = c(CRAN = "https://packagemanager.posit.co/cran/2026-06-01"),
  Ncpus = max(1L, parallel::detectCores())
)
pkgs <- c(
  "knitr", "rmarkdown", "ggplot2", "dplyr", "tidyr", "readr",
  "showtext", "sysfonts"
)
install.packages(pkgs)

# 설치 검증: 하나라도 누락이면 빌드를 실패시킨다(조용한 깨진 이미지 방지).
# install.packages는 개별 패키지 실패를 경고로만 처리하므로 명시적으로 확인한다.
missing <- pkgs[!pkgs %in% rownames(installed.packages())]
if (length(missing) > 0) {
  stop("R 패키지 설치 실패: ", paste(missing, collapse = ", "))
}
