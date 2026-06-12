import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Coins, Search, Plus, Minus } from 'lucide-react';

interface UserCredit {
  id: string;
  email: string | null;
  full_name: string | null;
  balance: number;
  plan: string;
  sub_status: string;
}

export default function AdminCreditsPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustingUser, setAdjustingUser] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .order('created_at');

    if (!profiles) { setLoading(false); return; }

    const userIds = profiles.map(p => p.id);
    const [creditsRes, subsRes] = await Promise.all([
      supabase.from('user_credits' as any).select('user_id, balance').in('user_id', userIds),
      supabase.from('user_subscriptions' as any).select('user_id, plan, status').in('user_id', userIds),
    ]);

    const creditsMap = new Map((creditsRes.data as any[] || []).map((c: any) => [c.user_id, c.balance]));
    const subsMap = new Map((subsRes.data as any[] || []).map((s: any) => [s.user_id, { plan: s.plan, status: s.status }]));

    setUsers(profiles.map(p => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      balance: creditsMap.get(p.id) ?? 0,
      plan: subsMap.get(p.id)?.plan ?? 'none',
      sub_status: subsMap.get(p.id)?.status ?? 'inactive',
    })));
    setLoading(false);
  }

  async function adjustCredits(userId: string, amount: number) {
    if (amount === 0) return;

    // Upsert user_credits
    const { data: existing } = await supabase
      .from('user_credits' as any)
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();

    const currentBalance = (existing as any)?.balance ?? 0;
    const newBalance = Math.max(0, currentBalance + amount);

    if (existing) {
      await supabase.from('user_credits' as any).update({ balance: newBalance, updated_at: new Date().toISOString() } as any).eq('user_id', userId);
    } else {
      await supabase.from('user_credits' as any).insert({ user_id: userId, balance: newBalance } as any);
    }

    // Log transaction
    await supabase.from('credit_transactions' as any).insert({
      user_id: userId,
      type: 'admin_adjustment',
      amount,
      description: `Admin adjustment: ${amount > 0 ? '+' : ''}${amount} credits`,
    } as any);

    setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: newBalance } : u));
    setAdjustingUser(null);
    setAdjustAmount('');
    toast({ title: 'Credits angepasst', description: `Neuer Stand: ${newBalance}` });
  }

  async function toggleSubscription(userId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { data: existing } = await supabase
      .from('user_subscriptions' as any)
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('user_subscriptions' as any).update({
        status: newStatus,
        plan: newStatus === 'active' ? 'advanced' : 'none',
      } as any).eq('user_id', userId);
    } else {
      await supabase.from('user_subscriptions' as any).insert({
        user_id: userId,
        plan: 'advanced',
        status: newStatus,
      } as any);
    }

    setUsers(prev => prev.map(u => u.id === userId ? {
      ...u,
      sub_status: newStatus,
      plan: newStatus === 'active' ? 'advanced' : 'none',
    } : u));
    toast({ title: newStatus === 'active' ? 'Subscription aktiviert' : 'Subscription deaktiviert' });
  }

  const filtered = search
    ? users.filter(u =>
        (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="User suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs"
        />
      </div>

      <div className="space-y-2">
        {filtered.map(u => (
          <div key={u.id} className="rounded-xl border border-border/40 bg-card p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground truncate">{u.full_name || 'Kein Name'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  <Coins className="mr-1 h-3 w-3" /> {u.balance}
                </Badge>
                {u.sub_status === 'active' && (
                  <Badge className="text-[9px] bg-primary/15 text-primary border-0">Unlimited</Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Quick adjust */}
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => adjustCredits(u.id, 5)}>
                <Plus className="mr-0.5 h-3 w-3" />5
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => adjustCredits(u.id, 15)}>
                <Plus className="mr-0.5 h-3 w-3" />15
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => adjustCredits(u.id, 50)}>
                <Plus className="mr-0.5 h-3 w-3" />50
              </Button>

              {/* Custom adjust */}
              {adjustingUser === u.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    className="h-7 w-20 text-[11px]"
                    placeholder="±"
                  />
                  <Button size="sm" className="h-7 text-[10px]" onClick={() => adjustCredits(u.id, parseInt(adjustAmount) || 0)}>
                    OK
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setAdjustingUser(u.id)}>
                  Manuell
                </Button>
              )}

              {/* Subscription toggle */}
              <div className="flex items-center gap-1.5 ml-auto">
                <Switch
                  checked={u.sub_status === 'active'}
                  onCheckedChange={() => toggleSubscription(u.id, u.sub_status)}
                />
                <span className="text-[10px] text-muted-foreground">Abo</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
