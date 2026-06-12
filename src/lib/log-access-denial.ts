import { supabase } from "@/integrations/supabase/client";

interface AccessDenialParams {
  resourceType: string;        // 'appointment' | 'calendar' | 'performance_tab' | ...
  resourceId?: string | null;
  resolvedLevel?: number | null;
  teamScopeIds?: string[];
  denialReason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget: logs an access denial to `access_denial_log`.
 * Never throws — swallows errors silently to avoid cascading UI failures.
 */
export function logAccessDenial(params: AccessDenialParams): void {
  supabase.auth.getUser().then(({ data }) => {
    const uid = data?.user?.id;
    if (!uid) return;
    (supabase as any)
      .from("access_denial_log")
      .insert({
        user_id: uid,
        resource_type: params.resourceType,
        resource_id: params.resourceId ?? null,
        resolved_level: params.resolvedLevel ?? null,
        team_scope_ids: params.teamScopeIds ?? null,
        denial_reason: params.denialReason,
        metadata: params.metadata ?? {},
      })
      .then(() => {});
  });
}
