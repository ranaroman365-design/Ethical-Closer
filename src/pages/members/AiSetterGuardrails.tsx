import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/i18n/LanguageContext";
import AccessDenied from "@/components/members/AccessDenied";
import { ShieldCheck, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SEGMENTS = [
  "unbooked_qualified",
  "booked_unconfirmed",
  "booked_at_risk",
  "no_show_recovery",
  "reschedule_requested",
] as const;

type Activation = {
  id: string;
  funnel_key: string;
  segment: (typeof SEGMENTS)[number];
  enabled: boolean;
  max_calls_per_day: number;
  notes: string | null;
};

export default function AiSetterGuardrails() {
  const { user, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const [funnels, setFunnels] = useState<string[]>([]);
  const [funnelKey, setFunnelKey] = useState("");
  const [rows, setRows] = useState<Activation[]>([]);
  const [newSeg, setNewSeg] = useState<(typeof SEGMENTS)[number]>("no_show_recovery");
  const [newCap, setNewCap] = useState(20);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("per_funnel_feature_flags").select("funnel_key");
      setFunnels((data ?? []).map((r: any) => r.funnel_key));
    })();
  }, []);

  useEffect(() => {
    if (funnels.length && !funnelKey) setFunnelKey(funnels[0]);
  }, [funnels, funnelKey]);

  const load = async () => {
    if (!funnelKey) return;
    const { data } = await supabase
      .from("ai_setter_segment_activations")
      .select("*")
      .eq("funnel_key", funnelKey)
      .order("segment");
    setRows((data as any) ?? []);
  };
  useEffect(() => {
    load();
  }, [funnelKey]);

  if (!isAdmin && !isOwner) return <AccessDenied />;

  const upsert = async (patch: Partial<Activation> & { funnel_key: string; segment: string }) => {
    const { error } = await supabase
      .from("ai_setter_segment_activations")
      .upsert(
        { ...patch, updated_by: user?.id, updated_at: new Date().toISOString() } as any,
        { onConflict: "funnel_key,segment" } as any,
      );
    if (error) toast({ variant: "destructive", title: error.message });
    load();
  };

  const addSegment = async () => {
    if (!funnelKey) return;
    await upsert({
      funnel_key: funnelKey,
      segment: newSeg,
      enabled: false,
      max_calls_per_day: newCap,
    });
  };

  return (
    <div className="space-y-8 p-6 lg:p-10">
      <header className="space-y-2 border-b pb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {lang === "de" ? "Admin · Guardrails" : "Admin · Guardrails"}
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          <ShieldCheck className="mr-2 inline h-6 w-6" />
          {lang === "de" ? "AI Setter — Aktivierungs-Guardrails" : "AI Setter — Activation Guardrails"}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {lang === "de"
            ? "AI ruft NUR an, wenn alle vier Gates offen sind: Global · Funnel · Segment · Tagesbudget."
            : "AI calls only when all four gates are open: Global · Funnel · Segment · Daily cap."}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <Label>{lang === "de" ? "Funnel" : "Funnel"}</Label>
          <Select value={funnelKey} onValueChange={setFunnelKey}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {funnels.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {rows.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              {lang === "de"
                ? "Noch keine Segmente aktiviert. Füge unten ein erstes hinzu."
                : "No segments yet. Add the first one below."}
            </Card>
          )}
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={r.enabled ? "default" : "outline"}>
                    {r.enabled ? "ON" : "OFF"}
                  </Badge>
                  <span className="font-mono text-sm">{r.segment}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lang === "de" ? "Tageslimit" : "Daily cap"}: {r.max_calls_per_day}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={500}
                  value={r.max_calls_per_day}
                  onChange={(e) =>
                    upsert({
                      funnel_key: r.funnel_key,
                      segment: r.segment,
                      max_calls_per_day: parseInt(e.target.value || "0", 10),
                    })
                  }
                  className="w-24"
                />
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) =>
                    upsert({ funnel_key: r.funnel_key, segment: r.segment, enabled: v })
                  }
                />
              </div>
            </Card>
          ))}

          <Card className="flex flex-col gap-3 border-dashed p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-xs">{lang === "de" ? "Segment" : "Segment"}</Label>
              <Select value={newSeg} onValueChange={(v) => setNewSeg(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Label className="text-xs">{lang === "de" ? "Tageslimit" : "Daily cap"}</Label>
              <Input
                type="number"
                min={0}
                max={500}
                value={newCap}
                onChange={(e) => setNewCap(parseInt(e.target.value || "0", 10))}
                className="mt-1"
              />
            </div>
            <Button onClick={addSegment} disabled={!funnelKey}>
              <Plus className="mr-2 h-4 w-4" />
              {lang === "de" ? "Hinzufügen" : "Add"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
