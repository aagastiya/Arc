-- Add clip and cover image URL columns to stories table
-- These store URLs to files hosted in Supabase Storage

ALTER TABLE public.stories
  ADD COLUMN clip_url text,
  ADD COLUMN cover_image_url text;

COMMENT ON COLUMN public.stories.clip_url IS 'URL to the MP4 video clip hosted in Supabase Storage. Nullable — not every story has a clip.';
COMMENT ON COLUMN public.stories.cover_image_url IS 'URL to the still cover image hosted in Supabase Storage. Used as the thumbnail in the Today feed.';
