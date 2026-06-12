import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, Link2, CheckCircle2, Clock, XCircle, RotateCcw,
  AlertTriangle, TrendingUp, Copy, ExternalLink, Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface PaymentLink {
  id: string;
  token: string;
  lead_id: string | null;
  closer_id: string | null;
  deal_type: string;
  payment_type: string;
  amount: number;
  status: string;
  offer_title: string | null;
  first_name: string | null;
  email: string | null;
  payment_url: string | null;
  created_at: string;
  paid_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  expires_at: string;
  call_id: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
}

type RangeKey = "7d" | "30d" | "90d";
type StatusFilter = "all" | "pending" | "paid" | "expired" | "refunded" | "disputed";

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const STATUS_CONFIG: Record<string, { label: { de: string; en: string }; icon: typeof CheckCircle2; tone: string }> = {
  pending:  { label: { de: "Erstellt", en: "Created" }, icon: Clock, tone: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  paid:     { label: { de: "Bezahlt", en: "Paid" }, icon: CheckCircle2, tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  expired:  { label: { de: "Abgelaufen", en: "Expired" }, icon: XCircle, tone: "border-white/10 bg-white/5 text-muted-foreground" },
  failed:   { label: { de: "Fehlgeschlagen", en: "Failed" }, icon: XCircle, tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  refunded: { label: { de: "Erstattet", en: "Refunded" }, icon: RotateCcw, tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  disputed: { label: { de: "Streit", en: "Disputed" }, icon: AlertTriangle, tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
};

const fmtEur = (cents: number) => `€${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function PaymentLinksDashboard() {
  const { user, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const [range, setRange] = useState<RangeKey>("30d");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - RANGE_DAYS[range] * 86400000).toISOString();

      let q = supabase
        .from("payment_links")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!isAdmin && !isOwner) {
        q = q.eq("closer_id", user.id);
      }

      const { data, error } = await q;
      if (error) console.error("payment_links fetch error:", error);
      if (!cancelled) {
        setLinks((data as unknown as PaymentLink[]) ?? []);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, range, isAdmin, isOwner]);

  const stats = useMemo(() => {
    const total = links.length;
    const active = links.filter((l) => l.status === "pending").length;
    const paid = links.filter((l) => l.status === "paid").length;
    const expired = links.filter((l) => l.status === "expired").length;
    const refunded = links.filter((l) => l.status === "refunded" || l.status === "disputed").length;
    const revenue = links.filter((l) => l.status === "paid").reduce((s, l) => s + l.amount, 0);
    const conversionRate = total > 0 ? (paid / total) * 100 : 0;
    const withCall = links.filter((l) => l.status === "paid" && l.call_id).length;

    const now = Date.now();
    const todayRevenue = links
      .filter((l) => l.status === "paid" && l.paid_at && (now - new Date(l.paid_at).getTime()) < 86400000)
      .reduce((s, l) => s + l.amount, 0);
    const weekRevenue = links
      .filter((l) => l.status === "paid" && l.paid_at && (now - new Date(l.paid_at).getTime()) < 7 * 86400000)
      .reduce((s, l) => s + l.amount, 0);

    return { total, active, paid, expired, refunded, revenue, conversionRate, todayRevenue, weekRevenue, withCall };
  }, [links]);

  const filteredLinks = useMemo(() => {
    if (statusFilter === "all") return links;
    return links.filter((l) => l.status === statusFilter);
  }, [links, statusFilter]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Payment System
          </p>
          <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
            {t("Zahlungslinks", "Payment Links")}
          </h2>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("7 Tage", "7 days")}</SelectItem>
            <SelectItem value="30d">{t("30 Tage", "30 days")}</SelectItem>
            <SelectItem value="90d">{t("90 Tage", "90 days")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <StatCard icon={<Link2 className="h-3.5 w-3.5" />} label={t("Gesamt", "Total")} value={String(stats.total)} />
            <StatCard icon={<Clock className="h-3.5 w-3.5" />} label={t("Aktiv", "Active")} value={String(stats.active)} />
            <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={t("Bezahlt", "Paid")} value={String(stats.paid)} tone="pos" />
            <StatCard icon={<XCircle className="h-3.5 w-3.5" />} label={t("Abgelaufen", "Expired")} value={String(stats.expired)} />
            <StatCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Conversion" value={fmtPct(stats.conversionRate)} tone={stats.conversionRate >= 30 ? "pos" : stats.conversionRate >= 15 ? "neutral" : "neg"} />
            <StatCard icon={<Wallet className="h-3.5 w-3.5" />} label="Revenue" value={fmtEur(stats.revenue)} tone="pos" />
            <StatCard icon={<Wallet className="h-3.5 w-3.5" />} label={t("Heute", "Today")} value={fmtEur(stats.todayRevenue)} />
          </div>

          {/* Revenue breakdown */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Revenue heute", "Revenue today")}</p>
              <p className="mt-1 font-serif text-2xl font-light text-foreground">{fmtEur(stats.todayRevenue)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Revenue 7d", "Revenue 7d")}</p>
              <p className="mt-1 font-serif text-2xl font-light text-foreground">{fmtEur(stats.weekRevenue)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Revenue Zeitraum", "Revenue period")}</p>
              <p className="mt-1 font-serif text-2xl font-light text-foreground">{fmtEur(stats.revenue)}</p>
            </Card>
          </div>

          {/* Status filter tabs */}
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all">{t("Alle", "All")} ({stats.total})</TabsTrigger>
              <TabsTrigger value="pending">{t("Aktiv", "Active")} ({stats.active})</TabsTrigger>
              <TabsTrigger value="paid">{t("Bezahlt", "Paid")} ({stats.paid})</TabsTrigger>
              <TabsTrigger value="expired">{t("Abgelaufen", "Expired")} ({stats.expired})</TabsTrigger>
              {stats.refunded > 0 && (
                <TabsTrigger value="refunded">{t("Erstattet", "Refunded")} ({stats.refunded})</TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {/* Links Table */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                {t("Zahlungslinks", "Payment Links")} ({filteredLinks.length})
              </h3>
            </div>
            {filteredLinks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("Keine Zahlungslinks in dieser Ansicht.", "No payment links in this view.")}
              </div>
            ) : (
              <div className="divide-y">
                {filteredLinks.map((link) => (
                  <LinkRow key={link.id} link={link} t={t} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, tone = "neutral",
}: {
  icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "pos" | "neg";
}) {
  const toneColor = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-foreground";
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-serif text-xl font-light ${toneColor}`}>{value}</div>
    </Card>
  );
}

function LinkRow({ link, t }: { link: PaymentLink; t: (de: string, en: string) => string }) {
  const config = STATUS_CONFIG[link.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const statusLabel = config.label[t("de", "en") === "de" ? "de" : "en"];

  const handleCopy = async () => {
    if (link.payment_url) {
      await navigator.clipboard.writeText(link.payment_url);
      toast.success(t("Link kopiert", "Link copied"));
    }
  };

  const timeAgo = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {link.first_name || link.email || "—"}
          </span>
          <Badge variant="outline" className={`text-[10px] ${config.tone}`}>
            {statusLabel}
          </Badge>
          {link.status === "paid" && link.call_id && (
            <Badge variant="outline" className="text-[10px] border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              Revenue ✓
            </Badge>
          )}
          {link.status === "paid" && !link.call_id && (
            <Badge variant="outline" className="text-[10px] border-amber-400/30 bg-amber-400/10 text-amber-300">
              No Call
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{link.offer_title || link.deal_type}</span>
          <span>·</span>
          <span className="font-mono">{fmtEur(link.amount)}</span>
          <span>·</span>
          <span>{timeAgo(link.created_at)}</span>
          {link.paid_at && (
            <>
              <span>·</span>
              <span className="text-emerald-600">{t("Bezahlt", "Paid")} {timeAgo(link.paid_at)}</span>
            </>
          )}
          {link.refunded_at && (
            <>
              <span>·</span>
              <span className="text-rose-400">{t("Erstattet", "Refunded")} {timeAgo(link.refunded_at)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {link.payment_url && link.status === "pending" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <a href={link.payment_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
