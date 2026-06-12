import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type Kpi = {
  quiz_completed: number;
  retargeting_sends: number;
  bookings_after_retarget: number;
  reminder_sends: number;
  show_rate_pct: number;
  payment_at_risk: number;
  payments_recovered: number;
  commitments_confirmed: number;
  no_shows: number;
  upsell_offers: number;
};

export default function RevenueAccelerationKPI() {
  const [data, setData] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_revenue_acceleration_kpis", { p_days: 7 });
        if (error) throw error;
        setData(data as unknown as Kpi);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin" /></div>;
  if (err) return <div className="p-6 text-destructive">Fehler: {err}</div>;
  if (!data) return null;

  const cards: Array<{ label: string; value: string | number; hint?: string }> = [
    { label: "Quiz abgeschlossen", value: data.quiz_completed, hint: "letzte 7 Tage" },
    { label: "Retargeting Sends", value: data.retargeting_sends, hint: "SMS + Email" },
    { label: "Buchungen nach Retarget", value: data.bookings_after_retarget },
    { label: "Reminder Sends", value: data.reminder_sends, hint: "24h / 2h / 10m" },
    { label: "Show-Up Rate", value: `${data.show_rate_pct}%` },
    { label: "Zahlung Risiko", value: data.payment_at_risk },
    { label: "Zahlungen recovered", value: data.payments_recovered },
    { label: "Commitments bestätigt", value: data.commitments_confirmed },
    { label: "No-Shows", value: data.no_shows },
    { label: "Upsell Offers", value: data.upsell_offers },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Revenue Acceleration KPIs</h1>
        <Badge variant="outline">Last 7 days</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
              {c.hint && <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
