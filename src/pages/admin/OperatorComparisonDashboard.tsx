import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getLevelForStage } from "@/lib/kpi-config";
import { useTeamPerformance, type PerformanceScope, type TeamMember } from "@/hooks/useTeamPerformance";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, RefreshCw, Activity, Users, User, TrendingUp, TrendingDown, Phone, Eye, XCircle, DollarSign, Clock, MessageSquare, BarChart3, AlertTriangle } from "lucide-react";

/** Canonical role groups — no duplicate Operator/Senior Closer */
const ROLE_OPTIONS = [
  { value: "all", label: "Alle Rollen" },
  { value: "setter", label: "Setter (L1–L3)" },
  { value: "closer", label: "Closer (L4–L5)" },
  { value: "senior_closer", label: "Senior Closer (L6)" },
  { value: "director", label: "Director+ (L7+)" },
] as const;

export default function OperatorComparisonDashboard() {
  const { profile, isAdmin, isOwner } = useAuth();
  const stage = (profile as any)?.business_stage ?? "opener";
  const level = getLevelForStage(stage);
  const isAdminLike = isAdmin || isOwner;
  const effectiveLevel = isAdminLike ? 8 : level;

  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<PerformanceScope>(effectiveLevel >= 4 ? "team" : "my");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const passedMember = scope === "my" ? (profile as any)?.id ?? null : memberId;
  // Pass roleFilter to hook so it reaches the RPC and changes aggregation
  const { kpis, members, loading, error, refresh } = useTeamPerformance(
    days,
    passedMember,
    scope === "team" ? roleFilter : null,
  );

  // Filter displayed members by role (for the member list)
  const filteredMembers = useMemo(() => {
    if (roleFilter === "all") return members;
    const levelRange = roleFilter === "setter" ? [1,2,3]
      : roleFilter === "closer" ? [4,5]
      : roleFilter === "senior_closer" ? [6]
      : roleFilter === "director" ? [7,8] : [];
    if (levelRange.length === 0) return members;
    return members.filter(m => levelRange.includes(m.member_level));
  }, [members, roleFilter]);

  // Group members by canonical role for breakdown
  const roleGroups = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    members.forEach(m => {
      const key = m.member_role || "Unbekannt";
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    return groups;
  }, [members]);

  const ranges = [
    { v: 1, label: "24h" },
    { v: 7, label: "7 Tage" },
    { v: 30, label: "30 Tage" },
    { v: 90, label: "90 Tage" },
  ];

  const scopeLabel = (s: PerformanceScope) => s === "my" ? "Meine Performance" : effectiveLevel >= 8 ? "Plattform" : effectiveLevel >= 7 ? "Director Area" : "Team Performance";

  if (!profile || effectiveLevel < 1) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card className="p-8 text-center border-border/40">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-lg font-semibold text-foreground">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-2">Zugriff nicht möglich. Bitte melde dich an.</p>
        </Card>
      </div>
    );
  }

  const kpiCards: Array<{ label: string; value: string | number; icon: React.ElementType; color: string }> = [
    { label: "Total Leads", value: kpis.total_leads, icon: Users, color: "text-blue-500" },
    { label: "Booked Calls", value: kpis.booked_calls, icon: Phone, color: "text-indigo-500" },
    { label: "Booking Rate", value: `${kpis.booking_rate}%`, icon: TrendingUp, color: "text-indigo-500" },
    { label: "Shows", value: kpis.shows, icon: Eye, color: "text-emerald-500" },
    { label: "Show Rate", value: `${kpis.show_rate}%`, icon: TrendingUp, color: "text-emerald-500" },
    { label: "No Shows", value: kpis.no_shows, icon: XCircle, color: "text-red-500" },
    { label: "No Show Rate", value: `${kpis.no_show_rate}%`, icon: TrendingDown, color: "text-red-500" },
    { label: "Closed Deals", value: kpis.closed_deals, icon: DollarSign, color: "text-green-600" },
    { label: "Close Rate", value: `${kpis.close_rate}%`, icon: TrendingUp, color: "text-green-600" },
    { label: "Revenue", value: `€${kpis.revenue.toLocaleString("de-DE")}`, icon: DollarSign, color: "text-accent" },
    { label: "Revenue / Lead", value: `€${kpis.revenue_per_lead.toLocaleString("de-DE")}`, icon: BarChart3, color: "text-accent" },
    { label: "Revenue / Show", value: `€${kpis.revenue_per_show.toLocaleString("de-DE")}`, icon: BarChart3, color: "text-accent" },
    { label: "TTFC (Min)", value: kpis.ttfc_minutes, icon: Clock, color: "text-amber-500" },
    { label: "Response Rate", value: `${kpis.response_rate}%`, icon: MessageSquare, color: "text-blue-500" },
  ];

  const bottleneck = useMemo(() => {
    const thresholds = [
      { stage: "Booking Rate", rate: kpis.booking_rate, min: 30 },
      { stage: "Show Rate", rate: kpis.show_rate, min: 60 },
      { stage: "Close Rate", rate: kpis.close_rate, min: 20 },
      { stage: "Response Rate", rate: kpis.response_rate, min: 50 },
    ];
    const flags = thresholds.filter(t => t.rate < t.min && kpis.total_leads > 0);
    flags.sort((a, b) => (a.rate / a.min) - (b.rate / b.min));
    return flags;
  }, [kpis]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-2 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><Activity className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Performance Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {scope === "my" ? "Eigene Kennzahlen" : `Team-Übersicht · ${kpis.team_size} Mitglieder`}
              {roleFilter !== "all" && ` · ${ROLE_OPTIONS.find(r => r.value === roleFilter)?.label}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {effectiveLevel >= 4 && (
            <div className="flex rounded-lg border border-border/40 bg-card p-1">
              <Button size="sm" variant={scope === "my" ? "default" : "ghost"} onClick={() => { setScope("my"); setMemberId(null); }} className="h-7 text-xs px-3">
                <User className="h-3 w-3 mr-1" /> Meine
              </Button>
              <Button size="sm" variant={scope === "team" ? "default" : "ghost"} onClick={() => { setScope("team"); setMemberId(null); }} className="h-7 text-xs px-3">
                <Users className="h-3 w-3 mr-1" /> {scopeLabel("team")}
              </Button>
            </div>
          )}
          <div className="flex rounded-lg border border-border/40 bg-card p-1">
            {ranges.map(r => (
              <Button key={r.v} size="sm" variant={days === r.v ? "default" : "ghost"} onClick={() => setDays(r.v)} className="h-7 text-xs px-3">
                {r.label}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="h-7 px-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Filters for team scope */}
      {scope === "team" && members.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {/* Member filter — includes self */}
          <Select value={memberId ?? "all"} onValueChange={(v) => setMemberId(v === "all" ? null : v)}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue placeholder="Alle Teammitglieder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Teammitglieder</SelectItem>
              {filteredMembers.map(m => (
                <SelectItem key={m.member_id} value={m.member_id}>
                  {m.member_name} · {m.member_role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Role filter — canonical groups, no duplication */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Alle Rollen" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error === "forbidden" && (
        <Card className="p-6 text-center border-border/40">
          <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Team Performance ist ab Level 4 verfügbar.</p>
        </Card>
      )}

      {error && error !== "forbidden" && (
        <Card className="p-6 text-center border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-6 w-6 mx-auto text-destructive mb-2" />
          <p className="text-sm font-medium text-foreground">Performance-Daten konnten nicht geladen werden</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-3">
            <RefreshCw className="h-3 w-3 mr-1" /> Erneut versuchen
          </Button>
        </Card>
      )}

      {!loading && !error && kpis.total_leads === 0 && kpis.booked_calls === 0 && (
        <Card className="p-6 border-border/40 bg-muted/30">
          <div className="text-center space-y-2">
            <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Keine Daten für diesen Zeitraum gefunden.</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Zeitraum: {days === 1 ? "24h" : `${days} Tage`} · Scope: {scope === "my" ? "Eigene" : "Team"}</p>
              <p>User-Level: L{kpis.user_level} · Teammitglieder: {members.length}</p>
              {memberId && <p>Filter: {members.find(m => m.member_id === memberId)?.member_name ?? "Unbekannt"}</p>}
            </div>
          </div>
        </Card>
      )}

      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {kpiCards.map(card => (
            <Card key={card.label} className="p-3 border-border/30 hover:border-border/60 transition-colors">
              <div className="flex items-center gap-1.5 mb-1">
                <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{card.label}</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{loading ? "…" : card.value}</p>
            </Card>
          ))}
        </div>
      )}

      {!error && bottleneck.length > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/[0.05]">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Bottleneck-Diagnose</h3>
          </div>
          <div className="space-y-2">
            {bottleneck.map((b, i) => (
              <div key={b.stage} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-red-500/20 text-red-600" : "bg-amber-500/20 text-amber-600"}`}>
                    {i + 1}
                  </span>
                  <span className="text-foreground font-medium">{b.stage}</span>
                </div>
                <div className="text-right">
                  <span className="text-red-500 font-mono">{b.rate}%</span>
                  <span className="text-muted-foreground ml-1">(min {b.min}%)</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Role Breakdown */}
      {scope === "team" && !memberId && Object.keys(roleGroups).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Team-Breakdown nach Rolle
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(roleGroups).sort(([,a],[,b]) => (b[0]?.member_level ?? 0) - (a[0]?.member_level ?? 0)).map(([role, mems]) => (
              <Card key={role} className="p-4 border-border/30">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{role}</h4>
                <div className="space-y-1.5">
                  {mems.map(m => (
                    <button
                      key={m.member_id}
                      onClick={() => setMemberId(m.member_id)}
                      className="w-full flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-foreground">{m.member_name}</span>
                      <span className="text-muted-foreground">L{m.member_level}</span>
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {memberId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Gefiltert auf: <strong className="text-foreground">{members.find(m => m.member_id === memberId)?.member_name ?? "Unbekannt"}</strong></span>
          <Button variant="ghost" size="sm" onClick={() => setMemberId(null)} className="h-5 text-[10px] px-2">
            Zurück zum Team
          </Button>
        </div>
      )}

      {effectiveLevel < 4 && (
        <Card className="p-4 border-border/40">
          <p className="text-xs text-muted-foreground">
            <User className="h-3 w-3 inline mr-1" />
            Du siehst deine persönliche Performance. Team-Sicht ist ab Level 4 verfügbar.
          </p>
        </Card>
      )}
    </div>
  );
}
