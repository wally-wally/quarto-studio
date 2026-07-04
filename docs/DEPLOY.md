# Quarto Studio — 배포 가이드

## 사전 조건

- Docker Engine 24+ / Docker Compose v2
- Daytona 계정·API 키 (`DAYTONA_API_KEY`)
- 렌더용 Daytona 스냅샷 준비 완료 — 로컬에 이미지를 빌드할 필요는 없다. 최초 1회
  `./scripts/daytona-snapshot.sh` 로 서버사이드 빌드하고 `pnpm smoke:daytona` 로 검증한다
  (자세한 절차는 아래 "보안 / 격리" 참고).

## 전체 스택 실행

```bash
docker compose up -d --build
```

`migrate` 서비스가 DB 마이그레이션을 완료한 뒤 `web`·`worker`가 기동됩니다.

`worker` 서비스는 `DAYTONA_API_KEY`가 실제 환경변수로 존재하지 않으면 즉시 기동에 실패한다
(`DAYTONA_API_KEY가 필요합니다`). Compose는 `.env.local`이 아니라 `.env`/셸 export만 읽으므로,
운영 환경에서는 systemd `EnvironmentFile`, docker-compose.yml과 같은 위치의 `.env` 파일,
CI/CD 시크릿 주입 등 배포 환경의 시크릿 관리 방식으로 `docker compose up` 실행 전에 값을
주입해야 한다. 실제 키 값을 커밋된 파일에 하드코딩하지 말 것.

## 첫 사용자 등록

브라우저에서 `http://localhost:3000` 접속 후 회원가입합니다.

## 예제 시드 (선택)

```bash
SEED_USER_EMAIL=me@example.com node scripts/seed-examples.mjs
```

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `postgres://quarto:quarto@postgres:5432/quarto_studio` | PostgreSQL 연결 URL |
| `ARTIFACT_DIR` | `/artifacts` | 렌더 결과물 저장 경로 (named volume `artifacts`) |
| `DAYTONA_API_KEY` | (비밀 — .env.local/배포 시크릿) | Daytona API 키. **git 커밋 절대 금지** |
| `DAYTONA_SNAPSHOT` | `quarto-render-1` | 렌더용 Daytona 스냅샷 이름 (`scripts/daytona-snapshot.sh`로 생성) |
| `QUARTO_RENDER_TIMEOUT_MS` | `60000` | 렌더 타임아웃 (ms) |
| `RENDER_QUOTA` | `3` | 사용자별 동시 렌더(queued+running) 상한 |

## 백업 / 복원

```bash
# 백업: Postgres 덤프 + 아티팩트 볼륨 → ./backups/<타임스탬프>/
./scripts/backup.sh

# 복원(예시):
gunzip -c backups/<날짜>/db.sql.gz | docker compose exec -T postgres psql -U quarto -d quarto_studio
docker run --rm -v quarto-studio_artifacts:/a -v "$PWD/backups/<날짜>":/b alpine \
  sh -c 'tar -xzf /b/artifacts.tar.gz -C /a'
```

## 보안 / 격리

렌더(사용자 코드 실행)는 Daytona 관리형 sandbox에서 수행된다. 워커·웹 서버에서는
어떤 사용자 코드도 실행되지 않는다.

| 항목 | 내용 |
|---|---|
| 실행 격리 | 잡당 일회용 ephemeral sandbox (종료 시 삭제, 상태 잔존 없음) |
| 네트워크 | `networkBlockAll: true` — sandbox 내부에서 외부 통신 불가 (기존 `--network none` 동급) |
| 리소스 | 스냅샷 정의: 2 vCPU / 2GiB RAM / 10GiB 디스크 |
| 타임아웃 | ① Daytona exec timeout(60s) ② 워커 워치독(+10s) ③ autoStopInterval 5분 |
| 고아 정리 | 워커 크래시 시 autoStopInterval이 5분 내 sandbox 자동 정지·삭제(과금 중단) |
| 워커 권한 | Docker 소켓 접근 불필요 (socket-proxy 제거) — 아웃바운드 HTTPS(Daytona API)만 필요 |

스냅샷 갱신 절차: `docker/render/Dockerfile` 수정 → `./scripts/daytona-snapshot.sh <새버전>` →
`pnpm smoke:daytona`로 검증 → 배포 환경의 `DAYTONA_SNAPSHOT` 교체.

## 로그 확인

```bash
docker compose logs -f worker
docker compose logs -f web
```

## 중지

```bash
docker compose down
# 볼륨 포함 삭제:
docker compose down -v
```
