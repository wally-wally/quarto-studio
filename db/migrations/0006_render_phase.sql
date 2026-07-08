-- 렌더 진행 단계 표시: render_jobs에 phase 컬럼 추가.
-- worker가 sandbox 준비(preparing)/코드 실행(executing) 전환 시점에 갱신한다.
-- queued 상태에서는 NULL이고, 성공해도 마지막 값을 지우지 않는다
-- (무해 — 프론트가 success에서는 phase를 참조하지 않음).
alter table render_jobs add column phase text;
alter table render_jobs add constraint render_jobs_phase_chk
  check (phase is null or phase in ('preparing', 'executing'));
