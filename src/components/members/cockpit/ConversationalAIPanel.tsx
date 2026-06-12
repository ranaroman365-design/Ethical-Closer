import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/i18n/LanguageContext";
import { MessageCircle, Loader2, Pause, Play, UserCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  funnelKey: string | null;
  isAdmin: boolean;
}

interface Settings {
  id: string;
  scope: string;
  funnel_key: string | null;
  enabled: boolean;
  min_reply_interval_seconds: number;
  max_replies_per_conversation: number;
  high_value_score_threshold: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  ai_confidence_threshold: number;
}

interface Conv {
  id: string;
  phone_e164: string;
  state: string;
  last_intent: string | null;
  last_intent_confidence: number | null;
  ai_paused: boolean;
  message_count: number;
  ai_reply_count: number;
  last_inbound_at: string | null;
  funnel_key: string | null;
}

interface Escalation {
  id: string;
  trigger: string;
  status: string;
  notes: string | null;
  created_at: string;
}

const STATE_COLORS: Record<string, string> = {
  cold: "bg-muted text-muted-foreground",
  engaged: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  interested: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  booking_pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  booked: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  lost: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  escalated: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

export function ConversationalAIPanel({ funnelKey, isAdmin }: Props) {
  const { lang } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const load = async () => {
    setLoading(true);

    // Settings (per-funnel > global)
    let sQ = supabase.from("conversational_ai_settings").select("*");
    sQ = funnelKey
      ? sQ.eq("scope", "funnel").eq("funnel_key", funnelKey)
      : sQ.eq("scope", "global").is("funnel_key", null);
    const { data: sData } = await sQ.maybeSingle();
    setSettings(sData as Settings | null);

    // Conversations (recent 20)
    let cQ = supabase.from("wa_conversations").select("*")
      .order("last_inbound_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (funnelKey) cQ = cQ.eq("funnel_key", funnelKey);
    const { data: cData } = await cQ;
    setConversations((cData as Conv[]) ?? []);

    // Open escalations
    let eQ = supabase.from("wa_escalations").select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(10);
    if (funnelKey) eQ = eQ.eq("funnel_key", funnelKey);
    const { data: eData } = await eQ;
    setEscalations((eData as Escalation[]) ?? []);

    setLoading(false);
  };

  useEffect(() => { load(); }, [funnelKey]);

  const toggleEnabled = async (next: boolean) => {
    setSaving(true);
    try {
      if (settings?.id) {
        await supabase.from("conversational_ai_settings")
          .update({ enabled: next }).eq("id", settings.id);
      } else if (funnelKey) {
        await supabase.from("conversational_ai_settings").insert({
          scope: "funnel", funnel_key: funnelKey, enabled: next,
        });
      }
      toast.success(next
        ? t("WhatsApp AI aktiviert.", "WhatsApp AI enabled.")
        : t("WhatsApp AI pausiert.", "WhatsApp AI paused.")
      );
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const updateField = async (field: keyof Settings, value: any) => {
    if (!settings?.id) return;
    const patch = { [field]: value } as any;
    await supabase.from("conversational_ai_settings").update(patch).eq("id", settings.id);
    await load();
  };

  const pauseConv = async (id: string, paused: boolean) => {
    await supabase.from("wa_conversations").update({
      ai_paused: paused,
      ai_paused_reason: paused ? "manual_operator" : null,
    }).eq("id", id);
    toast.success(paused ? t("AI für Lead pausiert.", "AI paused for lead.") : t("AI fortgesetzt.", "AI resumed."));
    await load();
  };

  const resolveEsc = async (id: string) => {
    await supabase.from("wa_escalations").update({
      status: "resolved", resolved_at: new Date().toISOString(),
    }).eq("id", id);
    toast.success(t("Eskalation gelöst.", "Escalation resolved."));
    await load();
  };

  if (loading) {
    return (
      <Card className="p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const enabled = !!settings?.enabled;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-serif text-base">{t("Conversational WhatsApp AI", "Conversational WhatsApp AI")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Inbound-Antworten · Intent-Erkennung · Booking-Übergabe",
                "Inbound replies · Intent detection · Booking handoff",
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={enabled ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : ""}>
            {enabled ? t("aktiv", "live") : t("aus", "off")}
          </Badge>
          <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={saving} />
        </div>
      </div>

      {/* Settings (collapsed when disabled) */}
      {settings && (
        <div className="grid grid-cols-2 gap-4 border-b border-border/50 p-5 md:grid-cols-4">
          <SettingField
            label={t("Min Antwortabstand (s)", "Min reply gap (s)")}
            value={settings.min_reply_interval_seconds}
            onCommit={(v) => updateField("min_reply_interval_seconds", v)}
          />
          <SettingField
            label={t("Max Antworten/Lead", "Max replies/lead")}
            value={settings.max_replies_per_conversation}
            onCommit={(v) => updateField("max_replies_per_conversation", v)}
          />
          <SettingField
            label={t("Quiet-Hours Start", "Quiet hours start")}
            value={settings.quiet_hours_start}
            onCommit={(v) => updateField("quiet_hours_start", v)}
          />
          <SettingField
            label={t("Quiet-Hours Ende", "Quiet hours end")}
            value={settings.quiet_hours_end}
            onCommit={(v) => updateField("quiet_hours_end", v)}
          />
        </div>
      )}

      {/* Open Escalations */}
      {escalations.length > 0 && (
        <div className="border-b border-border/50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-medium">
              {t(`Offene Übergaben (${escalations.length})`, `Open handoffs (${escalations.length})`)}
            </h4>
          </div>
          <div className="space-y-2">
            {escalations.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-4 rounded-lg border border-border/50 p-3">
                <div className="space-y-1">
                  <Badge variant="outline" className="text-xs">{e.trigger}</Badge>
                  {e.notes && <p className="text-xs text-muted-foreground line-clamp-2">{e.notes}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => resolveEsc(e.id)}>
                  <UserCheck className="mr-1 h-3 w-3" />
                  {t("erledigt", "done")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Conversations */}
      <div className="p-5">
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
          {t("Letzte Conversations", "Recent conversations")}
        </h4>
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Noch keine WhatsApp-Conversations.", "No WhatsApp conversations yet.")}
          </p>
        ) : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 rounded-lg border border-border/50 p-3">
                <div className="flex items-center gap-3">
                  <Badge className={STATE_COLORS[c.state] || ""}>{c.state}</Badge>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{c.phone_e164}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.last_intent ? `${c.last_intent} · ${Math.round((c.last_intent_confidence ?? 0) * 100)}%` : "—"}
                      {" · "}{c.message_count} {t("Nachr.", "msgs")} · {c.ai_reply_count} AI
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => pauseConv(c.id, !c.ai_paused)}
                  title={c.ai_paused ? t("AI fortsetzen", "Resume AI") : t("AI pausieren", "Pause AI")}
                >
                  {c.ai_paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function SettingField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (!Number.isNaN(n) && n !== value) onCommit(n);
        }}
        className="h-8"
      />
    </div>
  );
}
