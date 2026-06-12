-- Add birthday and birthday_notify fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS birthday_notify boolean NOT NULL DEFAULT false;

-- Add file_url and attachment_type to community_messages for file/GIF support
ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text;