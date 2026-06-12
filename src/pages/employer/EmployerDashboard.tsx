import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, TrendingUp, UserCheck, MessageSquare } from 'lucide-react';

export default function EmployerDashboard() {
  const [stats, setStats] = useState({ certified: 0, visible: 0, contacts: 0 });

  useEffect(() => {
    async function load() {
      const [certRes, visRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('certified', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('certified', true).eq('employer_visibility_enabled', true),
      ]);
      setStats({
        certified: certRes.count ?? 0,
        visible: visRes.count ?? 0,
        contacts: 0,
      });
    }
    load();
  }, []);

  const cards = [
    { label: 'Certified Profiles', value: stats.certified, icon: UserCheck, color: 'text-emerald-500' },
    { label: 'Visible Candidates', value: stats.visible, icon: Users, color: 'text-primary' },
    { label: 'Top Performers', value: '—', icon: TrendingUp, color: 'text-amber-500' },
    { label: 'Contact Requests', value: stats.contacts, icon: MessageSquare, color: 'text-blue-500' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Verified Sales Talent</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review certified candidates based on real performance, not CV claims.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border border-border/40 bg-card p-5 space-y-2">
            <c.icon className={`h-5 w-5 ${c.color}`} />
            <p className="text-2xl font-bold text-foreground">{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
