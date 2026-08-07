-- Cached editor scan clusters per category (morning cron + manual rescan).
create table if not exists public.scan_cache (
  category text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.scan_cache is
  'Latest editor scan result per genre; desk loads this on open, rescan replaces it.';

alter table public.scan_cache enable row level security;
