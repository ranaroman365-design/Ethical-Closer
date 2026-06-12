import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mapLegacyQualityGrade, getQualityDisplay } from "@/lib/canonical-decision-engine";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Users, ArrowRight, CheckCircle2, XCircle, Clock, Target,
  TrendingUp, AlertTriangle, BarChart3, Filter,
} from "lucide-react";

/**
 * Sprint 7 — Pipeline Mirror Component
 * Visual Kanban matching the GHL "Ethical Top Closer" pipeline stages.
 */

const PIPELINE_STAGES = [
  { key: "new", label: "New Lead", color: "bg-blue-500" },
  { key: "quiz_completed", label: "Quiz Completed", color: "bg-indigo-500" },
  { key: "booked", label: "Booked", color: "bg-cyan-500" },
  { key: "assigned_setter", label: "Setter Assigned", color: "bg-teal-500" },
  { key: "setter_attempting", label: "Setter Contacting", color: "bg-emerald-500" },
  { key: "setter_qualified", label: "Setter Qualified", color: "bg-green-500" },
  { key: "setter_booked", label: "Setter Booked", color: "bg-lime-500" },
  { key: "ready_for_closer", label: "Ready for Closer", color: "bg-yellow-500" },
  { key: "assigned_closer", label: "Assigned Closer", color: "bg-amber-500" },
  { key: "closer_in_progress", label: "Closer In Progress", color: "bg-orange-500" },
  { key: "offer_made", label: "Offer Made", color: "bg-rose-500" },
  { key: "follow_up", label: "Follow Up", color: "bg-pink-500" },
  { key: "closed_won", label: "Closed Won", color: "bg-green-600" },
  { key: "closed_lost", label: "Closed Lost", color: "bg-red-600" },
];

interface PipelineLead {
  id: string;
  name: string;
  email: string;
  stage: string;
  lead_quality: string;
  lead_score: number;
  source_funnel: string | null;
  created_at: string;
}

export default function FunnelPipelineMirror({ funnelFilter }: { funnelFilter?: string }) {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeads = async () => {
      let query = supabase
        .from("leads")
        .select("id, name, email, stage, lead_quality, lead_score, source_funnel, created_at")
        .not("stage", "in", "(cancelled,converted_to_L1)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (funnelFilter) {
        query = query.eq("source_funnel", funnelFilter);
      }

      const { data } = await query;
      setLeads((data as PipelineLead[]) || []);
      setLoading(false);
    };
    fetchLeads();
  }, [funnelFilter]);

  const stageGroups = useMemo(() => {
    const groups: Record<string, PipelineLead[]> = {};
    PIPELINE_STAGES.forEach((s) => (groups[s.key] = []));
    leads.forEach((l) => {
      if (groups[l.stage]) groups[l.stage].push(l);
      else if (groups["new"]) groups["new"].push(l); // fallback
    });
    return groups;
  }, [leads]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Pipeline — Ethical Top Closer
        </h2>
        <Badge variant="outline" className="text-xs">
          {leads.length} Leads
        </Badge>
      </div>

      {/* Horizontal scrollable pipeline */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = stageGroups[stage.key] || [];
            return (
              <div
                key={stage.key}
                className="w-[200px] shrink-0 rounded-lg border border-border bg-card"
              >
                {/* Stage header */}
                <div className="flex items-center gap-2 p-3 border-b border-border">
                  <div className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
                  <span className="text-xs font-semibold text-foreground truncate">{stage.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {stageLeads.length}
                  </Badge>
                </div>

                {/* Stage leads */}
                <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                  {stageLeads.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-3">—</p>
                  )}
                  {stageLeads.slice(0, 10).map((lead) => (
                    <div
                      key={lead.id}
                      className="rounded-md border border-border/50 bg-background p-2 text-xs"
                    >
                      <p className="font-medium text-foreground truncate">{lead.name}</p>
                      <p className="text-muted-foreground truncate text-[10px]">{lead.email}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge
                          variant={mapLegacyQualityGrade(lead.lead_quality) === 'high' ? "default" : "secondary"}
                          className="text-[9px] px-1 py-0"
                        >
                          {getQualityDisplay(mapLegacyQualityGrade(lead.lead_quality)).label}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground">
                          Score: {lead.lead_score ?? 0}
                        </span>
                      </div>
                    </div>
                  ))}
                  {stageLeads.length > 10 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      +{stageLeads.length - 10} weitere
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
