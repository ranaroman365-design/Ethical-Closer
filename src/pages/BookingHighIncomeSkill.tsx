import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Booking from "@/pages/Booking";
import { trackFunnelEvent } from "@/lib/track-event";

/**
 * Sprint 3 — Dedicated booking wrapper for /high-income-skill/booking.
 * Re-uses the unified Booking page but ensures funnel context is set.
 */
export default function BookingHighIncomeSkill() {
  const navigate = useNavigate();

  useEffect(() => {
    // Ensure funnel source context is preserved
    localStorage.setItem("source_funnel", "high-income-skill");
    trackFunnelEvent("BOOKING_STARTED", { funnel: "high-income-skill" });
  }, []);

  return <Booking />;
}
