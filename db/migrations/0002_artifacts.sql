-- Phase 2: artifacts storage. rendered_html moves out of render_jobs.
create table if not exists artifacts (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  job_id       uuid references render_jobs(id) on delete set null,
  storage_key  text not null,
  content_type text not null default 'text/html',
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists artifacts_document_idx on artifacts (document_id, created_at desc);

alter table documents add column if not exists latest_artifact_id uuid references artifacts(id) on delete set null;

alter table render_jobs add column if not exists artifact_id uuid references artifacts(id) on delete set null;

alter table render_jobs drop column if exists rendered_html;
