-- Soft-archive for drafts that leave the admin desk without being deleted.
-- Archived stories are hidden from Genre Review, scan done-matching, and
-- edition lists. Readers already only see is_live rows, so this is admin-only.

alter table public.stories
  add column if not exists archived_at timestamptz;

create index if not exists stories_archived_at_idx
  on public.stories (archived_at)
  where archived_at is null;

-- One-off hygiene: archive open drafts whose newest linked source article is
-- older than 14 days. Carry-over of fresher drafts is left for editors.
with newest as (
  select
    s.id,
    greatest(
      coalesce(
        (
          select max(a.published_at)
          from public.story_articles sa
          join public.articles a on a.id = sa.article_id
          where sa.story_id = s.id
        ),
        '-infinity'::timestamptz
      ),
      coalesce(
        (
          select a.published_at
          from public.articles a
          where a.id = s.article_id
        ),
        '-infinity'::timestamptz
      )
    ) as newest_source
  from public.stories s
  where s.is_live = false
    and s.archived_at is null
)
update public.stories s
set
  archived_at = now(),
  updated_at = now()
from newest n
where s.id = n.id
  and n.newest_source > '-infinity'::timestamptz
  and n.newest_source < now() - interval '14 days';

notify pgrst, 'reload schema';
