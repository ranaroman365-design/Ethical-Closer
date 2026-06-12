import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, Clock, XCircle, DollarSign } from 'lucide-react';

interface HandoverLead {
  id: string;
  name: string;
  stage: string;
  deal_value: number | null;
  appointment_date: string | null;
  updated_at: string;
}

const CLOSER_STAGE_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ready_for_closer: { label: 'Wartet auf Closer', icon: <Clock className="h-3 w-3" />, color: 'text-muted-foreground bg-muted/50' },
  assigned_closer: { label: 'Zugewiesen', icon: <ArrowRight className="h-3 w-3" />, color: 'text-blue-600 bg-blue-500/10' },
  closer_in_progress: { label: 'In Bearbeitung', icon: <Clock className="h-3 w-3" />, color: 'text-amber-600 bg-amber-500/10' },
  offer_made: { label: 'Angebot gemacht', icon: <DollarSign className="h-3 w-3" />, color: 'text-purple-600 bg-purple-500/10' },
  closed_won: { label: 'Closed Won', icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-primary bg-primary/10' },
  closed_lost: { label: 'Closed Lost', icon: <XCircle className="h-3 w-3" />, color: 'text-destructive bg-destructive/10' },
  recycle: { label: 'Recycle', icon: <Clock className="h-3 w-3" />, color: 'text-muted-foreground bg-muted/50' },
};

export default function HandoverTracker() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<HandoverLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('leads')
      .select('id, name, stage, deal_value, appointment_date, updated_at')
      .eq('setter_id', user.id)
      .in('stage', Object.keys(CLOSER_STAGE_MAP))
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setLeads((data as HandoverLead[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  if (loading || leads.length === 0) return null;

  const wonCount = leads.filter(l => l.stage === 'closed_won').length;
  const activeCount = leads.filter(l => !['closed_won', 'closed_lost', 'recycle'].includes(l.stage)).length;

  return (
    <div className="mb-6 rounded-xl border border-border/40 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pipeline Handover Tracker
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Status deiner übergebenen Leads bei Closern
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[9px]">{activeCount} aktiv</Badge>
          {wonCount > 0 && (
            <Badge className="bg-primary/10 text-primary border-0 text-[9px]">
              {wonCount} gewonnen
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {leads.map(lead => {
          const stageInfo = CLOSER_STAGE_MAP[lead.stage] || { label: lead.stage, icon: null, color: 'text-muted-foreground bg-muted/50' };
          return (
            <div key={lead.id} className="flex items-center gap-3 rounded-lg border border-border/30 bg-background p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-foreground truncate">{lead.name}</p>
                {lead.appointment_date && (
                  <p className="text-[9px] text-muted-foreground">
                    Termin: {new Date(lead.appointment_date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
                  </p>
                )}
              </div>
              {lead.deal_value != null && lead.deal_value > 0 && (
                <span className="text-[10px] font-medium text-foreground">{lead.deal_value} €</span>
              )}
              <span className={`flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-medium ${stageInfo.color}`}>
                {stageInfo.icon} {stageInfo.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
