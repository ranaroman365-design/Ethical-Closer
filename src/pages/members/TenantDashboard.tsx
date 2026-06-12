import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2, Users, Target, DollarSign, TrendingUp, BarChart3,
  CheckCircle2, XCircle, ArrowRight, Shield, Zap, Clock, Globe,
  Palette, Settings, AlertTriangle, Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

type Tenant = Record<string, any>;
type Lead = Record<string, any>;
type Profile = Record<string, any>;

const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

export default function TenantDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [confirmedCalls, setConfirmedCalls] = useState<{ id: string; closer_id: string; revenue: number; result: string }[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [memberKpis, setMemberKpis] = useState<Record<string, any>[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadTenantData();
  }, [user?.id]);

  const loadTenantData = async () => {
    setLoading(true);

    // 1. Check if user is platform admin (sees all tenants) or tenant member
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user!.id);

    const userIsAdmin = (roles ?? []).some(r => ['admin', 'owner'].includes(r.role));
    setIsAdmin(userIsAdmin);

    // 2. Find user's tenant
    let tenantId: string | null = null;

    if (userIsAdmin) {
      // Admin sees first tenant (or all — simplified for MVP)
      const { data: tenants } = await supabase.from('tenants').select('*').limit(1).single();
      if (tenants) {
        setTenant(tenants);
        tenantId = tenants.id;
      }
    } else {
      const { data: membership } = await supabase
        .from('tenant_memberships')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .eq('membership_status', 'active')
        .limit(1)
        .maybeSingle();

      if (membership?.tenant_id) {
        tenantId = membership.tenant_id;
        const { data: t } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
        setTenant(t);
      }
    }

    if (!tenantId) {
      setLoading(false);
      return;
    }

    // 3. Load tenant members
    const { data: memberships } = await supabase
      .from('tenant_memberships')
      .select('user_id, role')
      .eq('tenant_id', tenantId)
      .eq('membership_status', 'active');

    const memberIds = (memberships ?? []).map(m => m.user_id);

    if (memberIds.length > 0) {
      const [profileRes, kpiRes, leadRes, callsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, business_stage, avatar_url').in('id', memberIds),
        supabase.from('member_kpis').select('*').in('user_id', memberIds),
        supabase.from('leads').select('id, stage, setter_id, closer_id, deal_value, lead_quality, created_at, lead_score')
          .or(memberIds.map(id => `setter_id.eq.${id},closer_id.eq.${id}`).join(',')),
        supabase.from('calls' as never).select('id, closer_id, revenue, result').eq('result', 'closed_won'),
      ]);

      setMembers(profileRes.data ?? []);
      setMemberKpis(kpiRes.data ?? []);
      setLeads(leadRes.data ?? []);
      setConfirmedCalls((callsRes.data ?? []) as any);
    }

    setLoading(false);
  };

  /* ── Derived Stats ── */
  const stats = useMemo(() => {
    const total = leads.length;
    const booked = leads.filter(l => !['in_pool', 'new'].includes(l.stage)).length;
    const qualified = leads.filter(l => ['setter_qualified', 'ready_for_closer', 'assigned_closer', 'closer_in_progress', 'offer_made', 'closed_won'].includes(l.stage)).length;
    const won = leads.filter(l => l.stage === 'closed_won').length;
    const lost = leads.filter(l => l.stage === 'closed_lost').length;
    // Confirmed Revenue from calls table (source of truth), NOT leads.deal_value
    const revenue = confirmedCalls.reduce((s, c) => s + (Number(c.revenue) || 0), 0);
    const pipelineValue = leads.filter(l => l.stage === 'closed_won').reduce((s, l) => s + (l.deal_value || 0), 0);
    const avgDeal = won > 0 ? Math.round(revenue / won) : 0;
    const closeRate = pct(won, won + lost);
    const qualRate = pct(qualified, total);

    return { total, booked, qualified, won, lost, revenue, avgDeal, closeRate, qualRate };
  }, [leads, confirmedCalls]);

  const SETTER_STAGES = ['setter', 'associate_setter', 'senior_associate', 'senior_setter'];
  const CLOSER_STAGES = ['junior_manager', 'manager', 'senior_manager', 'director'];

  const setterPerf = useMemo(() => {
    return members
      .filter(m => SETTER_STAGES.includes(m.business_stage))
      .map(m => {
        const kpi = memberKpis.find(k => k.user_id === m.id);
        const assigned = leads.filter(l => l.setter_id === m.id).length;
        const qual = leads.filter(l => l.setter_id === m.id && ['setter_qualified', 'ready_for_closer', 'assigned_closer'].includes(l.stage)).length;
        return { id: m.id as string, full_name: (m.full_name || '–') as string, qualRate: pct(qual, assigned), assigned, showRate: kpi?.show_rate ?? 0 };
      })
      .sort((a, b) => b.qualRate - a.qualRate);
  }, [members, memberKpis, leads]);

  const closerPerf = useMemo(() => {
    return members
      .filter(m => CLOSER_STAGES.includes(m.business_stage))
      .map(m => {
        const kpi = memberKpis.find(k => k.user_id === m.id);
        const won = leads.filter(l => l.closer_id === m.id && l.stage === 'closed_won').length;
        const lost = leads.filter(l => l.closer_id === m.id && l.stage === 'closed_lost').length;
        const rev = confirmedCalls.filter(c => c.closer_id === m.id).reduce((s, c) => s + (Number(c.revenue) || 0), 0);
        return { id: m.id as string, full_name: (m.full_name || '–') as string, won, lost, closeRate: pct(won, won + lost), revenue: rev };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [members, memberKpis, leads, confirmedCalls]);

  const config = tenant?.config as Record<string, any> | null;
  const branding = config?.branding as Record<string, any> | null;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Building2 className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground text-center">Kein Tenant zugewiesen.<br />Kontaktiere den Administrator.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt="" className="h-8 w-auto object-contain" />
            ) : (
              <Building2 className="h-6 w-6 text-primary" />
            )}
            <h1 className="font-serif text-xl font-semibold text-foreground">{tenant.name}</h1>
            <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
              {tenant.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            B2B Revenue Dashboard · {members.length} Mitglieder · {leads.length} Leads
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Link to="/members/white-label">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Branding
              </Button>
            </Link>
            <Link to="/members/admin/tenant-matrix">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Zugriff
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* License Status */}
      {tenant.license_status && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm',
          tenant.license_paid ? 'border-primary/30 bg-primary/5 text-primary' : 'border-destructive/30 bg-destructive/5 text-destructive'
        )}>
          {tenant.license_paid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>
            Lizenz: <span className="font-medium">{tenant.license_status}</span>
            {tenant.license_paid ? ' · Aktiv' : ' · Zahlung ausstehend'}
          </span>
        </div>
      )}

      {/* KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { icon: Target, label: 'Leads', value: stats.total },
          { icon: ArrowRight, label: 'Gebucht', value: stats.booked },
          { icon: Shield, label: 'Qualifiziert', value: stats.qualified },
          { icon: CheckCircle2, label: 'Won', value: stats.won, accent: true },
          { icon: XCircle, label: 'Lost', value: stats.lost },
          { icon: TrendingUp, label: 'Close %', value: `${stats.closeRate}%` },
          { icon: DollarSign, label: 'Revenue', value: stats.revenue >= 1000 ? `€${(stats.revenue / 1000).toFixed(1)}k` : `€${stats.revenue}`, accent: true },
          { icon: BarChart3, label: 'Ø Deal', value: `€${stats.avgDeal}` },
        ].map((m, i) => (
          <div key={i} className={cn(
            'rounded-xl border border-border p-3 bg-card',
            (m as any).accent && 'border-primary/30 bg-primary/5'
          )}>
            <div className="flex items-center gap-1.5 mb-1">
              <m.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{m.label}</span>
            </div>
            <p className={cn('text-lg font-bold', (m as any).accent ? 'text-primary' : 'text-foreground')}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pipeline</h3>
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { label: 'Leads', value: stats.total },
            { label: 'Gebucht', value: stats.booked },
            { label: 'Qualifiziert', value: stats.qualified },
            { label: 'Won', value: stats.won },
          ].map((stage, i, arr) => (
            <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
              <div className="flex-1 text-center rounded-lg border border-border p-2 bg-muted/20">
                <p className="text-lg font-bold text-foreground">{stage.value}</p>
                <p className="text-[10px] text-muted-foreground">{stage.label}</p>
                {i > 0 && (
                  <p className="text-[9px] text-primary font-medium">
                    {pct(stage.value, arr[i - 1].value)}%
                  </p>
                )}
              </div>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Setter & Closer Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Setters */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Setter Performance</span>
            <Badge variant="outline" className="ml-auto text-[10px]">{setterPerf.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {setterPerf.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Keine Setter</p>
            ) : (
              setterPerf.map((s, i) => (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.full_name || '–'}</p>
                  </div>
                  <div className="text-center w-14">
                    <p className="text-sm font-semibold text-foreground">{s.qualRate}%</p>
                    <p className="text-[9px] text-muted-foreground">Qual.</p>
                  </div>
                  <div className="text-center w-12">
                    <p className="text-sm text-muted-foreground">{s.assigned}</p>
                    <p className="text-[9px] text-muted-foreground">Leads</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Closers */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Closer Performance</span>
            <Badge variant="outline" className="ml-auto text-[10px]">{closerPerf.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {closerPerf.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Keine Closer</p>
            ) : (
              closerPerf.map((c, i) => (
                <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.full_name || '–'}</p>
                  </div>
                  <div className="text-center w-14">
                    <p className="text-sm font-semibold text-foreground">{c.closeRate}%</p>
                    <p className="text-[9px] text-muted-foreground">Close</p>
                  </div>
                  <div className="text-center w-16">
                    <p className="text-sm font-semibold text-foreground">
                      {c.revenue >= 1000 ? `€${(c.revenue / 1000).toFixed(1)}k` : `€${c.revenue}`}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Rev.</p>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-[10px] gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5 text-primary" />{c.won}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] gap-0.5">
                      <XCircle className="h-2.5 w-2.5 text-destructive" />{c.lost}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tenant Info */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tenant-Details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-[11px]">Slug</p>
            <p className="font-medium text-foreground">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11px]">Typ</p>
            <p className="font-medium text-foreground">{tenant.tenant_type || 'Standard'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11px]">Product Key</p>
            <p className="font-medium text-foreground">{tenant.product_key || '–'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11px]">Erstellt</p>
            <p className="font-medium text-foreground">{new Date(tenant.created_at).toLocaleDateString('de-DE')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
