import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/i18n/LanguageContext";
import { TrendingUp } from "lucide-react";

interface Stats {
  bookings: number;
  show_rate: number;
  close_rate: number;
  revenue: number;
}

export function PerformanceSnapshot({ funnelKey }: { funnelKey?: string | null }) {
  const { lang } = useLanguage();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      // Appointments in last 30d
      let aQ: any = (supabase.from as any)("appointments").select("status").gte("created_at", since);
      if (funnelKey) aQ = aQ.eq("funnel_key", funnelKey);
      const { data: appts } = await aQ;
      const total = appts?.length ?? 0;
      const showed = (appts as any[] | null)?.filter((r) => r.status === "showed" || r.status === "closed_won").length ?? 0;
      const closed = (appts as any[] | null)?.filter((r) => r.status === "closed_won").length ?? 0;

      // Revenue: try call object value sum
      let revenue = 0;
      try {
        const { data: revRows } = await (supabase.from as any)("calls")
          .select("contract_value")
          .gte("created_at", since)
          .eq("outcome", "closed_won");
        revenue = (revRows as any[] | null)?.reduce((sum, r) => sum + Number(r.contract_value ?? 0), 0) ?? 0;
      } catch { /* table may not exist in some schemas */ }

      if (!active) return;
      setS({
        bookings: total,
        show_rate: total > 0 ? (showed / total) * 100 : 0,
        close_rate: showed > 0 ? (closed / showed) * 100 : 0,
        revenue,
      });
    })();
    return () => { active = false; };
  }, [funnelKey]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
          {lang === "de" ? "Performance · 30 Tage" : "Performance · 30 days"}
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label={lang === "de" ? "Bookings" : "Bookings"} value={s ? String(s.bookings) : "—"} />
        <Metric label={lang === "de" ? "Show Rate" : "Show rate"} value={s ? `${s.show_rate.toFixed(0)}%` : "—"} />
        <Metric label={lang === "de" ? "Close Rate" : "Close rate"} value={s ? `${s.close_rate.toFixed(0)}%` : "—"} />
        <Metric label={lang === "de" ? "Umsatz" : "Revenue"} value={s ? `€${s.revenue.toLocaleString()}` : "—"} />
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl font-light">{value}</p>
    </div>
  );
}
