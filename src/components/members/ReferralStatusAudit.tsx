import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, ChevronDown, ChevronRight, Clock, History,
  RefreshCw, Search, Filter, AlertCircle,
} from 'lucide-react';

type Status = 'invited' | 'signed' | 'closed' | 'paid' | 'rejected' | string;

interface AuditRow {
  id: string;
  referrer_id: string | null;
  referrer_name: string | null;
  referrer_email: string | null;
  referred_email: string;
  referred_user_id: string | null;
  status: Status;
  referral_index: number | null;
  payout_amount: number | null;
  source_channel: string | null;
  reward_granted: boolean | null;
  created_at: string;
  accepted_at: string | null;
  reward_granted_at: string | null;
  transition_count: number;
  last_changed_at: string | null;
}

interface HistoryRow {
  id: string;
  referral_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  source: string;
  note: string | null;
  created_at: string;
}

const STATUS_ORDER: Status[] = ['invited', 'signed', 'closed', 'paid', 'rejected'];

const STATUS_STYLE: Record<string, string> = {
  invited:  'bg-muted text-muted-foreground border-border',
  signed:   'bg-accent/15 text-accent border-accent/30',
  closed:   'bg-primary/15 text-primary border-primary/30',
  paid:     'bg-primary/25 text-primary border-primary/40',
  rejected: 'bg-destructive/10 text-destructive border-destructive/30',
};

const fmtEur = (n: number | null) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

const fmtDateTime = (s: string | null) =>
  s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function ReferralStatusAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [edgeOnly, setEdgeOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('view_referral_audit' as any)
      .select('*')
      .order('last_changed_at', { ascending: false, nullsFirst: false });
    if (!error && data) setRows(data as unknown as AuditRow[]);
    setLoading(false);
  }

  async function loadHistory(referralId: string) {
    if (history[referralId]) return;
    const { data } = await supabase
      .from('referral_status_history' as any)
      .select('*')
      .eq('referral_id', referralId)
      .order('created_at', { ascending: true });
    if (data) setHistory((h) => ({ ...h, [referralId]: data as unknown as HistoryRow[] }));
  }

  function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      loadHistory(id);
    }
  }

  // Edge-case detection
  function detectEdgeCases(r: AuditRow): string[] {
    const issues: string[] = [];
    const now = Date.now();

    // 1. Stuck in invited > 14 days
    if (r.status === 'invited' && now - new Date(r.created_at).getTime() > 14 * 86_400_000) {
      issues.push('Invited > 14 days');
    }
    // 2. Closed but reward not granted
    if (r.status === 'closed' && !r.reward_granted) {
      issues.push('Closed without reward');
    }
    // 3. Paid but no reward_granted_at
    if (r.status === 'paid' && !r.reward_granted_at) {
      issues.push('Paid without grant date');
    }
    // 4. Signed but no referred_user_id linked
    if ((r.status === 'signed' || r.status === 'closed') && !r.referred_user_id) {
      issues.push('No linked user');
    }
    // 5. Closed but accepted_at missing
    if ((r.status === 'closed' || r.status === 'paid') && !r.accepted_at) {
      issues.push('Missing accepted_at');
    }
    // 6. Excessive churn (more than 4 transitions)
    if (r.transition_count > 4) {
      issues.push(`${r.transition_count} transitions`);
    }
    // 7. Payout mismatch (0 for non-rejected)
    if (r.status !== 'rejected' && (!r.payout_amount || r.payout_amount === 0)) {
      issues.push('Payout = 0');
    }
    return issues;
  }

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, _issues: detectEdgeCases(r) })),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (edgeOnly && r._issues.length === 0) return false;
      if (!q) return true;
      return (
        r.referred_email?.toLowerCase().includes(q) ||
        r.referrer_email?.toLowerCase().includes(q) ||
        r.referrer_name?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [enriched, search, statusFilter, edgeOnly]);

  // KPI strip
  const kpis = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_ORDER.forEach((s) => (counts[s] = 0));
    let edgeCount = 0;
    enriched.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r._issues.length > 0) edgeCount++;
    });
    return { counts, edgeCount, total: enriched.length };
  }, [enriched]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Lade Audit-Daten…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Referral Status Audit</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Vollständige Transitionshistorie & automatische Edge-Case-Erkennung.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="text-xs">
          <RefreshCw className="mr-1.5 h-3 w-3" /> Aktualisieren
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <KpiCard label="Gesamt" value={kpis.total} />
        {STATUS_ORDER.map((s) => (
          <KpiCard
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            value={kpis.counts[s] || 0}
            tone={s === 'closed' || s === 'paid' ? 'primary' : s === 'rejected' ? 'destructive' : 'default'}
          />
        ))}
      </div>

      {/* Edge case banner */}
      {kpis.edgeCount > 0 && (
        <button
          onClick={() => setEdgeOnly((v) => !v)}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
            edgeOnly
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-warning/30 bg-warning/5 hover:bg-warning/10'
          }`}
        >
          <AlertTriangle className={`h-4 w-4 shrink-0 ${edgeOnly ? 'text-destructive' : 'text-warning'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">
              {kpis.edgeCount} Referrals mit erkannten Edge-Cases
            </p>
            <p className="text-[11px] text-muted-foreground">
              {edgeOnly ? 'Klicke um alle anzuzeigen' : 'Klicke um nur Edge-Cases zu filtern'}
            </p>
          </div>
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Suche: Email, Name, Referral-ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-card p-0.5">
          <Filter className="ml-1.5 h-3 w-3 text-muted-foreground" />
          {(['all', ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s as Status | 'all')}
              className={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                statusFilter === s
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/40 py-10 text-center text-sm text-muted-foreground">
            Keine Referrals für die aktuellen Filter.
          </p>
        )}

        {filtered.map((r) => {
          const isOpen = expanded === r.id;
          const issues = r._issues;
          return (
            <div
              key={r.id}
              className={`rounded-xl border bg-card transition-colors ${
                issues.length > 0 ? 'border-warning/30' : 'border-border/40'
              }`}
            >
              <button
                onClick={() => toggleExpand(r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-xl"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}

                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground tabular-nums">
                  #{r.referral_index ?? '?'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-foreground truncate">{r.referred_email}</p>
                    {issues.length > 0 && (
                      <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-[9px] h-4 px-1.5">
                        <AlertCircle className="mr-0.5 h-2.5 w-2.5" />
                        {issues.length}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    von {r.referrer_name || r.referrer_email || r.referrer_id?.slice(0, 8)}
                    {' · '}
                    <Clock className="inline h-2.5 w-2.5 -mt-0.5" /> {fmtDateTime(r.last_changed_at)}
                    {r.transition_count > 1 && (
                      <span> · {r.transition_count} transitions</span>
                    )}
                    {r.source_channel && <span> · {r.source_channel}</span>}
                  </p>
                </div>

                <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${STATUS_STYLE[r.status] ?? STATUS_STYLE.invited}`}>
                  {r.status}
                </Badge>

                <span className="shrink-0 text-xs font-semibold text-foreground tabular-nums w-16 text-right">
                  {fmtEur(r.payout_amount)}
                </span>
              </button>

              {/* Expanded panel */}
              {isOpen && (
                <div className="border-t border-border/40 bg-muted/20 p-4 space-y-4 animate-fade-in">
                  {/* Edge cases */}
                  {issues.length > 0 && (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-warning mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" /> Edge Cases
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {issues.map((iss) => (
                          <span key={iss} className="rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                            {iss}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] md:grid-cols-4">
                    <Meta label="Referral ID" value={r.id.slice(0, 8) + '…'} mono />
                    <Meta label="Index" value={`#${r.referral_index ?? '—'}`} />
                    <Meta label="Channel" value={r.source_channel ?? 'direct'} />
                    <Meta label="Reward granted" value={r.reward_granted ? 'Ja' : 'Nein'} tone={r.reward_granted ? 'primary' : undefined} />
                    <Meta label="Created" value={fmtDateTime(r.created_at)} />
                    <Meta label="Accepted" value={fmtDateTime(r.accepted_at)} />
                    <Meta label="Reward granted at" value={fmtDateTime(r.reward_granted_at)} />
                    <Meta label="Linked user" value={r.referred_user_id ? r.referred_user_id.slice(0, 8) + '…' : '—'} mono />
                  </div>

                  {/* Status timeline */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
                      <History className="h-3 w-3" /> Status-Verlauf
                    </p>
                    <div className="space-y-1.5">
                      {(history[r.id] ?? []).map((h, i) => (
                        <div key={h.id} className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-background/60 px-3 py-1.5">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary tabular-nums">
                            {i + 1}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {h.old_status ? (
                              <>
                                <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${STATUS_STYLE[h.old_status] ?? STATUS_STYLE.invited}`}>
                                  {h.old_status}
                                </Badge>
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">created</span>
                            )}
                            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${STATUS_STYLE[h.new_status] ?? STATUS_STYLE.invited}`}>
                              {h.new_status}
                            </Badge>
                          </div>
                          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5">{h.source}</span>
                            <Clock className="h-2.5 w-2.5" />
                            {fmtDateTime(h.created_at)}
                          </div>
                        </div>
                      ))}
                      {(!history[r.id] || history[r.id].length === 0) && (
                        <p className="text-[11px] text-muted-foreground italic px-2">Keine History-Einträge.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: 'primary' | 'destructive' | 'default' }) {
  const valueColor =
    tone === 'primary' ? 'text-primary' :
    tone === 'destructive' ? 'text-destructive' :
    'text-foreground';
  return (
    <div className="rounded-xl border border-border/40 bg-card p-3">
      <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

function Meta({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'primary' }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-[11px] ${mono ? 'font-mono' : ''} ${tone === 'primary' ? 'text-primary font-semibold' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
