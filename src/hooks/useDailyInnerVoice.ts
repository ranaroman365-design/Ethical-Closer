import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InnerVoicePost {
  id: string;
  title: string;
  scenario_type: "objection" | "closing" | "mindset" | "breakthrough" | "deal" | "mistake";
  content: string;
  lesson: string;
  difficulty_level: number;
  display_order: number;
}

const STORAGE_KEY = "etc_inner_voice_today";

interface CachedPick { date: string; postId: string }

/** Picks one post per local day, rotates least-recently-shown. */
export function useDailyInnerVoice() {
  const [post, setPost] = useState<InnerVoicePost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      // Try to reuse today's pick from local cache (UI stability per session)
      let cached: CachedPick | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) cached = JSON.parse(raw) as CachedPick;
      } catch { /* ignore */ }

      if (cached?.date === today) {
        const { data } = await supabase
          .from("inner_voice_posts")
          .select("*")
          .eq("id", cached.postId)
          .maybeSingle();
        if (active && data) {
          setPost(data as InnerVoicePost);
          setLoading(false);
          return;
        }
      }

      // Fetch least-recently-shown (NULLS first means never shown wins)
      const { data: candidates } = await supabase
        .from("inner_voice_posts")
        .select("*")
        .eq("is_published", true)
        .order("last_shown_at", { ascending: true, nullsFirst: true })
        .order("shown_count", { ascending: true })
        .limit(5);

      if (!candidates?.length) {
        if (active) setLoading(false);
        return;
      }

      // Deterministic pick within today's candidate set (stable per day)
      const idx = Math.abs(hashStr(today)) % candidates.length;
      const picked = candidates[idx] as InnerVoicePost;

      // Mark shown (best-effort)
      supabase
        .from("inner_voice_posts")
        .update({
          last_shown_at: new Date().toISOString(),
          shown_count: (candidates[idx] as { shown_count: number }).shown_count + 1,
        } as never)
        .eq("id", picked.id)
        .then(() => undefined);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, postId: picked.id }));
      } catch { /* ignore */ }

      if (active) {
        setPost(picked);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { post, loading };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
