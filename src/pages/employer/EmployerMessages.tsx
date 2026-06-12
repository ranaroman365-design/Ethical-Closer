import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEmployerAccess } from '@/hooks/useEmployerAccess';
import { Badge } from '@/components/ui/badge';

interface ContactEntry {
  id: string;
  candidate_user_id: string;
  message: string;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-500/10 text-blue-600',
  seen: 'bg-amber-500/10 text-amber-600',
  responded: 'bg-emerald-500/10 text-emerald-600',
  closed: 'bg-muted text-muted-foreground',
};

export default function EmployerMessages() {
  const { companyId } = useEmployerAccess();
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('employer_contacts')
      .select('id, candidate_user_id, message, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setContacts((data ?? []) as ContactEntry[]);
        setLoading(false);
      });
  }, [companyId]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-foreground">Contact Requests</h2>
        <p className="text-sm text-muted-foreground">{contacts.length} total messages</p>
      </div>

      {contacts.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No contact requests yet.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map(c => (
            <div key={c.id} className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('de-DE')}</p>
                <Badge className={`text-[10px] border-0 ${STATUS_COLORS[c.status] || STATUS_COLORS.sent}`}>{c.status}</Badge>
              </div>
              <p className="text-sm text-foreground">{c.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
