# Quarto 문법 레퍼런스

Quarto가 제공하는 문법·옵션을 [quarto.org](https://quarto.org)의 Guide와 Reference를 기반으로 전수 정리한 문서 모음입니다. Quarto Studio 에디터 개발 시 문법 지원·검증·자동완성·예제의 근거 자료로 사용합니다.

> [!NOTE]
> 각 문서 상단에 원본 페이지 출처가 표기되어 있습니다. Quarto는 자주 갱신되므로, 세부 옵션은 원본 페이지와 교차 확인하세요. (정리 시점: 2026-06-26)

## 구성

| 문서 | 영역 | 주요 내용 |
| --- | --- | --- |
| [01-authoring-markdown.md](01-authoring-markdown.md) | Authoring · 마크다운 | 텍스트 서식, 헤딩, 목록, 링크/이미지, 수식, div/span, 그림, 표, 다이어그램, Callout, 코드 블록·주석, Shortcode, 비디오, 아티클 레이아웃 |
| [02-scholarly.md](02-scholarly.md) | Authoring · 학술 | 인용(citations), 교차참조(cross-references), front matter, 타이틀 블록, 부록 |
| [03-computations.md](03-computations.md) | Computations | Python/R/Julia/Observable 청크, 인라인 코드, 실행 옵션 전수표, 파라미터 |
| [04-advanced.md](04-advanced.md) | Advanced | Includes, 변수(var/meta/env), 조건부 콘텐츠, 페이지 레이아웃, 언어 설정, 노트북 필터 |
| [05-reference-html.md](05-reference-html.md) | Reference · 포맷 | HTML 출력 YAML 옵션 전수 (카테고리별) |
| [06-reference-pdf-typst-docx.md](06-reference-pdf-typst-docx.md) | Reference · 포맷 | PDF / Typst / Word 출력 YAML 옵션 전수 |
| [07-reference-cells.md](07-reference-cells.md) | Reference · 셀 | 코드 셀 `#\|` 옵션 전수 (Knitr / Jupyter / OJS) |
| [08-reference-projects.md](08-reference-projects.md) | Reference · 프로젝트 | `_quarto.yml` 프로젝트/preview/serve 옵션 + 스켈레톤 |

## 빠른 이정표

- **사용자가 `.qmd`에 타이핑하는 문법** → `01`, `02`, `04`
- **코드 실행 동작·옵션** → `03`, `07`
- **출력 포맷별 YAML 옵션** → `05`, `06`
- **프로젝트 단위 설정** → `08`

## 원본 출처

- Guide: <https://quarto.org/docs/guide/>
- Reference: <https://quarto.org/docs/reference/>
