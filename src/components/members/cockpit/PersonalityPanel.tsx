import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { Activity, UserSquare2, Loader2, ShieldOff } from "lucide-react";
import {
  PERSONALITY_TYPES,
  PERSONALITY_META,
  type Personality,
} from "@/lib/canonical-personality";
import { toast } from "sonner";

// Layer 40 — Personality Matching Engine cockpit panel.
// Mounts inside Operator Control. L6+admin.

interface PerfRow { personality: Personality; messages: number; replies_sent: number; bookings: number; booking_rate_pct: number; }
interface ConvRow {
  id: string;
  phone_e164: string;
  funnel_key: string | null;
  state: string;
  personality_type: Personality | null;
  dominant_personality: Personality | null;
  personality_override: Personality | null;
  personality_engine_disabled: boolean;
  last_inbound_at: string | null;
}

function PersonalityBadge({ value }: { value: Personality | null }) {
  const { lang } = useLanguage();
  if (!value) return <Badge variant="outline" className="text-[10px]">—</Badge>;
  const meta = PERSONALITY_META[value];
  const tone: Record<Personality, string> = {
    dominant:   "bg-rose-100 text-rose-900 border-rose-200",
    analytical: "bg-sky-100 text-sky-900 border-sky-200",
    relational: "bg-emerald-100 text-emerald-900 border-emerald-200",
    expressive: "bg-amber-100 text-amber-900 border-amber-200",
    unknown:    "bg-stone-100 text-stone-700 border-stone-200",
  };
  return (
    <Badge className={`text-[10px] font-medium border ${tone[value]}`}>
      {lang === "de" ? meta.label_de : meta.label_en}
    </Badge>
  );
}

interface Props { funnelKey: string; isAdmin: boolean; }

export function PersonalityPanel({ funnelKey }: Props) {
  const { lang } = useLanguage();
  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const fk = funnelKey === "__all" ? null : funnelKey;

    const [perfRes, convsRes] = await Promise.all([
      supabase.rpc("personality_performance" as any, { _funnel_key: fk } as any),
      supabase
        .from("wa_conversations")
        .select("id, phone_e164, funnel_key, state, personality_type, dominant_personality, personality_override, personality_engine_disabled, last_inbound_at")
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);

    const perfData: any = perfRes.data;
    setPerf((perfData?.by_personality ?? []) as PerfRow[]);
    setConversations((convsRes.data ?? []) as unknown as ConvRow[]);
    setLoading(false);
  }, [funnelKey]);

  useEffect(() => { load(); }, [load]);

  const setOverride = async (id: string, value: Personality | null) => {
    setSavingId(id);
    const { error } = await supabase
      .from("wa_conversations")
      .update({
        personality_override: value,
        personality_override_at: value ? new Date().toISOString() : null,
      } as any)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(lang === "de" ? "Speichern fehlgeschlagen" : "Save failed");
      return;
    }
    toast.success(lang === "de" ? "Override gesetzt" : "Override set");
    load();
  };

  const toggleEngine = async (id: string, disabled: boolean) => {
    setSavingId(id);
    const { error } = await supabase
      .from("wa_conversations")
      .update({ personality_engine_disabled: disabled } as any)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(lang === "de" ? "Speichern fehlgeschlagen" : "Save failed");
      return;
    }
    load();
  };

  return (
    <Card className="p-6 rounded-2xl bg-cream border-stone-200/60">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <UserSquare2 className="w-4 h-4 text-stone-500" />
          <h3 className="text-base font-serif text-ink">
            {lang === "de" ? "Personality Matching Engine" : "Personality Matching Engine"}
          </h3>
          <Badge variant="outline" className="text-[10px] border-stone-300">L40</Badge>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {lang === "de" ? "Letzte 30 Tage" : "Last 30 days"}
        </Badge>
      </div>

      {/* Per-personality performance */}
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-2">
          {lang === "de" ? "Performance pro Persönlichkeit" : "Performance per personality"}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-stone-500 text-sm">
            <Loader2 className="w-3 h-3 animate-spin" /> {lang === "de" ? "Lade…" : "Loading…"}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PERSONALITY_TYPES.map((p) => {
              const row = perf.find((r) => r.personality === p);
              return (
                <div key={p} className="p-3 rounded-xl bg-white border border-stone-200/70">
                  <div className="flex items-center justify-between mb-2">
                    <PersonalityBadge value={p} />
                    <span className="text-[10px] text-stone-400">{row?.messages ?? 0}</span>
                  </div>
                  <div className="text-xl font-serif text-ink">{row?.booking_rate_pct ?? 0}%</div>
                  <div className="text-[10px] text-stone-500">
                    {lang === "de" ? "Buchungsrate" : "Booking rate"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent conversations */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-2">
          {lang === "de" ? "Aktive Gespräche · Personality Übersicht" : "Active conversations · personality view"}
        </div>
        {conversations.length === 0 ? (
          <div className="text-sm text-stone-500">
            {lang === "de" ? "Noch keine Gespräche." : "No conversations yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-stone-200/70"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Activity className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">{c.phone_e164}</div>
                    <div className="text-[10px] text-stone-500 flex items-center gap-1.5 flex-wrap">
                      <span>{lang === "de" ? "Erkannt" : "Detected"}:</span>
                      <PersonalityBadge value={c.personality_type} />
                      <span className="ml-2">{lang === "de" ? "Dominant" : "Dominant"}:</span>
                      <PersonalityBadge value={c.dominant_personality} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={c.personality_override ?? "__none"}
                    onValueChange={(v) => setOverride(c.id, v === "__none" ? null : (v as Personality))}
                  >
                    <SelectTrigger className="h-7 w-[140px] text-xs">
                      <SelectValue placeholder={lang === "de" ? "Override" : "Override"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">
                        {lang === "de" ? "Kein Override" : "No override"}
                      </SelectItem>
                      {PERSONALITY_TYPES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {lang === "de" ? PERSONALITY_META[p].label_de : PERSONALITY_META[p].label_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1.5">
                    <ShieldOff className="w-3 h-3 text-stone-400" />
                    <Switch
                      checked={!c.personality_engine_disabled}
                      disabled={savingId === c.id}
                      onCheckedChange={(v) => toggleEngine(c.id, !v)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-stone-400 mt-3">
          {lang === "de"
            ? "Personality = Grundtyp. State (L39) = momentaner Zustand. Beide kombiniert = Top 1% Antwort."
            : "Personality = base type. State (L39) = momentary state. Combined = Top 1% reply."}
        </div>
      </div>

      <div className="flex items-center justify-end mt-4">
        <Button variant="ghost" size="sm" onClick={load} className="text-xs">
          {lang === "de" ? "Aktualisieren" : "Refresh"}
        </Button>
      </div>
    </Card>
  );
}
