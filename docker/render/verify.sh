#!/usr/bin/env bash
# 렌더 이미지(quarto-render:dev)로 examples/ 의 모든 .qmd를 렌더해 검증한다.
# 각 예제는 격리된 임시 디렉토리에서 렌더한다.
#
# 주의: macOS Docker bind-mount에서는 Quarto가 중첩 _files 디렉토리를 만들 때
# 드물게 mkdir이 실패할 수 있다(셀 실행 자체는 성공). 따라서 렌더는 1회 재시도하고,
# 2회 연속 실패만 FAIL로 처리한다. 프로덕션(tmpfs)에서는 발생하지 않을 가능성이 높다.
set -euo pipefail

IMAGE="${IMAGE:-quarto-render:dev}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXAMPLES="$ROOT/examples"

# 정규화 가드: 예제에 비정규 Julia 커널 이름이 남아 있으면 실패(julia-1.10만 허용).
if grep -RnE '^jupyter:[[:space:]]*julia-' "$EXAMPLES" | grep -v 'julia-1.10'; then
  echo "FAIL: 비정규 Julia 커널 이름이 예제에 있음 (julia-1.10만 허용)"
  exit 1
fi

render_once() {
  local name=$1 tmp=$2
  docker run --rm -v "$tmp:/work" -w /work "$IMAGE" \
    quarto render "$name" --to html >"$tmp/log.txt" 2>&1
}

fail=0
for f in "$EXAMPLES"/*.qmd; do
  name="$(basename "$f")"
  tmp="$(mktemp -d)"
  cp "$f" "$tmp/"
  if render_once "$name" "$tmp"; then
    echo "PASS  $name"
  elif render_once "$name" "$tmp"; then
    echo "PASS  $name (retry)"
  else
    echo "FAIL  $name"
    tail -n 20 "$tmp/log.txt"
    fail=1
  fi
  rm -rf "$tmp"
done
exit $fail
