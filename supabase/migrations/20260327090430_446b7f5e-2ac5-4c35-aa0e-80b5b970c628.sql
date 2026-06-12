
ALTER TABLE public.direct_messages 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL;
