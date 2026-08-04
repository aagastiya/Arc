-- story_articles: many-to-many link between curated stories and source articles.
-- stories.article_id remains the primary/original article for now; this table
-- allows additional sources without changing the stories schema.

create table public.story_articles (
  story_id uuid not null references public.stories (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, article_id)
);

create index story_articles_article_id_idx on public.story_articles (article_id);

alter table public.story_articles enable row level security;

create policy "Anyone can read links for live stories"
  on public.story_articles for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = story_id
        and s.is_live = true
    )
  );

-- Backfill from existing single-article stories.
insert into public.story_articles (story_id, article_id)
select id, article_id
from public.stories
on conflict do nothing;
