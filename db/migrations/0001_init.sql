-- Phase 1: documents + render_jobs(큐). 단일 사용자, 인증 없음(Phase 3에서 추가).
create extension if not exists "pgcrypto";

create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text not null unique,
  content      text not null,
  execute_code boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- render_jobs: 큐이자 렌더 결과 저장소.
-- Phase 1은 rendered_html을 잡에 둔다(Phase 2에서 아티팩트 스토리지로 이동).
create table if not exists render_jobs (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references documents(id) on delete cascade,
  status           text not null default 'queued',
  content_snapshot text not null,
  execute_code     boolean not null,
  worker_id        text,
  attempts         int not null default 0,
  log              text,
  rendered_html    text,
  created_at       timestamptz not null default now(),
  claimed_at       timestamptz,
  finished_at      timestamptz,
  constraint render_jobs_status_chk
    check (status in ('queued','running','succeeded','failed','timed_out'))
);

create index if not exists render_jobs_queue_idx on render_jobs (status, created_at);
create index if not exists render_jobs_document_idx on render_jobs (document_id);
