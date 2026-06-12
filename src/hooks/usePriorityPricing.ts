import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PricingTier {
  tier_key: string;
  price_cents: number;
  label: string;
  is_current: boolean;
}

interface PriorityPricing {
  currentTier: PricingTier | null;
  allTiers: PricingTier[];
  priceFormatted: string;
  loading: boolean;
}

/**
 * Fetches the current dynamic priority pricing.
 * Price is calculated ONCE on mount and stays stable for the session (no price jumps).
 */
export function usePriorityPricing(): PriorityPricing {
  const [allTiers, setAllTiers] = useState<PricingTier[]>([]);
  const [currentTier, setCurrentTier] = useState<PricingTier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchPricing = async () => {
      const { data, error } = await supabase.rpc("get_priority_pricing");

      if (!error && data && mounted) {
        const tiers = data as PricingTier[];
        setAllTiers(tiers);
        const active = tiers.find((t) => t.is_current) ?? tiers[0] ?? null;
        setCurrentTier(active);
      }
      if (mounted) setLoading(false);
    };

    fetchPricing();
    return () => { mounted = false; };
  }, []); // Intentionally no deps – price locked per session

  const priceFormatted = currentTier
    ? `${(currentTier.price_cents / 100).toFixed(0)}€`
    : "–";

  return { currentTier, allTiers, priceFormatted, loading };
}
