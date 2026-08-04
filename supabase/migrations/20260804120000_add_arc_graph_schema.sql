-- Arc graph schema: entities, events, and story link tables.
-- Additive only — does not alter stories, articles, or story_articles.
-- Public read is gated by approved flags on story_entities / story_events;
-- writes go through the service-role key (bypasses RLS), same as stories.

-- ── tables ──────────────────────────────────────────────────────────────────

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('person', 'organization')),
  name text not null,
  aliases text[] not null default '{}',
  short_description text not null default '',
  created_at timestamptz not null default now()
);

create unique index entities_kind_lower_name_uidx
  on public.entities (kind, lower(name));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  open_question text not null default '',
  status text not null default 'running'
    check (status in ('running', 'resolved', 'dormant')),
  created_at timestamptz not null default now()
);

create index events_status_idx on public.events (status);

create table public.event_relations (
  parent_event_id uuid not null references public.events (id) on delete cascade,
  child_event_id uuid not null references public.events (id) on delete cascade,
  primary key (parent_event_id, child_event_id),
  check (parent_event_id <> child_event_id)
);

create index event_relations_child_event_id_idx
  on public.event_relations (child_event_id);

create table public.story_entities (
  story_id uuid not null references public.stories (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  role text not null default 'mentioned'
    check (role in ('subject', 'mentioned')),
  approved boolean not null default false,
  primary key (story_id, entity_id)
);

create index story_entities_entity_id_idx on public.story_entities (entity_id);
create index story_entities_approved_idx on public.story_entities (approved)
  where approved = true;

create table public.story_events (
  story_id uuid not null references public.stories (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  approved boolean not null default false,
  primary key (story_id, event_id)
);

create index story_events_event_id_idx on public.story_events (event_id);
create index story_events_approved_idx on public.story_events (approved)
  where approved = true;

-- ── RLS (select-only for anon/authenticated; service role bypasses) ─────────

alter table public.entities enable row level security;
alter table public.events enable row level security;
alter table public.event_relations enable row level security;
alter table public.story_entities enable row level security;
alter table public.story_events enable row level security;

create policy "Anyone can read approved story entity links"
  on public.story_entities for select
  to anon, authenticated
  using (approved = true);

create policy "Anyone can read approved story event links"
  on public.story_events for select
  to anon, authenticated
  using (approved = true);

create policy "Anyone can read entities linked via an approved story"
  on public.entities for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.story_entities se
      where se.entity_id = id
        and se.approved = true
    )
  );

create policy "Anyone can read events linked via an approved story"
  on public.events for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.story_events se
      where se.event_id = id
        and se.approved = true
    )
  );

create policy "Anyone can read relations between approved-linked events"
  on public.event_relations for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.story_events se
      where se.event_id = parent_event_id
        and se.approved = true
    )
    and exists (
      select 1
      from public.story_events se
      where se.event_id = child_event_id
        and se.approved = true
    )
  );
