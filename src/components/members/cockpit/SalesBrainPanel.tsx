import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Brain, Target, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { toast } from "sonner";

interface BrainView {
  profile: any | null;
  latest_insight: any | null;
  recent_analyses: any[];
}

export function SalesBrainPanel() {
  const { user, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [view, setView] = useState<BrainView | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topProfiles, setTopProfiles] = useState<any[]>([]);

  const adminOnly = isAdmin || isOwner;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sales_brain_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      setSettings(data);
      const { data: top } = await supabase
        .from("lead_sales_profiles")
        .select("lead_id, summary_profile, conversion_probability, risk_tier, dominant_personality, dominant_state, funnel_key, generated_at")
        .order("conversion_probability", { ascending: false })
        .limit(8);
      setTopProfiles(top ?? []);
    })();
  }, []);

  const updateSettings = async (patch: Partial<any>) => {
    if (!adminOnly) return;
    setSavingSettings(true);
    const { data, error } = await supabase
      .from("sales_brain_settings")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq("id", true)
      .select()
      .single();
    setSavingSettings(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSettings(data);
      toast.success(lang === "de" ? "Gespeichert" : "Saved");
    }
  };

  const loadLead = async (id: string) => {
    if (!id) return;
    setLoadingView(true);
    const { data, error } = await supabase.rpc("sales_brain_lead_view", { _lead_id: id } as any);
    setLoadingView(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setView(data as unknown as BrainView);
  };

  const generateInsight = async () => {
    if (!leadId) return;
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("sales-brain-precall", {
      body: { lead_id: leadId },
    });
    setGenerating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((data as any)?.skipped) {
      toast.message(lang === "de" ? "Sales Brain ist deaktiviert" : "Sales Brain is disabled");
      return;
    }
    toast.success(lang === "de" ? "Insight erstellt" : "Insight generated");
    loadLead(leadId);
  };

  const t = (de: string, en: string) => (lang === "de" ? de : en);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 border-b pb-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
          {t("Sales Brain — Pre-Call Intelligence", "Sales Brain — Pre-Call Intelligence")}
        </h2>
        <Badge variant="outline" className="ml-1 text-[10px]">L41</Badge>
        {settings && (
          <Badge variant={settings.enabled ? "default" : "secondary"} className="ml-1 text-[10px]">
            {settings.enabled ? t("Aktiv", "Active") : t("Inaktiv", "Off")}
          </Badge>
        )}
      </div>

      {/* Settings (admin only) */}
      {adminOnly && settings && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!settings.enabled}
                disabled={savingSettings}
                onCheckedChange={(v) => updateSettings({ enabled: v })}
              />
              {t("Engine aktivieren", "Enable engine")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!settings.pre_call_enabled}
                disabled={savingSettings}
                onCheckedChange={(v) => updateSettings({ pre_call_enabled: v })}
              />
              {t("Pre-Call Briefings", "Pre-call briefs")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!settings.post_call_enabled}
                disabled={savingSettings}
                onCheckedChange={(v) => updateSettings({ post_call_enabled: v })}
              />
              {t("Post-Call Analyse", "Post-call analysis")}
            </label>
          </div>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldAlert className="h-3 w-3" />
            {t(
              "Beratend. Schließt nie automatisch ab. Erfindet keine Fakten. Überstimmt keine Einwilligung.",
              "Advisory only. Never auto-closes. Never fabricates. Never overrides consent.",
            )}
          </p>
        </Card>
      )}

      {/* Lead lookup */}
      <Card className="p-4 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-[10px] uppercase tracking-wider">
              {t("Lead-ID", "Lead ID")}
            </Label>
            <Input
              value={leadId}
              onChange={(e) => setLeadId(e.target.value.trim())}
              placeholder="uuid"
              className="font-mono text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => loadLead(leadId)} disabled={!leadId || loadingView}>
            {loadingView ? <Loader2 className="h-3 w-3 animate-spin" /> : t("Laden", "Load")}
          </Button>
          <Button size="sm" onClick={generateInsight} disabled={!leadId || generating || !settings?.enabled}>
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : t("Insight generieren", "Generate insight")}
          </Button>
        </div>

        {view?.profile && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge>{view.profile.dominant_personality ?? "unknown"}</Badge>
              <Badge variant="outline">{view.profile.dominant_state ?? "neutral"}</Badge>
              <Badge variant={view.profile.risk_tier === "high" ? "destructive" : view.profile.risk_tier === "medium" ? "secondary" : "default"}>
                {t("Risiko", "Risk")}: {view.profile.risk_tier ?? "—"}
              </Badge>
              <span className="text-muted-foreground">
                {t("Wahrscheinlichkeit", "Probability")}:{" "}
                <strong>{Math.round((view.profile.conversion_probability ?? 0) * 100)}%</strong>
              </span>
            </div>
            <p className="text-sm">{view.profile.summary_profile}</p>
            {view.profile.objections_raised?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Einwände", "Objections")}: {(view.profile.objections_raised as string[]).join(", ")}
              </p>
            )}
          </div>
        )}

        {view?.latest_insight && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("Letztes Pre-Call Briefing", "Latest pre-call brief")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · {new Date(view.latest_insight.generated_at).toLocaleString()}
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("Empfohlener Ansatz", "Recommended approach")}
              </p>
              <p className="text-sm">{view.latest_insight.recommended_approach}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("Opener", "Opener")}
              </p>
              <p className="text-sm italic">"{view.latest_insight.best_opening_line}"</p>
            </div>
            {view.latest_insight.likely_objections?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Wahrscheinliche Einwände", "Likely objections")}
                </p>
                <p className="text-xs">{(view.latest_insight.likely_objections as string[]).join(" · ")}</p>
              </div>
            )}
            {view.latest_insight.key_leverage_points?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Hebel", "Leverage")}
                </p>
                <ul className="ml-4 list-disc text-xs">
                  {(view.latest_insight.key_leverage_points as string[]).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {view.latest_insight.avoid?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Vermeiden", "Avoid")}: {(view.latest_insight.avoid as string[]).join(", ")}
              </p>
            )}
          </div>
        )}

        {view?.recent_analyses && view.recent_analyses.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("Letzte Post-Call Analysen", "Recent post-call analyses")}
            </p>
            {view.recent_analyses.map((a: any) => (
              <div key={a.id} className="rounded-md border p-3 text-xs space-y-1">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{a.outcome}</Badge>
                  <Badge variant="outline">{a.sentiment}</Badge>
                  <span className="text-muted-foreground">
                    match {Math.round((a.pre_call_match_score ?? 0) * 100)}%
                  </span>
                  <span className="text-muted-foreground">
                    · {new Date(a.generated_at).toLocaleDateString()}
                  </span>
                </div>
                {a.what_worked?.length > 0 && (
                  <p>
                    <strong>{t("Funktioniert", "Worked")}:</strong> {(a.what_worked as string[]).join(", ")}
                  </p>
                )}
                {a.what_failed?.length > 0 && (
                  <p>
                    <strong>{t("Gescheitert", "Failed")}:</strong> {(a.what_failed as string[]).join(", ")}
                  </p>
                )}
                {a.improvement_suggestions?.length > 0 && (
                  <p className="text-muted-foreground">
                    {t("Verbesserung", "Improvement")}: {(a.improvement_suggestions as string[]).join("; ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Top profiles */}
      <Card className="p-4 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("Top Wahrscheinlichkeit", "Top probability leads")}
        </p>
        {topProfiles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("Noch keine Profile.", "No profiles yet.")}
          </p>
        )}
        {topProfiles.map((p) => (
          <button
            key={p.lead_id}
            onClick={() => {
              setLeadId(p.lead_id);
              loadLead(p.lead_id);
            }}
            className="flex w-full items-center justify-between rounded-md border p-2 text-left text-xs hover:bg-muted/50"
          >
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-muted-foreground">{p.lead_id.slice(0, 8)}</span>
              <span className="line-clamp-1">{p.summary_profile}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {p.dominant_personality} · {p.dominant_state}
              </Badge>
              <Badge
                variant={p.risk_tier === "high" ? "destructive" : "default"}
                className="text-[10px]"
              >
                {Math.round((p.conversion_probability ?? 0) * 100)}%
              </Badge>
            </div>
          </button>
        ))}
      </Card>
    </section>
  );
}

export default SalesBrainPanel;
