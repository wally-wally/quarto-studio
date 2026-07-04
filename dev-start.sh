#!/usr/bin/env bash
# 개발 모드 전체 스택 시작 스크립트 (QUICKSTART 경로 B 자동화)
# 사용: ./dev-start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

# ── 색상 출력 ──────────────────────────────────────────────────────────────
info()    { echo "[INFO]  $*"; }
success() { echo "[OK]    $*"; }
warn()    { echo "[WARN]  $*"; }
die()     { echo "[ERROR] $*" >&2; exit 1; }

# ── 종료 시 자식 프로세스 정리 ────────────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  info "종료 신호 수신 — 서비스 중지 중..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  docker compose -f "$ROOT/docker-compose.yml" stop postgres 2>/dev/null || true
  info "정리 완료"
}
trap cleanup INT TERM EXIT

# ── 사전 조건 확인 ────────────────────────────────────────────────────────
info "사전 조건 확인 중..."
docker info >/dev/null 2>&1 || die "Docker Desktop이 실행되어 있지 않습니다. 먼저 실행하세요."

# nvm으로 Node 24 활성화
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
NODE_VER=$(node -v 2>/dev/null | cut -c2- | cut -d. -f1)
[[ "$NODE_VER" -ge 24 ]] 2>/dev/null || warn "Node.js 24 권장 (현재: $(node -v)). 동작하지만 엔진 경고가 날 수 있습니다."

command -v pnpm >/dev/null 2>&1 || die "pnpm이 없습니다. 'corepack enable && corepack prepare pnpm@9.15.9 --activate' 실행 후 재시도."
success "사전 조건 OK"

# ── .env.local 준비 ───────────────────────────────────────────────────────
if [[ ! -f "$ROOT/.env.local" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env.local"
  info ".env.local 생성 (기본값 사용)"
fi

# ── Daytona 설정 로드 ─────────────────────────────────────────────────────
# 워커는 dotenv를 읽지 않으므로 .env.local의 변수를 셸로 내보낸다.
set -a
# shellcheck source=/dev/null
source "$ROOT/.env.local"
set +a
[[ -n "${DAYTONA_API_KEY:-}" ]] || warn "DAYTONA_API_KEY가 .env.local에 없습니다. 렌더가 실패합니다."

# ── Postgres 기동 ─────────────────────────────────────────────────────────
info "Postgres 기동 중..."
docker compose -f "$ROOT/docker-compose.yml" up -d --wait postgres 2>&1 \
  | grep -E "Created|Started|Healthy|already" || true
success "Postgres 실행 중 (localhost:5432)"

# ── DB 마이그레이션 ───────────────────────────────────────────────────────
info "DB 마이그레이션 실행 중..."
export DATABASE_URL="postgres://quarto:quarto@localhost:5432/quarto_studio"
(cd "$ROOT" && pnpm migrate 2>&1) | grep -E "applying|완료|already|Error" || true
success "마이그레이션 완료"

# ── Next.js 웹 서버 ───────────────────────────────────────────────────────
info "Next.js 개발 서버 시작 중..."
(cd "$ROOT" && pnpm dev > "$LOG_DIR/web.log" 2>&1) &
PIDS+=($!)
# 서버가 Ready 될 때까지 대기 (최대 30초)
for i in $(seq 1 30); do
  sleep 1
  grep -q "Ready" "$LOG_DIR/web.log" 2>/dev/null && break
  [[ $i -eq 30 ]] && warn "웹 서버 시작이 느립니다. $LOG_DIR/web.log 확인."
done
success "Next.js 실행 중 → http://localhost:3000  (로그: $LOG_DIR/web.log)"

# ── 렌더 워커 ─────────────────────────────────────────────────────────────
info "렌더 워커 시작 중..."
(cd "$ROOT" && DATABASE_URL="$DATABASE_URL" pnpm worker > "$LOG_DIR/worker.log" 2>&1) &
PIDS+=($!)
sleep 2
success "렌더 워커 실행 중  (로그: $LOG_DIR/worker.log)"

# ── convert 사이드카 (docx/pptx/pdf 첨부 텍스트 추출) ────────────────────
CONVERT_DIR="$ROOT/convert"
if [[ -f "$CONVERT_DIR/requirements.txt" ]]; then
  info "convert 사이드카 시작 중..."
  if [[ ! -d "$CONVERT_DIR/.venv" ]]; then
    info "  venv 생성 중 (최초 1회)..."
    python3 -m venv "$CONVERT_DIR/.venv"
    "$CONVERT_DIR/.venv/bin/pip" install --quiet -r "$CONVERT_DIR/requirements.txt"
  fi
  (cd "$CONVERT_DIR" && .venv/bin/uvicorn app.main:app --port 8000 > "$LOG_DIR/convert.log" 2>&1) &
  PIDS+=($!)
  sleep 2
  if curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; then
    success "convert 사이드카 실행 중 → http://localhost:8000"
  else
    warn "convert 사이드카 응답 없음. $LOG_DIR/convert.log 확인."
  fi
fi

# ── 완료 ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Quarto Studio 개발 스택 실행 중"
echo "  브라우저: http://localhost:3000"
echo ""
echo "  로그 위치: $LOG_DIR/"
echo "    web.log     — Next.js"
echo "    worker.log  — 렌더 워커"
echo "    convert.log — 첨부 추출 사이드카"
echo ""
echo "  종료: Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 자식 프로세스 중 하나라도 죽으면 전체 종료
wait -n "${PIDS[@]}" 2>/dev/null || true
