#!/usr/bin/env bash
# Daytona 서버사이드 빌드로 렌더 스냅샷 생성.
# 사용: DAYTONA_API_KEY=... ./scripts/daytona-snapshot.sh [버전번호]
#   예: ./scripts/daytona-snapshot.sh 2  →  quarto-render-2 생성
# 생성 후 .env.local(운영은 배포 환경변수)의 DAYTONA_SNAPSHOT을 새 이름으로 교체한다.
set -euo pipefail

VERSION="${1:-1}"
NAME="quarto-render-${VERSION}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v daytona >/dev/null 2>&1 || {
  echo "[ERROR] daytona CLI가 없습니다. 설치: brew install daytonaio/cli/daytona" >&2
  exit 1
}
[[ -n "${DAYTONA_API_KEY:-}" ]] || {
  echo "[ERROR] DAYTONA_API_KEY를 export 하세요 (.env.local 참고)" >&2
  exit 1
}

echo "[INFO] 스냅샷 ${NAME} 서버사이드 빌드 시작 (수십 분 소요 가능)..."
daytona snapshot create "${NAME}" \
  --dockerfile "${ROOT}/docker/render/Dockerfile" \
  --context "${ROOT}/docker/render" \
  --cpu 2 --memory 2 --disk 10

echo "[OK] 스냅샷 ${NAME} 생성 완료"
echo "     → DAYTONA_SNAPSHOT=${NAME} 으로 설정한 뒤 'pnpm smoke:daytona'로 검증하세요"
