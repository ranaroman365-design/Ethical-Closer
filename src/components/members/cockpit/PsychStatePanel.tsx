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
import { Activity, Brain, Loader2, ShieldOff } from "lucide-react";
import {
  PSYCH_STATES,
  PSYCH_STATE_META,
  type PsychState,
} from "@/lib/canonical-psych-state";
import { toast } from "sonner";

// Layer 39 — Psychological State Engine cockpit panel.
// Mounts inside Operator Control. L6+admin.

interface PerfRow { state: PsychState; messages: number; replies_sent: number; bookings: number; booking_rate_pct: number; }
interface ConvRow {
  id: string;
  phone_e164: string;
  funnel_key: string | null;
  state: string;
  psych_state: PsychState | null;
  dominant_state: PsychState | null;
  state_override: PsychState | null;
  psych_engine_disabled: boolean;
  last_inbound_at: string | null;
}

function StateBadge({ state }: { state: PsychState | null }) {
  const { lang } = useLanguage();
  if (!state) return <Badge variant="outline" className="text-[10px]">—</Badge>;
  const meta = PSYCH_STATE_META[state];
  const tone: Record<PsychState, string> = {
    uncertain: "bg-amber-100 text-amber-900 border-amber-200",
    busy:      "bg-rose-100 text-rose-900 border-rose-200",
    rational:  "bg-sky-100 text-sky-900 border-sky-200",
    dominant:  "bg-violet-100 text-violet-900 border-violet-200",
    neutral:   "bg-stone-100 text-stone-700 border-stone-200",
  };
  return (
    <Badge className={`text-[10px] font-medium border ${tone[state]}`}>
      {lang === "de" ? meta.label_de : meta.label_en}
    </Badge>
  );
}

interface Props { funnelKey: string; isAdmin: boolean; }

export function PsychStatePanel({ funnelKey, isAdmin }: Props) {
  const { lang } = useLanguage();
  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const fk = funnelKey === "__all" ? null : funnelKey;

    const [perfRes, convsRes] = await Promise.all([
      supabase.rpc("psych_state_performance" as any, { _funnel_key: fk } as any),
      supabase
        .from("wa_conversations")
        .select("id, phone_e164, funnel_key, state, psych_state, dominant_state, state_override, psych_engine_disabled, last_inbound_at")
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);

    const perfData: any = perfRes.data;
    setPerf((perfData?.by_state ?? []) as PerfRow[]);
    setConversations((convsRes.data ?? []) as ConvRow[]);
    setLoading(false);
  }, [funnelKey]);

  useEffect(() => { load(); }, [load]);

  const setOverride = async (id: string, value: PsychState | null) => {
    setSavingId(id);
    const { error } = await supabase
      .from("wa_conversations")
      .update({
        state_override: value,
        state_override_at: value ? new Date().toISOString() : null,
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
      .update({ psych_engine_disabled: disabled } as any)
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
          <Brain className="w-4 h-4 text-stone-500" />
          <h3 className="text-base font-serif text-ink">
            {lang === "de" ? "Psychological State Engine" : "Psychological State Engine"}
          </h3>
          <Badge variant="outline" className="text-[10px] border-stone-300">L39</Badge>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {lang === "de" ? "Letzte 30 Tage" : "Last 30 days"}
        </Badge>
      </div>

      {/* Per-state performance */}
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-2">
          {lang === "de" ? "Performance pro Zustand" : "Performance per state"}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-stone-500 text-sm">
            <Loader2 className="w-3 h-3 animate-spin" /> {lang === "de" ? "Lade…" : "Loading…"}
          </div>
        ) : perf.length === 0 ? (
          <div className="text-sm text-stone-500">
            {lang === "de" ? "Noch keine Daten." : "No data yet."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PSYCH_STATES.map((s) => {
              const row = perf.find((p) => p.state === s);
              return (
                <div key={s} className="p-3 rounded-xl bg-white border border-stone-200/70">
                  <div className="flex items-center justify-between mb-2">
                    <StateBadge state={s} />
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
          {lang === "de" ? "Aktive Gespräche · State Übersicht" : "Active conversations · state view"}
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
                    <div className="text-[10px] text-stone-500 flex items-center gap-1.5">
                      <span>{lang === "de" ? "Erkannt" : "Detected"}:</span>
                      <StateBadge state={c.psych_state} />
                      <span className="ml-2">{lang === "de" ? "Dominant" : "Dominant"}:</span>
                      <StateBadge state={c.dominant_state} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={c.state_override ?? "__none"}
                    onValueChange={(v) => setOverride(c.id, v === "__none" ? null : (v as PsychState))}
                  >
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue placeholder={lang === "de" ? "Override" : "Override"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">
                        {lang === "de" ? "Kein Override" : "No override"}
                      </SelectItem>
                      {PSYCH_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {lang === "de" ? PSYCH_STATE_META[s].label_de : PSYCH_STATE_META[s].label_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1.5">
                    <ShieldOff className="w-3 h-3 text-stone-400" />
                    <Switch
                      checked={!c.psych_engine_disabled}
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
            ? "Override ersetzt erkannten Zustand. Toggle aus = neutrale Antworten."
            : "Override replaces detected state. Toggle off = neutral replies."}
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
