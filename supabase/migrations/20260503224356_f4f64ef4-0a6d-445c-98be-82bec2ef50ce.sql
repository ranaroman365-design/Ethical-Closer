CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE black_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_user_id UUID REFERENCES auth.users(id),
  invited_email TEXT,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);
ALTER TABLE black_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_own_read" ON black_invitations
  FOR SELECT USING (auth.uid() = invited_user_id OR auth.uid() = invited_by);