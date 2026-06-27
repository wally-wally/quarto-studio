-- Phase 3-B: owner 스코프
-- 기존 owner 없는 문서는 owner_id = null 로 유지됨 (고아 → 아무에게도 안 보임).

alter table documents add column owner_id uuid references users(id) on delete cascade;

alter table render_jobs add column requested_by uuid references users(id) on delete set null;

create index documents_owner_idx on documents(owner_id);

alter table documents drop constraint documents_slug_key;

create unique index documents_owner_slug_uidx on documents(owner_id, slug);
