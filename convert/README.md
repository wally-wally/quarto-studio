# convert — 첨부 문서 텍스트 추출 사이드카

첨부 문서(`docx`, `pptx`, `pdf`)를 평문 텍스트로 변환하는 작은 FastAPI 서비스다.
[`markitdown`](https://github.com/microsoft/markitdown) 으로 변환하며, 웹 앱(Next.js)이
HTTP로 호출한다. 무거운 파서 의존성을 웹 이미지에서 분리해 배포 이미지를 가볍게 유지하는 것이 목적이다.

## 엔드포인트

| 메서드 | 경로 | 입력 | 출력 |
|---|---|---|---|
| `POST` | `/convert` | multipart `file` | `{ "text": "<추출된 텍스트>" }` |
| `GET` | `/health` | — | `{ "status": "ok" }` |

## 로컬 기동

```bash
cd convert
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

웹 앱은 `CONVERT_SERVICE_URL`(기본 `http://localhost:8000`)로 이 서비스를 찾는다.

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `CONVERT_MAX_BYTES` | `12582912` (12MB) | 단일 파일 업로드 상한 |

## 컨테이너

`docker-compose.yml` 의 `convert` 서비스로 빌드/기동되며, 내부 네트워크 전용(외부 포트 미노출)이다.
