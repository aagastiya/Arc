-- Arc curated stories — separate from raw RSS articles.
-- An "arc story" is what YOU publish to users via the Today page.
-- It links back to one raw article and adds Arc voice content on top.

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  arc_headline text not null,
  arc_summary text not null,
  arc_storyline jsonb not null default '[]'::jsonb,
  category text not null default 'today',
  is_live boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id)
);

create index stories_published_at_idx on public.stories (published_at desc nulls last);
create index stories_category_idx on public.stories (category);
create index stories_is_live_idx on public.stories (is_live);

alter table public.stories enable row level security;

create policy "Anyone can read live stories"
  on public.stories for select
  to anon, authenticated
  using (is_live = true);