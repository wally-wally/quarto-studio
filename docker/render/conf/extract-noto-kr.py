"""Noto Sans CJK KR을 .ttc 컬렉션에서 단독 .ttf로 추출한다.

왜 필요한가:
- GR(Julia Plots 기본 백엔드)은 폰트를 fontconfig 패밀리가 아니라 "<fontfamily>.ttf"
  파일명으로 찾는다. Noto Sans CJK KR은 .ttc 컬렉션이라 이름으로 못 찾는다.
- NanumGothic은 .ttf라 GR이 찾지만 U+2212(−, 수학용 마이너스)가 없어, 음수 축 라벨이
  두부로 깨지고 GR이 "glyph missing from current font: 8722"를 대량 출력한다.
- Noto Sans CJK KR은 한글 + U+2212를 모두 포함한다. 단독 .ttf로 추출해 두면 GR이
  fontfamily="NotoSansKR"로 로드할 수 있어 한글과 음수 부호가 함께 정상 렌더된다.

fontTools는 matplotlib 의존성으로 venv에 이미 설치돼 있다(requirements.txt 핀).
"""

import os

from fontTools.ttLib import TTCollection

SRC = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
DST = "/usr/share/fonts/truetype/noto-kr/NotoSansKR.ttf"
FAMILY = "Noto Sans CJK KR"

os.makedirs(os.path.dirname(DST), exist_ok=True)

collection = TTCollection(SRC)
for font in collection.fonts:
    if (font["name"].getDebugName(1) or "") == FAMILY:
        font.save(DST)
        print(f"extracted {FAMILY} -> {DST}")
        break
else:
    families = [f["name"].getDebugName(1) for f in collection.fonts]
    raise SystemExit(f"{FAMILY} face not found in {SRC}; available: {families}")
