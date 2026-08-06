-- Separate "we have the full text" from "the last fetch didn't work", so a
-- publisher that times out once is retried later instead of written off.

alter table public.articles
  add column if not exists full_text_failed_at timestamptz;

comment on column public.articles.full_text_failed_at is
  'Time of the last unsuccessful full-text extraction (timeout, error, or too little text). Generation skips re-fetching within the cooldown window, then tries again. Cleared on success.';

comment on column public.articles.full_text_fetched_at is
  'Time full_text was successfully extracted. Only set on success, so its presence means the stored text is usable.';

-- Failures were previously stamped as fetches, which permanently pinned those
-- articles to their RSS summary. Move them so they become retryable.
update public.articles
  set full_text_failed_at = full_text_fetched_at,
      full_text_fetched_at = null
  where full_text_fetched_at is not null
    and (full_text is null or length(full_text) < 500);
