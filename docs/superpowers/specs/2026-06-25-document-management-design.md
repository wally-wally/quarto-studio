# Quarto Studio 문서 관리 설계

## 목표

Quarto Studio의 왼쪽 사이드바에서 문서를 만들고, 제목을 빠르게 수정하고, 불필요한 문서를 삭제할 수 있게 한다. 이번 범위는 문서 관리 루트를 완성하는 데 집중하며, 렌더 로그 보기와 Python/R 실행 환경 상태 체크 UI는 후속 작업으로 남긴다.

## 포함 범위

- 사이드바 `+` 버튼으로 새 문서 생성 다이얼로그 열기.
- 새 문서 제목 입력 후 SQLite에 문서 생성.
- 새 문서 생성 직후 해당 문서를 활성 문서로 선택.
- 사이드바 문서 항목에서 제목 inline 편집.
- 문서 삭제와 삭제 후 활성 문서 자동 전환.

## 제외 범위

- 렌더 로그 저장 및 보기.
- Python/R 실행 환경 상태 체크 UI.
- 문서 검색 기능.
- 복구 가능한 휴지통 또는 soft delete.
- drag-and-drop 정렬.

## 사용자 흐름

### 새 문서 생성

사이드바 header의 `+` 버튼은 활성화된다. 사용자가 버튼을 누르면 작은 modal dialog가 열린다. Dialog에는 문서 제목 입력 필드, 생성 버튼, 취소 버튼이 있다.

사용자가 제목을 입력하고 생성하면 서버 액션이 새 문서를 만든다. 제목은 사용자가 입력한 값을 사용하고, slug는 제목을 `normalizeSlug`로 변환한 값을 기반으로 만든다. 동일 slug가 이미 있으면 안정적인 suffix를 붙여 unique slug를 만든다. 생성된 문서는 기본 QMD 템플릿을 가진다.

기본 QMD 템플릿은 다음 형태를 사용한다.

```markdown
---
title: "<사용자 입력 제목>"
format:
  html:
    toc: true
---

# <사용자 입력 제목>

새 Quarto 문서를 작성해보세요.
```

생성 성공 후 dialog는 닫히고, 새 문서가 사이드바에서 active 상태가 되며, 에디터와 미리보기 pane은 새 문서 상태를 보여준다. 미리보기는 아직 렌더되지 않은 상태로 시작한다.

### 사이드바 제목 편집

각 문서 항목에는 제목 옆에 편집 아이콘 버튼이 있다. 사용자가 편집 버튼을 누르면 해당 문서 항목의 제목 영역이 input으로 바뀐다.

- Enter: 제목 저장.
- Blur: 제목 저장.
- Escape: 편집 취소.
- 빈 제목 저장 시도: 저장하지 않고 기존 제목을 유지한다.

사이드바 제목 편집은 제목만 수정한다. slug와 QMD 본문은 자동 변경하지 않는다. 현재 활성 문서의 제목을 사이드바에서 수정하면 에디터의 제목 필드도 같은 값으로 갱신된다.

### 문서 삭제

각 문서 항목에는 삭제 아이콘 버튼이 있다. 삭제 버튼을 누르면 브라우저 `confirm()`으로 확인한다. 확인 메시지는 삭제할 문서 제목을 포함한다.

삭제 성공 후에는 다음 규칙으로 활성 문서를 정한다.

1. 삭제한 문서가 active 문서가 아니면 현재 active 문서를 유지한다.
2. 삭제한 문서가 active 문서이면, 남아 있는 문서 중 최신 수정 문서를 선택한다.
3. 마지막 문서를 삭제하면 새 기본 문서를 자동 생성하고 선택한다.

삭제는 hard delete로 처리한다. 삭제된 문서의 렌더링 HTML, 오류, 메타데이터도 함께 사라진다.

## 데이터와 서비스 설계

기존 `documents` 테이블을 그대로 사용한다. 새 컬럼은 추가하지 않는다.

Repository에는 다음 동작을 추가한다.

| 동작 | 역할 |
| --- | --- |
| `createDocument(title)` | 새 id, unique slug, 기본 QMD content를 가진 문서를 insert한다. |
| `renameDocument(id, title)` | 특정 문서의 제목만 수정하고 `updated_at`을 갱신한다. |
| `deleteDocument(id)` | 특정 문서를 hard delete한다. |

마지막 문서 삭제 여부와 다음 active 문서 선택은 별도 count API를 만들지 않고, 삭제 후 `listDocuments()` 결과를 재사용해서 판단한다.

Service는 repository 동작을 workspace 단위로 감싼다.

| 동작 | 반환 |
| --- | --- |
| `createDocument(title)` | 생성 문서를 active로 둔 `WorkspaceState`. |
| `renameDocument(id, title)` | 현재 active 문서를 유지하되 제목 변경이 반영된 `WorkspaceState`. |
| `deleteDocument(id)` | 삭제 후 자동 선택된 active 문서를 포함한 `WorkspaceState`. |

Server Action은 각 service 메서드를 호출하고 변경 후 `revalidatePath("/")`를 수행한다.

## UI 설계

사이드바는 문서 관리의 중심이 된다.

- Header의 `+` 버튼은 `aria-label="새 문서 만들기"`로 노출한다.
- 새 문서 dialog는 사이드바 위에 뜨는 modal로 구현한다.
- 문서 항목은 기존 제목/상태 표시를 유지하되, 오른쪽에 편집/삭제 icon button을 둔다.
- 아이콘 버튼은 lucide의 `Pencil`과 `Trash2`를 사용한다.
- 편집 input은 문서 항목의 높이를 크게 흔들지 않도록 기존 제목 영역 안에 배치한다.
- 삭제와 편집 중에는 현재 작업 중인 서버 액션이 끝날 때까지 관련 입력과 버튼을 비활성화한다.

## 오류 처리

| 상황 | 동작 |
| --- | --- |
| 새 문서 제목이 비어 있음 | dialog를 닫지 않고 입력 필드 근처에 한국어 오류를 보여준다. |
| 제목 편집 값이 비어 있음 | 저장하지 않고 기존 제목으로 복귀한다. |
| 삭제 confirm 취소 | 아무 서버 액션도 호출하지 않는다. |
| 서버 액션 실패 | 기존 workspace를 유지하고 하단 action error toast를 보여준다. |
| 삭제 대상 문서가 없음 | 서버 오류 메시지를 action error toast로 표시한다. |

## 테스트 전략

Vitest와 React Testing Library를 사용한다. 테스트는 production source module을 직접 import한다.

주요 테스트는 다음을 포함한다.

- Repository: 새 문서 생성, unique slug 생성, 제목 변경, 삭제, 마지막 문서 처리에 필요한 조회.
- Service: create/rename/delete가 올바른 active 문서를 가진 `WorkspaceState`를 반환하는지 확인.
- Server Action: create/rename/delete action이 service를 호출하고 `revalidatePath("/")`를 수행하는지 확인.
- UI: `+` 버튼 클릭 시 dialog 표시, 제목 입력 후 create action 호출, 사이드바 inline 제목 편집 저장/취소, 삭제 confirm 후 delete action 호출.

## 확정된 결정

- 새 문서는 modal dialog에서 제목을 입력해 만든다.
- 사이드바 제목 편집은 제목만 바꾸며 slug와 본문은 유지한다.
- 삭제는 hard delete로 처리한다.
- 마지막 문서 삭제 시 새 기본 문서를 자동 생성한다.
- 렌더 로그 보기와 Python/R 실행 환경 체크는 이번 구현에서 제외한다.
