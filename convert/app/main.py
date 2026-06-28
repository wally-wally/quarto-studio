import os
import tempfile
from contextlib import suppress

from fastapi import FastAPI, File, HTTPException, UploadFile
from markitdown import MarkItDown

# 웹이 첨부 총합 5MB를 강제하지만 서비스도 자체 방어선을 둔다.
MAX_BYTES = int(os.environ.get("CONVERT_MAX_BYTES", str(12 * 1024 * 1024)))

app = FastAPI(title="quarto-studio convert", version="1.0.0")
_md = MarkItDown(enable_plugins=False)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/convert")
def convert(file: UploadFile = File(...)) -> dict:
    # 동기 def → FastAPI가 스레드풀에서 실행(블로킹 변환이 이벤트 루프를 막지 않음).
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다.")

    suffix = os.path.splitext(file.filename or "")[1].lower()
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        result = _md.convert(tmp_path)
        text = (result.text_content or "").strip() if result else ""
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="문서 변환에 실패했습니다.") from exc
    finally:
        if tmp_path:
            with suppress(OSError):
                os.remove(tmp_path)

    return {"text": text}
