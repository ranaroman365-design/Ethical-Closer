import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Gift, UserPlus, XCircle } from 'lucide-react';

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_email: string;
  referred_user_id: string | null;
  status: string;
  reward_granted: boolean;
  created_at: string;
  accepted_at: string | null;
  reward_granted_at: string | null;
}

interface ProfileMinimal {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function ReferralsAdmin() {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMinimal>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: refData }, { data: profData }] = await Promise.all([
      supabase.from('referrals' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email'),
    ]);
    setReferrals((refData as unknown as ReferralRow[]) ?? []);
    const map: Record<string, ProfileMinimal> = {};
    ((profData as ProfileMinimal[]) ?? []).forEach(p => { map[p.id] = p; });
    setProfiles(map);
    setLoading(false);
  }

  async function acceptReferral(ref: ReferralRow) {
    // Update referral status
    await (supabase.from('referrals' as any) as any)
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', ref.id);

    toast({ title: 'Referral akzeptiert' });
    load();
  }

  async function rejectReferral(id: string) {
    await (supabase.from('referrals' as any) as any)
      .update({ status: 'rejected' })
      .eq('id', id);
    toast({ title: 'Referral abgelehnt' });
    load();
  }

  async function grantReward(ref: ReferralRow) {
    // Calculate tier based on existing accepted referrals
    const { count } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', ref.referrer_id)
      .eq('status', 'accepted');

    const acceptedCount = count || 0;
    let rewardAmount = 150;
    let tier = 1;
    if (acceptedCount >= 5) { rewardAmount = 250; tier = 3; }
    else if (acceptedCount >= 3) { rewardAmount = 200; tier = 2; }

    const { data: benefit } = await (supabase.from('benefits' as any) as any)
      .insert({
        title: `Amazon Voucher (${rewardAmount}€) – Referral Reward`,
        description: `Referral-Belohnung (Tier ${tier}) für die Einladung von ${ref.referred_email}`,
        icon: 'Gift',
        unlock_type: 'milestone_based',
        unlock_value: `referral_${ref.id}`,
        reward_type: 'voucher',
        is_new: true,
        active: true,
      })
      .select()
      .single();

    if (benefit) {
      await (supabase.from('user_benefits' as any) as any).insert({
        user_id: ref.referrer_id,
        benefit_id: (benefit as any).id,
      });

      await (supabase.from('referrals' as any) as any)
        .update({
          reward_granted: true,
          reward_granted_at: new Date().toISOString(),
          reward_benefit_id: (benefit as any).id,
          tier,
          reward_amount: rewardAmount,
        })
        .eq('id', ref.id);

      toast({ title: 'Reward gewährt!', description: `${rewardAmount}€ Amazon Voucher (Tier ${tier}) wurde freigeschaltet.` });
    }
    load();
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Lade Referrals…</p>;

  const pending = referrals.filter(r => r.status === 'pending' || r.status === 'applied');
  const processed = referrals.filter(r => r.status === 'accepted' || r.status === 'rejected');

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Gesamt', value: referrals.length },
          { label: 'Akzeptiert', value: referrals.filter(r => r.status === 'accepted').length },
          { label: 'Rewards vergeben', value: referrals.filter(r => r.reward_granted).length },
          { label: 'Gesamtwert', value: `${referrals.filter(r => r.reward_granted).length * 100}€` },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/40 bg-card p-3 text-center">
            <p className="text-lg font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Offene Referrals</h3>
          <div className="space-y-2">
            {pending.map(r => {
              const referrer = profiles[r.referrer_id];
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-accent/20 bg-card p-4">
                  <UserPlus className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">{r.referred_email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Eingeladen von {referrer?.full_name || referrer?.email || r.referrer_id.slice(0, 8)}
                      {' · '}{new Date(r.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="text-[10px] h-7 text-primary border-primary/30" onClick={() => acceptReferral(r)}>
                    <CheckCircle2 className="mr-1 h-3 w-3" />Akzeptieren
                  </Button>
                  <Button size="sm" variant="outline" className="text-[10px] h-7 text-destructive border-destructive/30" onClick={() => rejectReferral(r.id)}>
                    <XCircle className="mr-1 h-3 w-3" />Ablehnen
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Processed */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Verarbeitete Referrals</h3>
        <div className="space-y-2">
          {processed.map(r => {
            const referrer = profiles[r.referrer_id];
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{r.referred_email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Von {referrer?.full_name || referrer?.email || '—'} · {new Date(r.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${r.status === 'accepted' ? 'text-primary border-primary/30' : 'text-destructive border-destructive/30'}`}>
                  {r.status === 'accepted' ? 'Akzeptiert' : 'Abgelehnt'}
                </Badge>
                {r.status === 'accepted' && !r.reward_granted && (
                  <Button size="sm" variant="outline" className="text-[10px] h-7 border-accent/30 text-accent" onClick={() => grantReward(r)}>
                    <Gift className="mr-1 h-3 w-3" />Reward vergeben
                  </Button>
                )}
                {r.reward_granted && (
                  <Badge className="bg-primary/15 text-primary border-0 text-[9px]">
                    <Gift className="mr-0.5 h-2.5 w-2.5" />Vergeben
                  </Badge>
                )}
              </div>
            );
          })}
          {processed.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Noch keine verarbeiteten Referrals.</p>}
        </div>
      </div>
    </div>
  );
}
