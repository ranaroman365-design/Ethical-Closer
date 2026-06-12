import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BookOpen, Sparkles, ShieldCheck, Inbox } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { toast } from "sonner";
import AccessDenied from "@/components/members/AccessDenied";

const CATEGORIES = [
  "winning_phrase","losing_phrase","objection","objection_handling",
  "best_message","best_opening","best_followup","no_show_recovery",
  "close_reason","lost_reason","psychology_pattern","personality_pattern",
  "state_pattern","funnel_insight",
];

export default function LearningLoopAdmin() {
  const { isAdmin, isOwner, user } = useAuth();
  const { lang } = useLanguage();
  const adminAccess = isAdmin || isOwner;

  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genCategory, setGenCategory] = useState("winning_phrase");
  const [genFunnel, setGenFunnel] = useState("");
  const [genLevel, setGenLevel] = useState("1");

  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: p }, { data: i }] = await Promise.all([
      supabase.from("learning_loop_settings").select("*").eq("id", true).maybeSingle(),
      supabase
        .from("learning_data_pool")
        .select("*")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("learning_insights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setSettings(s);
    setPending(p ?? []);
    setInsights(i ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (adminAccess) load();
  }, [adminAccess]);

  if (!adminAccess) return <AccessDenied />;

  const updateSettings = async (patch: any) => {
    setSavingSettings(true);
    const { data, error } = await supabase
      .from("learning_loop_settings")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq("id", true)
      .select()
      .single();
    setSavingSettings(false);
    if (error) toast.error(error.message);
    else { setSettings(data); toast.success(t("Gespeichert", "Saved")); }
  };

  const approve = async (id: string, publish: boolean) => {
    const { error } = await supabase.rpc("approve_learning_pool_entry", {
      _id: id, _publish: publish,
    } as any);
    if (error) toast.error(error.message);
    else { toast.success(publish ? t("Veröffentlicht", "Published") : t("Genehmigt", "Approved")); load(); }
  };

  const reject = async (id: string) => {
    const reason = prompt(t("Grund?", "Reason?")) ?? "no_reason";
    const { error } = await supabase.rpc("reject_learning_pool_entry", { _id: id, _reason: reason } as any);
    if (error) toast.error(error.message);
    else { toast.success(t("Abgelehnt", "Rejected")); load(); }
  };

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("learning-loop-insight", {
      body: {
        category: genCategory,
        funnel_key: genFunnel || null,
        recommended_level: Number(genLevel),
      },
    });
    setGenerating(false);
    if (error) toast.error(error.message);
    else if ((data as any)?.skipped) toast.message((data as any).reason);
    else { toast.success(t("Insight erstellt", "Insight created")); load(); }
  };

  const publishInsight = async (id: string) => {
    const { error } = await supabase
      .from("learning_insights")
      .update({
        approval_status: "published",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t("Veröffentlicht", "Published")); load(); }
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="font-serif text-3xl">{t("Learning Loop", "Learning Loop")}</h1>
          <Badge variant="outline" className="ml-2 text-[10px]">L42</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "Reale Daten → kuratierter Lern-Pool → Schüler-Apps. Anonymisierung verpflichtend.",
            "Real data → curated learning pool → student apps. Anonymization mandatory.",
          )}
        </p>
      </header>

      {settings && (
        <Card className="space-y-3 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("Engine-Steuerung", "Engine controls")}
          </p>
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
                checked={!!settings.ingestion_enabled}
                disabled={savingSettings}
                onCheckedChange={(v) => updateSettings({ ingestion_enabled: v })}
              />
              {t("Ingestion", "Ingestion")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!settings.auto_approval_enabled}
                disabled={savingSettings}
                onCheckedChange={(v) => updateSettings({ auto_approval_enabled: v })}
              />
              {t("Auto-Approval", "Auto-approval")}
            </label>
          </div>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            {t(
              "Veröffentlichung erfordert immer Admin-Freigabe. Schüler sehen niemals Rohdaten.",
              "Publishing always requires admin approval. Students never see raw data.",
            )}
          </p>
        </Card>
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">
            <Inbox className="mr-1 h-3 w-3" /> {t("Eingang", "Pending")} ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Sparkles className="mr-1 h-3 w-3" /> {t("Insights", "Insights")} ({insights.length})
          </TabsTrigger>
          <TabsTrigger value="generate">
            {t("Generieren", "Generate")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!loading && pending.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              {t("Keine offenen Einträge.", "No pending entries.")}
            </Card>
          )}
          {pending.map((p) => (
            <Card key={p.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{p.category}</Badge>
                <Badge variant="secondary">L{p.level_relevance}+</Badge>
                <span className="text-muted-foreground">· {p.source_type}</span>
                {p.funnel_key && <span className="text-muted-foreground">· {p.funnel_key}</span>}
                <span className="text-muted-foreground">
                  · conf {Math.round((p.confidence_score ?? 0) * 100)}%
                </span>
                {Array.isArray(p.scrubbed_fields) && p.scrubbed_fields.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    🔒 {(p.scrubbed_fields as string[]).join(", ")}
                  </Badge>
                )}
              </div>
              <p className="text-sm">{p.anonymized_content}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => reject(p.id)}>
                  {t("Ablehnen", "Reject")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => approve(p.id, false)}>
                  {t("Genehmigen", "Approve")}
                </Button>
                <Button size="sm" onClick={() => approve(p.id, true)}>
                  {t("Veröffentlichen", "Publish")}
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="insights" className="space-y-2">
          {insights.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              {t("Noch keine Insights.", "No insights yet.")}
            </Card>
          )}
          {insights.map((i) => (
            <Card key={i.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{i.category}</Badge>
                {i.recommended_level && <Badge variant="secondary">L{i.recommended_level}+</Badge>}
                <Badge>{i.suggested_application}</Badge>
                <Badge variant={i.approval_status === "published" ? "default" : "outline"}>
                  {i.approval_status}
                </Badge>
                <span className="text-muted-foreground">· {i.source_count} samples</span>
              </div>
              <p className="text-sm font-medium">{i.insight_title}</p>
              <p className="text-xs text-muted-foreground">{i.insight_summary}</p>
              {i.approval_status !== "published" && (
                <Button size="sm" onClick={() => publishInsight(i.id)}>
                  {t("Veröffentlichen", "Publish")}
                </Button>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="generate" className="space-y-3">
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider">{t("Kategorie", "Category")}</Label>
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={genCategory}
                  onChange={(e) => setGenCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider">{t("Funnel (optional)", "Funnel (optional)")}</Label>
                <Input value={genFunnel} onChange={(e) => setGenFunnel(e.target.value)} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider">{t("Level", "Level")}</Label>
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={genLevel}
                  onChange={(e) => setGenLevel(e.target.value)}
                >
                  {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>L{n}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={generate} disabled={generating || !settings?.enabled}>
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : t("Insight generieren", "Generate insight")}
            </Button>
            {!settings?.enabled && (
              <p className="text-xs text-muted-foreground">
                {t("Engine ist deaktiviert.", "Engine is disabled.")}
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
