-- Edition composing: editorial weight per story, and a way to hold a story
-- on the Today page for one more edition day (additive).

alter table public.stories
  add column if not exists importance smallint not null default 3;

alter table public.stories
  drop constraint if exists stories_importance_range;

alter table public.stories
  add constraint stories_importance_range check (importance between 1 and 5);

comment on column public.stories.importance is
  'Editorial weight 1-5 (5 = major significance). Seeded from the editor-scan cluster score, editable in /admin/edition. Orders the Today feed below section heroes.';

alter table public.stories
  add column if not exists carried_over_at timestamptz;

comment on column public.stories.carried_over_at is
  'Set when an editor keeps an older story in today''s edition. The Today query treats a story as part of today when published_at OR carried_over_at falls on the current edition day.';

create index if not exists stories_carried_over_at_idx
  on public.stories (carried_over_at desc);

create index if not exists stories_importance_idx
  on public.stories (importance desc);

-- The Today page previously showed every live story regardless of age. Carry
-- the current front page over so introducing the day window empties nothing.
update public.stories
  set carried_over_at = now()
  where is_live = true
    and carried_over_at is null;
