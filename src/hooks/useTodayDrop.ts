import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TodayDrop {
  id: string;
  title: string;
  content: string;
  drop_type: string | null;
  format: string;
  scheduled_for: string;
  scheduled_time: string | null;
  published_at: string | null;
  author_type: string;
  priority: number;
  cta_label?: string | null;
  cta_url?: string | null;
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Sunday Reflection",
  1: "Monday Insight",
  2: "Tuesday Question",
  3: "Wednesday Win",
  4: "Thursday Drop",
  5: "Friday Founder Note",
  6: "Saturday Social",
};

export function getDropLabel(dropType: string | null, scheduledFor: string): string {
  const dow = new Date(scheduledFor).getUTCDay();
  return WEEKDAY_LABELS[dow] ?? (dropType ?? "Daily Drop");
}

/** Returns today's drop + the most recent published drop (yesterday) */
export function useTodayDrop() {
  const [today, setToday] = useState<TodayDrop | null>(null);
  const [yesterday, setYesterday] = useState<TodayDrop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      const { data: t } = await supabase
        .from("community_drops")
        .select("*")
        .eq("published", true)
        .eq("scheduled_for", todayStr)
        .order("priority", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: y } = await supabase
        .from("community_drops")
        .select("*")
        .eq("published", true)
        .lt("scheduled_for", todayStr)
        .order("scheduled_for", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      setToday((t as TodayDrop) ?? null);
      setYesterday((y as TodayDrop) ?? null);
      setLoading(false);

      // Track view (atomic)
      if (t?.id) {
        supabase.rpc("increment_drop_view" as never, { _drop_id: t.id } as never);
      }
    })();
    return () => { active = false; };
  }, []);

  return { today, yesterday, loading };
}
