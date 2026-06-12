import { useMentorData } from '@/hooks/useMentorData';
import { Users, TrendingUp, Percent, Phone, Eye } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Bewerber', opener: 'Trainee', setter: 'Associate Setter',
  senior_associate: 'Senior Setter', junior_manager: 'Closer (Placement Track)',
  manager: 'Managing Closer', senior_manager: 'Senior Closer',
  director: 'Director', partner: 'Partner',
};

export default function MentorWidget() {
  const { mentees, loading, isMentor } = useMentorData();

  if (loading || !isMentor) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Deine Mentees ({mentees.length})
      </h3>

      {mentees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Mentees zugewiesen.</p>
      ) : (
        <div className="space-y-3">
          {mentees.map(m => {
            const cr = m.kpis?.closing_rate ?? 0;
            const sr = m.kpis?.show_rate ?? 0;
            const cpw = m.kpis?.calls_per_week ?? 0;
            return (
              <div key={m.id} className="rounded-lg border border-border/30 bg-background p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground truncate">{m.full_name || 'Anonym'}</p>
                    <p className="text-[10px] text-muted-foreground">{STAGE_LABELS[m.business_stage] || m.business_stage}</p>
                  </div>
                  {m.certified && (
                    <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">✓ Zertifiziert</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Percent className="h-2.5 w-2.5" />
                      <span className="text-[9px]">Close</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{cr}%</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Eye className="h-2.5 w-2.5" />
                      <span className="text-[9px]">Show</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{sr}%</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Phone className="h-2.5 w-2.5" />
                      <span className="text-[9px]">Calls/W</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{cpw}</p>
                  </div>
                </div>
                {m.kpis?.storno_rate != null && (m.kpis.storno_rate > 10) && (
                  <p className="mt-2 text-[10px] text-red-500 font-medium">⚠ Storno Rate: {m.kpis.storno_rate}%</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
