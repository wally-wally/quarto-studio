-- 렌더 중단(cancel) 지원: render_jobs.status에 'canceled' 추가.
-- 사용자가 렌더를 중단하면 queued/running 잡을 canceled로 표시한다(쿼터 해제 + 무한 '렌더링 중' 탈출).
alter table render_jobs drop constraint render_jobs_status_chk;
alter table render_jobs add constraint render_jobs_status_chk
  check (status in ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'canceled'));
