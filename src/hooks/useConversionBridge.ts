import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface BridgeEvaluation {
  days_active: number;
  credits: number;
  posts_count: number;
  comments_count: number;
  triggers_fired: string[];
  eligible_trigger: string | null;
  cta_type: "curiosity" | "identity" | "progress" | null;
  offer_id: string | null;
  cooldown_ok: boolean;
  show_allowed: boolean;
}

export interface MidTicketOffer {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  price_cents: number;
  currency: string;
  unlock_credits: number;
  checkout_url: string | null;
}

/** Returns the bridge that should be shown right now (or null if none). */
export function useConversionBridge() {
  const { user } = useAuth();
  const [evaluation, setEvaluation] = useState<BridgeEvaluation | null>(null);
  const [offer, setOffer] = useState<MidTicketOffer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc(
        "evaluate_conversion_triggers" as never,
        { _user_id: user.id } as never
      );
      if (!active) return;
      if (error || !data) { setLoading(false); return; }
      const ev = data as unknown as BridgeEvaluation;
      setEvaluation(ev);

      if (ev.offer_id) {
        const { data: o } = await supabase
          .from("mid_ticket_offers")
          .select("*")
          .eq("id", ev.offer_id)
          .maybeSingle();
        if (active && o) setOffer(o as MidTicketOffer);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  async function markShown() {
    if (!user?.id || !evaluation?.eligible_trigger || !evaluation.cta_type) return;
    await supabase.rpc(
      "mark_bridge_shown" as never,
      {
        _user_id: user.id,
        _trigger: evaluation.eligible_trigger,
        _cta_type: evaluation.cta_type,
      } as never
    );
  }

  return { evaluation, offer, loading, markShown };
}
