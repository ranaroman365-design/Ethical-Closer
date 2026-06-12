import { motion } from "framer-motion";
import { Check, Clock, Shield, Users } from "lucide-react";

/**
 * Pre-booking conversion frame for /closerpath/booking.
 * Renders ABOVE the existing Booking calendar (which is unchanged).
 *
 * Principle: Clarity → Trust → Commitment → Booking
 * Effect: Increases show-up rate + decision confidence WITHOUT touching
 * calendar logic, routing, or backend flow.
 */
const BookingPreFrame = () => (
  <motion.section
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="mx-auto mb-10 max-w-2xl space-y-8 px-6 pt-12 md:pt-16"
  >
    {/* Headline */}
    <header className="space-y-3 text-center">
      <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Next step
      </p>
      <h1 className="font-display text-3xl font-semibold leading-tight text-foreground md:text-4xl">
        Your next step: Qualification Call
      </h1>
      <p className="font-sans text-base text-muted-foreground md:text-lg">
        This call determines if and how you can enter the system.
      </p>
    </header>

    {/* What happens on the call */}
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="mb-4 font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        On this call, we will:
      </p>
      <ul className="space-y-3">
        {[
          "review your profile",
          "assess your starting point",
          "show you the exact next steps",
        ].map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 font-sans text-base text-foreground"
          >
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
        <div className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-primary" />
          Duration: 20–30 minutes
        </div>
        <div className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-primary" />
          Direct, structured, no fluff
        </div>
      </div>
    </div>

    {/* Positioning shift */}
    <div className="border-l-2 border-primary/60 pl-5">
      <p className="font-display text-lg font-medium leading-relaxed text-foreground md:text-xl">
        This is not a sales call.
        <br />
        <span className="text-muted-foreground">
          This is a qualification process.
        </span>
      </p>
    </div>

    {/* Commitment filter */}
    <div className="rounded-lg bg-muted/40 p-5">
      <p className="mb-3 font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        We only move forward with people who are willing to:
      </p>
      <ul className="space-y-2">
        {[
          "take ownership",
          "follow a system",
          "execute consistently",
        ].map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 font-sans text-sm text-foreground/90"
          >
            <Check className="h-4 w-4 shrink-0 text-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>

    {/* Micro-proof */}
    <div className="flex items-start gap-3 font-sans text-sm leading-relaxed text-muted-foreground md:text-base">
      <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p>
        People who go through this process typically gain clarity immediately,
        understand their real starting point, and see a clear path forward.
      </p>
    </div>

    {/* Soft urgency */}
    <p className="text-center font-sans text-xs text-muted-foreground">
      Available slots are limited each week.
    </p>
  </motion.section>
);

export default BookingPreFrame;
