import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Target, Save, ChevronDown, ChevronUp } from "lucide-react";

interface LeadWithScore {
  id: string;
  name: string;
  email: string | null;
  stage: string;
  created_at: string;
  score?: {
    id: string;
    commitment: number;
    financial_ability: number;
    time_availability: number;
    communication_quality: number;
    goal_clarity: number;
    total_score: number;
    player_type: string;
    admin_notes: string | null;
  } | null;
}

const DIMENSIONS = [
  { key: "commitment", label: "Commitment", desc: "Bereitschaft, sich voll einzubringen" },
  { key: "financial_ability", label: "Finanzielle Fähigkeit", desc: "Kann die Investition tragen" },
  { key: "time_availability", label: "Zeitverfügbarkeit", desc: "Kann ausreichend Zeit investieren" },
  { key: "communication_quality", label: "Kommunikationsqualität", desc: "Ausdrucksfähigkeit und Klarheit" },
  { key: "goal_clarity", label: "Zielklarheit & Fit", desc: "Klare Ziele, passt zum Programm" },
] as const;

const PLAYER_COLORS: Record<string, string> = {
  A: "text-primary border-primary/30 bg-primary/10",
  B: "text-accent border-accent/30 bg-accent/10",
  C: "text-muted-foreground border-border",
};

export default function ApplicantScoringAdmin() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editScores, setEditScores] = useState<Record<string, number>>({});
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, name, email, stage, created_at")
      .eq("source", "bewerbung")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!leadsData) {
      setLoading(false);
      return;
    }

    // Fetch scores for these leads
    const leadIds = leadsData.map((l) => l.id);
    const { data: scoresData } = await supabase
      .from("applicant_scores" as any)
      .select("*")
      .in("lead_id", leadIds);

    const scoresMap = new Map<string, any>();
    (scoresData as any[] ?? []).forEach((s: any) => scoresMap.set(s.lead_id, s));

    const combined: LeadWithScore[] = leadsData.map((l) => ({
      ...l,
      score: scoresMap.get(l.id) || null,
    }));

    setLeads(combined);
    setLoading(false);
  }

  function startEdit(lead: LeadWithScore) {
    setExpandedId(lead.id);
    if (lead.score) {
      setEditScores({
        commitment: lead.score.commitment,
        financial_ability: lead.score.financial_ability,
        time_availability: lead.score.time_availability,
        communication_quality: lead.score.communication_quality,
        goal_clarity: lead.score.goal_clarity,
      });
      setEditNotes(lead.score.admin_notes || "");
    } else {
      setEditScores({ commitment: 10, financial_ability: 10, time_availability: 10, communication_quality: 10, goal_clarity: 10 });
      setEditNotes("");
    }
  }

  async function saveScore(leadId: string) {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      lead_id: leadId,
      commitment: editScores.commitment,
      financial_ability: editScores.financial_ability,
      time_availability: editScores.time_availability,
      communication_quality: editScores.communication_quality,
      goal_clarity: editScores.goal_clarity,
      admin_notes: editNotes || null,
      scored_by: auth.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("applicant_scores" as any).upsert(payload as any, { onConflict: "lead_id" } as any);
    setSaving(false);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Score gespeichert" });
    loadLeads();
    setExpandedId(null);
  }

  const totalEdit = Object.values(editScores).reduce((a, b) => a + b, 0);
  const playerTypeEdit = totalEdit >= 80 ? "A" : totalEdit >= 60 ? "B" : "C";

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Lade Bewerber…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <Target className="h-5 w-5 text-accent" />
        <h2 className="font-serif text-lg font-semibold text-foreground">Bewerber-Scoring</h2>
        <Badge variant="outline" className="text-[10px]">{leads.length} Bewerber</Badge>
      </div>

      {leads.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Bewerbungen eingegangen.</p>
      )}

      {leads.map((lead) => (
        <div key={lead.id} className="rounded-xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground truncate">{lead.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{lead.email} · {new Date(lead.created_at).toLocaleDateString("de-DE")}</p>
            </div>
            {lead.score ? (
              <Badge className={`text-[10px] ${PLAYER_COLORS[lead.score.player_type]}`}>
                {lead.score.player_type}-Player · {lead.score.total_score}/100
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">Nicht bewertet</Badge>
            )}
            <button
              onClick={() => expandedId === lead.id ? setExpandedId(null) : startEdit(lead)}
              className="text-muted-foreground hover:text-foreground"
            >
              {expandedId === lead.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {expandedId === lead.id && (
            <div className="mt-4 border-t border-border/30 pt-4 space-y-4">
              {DIMENSIONS.map((dim) => (
                <div key={dim.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-[12px] font-medium text-foreground">{dim.label}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">{dim.desc}</span>
                    </div>
                    <span className="text-[12px] font-bold text-accent">{editScores[dim.key]}/20</span>
                  </div>
                  <Slider
                    value={[editScores[dim.key]]}
                    onValueChange={([v]) => setEditScores((prev) => ({ ...prev, [dim.key]: v }))}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              ))}

              <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${PLAYER_COLORS[playerTypeEdit]}`}>
                  <span className="font-serif text-lg font-bold">{playerTypeEdit}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{totalEdit}/100</p>
                  <p className="text-[10px] text-muted-foreground">
                    {playerTypeEdit === "A" ? "A-Player" : playerTypeEdit === "B" ? "B-Player" : "C-Player"}
                  </p>
                </div>
              </div>

              <Textarea
                placeholder="Admin-Notizen zum Bewerber…"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="text-[12px]"
              />

              <Button
                onClick={() => saveScore(lead.id)}
                disabled={saving}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs"
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Wird gespeichert…" : "Score speichern"}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
