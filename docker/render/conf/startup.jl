# Julia/Plots(GR) 한글 렌더: 기본 폰트를 NotoSansKR(추출된 Noto Sans CJK KR)로.
#
# NanumGothic은 한글은 되지만 U+2212(−, 수학용 마이너스)가 없어 음수 축 라벨이 두부로
# 깨지고 GR이 "glyph missing from current font: 8722"를 대량 출력했다. Noto Sans CJK KR은
# 한글 + U+2212를 모두 포함한다. GR은 폰트를 "<이름>.ttf" 파일명으로 찾으므로, Noto의 .ttc를
# Dockerfile(extract-noto-kr.py)에서 NotoSansKR.ttf로 추출해 두고 그 이름을 지정한다.
#
# Plots는 로드 시 Main의 PLOTS_DEFAULTS 전역을 읽어 기본 속성에 적용한다.
# 이 파일은 모든 julia 세션(IJulia 커널 포함)에서 Plots 로드 전에 실행되므로,
# 사용자가 fontfamily를 지정하지 않아도 차트의 한글과 음수 부호가 두부 없이 렌더된다.
PLOTS_DEFAULTS = Dict(:fontfamily => "NotoSansKR")
