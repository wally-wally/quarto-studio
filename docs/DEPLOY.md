# Quarto Studio — 배포 가이드

## 사전 조건

- Docker Engine 24+ / Docker Compose v2
- 호스트에 `quarto-render:dev` 이미지 빌드 완료

```bash
# 렌더 이미지 빌드 (최초 1회)
docker build -t quarto-render:dev docker/render
```

## 전체 스택 실행

```bash
docker compose up -d --build
```

`migrate` 서비스가 DB 마이그레이션을 완료한 뒤 `web`·`worker`가 기동됩니다.

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
| `DOCKER_HOST` | `tcp://socket-proxy:2375` | Docker API 엔드포인트 (워커) |
| `QUARTO_RENDER_IMAGE` | `quarto-render:dev` | 일회용 렌더 컨테이너 이미지 |
| `RENDER_WORK_DIR` | `/work-root` | 워커가 잡 파일을 쓰는 경로 (named volume `render-work`) |
| `RENDER_WORK_VOLUME` | `quarto-studio_render-work` | 렌더 컨테이너가 마운트할 named volume 이름 |
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

일회용 렌더 컨테이너에 적용된 격리(워커 `docker run` 플래그):

| 플래그 | 효과 |
|--------|------|
| `--network none` | 외부 네트워크 차단(코드가 외부로 못 나감) |
| `--cap-drop ALL` + `--security-opt no-new-privileges` | 권한 상승 차단 |
| `--pids-limit 256` · `--memory 1g` · `--cpus 1.5` | 자원 고갈 방지 |
| `--rm` (일회용) | 렌더마다 새 컨테이너, 끝나면 폐기 |
| docker-socket-proxy | 워커의 Docker API를 컨테이너 생성/조회로 최소화(호스트 소켓 직접 노출 안 함) |

**남은 하드닝(후속):** `--read-only` 루트FS + 비루트 `--user`. 비루트 실행 시 렌더 이미지의
조정이 필요함 — IJulia 커널이 `/root/.local`에 설치되어 비루트가 못 찾고, matplotlib 폰트
캐시(`MPLCONFIGDIR`)·Julia depot의 쓰기 경로를 tmpfs/시스템 위치로 옮겨야 함. 이미지 재빌드와
`smoke.sh`/`verify.sh` 재검증이 동반되는 작업이라 별도로 진행 권장.

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
