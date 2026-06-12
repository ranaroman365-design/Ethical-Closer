import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";

const STUDENT_CATEGORIES = [
  { key: "winning_phrase",      de: "Gewinner-Phrasen",      en: "Winning phrases" },
  { key: "objection_handling",  de: "Einwand-Behandlung",    en: "Objection handling" },
  { key: "best_opening",        de: "Beste Eröffnungen",     en: "Best openings" },
  { key: "best_followup",       de: "Beste Follow-ups",      en: "Best follow-ups" },
  { key: "no_show_recovery",    de: "No-Show Recovery",      en: "No-show recovery" },
  { key: "close_reason",        de: "Abschlussgründe",       en: "Close reasons" },
  { key: "psychology_pattern",  de: "Psychologische Muster", en: "Psychology patterns" },
];

export default function LearningPool() {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const stage = (profile as any)?.business_stage ?? "applicant";
  const myLevel = isAdmin || isOwner ? 6 : Math.max(1, getLevelForStage(stage) || 1);

  const [items, setItems] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState(STUDENT_CATEGORIES[0].key);

  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const load = async (category: string) => {
    if (!user) return;
    setLoading(true);
    const [{ data: pool }, { data: ins }] = await Promise.all([
      supabase.rpc("learning_pool_for_student", {
        _max_level: myLevel,
        _category: category,
      } as any),
      supabase
        .from("learning_insights")
        .select("*")
        .eq("approval_status", "published")
        .lte("recommended_level", myLevel)
        .eq("category", category)
        .order("published_at", { ascending: false })
        .limit(20),
    ]);
    const list = (pool as any)?.items ?? [];
    setItems(list);
    setInsights(ins ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load(activeCat);
  }, [activeCat, user, myLevel]);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="font-serif text-3xl">{t("Lern-Pool", "Learning Pool")}</h1>
          <Badge variant="outline" className="ml-1 text-[10px]">L{myLevel}</Badge>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          {t(
            "Anonymisierte Erkenntnisse aus echten Calls und Nachrichten — geprüft und freigegeben.",
            "Anonymized insights from real calls and messages — reviewed and approved.",
          )}
        </p>
      </header>

      <Tabs value={activeCat} onValueChange={setActiveCat}>
        <TabsList className="flex flex-wrap h-auto">
          {STUDENT_CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="text-xs">
              {lang === "de" ? c.de : c.en}
            </TabsTrigger>
          ))}
        </TabsList>

        {STUDENT_CATEGORIES.map((c) => (
          <TabsContent key={c.key} value={c.key} className="space-y-3">
            {insights.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Aggregierte Insights", "Aggregated insights")}
                </p>
                {insights.map((i) => (
                  <Card key={i.id} className="space-y-1 border-l-4 border-l-primary p-4">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary">L{i.recommended_level ?? "—"}</Badge>
                      <span className="text-muted-foreground">· {i.source_count} samples</span>
                    </div>
                    <p className="text-sm font-medium">{i.insight_title}</p>
                    <p className="text-xs text-muted-foreground">{i.insight_summary}</p>
                  </Card>
                ))}
              </div>
            )}

            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("Beispiele", "Examples")}
            </p>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!loading && items.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">
                {t("Noch keine veröffentlichten Inhalte.", "No published content yet.")}
              </Card>
            )}
            {items.map((it) => (
              <Card key={it.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">L{it.level_relevance}+</Badge>
                  {it.insight_type && <Badge variant="secondary">{it.insight_type}</Badge>}
                  {it.performance_metric != null && (
                    <span className="text-muted-foreground">· perf {Number(it.performance_metric).toFixed(2)}</span>
                  )}
                </div>
                <p className="text-sm">{it.anonymized_content}</p>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
