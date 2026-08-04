-- Cache extracted full article text for generation (additive).
-- Populated at generate-time; reused on later generates to avoid re-fetching.

alter table public.articles
  add column if not exists full_text text,
  add column if not exists full_text_fetched_at timestamptz;

comment on column public.articles.full_text is
  'Main article body extracted from the source URL at generate time. Nullable until first successful extract.';

comment on column public.articles.full_text_fetched_at is
  'When full_text was last fetched/extracted (even if thin/failed and left null).';
