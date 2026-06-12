/**
 * Revenue Partnerships — Partner Onboarding wizard (Phase F).
 *
 * Admin-only registry of brands routed through the ETC Revenue OS.
 * Reads/writes public.brands. RLS enforced server-side.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Brand = {
  id: string;
  slug: string;
  name: string;
  status: string;
  booking_enabled: boolean;
  source_systems: string[];
  default_revenue_split: Record<string, number>;
  logo_url: string | null;
  created_at: string;
};

const defaultSplit = { brand: 0.6, etc: 0.4, closer: 0.15, setter: 0.05, operator: 0.05 };

export default function RevenuePartnerships() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    name: "",
    source_systems: "",
    brand_share: 0.6,
    etc_share: 0.4,
    closer_share: 0.15,
    setter_share: 0.05,
    operator_share: 0.05,
  });

  const { data: brands, isLoading } = useQuery({
    queryKey: ["brands-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });

  const createBrand = useMutation({
    mutationFn: async () => {
      const split = {
        brand: form.brand_share,
        etc: form.etc_share,
        closer: form.closer_share,
        setter: form.setter_share,
        operator: form.operator_share,
      };
      if (split.brand + split.etc > 1.001) {
        throw new Error("brand + etc share cannot exceed 100%");
      }
      const sources = form.source_systems.split(",").map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase.from("brands" as never).insert({
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        source_systems: sources.length ? sources : [form.slug.trim().toUpperCase()],
        default_revenue_split: split,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brand created");
      setShowForm(false);
      setForm({ slug: "", name: "", source_systems: "", brand_share: 0.6, etc_share: 0.4, closer_share: 0.15, setter_share: 0.05, operator_share: 0.05 });
      qc.invalidateQueries({ queryKey: ["brands-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Revenue Partnerships</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Brands routed through the ETC Revenue OS. One backend, many brands.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add Partner"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New Brand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Slug (unique)</Label>
                <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="mbf" />
              </div>
              <div>
                <Label>Display name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Mama baut Freiheit" />
              </div>
            </div>
            <div>
              <Label>Source systems (comma separated)</Label>
              <Input
                value={form.source_systems}
                onChange={(e) => setForm((f) => ({ ...f, source_systems: e.target.value }))}
                placeholder="MBF,mbf_meta_q2"
              />
            </div>
            <div className="grid grid-cols-5 gap-3">
              {(["brand", "etc", "closer", "setter", "operator"] as const).map((key) => (
                <div key={key}>
                  <Label className="capitalize">{key} share</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={form[`${key}_share` as const]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [`${key}_share`]: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Splits are immutable after a deal closes. Brand + ETC share must sum to ≤ 100%.
            </p>
            <Button disabled={!form.slug || !form.name || createBrand.isPending} onClick={() => createBrand.mutate()}>
              {createBrand.isPending ? "Creating…" : "Create Brand"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registered Brands</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !brands || brands.length === 0 ? (
            <p className="text-muted-foreground">No brands yet.</p>
          ) : (
            <div className="space-y-3">
              {brands.map((b) => {
                const split = b.default_revenue_split ?? defaultSplit;
                return (
                  <div key={b.id} className="flex items-center justify-between border rounded-2xl p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.name}</span>
                        <Badge variant="outline">{b.slug}</Badge>
                        <Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge>
                        {b.booking_enabled && <Badge variant="outline">booking</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        sources: {b.source_systems?.join(", ") || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        split — brand {Math.round((split.brand ?? 0) * 100)}% · etc {Math.round((split.etc ?? 0) * 100)}% ·
                        closer {Math.round((split.closer ?? 0) * 100)}% · setter {Math.round((split.setter ?? 0) * 100)}% ·
                        operator {Math.round((split.operator ?? 0) * 100)}%
                      </div>
                    </div>
                    <a
                      href={`/members/admin/brand-dashboard/${b.slug}`}
                      className="text-sm underline text-primary"
                    >
                      Open Dashboard →
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
