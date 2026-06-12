import { useMemo } from "react";
import { deriveLeadQuality, type LeadQuality } from "@/lib/canonical-decision-engine";

export type LeadQualityTier = "high" | "medium" | "low";
export type CalendarType = "priority" | "standard" | "orientation";

interface LeadQualityResult {
  tier: LeadQualityTier;
  score: number;
  showPriority: boolean;
  maxVisibleSlots: number | null; // null = unlimited
  /** Primary calendar to show first (matches availability_slots.slot_type). */
  calendarType: CalendarType;
  /** Ordered fallback chain if primary calendar is empty. */
  fallbackChain: CalendarType[];
  /** Whether to surface the 27€ Community entry CTA alongside the calendar. */
  showCommunityCTA: boolean;
}

/**
 * Derives lead quality tier from localStorage qualification data
 * using the Canonical Decision Engine (Layer 51).
 * Determines slot visibility and priority access.
 *
 * High (70-100): All slots + priority
 * Medium (40-69): Standard + limited priority
 * Low (0-39): Restricted slots, no priority
 */
export function useLeadQuality(): LeadQualityResult {
  return useMemo(() => {
    const bucket = localStorage.getItem("qualification_bucket");
    const rawScore = localStorage.getItem("qualification_score");
    const score = rawScore ? parseInt(rawScore, 10) : 0;
    const rawLeadQuality = localStorage.getItem("lead_quality");

    // Canonical Decision Engine derives quality from all available signals
    const canonicalQuality: LeadQuality = deriveLeadQuality({
      qualification_bucket: bucket,
      lead_quality: rawLeadQuality,
      qualification_score: score,
    });

    // Map canonical LeadQuality → LeadQualityTier (mid → medium for legacy compat)
    const tier: LeadQualityTier =
      canonicalQuality === "high" ? "high" :
      canonicalQuality === "mid" ? "medium" :
      "low";

    const config: Record<
      LeadQualityTier,
      {
        showPriority: boolean;
        maxVisibleSlots: number | null;
        calendarType: CalendarType;
        fallbackChain: CalendarType[];
        showCommunityCTA: boolean;
      }
    > = {
      high: {
        showPriority: true,
        maxVisibleSlots: null,
        calendarType: "priority",
        fallbackChain: ["priority", "standard"],
        showCommunityCTA: false,
      },
      medium: {
        showPriority: true,
        maxVisibleSlots: null,
        calendarType: "standard",
        fallbackChain: ["standard", "priority"],
        showCommunityCTA: false,
      },
      // Low: NO dead-end. Show limited orientation slots + Community CTA.
      low: {
        showPriority: false,
        maxVisibleSlots: 2, // 1–2 weekly orientation slots
        calendarType: "orientation",
        fallbackChain: ["orientation", "standard"],
        showCommunityCTA: true,
      },
    };

    return {
      tier,
      score,
      ...config[tier],
    };
  }, []);
}
