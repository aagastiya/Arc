-- Entity identity layer: separate who someone IS from what they did this week.
-- Identity fields are anchored to Wikidata where possible and ranked by how
-- trustworthy their origin is, so a model guess can never overwrite a fact.

alter table public.entities
  add column if not exists wikidata_id text,
  add column if not exists description_source text not null default 'model',
  add column if not exists identity_verified_at timestamptz,
  add column if not exists role_title text not null default '',
  add column if not exists identity_candidates jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entities_description_source_check'
  ) then
    alter table public.entities
      add constraint entities_description_source_check
      check (description_source in ('wikidata', 'human', 'news', 'source_text', 'model'));
  end if;
end $$;

create index if not exists entities_wikidata_id_idx
  on public.entities (wikidata_id)
  where wikidata_id is not null;

create index if not exists entities_description_source_idx
  on public.entities (description_source);

comment on column public.entities.wikidata_id is
  'Wikidata QID this entity is anchored to, e.g. Q317521. Null when unmatched.';

comment on column public.entities.description_source is
  'Where short_description and role_title came from. Precedence, highest first: human, wikidata, news, source_text, model. A lower source may never overwrite a higher one.';

comment on column public.entities.identity_verified_at is
  'When identity was last confirmed against Wikidata or by an editor.';

comment on column public.entities.role_title is
  'Current position or role, e.g. "President of the United States". Identity, not activity.';

comment on column public.entities.identity_candidates is
  'Wikidata candidates left when a lookup was ambiguous, for an editor to resolve. Empty once resolved.';
