# Julia/Plots(GR) 한글 렌더: 기본 폰트를 NanumGothic으로.
# Plots는 로드 시 Main의 PLOTS_DEFAULTS 전역을 읽어 기본 속성에 적용한다.
# 이 파일은 모든 julia 세션(IJulia 커널 포함)에서 Plots 로드 전에 실행되므로,
# 사용자가 fontfamily를 지정하지 않아도 차트의 한글이 두부 없이 렌더된다.
PLOTS_DEFAULTS = Dict(:fontfamily => "NanumGothic")
