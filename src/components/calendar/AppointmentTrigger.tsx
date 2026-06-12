// Calendar Deep-Link · Layer 50
// Universal trigger. Wrap any element with <AppointmentTrigger appointmentId="...">child</AppointmentTrigger>
// to make it open the appointment detail modal on click. Zero page reloads.

import { useState, type ReactNode, type MouseEvent } from "react";
import { AppointmentDetailModal } from "./AppointmentDetailModal";

interface Props {
  appointmentId: string;
  children: ReactNode;
  className?: string;
  asChild?: boolean;
  /** Optional surface name for audit logging (e.g. "calendar", "operator-calendar", "setter-appointments") */
  source?: string;
}

export function AppointmentTrigger({ appointmentId, children, className, asChild, source }: Props) {
  const [open, setOpen] = useState(false);
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Client-side breadcrumb — visible in browser console + Lovable preview logs
    // eslint-disable-next-line no-console
    console.info("[AppointmentModal] trigger.click", {
      appointmentId,
      source: source ?? "unknown",
      ts: new Date().toISOString(),
    });
    setOpen(true);
  };
  return (
    <>
      {asChild ? (
        <span onClick={handleClick} className={className} role="button" tabIndex={0}>
          {children}
        </span>
      ) : (
        <button type="button" onClick={handleClick} className={className}>
          {children}
        </button>
      )}
      <AppointmentDetailModal
        appointmentId={appointmentId}
        open={open}
        onOpenChange={setOpen}
        source={source}
      />
    </>
  );
}
