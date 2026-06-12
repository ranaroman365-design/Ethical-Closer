import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Lock, Eye, AlertTriangle } from 'lucide-react';

interface BlockerResult {
  blocked: boolean;
  reason?: string;
  blockers?: string[];
}

export default function PromotionBlockers() {
  const { profile } = useAuth();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const [data, setData] = useState<BlockerResult | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .rpc('get_promotion_blockers', { p_user_id: profile.id })
      .then(({ data: d }) => {
        if (d) setData(d as unknown as BlockerResult);
      });
  }, [profile?.id]);

  if (!data || !data.blocked) return null;

  const reason = data.reason || '';
  const blockers = data.blockers || [];

  // Invitation-only
  if (reason.includes('invitation-only')) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
        <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          {tl('Dieser Level ist auf Einladung beschränkt.', 'This level is invitation-only.')}
        </p>
      </div>
    );
  }

  // Manual review
  if (reason.includes('manual review') || reason.includes('manual admin review')) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
        <Eye className="h-5 w-5 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          {tl('Dieser Level erfordert manuelle Freigabe.', 'This level requires manual approval.')}
        </p>
      </div>
    );
  }

  // Blockers list
  if (blockers.length > 0) {
    return (
      <div className="mt-4 rounded-xl border border-border/40 bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">
          {tl('Was noch fehlt', 'What\'s still missing')}
        </p>
        <div className="space-y-2">
          {blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{b}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
