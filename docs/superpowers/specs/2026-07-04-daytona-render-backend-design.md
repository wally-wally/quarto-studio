# Daytona 렌더 백엔드 전환 설계

날짜: 2026-07-04
브랜치: feature/daytona
상태: 설계 승인 대기

## 배경과 목표

quarto-studio의 렌더 실행(qmd 안의 Python/R/Julia 코드 실행 포함)은 현재 worker가
로컬 Docker 데몬에 일회용 컨테이너(`docker run --rm`)를 띄워 수행한다. 이를
Daytona(daytona.io) 관리형 클라우드 sandbox로 **전면 교체**한다.

기대 효과:

- worker 서버에서 Docker 데몬·docker-socket-proxy 의존 제거 (스케일아웃 단순화)
- 렌더 격리 책임을 Daytona로 이관 — 남아 있던 비루트/`--read-only` 하드닝 숙제 해소
- 회사 ai-api.office.hiworks.com에서 검증된 벤더·패턴 재사용 (단, quarto-studio는
  별도 Daytona 계정 사용)

수용한 트레이드오프:

- Daytona는 2026-06부로 코어가 클로즈드소스화되어 셀프호스팅 경로가 사실상 없음.
  관리형 클라우드 벤더 의존을 감수한다 (ai-api도 동일 전제). Daytona 장애 시 렌더
  기능이 멈춘다.
- worker에서 Daytona API(외부 인터넷)로의 아웃바운드 통신이 새로 필요하다.

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 백엔드 구성 | Daytona 전면 교체 (Docker 실행 경로·설정 제거, 스위치 없음) |
| sandbox 생명주기 | 렌더 잡 1건당 일회용 (`ephemeral: true`, 종료 시 삭제) |
| 스냅샷 빌드 | Daytona 서버사이드 빌드 (`daytona snapshot create --dockerfile`) |
| 코드 구조 | A안 — worker 인라인 교체 + 얇은 헬퍼 `worker/daytona.ts` 분리 |
| sandbox 네트워크 | 전체 차단 (현행 `--network none`과 동일 보안 수준) |

## 아키텍처

### 변하지 않는 것

- 프론트 → 서버 액션 → `enqueueRenderJob()` → PostgreSQL `render_jobs` 큐 →
  worker `FOR UPDATE SKIP LOCKED` claim 흐름 전체
- 렌더 쿼터(사용자당 동시 3건), 잡 상태 머신
  (`queued → running → succeeded/failed/timed_out/canceled`)
- `buildQuartoProjectFiles()`의 `index.qmd`/`_quarto.yml` 생성 로직
- 아티팩트 저장 (파일시스템 artifact store, 문서당 최근 5개 보존)
- `docker/render/Dockerfile` — 스냅샷 원본으로 그대로 사용 (amd64 서버사이드
  빌드이므로 aarch64 분기는 자연히 미사용)

### 신규: `worker/daytona.ts`

Daytona SDK(`@daytonaio/sdk`)를 감싸는 얇은 헬퍼. 핵심 함수 하나:

```
runQuartoRender({ files, timeoutMs, onCancelCheck })
  → sandbox 생성 (snapshot: DAYTONA_SNAPSHOT, ephemeral: true, 네트워크 차단,
     autoStopInterval: 5분)
  → index.qmd / _quarto.yml 업로드 (메모리 버퍼에서 직접 — 로컬 임시 디렉토리 불필요)
  → executeCommand("quarto render index.qmd --to html", cwd, timeout)
  → 성공 시 index.html 다운로드
  → finally: sandbox 삭제 (모든 경로에서 보장)
  → 반환: { exitCode, output, html }
```

### 수정: `worker/render-worker.ts`

- 제거: `runDocker()`, 볼륨 마운트 분기(compose 네임드 볼륨/로컬 바인드),
  컨테이너 이름 관리, `docker kill` 에스컬레이션, 로컬 임시 디렉토리 생성/정리
- `processJob()`이 `runQuartoRender()`를 호출하도록 교체
- 취소 폴링은 유지하되, 취소 신호 시 sandbox 즉시 삭제로 대체

### 인프라 변경

- docker-compose: `docker-socket-proxy` 서비스, `render-work` 공유 볼륨 제거
- worker 이미지(Dockerfile.worker): docker CLI 불필요
- 로컬 개발: Docker 데몬 없이 `DAYTONA_API_KEY`만 있으면 렌더 동작
- `docs/DEPLOY.md` 갱신

### 신규: `scripts/daytona-snapshot.sh`

`daytona snapshot create quarto-render-<버전> --dockerfile docker/render/Dockerfile
--context docker/render/ --cpu 2 --memory 2 --disk 10` 래퍼. 스냅샷 버전을 올리면
`DAYTONA_SNAPSHOT` 환경변수만 교체해서 배포.

## sandbox 스펙

- 2 vCPU / 2GiB RAM / 10GiB 디스크 (스냅샷에 정의)
  - 현행 1.5 CPU/1GB와 동급 이상. Daytona는 정수 vCPU 단위라 2로 상향.
  - 렌더 이미지가 수 GB(Julia+R 포함)라 디스크는 10GiB.
- `autoStopInterval: 5` (분) — worker가 죽어 삭제를 못 한 고아 sandbox의 과금
  방지 안전망. ephemeral이므로 정지 = 삭제.
- 네트워크 전체 차단 — 폰트·패키지는 이미지에 내장되어 렌더에 네트워크 불필요.
  sandbox 제어(업로드/실행/다운로드)는 Daytona 관리 통로라 차단과 무관.

## 데이터 흐름 (잡 1건)

1. worker가 잡 claim (기존과 동일)
2. `buildQuartoProjectFiles()`로 파일 내용 생성 (디스크에 쓰지 않음)
3. sandbox 생성 → `/work/`에 파일 업로드
4. `quarto render index.qmd --to html` 실행 (timeout 60초)
5. exit 0 → `/work/index.html` 다운로드 → 아티팩트 저장 → 트랜잭션 완료 처리
6. finally: sandbox 삭제

### 타임아웃 (삼중 안전망)

1. Daytona `executeCommand` timeout 파라미터 (60초)
2. worker 자체 타이머 (60초 + 여유 10초) — 초과 시 sandbox 삭제 후 `timed_out`
3. `autoStopInterval` 5분 — 최후 과금 방지

### 취소

- 기존과 동일하게 실행 중 DB 폴링으로 취소 신호 확인
- 감지 시 sandbox 즉시 삭제 → 잡 `canceled`

### worker 크래시

- sandbox는 autoStop으로 5분 내 자동 정리
- 잡이 `running`으로 남는 문제는 Docker 방식에도 있던 기존 이슈로 이번 범위 외

## 에러 처리

| 상황 | 처리 |
|---|---|
| 렌더 exit code ≠ 0 | 잡 `failed` + 출력 로그 저장 (기존 에러 패널 표시 방식 유지) |
| sandbox 생성 429/용량 부족 | retry-after ≤ 3초면 대기 후 1회 재시도, 실패 시 `failed` + 혼잡 안내 메시지 |
| Daytona API 장애·네트워크 오류 | `failed` + 원인 로그. 자동 무한 재시도 없음 (사용자 재시도) |
| 업로드/다운로드 실패 | `failed`, sandbox는 finally에서 삭제 |
| sandbox 삭제 실패 | 로그만 남기고 무시 (autoStop 안전망) |

## 환경변수

| 변수 | 상태 | 비고 |
|---|---|---|
| `DAYTONA_API_KEY` | 추가 (필수) | **git 커밋 절대 금지. `.env.local`에만 저장.** `.env.example`에는 빈 값 |
| `DAYTONA_SNAPSHOT` | 추가 | 기본 `quarto-render-1`. 스냅샷 버전 교체용 |
| `QUARTO_RENDER_TIMEOUT_MS` | 유지 | 60000 |
| `RENDER_QUOTA` | 유지 | 3 |
| `DOCKER_HOST`, `QUARTO_RENDER_IMAGE`, 렌더 작업 디렉토리 관련 | 제거 | Docker 실행 경로 폐기 |

## 테스트 계획

1. **단위 테스트 (vitest)** — `worker/daytona.ts`를 SDK mock으로 검증:
   정상 렌더 / 비정상 exit / 타임아웃 / 취소 / 모든 경로에서 sandbox 삭제 호출
   (finally 보장)
2. **스냅샷 스모크** — `scripts/daytona-smoke.sh`: 실제 Daytona에서 Python·R·Julia
   셀이 각각 포함된 샘플 qmd 렌더. 스냅샷 신규 생성 시마다 수동 실행
3. **E2E 수동 확인** — dev 환경 UI에서 렌더 결과 표시, 취소 버튼, 동시 3건 쿼터,
   60초 타임아웃 동작 확인
