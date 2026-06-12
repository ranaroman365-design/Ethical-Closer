import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, UserRound, Info, Clock3, Loader2 } from "lucide-react";

type Props = {
  appointmentId: string;
};

type AppointmentRow = {
  id: string;
  setter_id: string | null;
  booking_source: string | null;
  attribution_snapshot: any;
  fastlane_amount_cents: number | null;
  starts_at: string | null;
};

type SetterProfile = {
  full_name: string | null;
  avatar_url: string | null;
  business_stage: string | null;
};

const REASON_LABEL: Record<string, { label: string; tone: "neutral" | "info" | "warn" }> = {
  no_setter_available: { label: "Kein Setter im 5-Tage-Fenster verfügbar", tone: "info" },
  outside_business_hours: { label: "Außerhalb der Setter-Zeiten gebucht", tone: "info" },
  manual_override: { label: "Manuell auf Fastlane gesetzt", tone: "neutral" },
  capacity_exceeded: { label: "Setter-Kapazität überschritten", tone: "warn" },
  fastlane_priority_paid: { label: "Priority-Zahlung — direkter Zugang zum Closer", tone: "neutral" },
  ok: { label: "Standard-Zuweisung", tone: "neutral" },
};

function deriveReason(row: AppointmentRow): { key: string; label: string; tone: string } {
  const explicit = row.attribution_snapshot?.routing_reason;
  if (explicit && REASON_LABEL[explicit]) {
    return { key: explicit, ...REASON_LABEL[explicit] };
  }
  if (row.fastlane_amount_cents != null) {
    return { key: "fastlane_priority_paid", ...REASON_LABEL.fastlane_priority_paid };
  }
  // Heuristic fallback by booking_source
  const src = (row.booking_source || "").toLowerCase();
  if (src.includes("no_setter")) return { key: "no_setter_available", ...REASON_LABEL.no_setter_available };
  if (src.includes("manual")) return { key: "manual_override", ...REASON_LABEL.manual_override };
  if (src.includes("capacity")) return { key: "capacity_exceeded", ...REASON_LABEL.capacity_exceeded };
  return { key: "ok", ...REASON_LABEL.ok };
}

export function FastlaneAssignmentStatus({ appointmentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [appt, setAppt] = useState<AppointmentRow | null>(null);
  const [setter, setSetter] = useState<SetterProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function load() {
      attempts += 1;
      const { data, error } = await supabase
        .from("appointments")
        .select("id, setter_id, booking_source, attribution_snapshot, fastlane_amount_cents, starts_at")
        .eq("id", appointmentId)
        .maybeSingle();
      if (cancelled) return;

      if (error || !data) {
        if (attempts < 5) setTimeout(load, 1500);
        else setLoading(false);
        return;
      }

      setAppt(data as AppointmentRow);

      if (data.setter_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, business_stage")
          .eq("id", data.setter_id)
          .maybeSingle();
        if (!cancelled) setSetter((prof as SetterProfile) ?? null);
      } else if (attempts < 5) {
        // Webhook may still be assigning — retry briefly.
        setTimeout(load, 1500);
        return;
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  if (loading) {
    return (
      <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6 flex items-center gap-3 text-sm text-[hsl(var(--funnel-grey))]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wir bestätigen die Zuweisung deines Termins…
      </div>
    );
  }
  if (!appt) return null;

  const reason = deriveReason(appt);
  const isFastlane = appt.fastlane_amount_cents != null;
  const setterName = setter?.full_name?.trim();
  const stage = setter?.business_stage;

  return (
    <section className="mb-8">
      <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6">
        <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[hsl(var(--funnel-teal))]" />
          Deine Zuweisung
        </h2>

        {/* Wer */}
        <div className="flex items-start gap-4 mb-5">
          <div className="h-12 w-12 shrink-0 rounded-full overflow-hidden bg-[hsl(var(--funnel-sand))]/40 flex items-center justify-center">
            {setter?.avatar_url ? (
              <img src={setter.avatar_url} alt={setterName ?? "Berater"} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6 text-[hsl(var(--funnel-grey))]" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-sans text-xs uppercase tracking-wide text-[hsl(var(--funnel-grey))] mb-0.5">
              Dein Gesprächspartner
            </p>
            <p className="font-display text-base font-semibold text-[hsl(30,10%,12%)]">
              {setterName || (appt.setter_id ? "Wird gerade zugewiesen…" : "Direkter Closer-Termin")}
            </p>
            {stage && (
              <p className="font-sans text-xs text-[hsl(var(--funnel-grey))] mt-0.5">{stage}</p>
            )}
          </div>
        </div>

        {/* Warum */}
        <div className="rounded-sm border border-[hsl(var(--funnel-sand))]/60 bg-[hsl(var(--funnel-sand))]/10 p-4">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--funnel-teal))]" />
            <div className="flex-1">
              <p className="font-sans text-xs uppercase tracking-wide text-[hsl(var(--funnel-grey))] mb-1">
                {isFastlane ? "Fastlane aktiv" : "Routing"}
              </p>
              <p className="font-sans text-sm text-[hsl(30,10%,12%)] font-medium">{reason.label}</p>
              {isFastlane && (
                <p className="font-sans text-xs text-[hsl(var(--funnel-grey))] mt-1.5 leading-relaxed">
                  Wir haben deinen Termin bewusst priorisiert, damit du nicht warten musst.
                  Dein Closer ist vorab über dein Profil informiert.
                </p>
              )}
            </div>
          </div>
        </div>

        {appt.starts_at && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[hsl(var(--funnel-grey))]">
            <Clock3 className="h-3.5 w-3.5" />
            Eine Erinnerung erhältst du rechtzeitig per E-Mail und WhatsApp.
          </div>
        )}
      </div>
    </section>
  );
}

export default FastlaneAssignmentStatus;
