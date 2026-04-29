-- RSS feeds + articles. Run in Supabase SQL Editor or via CLI.

create table public.feeds (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  source_name text not null,
  category text not null default 'today',
  title text,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.feeds (id) on delete cascade,
  item_guid text not null,
  link text not null unique,
  title text not null,
  summary text,
  image_url text,
  author text,
  category text not null default 'today',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (feed_id, item_guid)
);

create index articles_published_at_idx on public.articles (published_at desc nulls last);
create index articles_category_idx on public.articles (category);
create index articles_feed_id_idx on public.articles (feed_id);
create index feeds_category_idx on public.feeds (category);

alter table public.feeds enable row level security;
alter table public.articles enable row level security;

create policy "Anyone can read feeds"
  on public.feeds for select
  to anon, authenticated
  using (true);

create policy "Anyone can read articles"
  on public.articles for select
  to anon, authenticated
  using (true);
