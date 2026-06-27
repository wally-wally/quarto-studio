#!/usr/bin/env bash
# 한글 폰트 회귀 검증(no-tofu). 이미지 빌드 후 이 스크립트를 돌리면
# 폰트 미설치/로케일 회귀/엔진 폰트 설정 깨짐을 "재현 가능"하게 잡는다.
# (수동 육안 검사를 대체하는 durable 체크 — 스펙 §5.3)
#
# 검사 신호:
#   - R LC_CTYPE가 UTF-8인지 (아니면 R/ggplot 한글이 두부/유니코드 escape로 깨짐)
#   - NanumGothic 폰트 설치 여부
#   - matplotlib 렌더 로그에 "missing from font" 경고 부재
#   - Julia/GR 렌더 로그에 "glyph missing" 경고 부재
#   - 세 엔진 한글 차트가 모두 렌더 성공(exit 0)
#
# macOS bind-mount의 중첩 _files mkdir flakiness 대비로 렌더는 1회 재시도.
set -uo pipefail

IMAGE="${IMAGE:-quarto-render:dev}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
SMOKE="$ROOT/smoke"
fail=0

echo "== 환경 검사 =="
if docker run --rm "$IMAGE" Rscript -e 'q(status = as.integer(!grepl("UTF-8", Sys.getlocale("LC_CTYPE"), ignore.case = TRUE)))'; then
  echo "PASS: R LC_CTYPE = UTF-8"
else
  echo "FAIL: R LC_CTYPE가 UTF-8이 아님 (한글 렌더 깨짐 원인)"; fail=1
fi
if docker run --rm "$IMAGE" sh -c 'fc-list | grep -qi nanumgothic'; then
  echo "PASS: NanumGothic 폰트 설치됨"
else
  echo "FAIL: NanumGothic 폰트 미설치"; fail=1
fi

render() {  # $1=qmd name; prints tmp dir path; renders with 1 retry
  local name=$1 tmp; tmp="$(mktemp -d)"; cp "$SMOKE/$name" "$tmp/"
  docker run --rm -v "$tmp:/work" -w /work "$IMAGE" quarto render "$name" --to html >"$tmp/log.txt" 2>&1 \
    || docker run --rm -v "$tmp:/work" -w /work "$IMAGE" quarto render "$name" --to html >"$tmp/log.txt" 2>&1
  printf '%s' "$tmp"
}

echo "== 엔진별 한글 차트 =="
# matplotlib: 렌더 성공 + "missing from font" 부재
t="$(render ko-matplotlib.qmd)"
if [ -f "$t/ko-matplotlib.html" ] && ! grep -qi "missing from font" "$t/log.txt"; then
  echo "PASS: matplotlib 한글 (no-tofu)"
else
  echo "FAIL: matplotlib 한글 렌더/폰트"; tail -n 15 "$t/log.txt"; fail=1
fi
rm -rf "$t"

# Julia/GR: 렌더 성공 + "glyph missing" 부재
t="$(render ko-plots.qmd)"
if [ -f "$t/ko-plots.html" ] && ! grep -qi "glyph missing" "$t/log.txt"; then
  echo "PASS: Julia/Plots 한글 (no-tofu)"
else
  echo "FAIL: Julia/Plots 한글 렌더/폰트"; tail -n 15 "$t/log.txt"; fail=1
fi
rm -rf "$t"

# R/ggplot: 렌더 성공(두부 회귀의 주원인인 로케일은 위에서 검사)
t="$(render ko-ggplot.qmd)"
if [ -f "$t/ko-ggplot.html" ]; then
  echo "PASS: R/ggplot 한글 렌더 성공"
else
  echo "FAIL: R/ggplot 한글 렌더"; tail -n 15 "$t/log.txt"; fail=1
fi
rm -rf "$t"

[ "$fail" -eq 0 ] && echo "== ALL SMOKE PASS ==" || echo "== SMOKE FAIL =="
exit "$fail"
