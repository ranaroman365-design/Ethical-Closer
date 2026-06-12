import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type SegmentKey = "observer" | "participant" | "engaged" | "builder" | "a_player";

export interface SegmentFlags {
  consistent_user?: boolean;
  social_leader?: boolean;
  high_intent?: boolean;
  fast_responder?: boolean;
  upgrade_clicked?: boolean;
}

export interface UserSegmentData {
  segment: SegmentKey;
  score: number;
  raw_score: number;
  flags: SegmentFlags;
  is_aplayer: boolean;
  days_inactive: number | null;
  last_updated: string | null;
}

const SEGMENT_LABELS: Record<SegmentKey, { de: string; en: string }> = {
  observer:    { de: "Observer",    en: "Observer" },
  participant: { de: "Participant", en: "Participant" },
  engaged:     { de: "Engaged",     en: "Engaged" },
  builder:     { de: "Builder",     en: "Builder" },
  a_player:    { de: "A-Player",    en: "A-Player" },
};

export function segmentLabel(seg: SegmentKey, lang: "de" | "en" = "de") {
  return SEGMENT_LABELS[seg]?.[lang] ?? seg;
}

/**
 * Loads the current user's segment via the `get_user_segment` RPC.
 * Score includes inactivity decay (computed server-side on read).
 */
export function useUserSegment(targetUserId?: string) {
  const { user } = useAuth();
  const userId = targetUserId ?? user?.id;
  const [data, setData] = useState<UserSegmentData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data: res, error } = await supabase.rpc("get_user_segment" as never, { _user_id: userId } as never);
    if (!error && res) setData(res as unknown as UserSegmentData);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { segment: data, loading, refresh: load };
}

/**
 * Bulk fetch segments for multiple users (for leaderboards / feed badges).
 * Reads `user_segments` directly — RLS only returns rows the caller may see
 * (own row + admin/director gets all). For non-admin viewers, missing rows
 * are simply absent from the map (no badge shown), which is the correct UX.
 */
export function useUserSegmentsBulk(userIds: string[]) {
  const [map, setMap] = useState<Record<string, { segment: SegmentKey; score: number; flags: SegmentFlags }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userIds.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_segments" as never)
        .select("user_id, segment, score, flags")
        .in("user_id", userIds);
      if (cancelled) return;
      const next: typeof map = {};
      (data as any[] | null)?.forEach((row) => {
        next[row.user_id] = {
          segment: row.segment as SegmentKey,
          score: row.score,
          flags: row.flags ?? {},
        };
      });
      setMap(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userIds.join(",")]);

  return { map, loading };
}
