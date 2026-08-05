-- Store the generate-time verification pass on each story (additive).
-- Written by /api/arc/generate via the service-role key; read in /admin only.

alter table public.stories
  add column if not exists verification jsonb;

comment on column public.stories.verification is
  'Result of the verification pass: { claims_checked: int, flags: [{ claim, reason, note }] }. Null until a story is generated with verification enabled.';
