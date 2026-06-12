/**
 * Brand Dashboard — per-brand revenue and conversion view (Phase F).
 *
 * Filters canonical tables by brand_id / origin_brand_id. Reuses ETC truth
 * (calls.revenue + revenue_allocations) instead of inventing new metrics.
 */
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Brand = { id: string; slug: string; name: string };

export default function BrandDashboard() {
  const { slug = "" } = useParams<{ slug: string }>();

  const { data: brand } = useQuery({
    queryKey: ["brand", slug],
    queryFn: async (): Promise<Brand | null> => {
      const { data } = await supabase
        .from("brands" as never)
        .select("id, slug, name")
        .eq("slug", slug)
        .maybeSingle();
      return (data as Brand | null) ?? null;
    },
    enabled: !!slug,
  });

  const brandId = brand?.id ?? null;

  const { data: stats } = useQuery({
    queryKey: ["brand-stats", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const [leadsRes, aptsRes, callsRes, allocRes] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("origin_brand_id" as never, brandId as never),
        supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("brand_id" as never, brandId as never),
        supabase.from("calls").select("revenue, result")
          .eq("brand_id" as never, brandId as never)
          .eq("is_simulation" as never, false as never),
        supabase.from("revenue_allocations" as never).select("revenue_total, brand_share, etc_share")
          .eq("brand_id", brandId),
      ]);
      const calls = (callsRes.data ?? []) as Array<{ revenue: number | null; result: string | null }>;
      const won = calls.filter((c) => c.result === "won" || c.result === "closed_won");
      const revenue = won.reduce((s, c) => s + (Number(c.revenue) || 0), 0);
      const allocs = (allocRes.data ?? []) as Array<{ revenue_total: number; brand_share: number; etc_share: number }>;
      const brandShare = allocs.reduce((s, a) => s + Number(a.brand_share || 0), 0);
      const etcShare = allocs.reduce((s, a) => s + Number(a.etc_share || 0), 0);
      return {
        leads: leadsRes.count ?? 0,
        appointments: aptsRes.count ?? 0,
        calls: calls.length,
        won: won.length,
        revenue,
        brandShare,
        etcShare,
        closeRate: calls.length ? Math.round((won.length / calls.length) * 100) : 0,
      };
    },
  });

  if (!brand) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <p className="text-muted-foreground">Brand not found.</p>
      </div>
    );
  }

  const tiles = [
    { label: "Leads", value: stats?.leads ?? "—" },
    { label: "Appointments", value: stats?.appointments ?? "—" },
    { label: "Calls", value: stats?.calls ?? "—" },
    { label: "Won", value: stats?.won ?? "—" },
    { label: "Close Rate", value: stats ? `${stats.closeRate}%` : "—" },
    { label: "Revenue", value: stats ? `€${stats.revenue.toLocaleString("de-DE")}` : "—" },
    { label: "Brand Share", value: stats ? `€${Math.round(stats.brandShare).toLocaleString("de-DE")}` : "—" },
    { label: "ETC Share", value: stats ? `€${Math.round(stats.etcShare).toLocaleString("de-DE")}` : "—" },
  ];

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <header>
        <h1 className="font-serif text-3xl">{brand.name}</h1>
        <p className="text-sm text-muted-foreground">Brand · {brand.slug}</p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
