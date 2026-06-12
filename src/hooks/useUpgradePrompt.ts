import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Annual-upgrade trigger conditions (all must be true):
 *   A) Active ≥ 7 days (since profile.created_at)
 *   B) Consumed ≥ 3 content units (post_view / lesson_view / replay_view)
 *   C) Returned ≥ 3 times (distinct session days)
 *
 * The user must already have community_access AND not be on the annual plan.
 * Once the modal is dismissed locally we don't ask again for 7 days
 * (avoids harassment); a per-user persisted dismissal lives in localStorage.
 */
const DISMISS_KEY = "etc_annual_upgrade_dismissed_at";
const DISMISS_COOLDOWN_DAYS = 7;

export function useUpgradePrompt() {
  const { profile } = useAuth();
  const [show, setShow] = useState(false);
  const uid = (profile as any)?.id as string | undefined;
  const hasCommunityAccess = Boolean((profile as any)?.community_access);
  const billingInterval = (profile as any)?.billing_interval as string | undefined;
  const onAnnual = billingInterval === "year" || billingInterval === "annual";

  useEffect(() => {
    if (!uid || !hasCommunityAccess || onAnnual) return;

    // Local cooldown
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_DAYS * 86_400_000) return;

    let cancelled = false;
    (async () => {
      try {
        // Condition A — active ≥ 7 days
        const createdAt = new Date((profile as any)?.created_at || Date.now()).getTime();
        const daysActive = (Date.now() - createdAt) / 86_400_000;
        if (daysActive < 7) return;

        // Condition B + C from community_events
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data: events, error } = await supabase
          .from("community_events" as any)
          .select("event_type, created_at")
          .eq("user_id", uid)
          .gte("created_at", since);

        if (error || !events || cancelled) return;

        const contentTypes = new Set([
          "post_view",
          "lesson_view",
          "replay_view",
          "module_view",
          "deal_view",
        ]);
        const contentUnits = (events as any[]).filter((e) => contentTypes.has(e.event_type)).length;
        if (contentUnits < 3) return;

        const sessionDays = new Set(
          (events as any[]).map((e) => new Date(e.created_at).toISOString().slice(0, 10))
        );
        if (sessionDays.size < 3) return;

        setShow(true);
      } catch {
        /* never block UX */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, hasCommunityAccess, onAnnual, profile]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  return { show, dismiss };
}
