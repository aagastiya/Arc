-- Key points + full report JSON on stories.
-- arc_key_points: short sourced bullets for the reader; arc_report: structured long-form copy.
-- Both are optional editorial fields alongside arc_headline / arc_summary / arc_storyline.

alter table public.stories
  add column if not exists arc_key_points jsonb not null default '[]'::jsonb,
  add column if not exists arc_report jsonb default null;

comment on column public.stories.arc_key_points is
  'JSON array of { "text": string, "source": string } — typically 3 summary bullets with outlet attribution. Default empty array.';

comment on column public.stories.arc_report is
  'Structured full report { "lead": string, "sections": [ { "title": string, "body": string } ] }. Null until authored.';
