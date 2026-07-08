# 렌더 sandbox DNS fast-fail — 외부 fetch 지연 원천 차단

날짜: 2026-07-09
브랜치: feature/render-dns-fast-fail
상태: 구현·검증 완료

## 문제

`chart` 문서(pandas + matplotlib + Styler 테이블) 렌더가 21.5초 소요. 렌더 로그 분석 결과
executing 구간 18.4초 중 상당분이 **차단된 네트워크에서의 외부 리소스 fetch 대기**였다:

```
[WARNING] Could not fetch resource https://cdnjs.cloudflare.com/.../jquery.min.js
[WARNING] Could not fetch resource https://cdnjs.cloudflare.com/.../require.min.js
```

### 원인 체인 (전 단계 실증 확인)

1. **주입**: Quarto Jupyter 엔진(`core/jupyter/widgets.ts`)은 노트북의 어느 셀이든 출력
   MIME이 `text/html`(또는 `application/javascript`)이면 jquery + require.js CDN
   `<script>` 태그를 head에 주입한다. 클래식 Jupyter Notebook 호환 계약(HTML 출력물이
   전역 jQuery/RequireJS를 가정하던 시절)을 보수적으로 유지하는 무딘 휴리스틱.
2. **트리거**: `chart` 문서의 `display(result.style...)` — pandas Styler의
   `_repr_html_()`이 `text/html` 출력을 생성. (matplotlib 차트는 `image/png`라 무관.)
3. **fetch**: `_quarto.yml`의 `embed-resources: true` 때문에 pandoc이 self-contained
   HTML을 만들며 head의 원격 리소스를 다운로드 시도.
4. **지연**: sandbox는 `networkBlockAll: true` — DNS 패킷이 조용히 드롭되어 resolver가
   타임아웃까지 대기. URL당 수 초씩 낭비 후 경고만 남기고 포기.

Pretendard/Google Fonts 제거(2026-07-05)와 같은 병의 다른 변종. 그때는 *소스*(폰트
링크)를 제거했지만, 이번 jquery/require는 Quarto 내부 주입이라 소스 제거 스위치가 없다.

## 결정: DNS fast-fail (클래스 전체 해결)

개별 소스를 쫓는 대신 **실패를 빠르게** 만든다. 렌더 명령 앞에 resolver를 루프백으로
돌리는 셋업을 붙인다:

```
printf 'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n' > /etc/resolv.conf 2>/dev/null || true; quarto render index.qmd --to html
```

- 127.0.0.1:53에는 아무것도 안 듣고 있으므로 조회가 **즉시 ECONNREFUSED** — 타임아웃 대기 소멸
- `options timeout:1 attempts:1`은 이중 안전망 (localhost 응답이 어떤 이유로든 지연될 때 1초 상한)
- `|| true`: resolv.conf 쓰기 실패 시에도 렌더는 계속 (느려질 뿐 결과 동일)
- sandbox는 root 실행(`docker/render/Dockerfile`에 USER 지시자 없음)이라 쓰기 가능
- **스냅샷 리빌드 불필요** — 퍼렌더 명령 프리픽스만으로 적용, `runQuartoRender()` 내부라
  worker·smoke 모든 호출자에 공통 적용

### 기능 영향 없음 (검토 완료)

네트워크는 이미 전면 차단 상태 — fast-fail은 "이미 실패하는 것을 빨리 실패하게" 할 뿐,
성공/실패 매트릭스는 불변:

- 정적 문서(현재 산출물 전부): 외부 참조는 죽은 jquery/require 태그 2줄뿐. 다운로드
  파일도 차트(base64 PNG)·CSS 인라인으로 오프라인 완전 표시 — 전후 동일.
- 가상의 인터랙티브 문서(ipywidgets 등): 지금도 임베드 실패 + 미리보기 CSP 차단.
  다운로드 후 인터넷 환경 열람 시 CDN 로드로 동작하는 경로도 전후 동일.
- 사용자 코드의 네트워크 호출(`requests.get` 등): 어차피 실패하던 것이 몇 초 매달리는
  대신 즉시 명확히 실패 — UX 개선.

### 기각한 대안

| 대안 | 기각 사유 |
|---|---|
| Quarto 주입 억제 | 공식 off 옵션 없음. Styler 사용 금지 등은 사용자 문서 제약 |
| 렌더 후 태그 제거 | fetch는 렌더 중에 발생 — 시간 절약 없음 |
| 스냅샷에 jquery/require 로컬 내장 + 태그 재작성 | 위젯 지원이 실요구가 될 때의 정공법. fast-fail과 충돌 없음(디딤돌) |
| sandbox 재사용/warm pool | preparing은 3.0초에 불과 — 격리 반납 대비 이득 없음 (실측으로 기각) |

## 검증 (실 Daytona, chart 문서)

| 시점 | 총 | preparing | executing |
|---|---|---|---|
| 구 main (폰트 fix 전, 7/8) | 32.2s | — | — |
| 현 main (fix 전) | 21.55s | 2.99s | 18.40s |
| **fast-fail 적용** | **13.96s / 14.48s (n=2)** | ~3.1s | **10.8~11.2s** |

- executing **-7.6초** (예상 ~5초보다 큰 폭 — DNS 대기가 URL당 추정치 이상이었음)
- 렌더 로그: fetch 경고 2건 여전히 기록(시도는 함) — 즉시 실패로 시간만 소멸
- 아티팩트: 1.2MB, 차트 base64 임베드 정상, fix 전 산출물과 구조 동일(diff 확인)
- 단위 테스트 250개 전체 통과, typecheck·lint 클린(기존 경고 5건만)
