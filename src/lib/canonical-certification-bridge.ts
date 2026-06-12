/**
 * KPI ⇄ Certification Bridge (Phase 2, dry-run only)
 *
 * Reads only. Computes which level a user qualifies for based on
 * member_kpis vs level_requirements. Writes nothing.
 *
 * TODO (deferred, breaking risk):
 *  - Auto-promotion writing to profiles.level + operator_level_history
 *  - Cutover of distribute_commissions RPC from JSONB lookup to
 *    public.commission_rates table. Currently both layers coexist;
 *    commission_rates is shadow-only (see src/lib/commissionRates.ts).
 */
import { supabase } from "@/integrations/supabase/client";

export interface PromotionEvaluation {
  user_id: string;
  evaluated_at: string;
  suggested_level: string | null;
  met_requirements: Array<{ level: string; kpi: string; actual: number; threshold: number }>;
  failed_requirements: Array<{ level: string; kpi: string; actual: number; threshold: number; op: string }>;
  confidence_score: number;
  recommendation: "no_qualified_level" | "review_for_promotion";
  dry_run: true;
  writes: 0;
  error?: string;
}

export async function evaluateOperatorPromotionDryRun(
  userId: string,
): Promise<PromotionEvaluation | { error: string }> {
  const { data, error } = await supabase.rpc("evaluate_operator_promotion_dry_run", {
    _user_id: userId,
  } as any);
  if (error) return { error: error.message };
  return data as unknown as PromotionEvaluation;
}

export interface LevelRequirement {
  id: string;
  level: string;
  role_name: string | null;
  kpi_key: string;
  threshold_operator: ">=" | "<=" | "=" | ">" | "<";
  threshold_value: number;
  weight: number;
  active: boolean;
}

export async function getLevelRequirements(): Promise<LevelRequirement[]> {
  const { data } = await supabase
    .from("level_requirements")
    .select("*")
    .eq("active", true)
    .order("level", { ascending: true });
  return (data ?? []) as LevelRequirement[];
}
