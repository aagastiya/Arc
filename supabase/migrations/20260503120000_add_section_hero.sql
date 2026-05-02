-- Section hero: at most one live story per raw category can be flagged for /today section layout.
alter table public.stories
  add column if not exists is_section_hero boolean not null default false;

create index if not exists stories_section_hero_category_idx
  on public.stories (category, is_section_hero)
  where is_section_hero = true;
