import { useEffect } from "react";
import BookingPreFrame from "@/components/closerpath/BookingPreFrame";
import Booking from "@/pages/Booking";
import { trackCloserPath } from "@/lib/track-closerpath";

/**
 * /closerpath/booking — Conversion Layer (Non-Destructive Integration)
 *
 * Wraps the existing Booking page. Adds a pre-booking frame ABOVE the
 * existing calendar. Calendar logic, routing, and backend flow remain
 * UNCHANGED.
 */
const CloserPathBooking = () => {
  useEffect(() => {
    trackCloserPath("booking_viewed", { variant: "v2_preframe" });
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(var(--funnel-warm-bg))]">
      <BookingPreFrame />
      <Booking />
    </div>
  );
};

export default CloserPathBooking;
