#!/usr/bin/env bash
# Quarto Studio 백업: Postgres 덤프 + 아티팩트(렌더 HTML) 볼륨.
# 사용: ./scripts/backup.sh [출력디렉토리]  (기본 ./backups/<타임스탬프>)
# 복원: docs/DEPLOY.md 참조.
set -euo pipefail

OUT="${1:-./backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"
ART_VOLUME="${ART_VOLUME:-quarto-studio_artifacts}"

echo "→ Postgres 덤프"
docker compose exec -T postgres pg_dump -U quarto quarto_studio | gzip > "$OUT_ABS/db.sql.gz"

echo "→ 아티팩트 볼륨 백업 ($ART_VOLUME)"
docker run --rm -v "$ART_VOLUME":/a:ro -v "$OUT_ABS":/out alpine \
  tar -czf /out/artifacts.tar.gz -C /a . 2>/dev/null || echo "  (아티팩트 볼륨 없음/비어있음 — 건너뜀)"

echo "백업 완료: $OUT_ABS"
ls -la "$OUT_ABS"
