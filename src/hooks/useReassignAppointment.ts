/**
 * useReassignAppointment — single legal client entrypoint to call the
 * server-side `reassign_appointment` RPC.
 *
 * IMPORTANT: This hook does NOT mutate appointments directly.
 * All ownership changes go through the SECURITY DEFINER RPC, which
 * enforces L6+/admin permission, status gates, and writes to
 * `appointment_reassignment_log`.
 *
 * Canon ties: Operational Canon (Layer 12) — ownership is auditable.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReassignmentType = "self_takeover" | "reassignment";
export type OwnerRole = "setter" | "closer";

export interface ReassignParams {
  appointmentId: string;
  newOwnerId: string;
  newOwnerRole: OwnerRole;
  reassignmentType: ReassignmentType;
  reason?: string;
  actionSource?: "manual" | "drag_and_drop";
  retainBlock?: boolean;
}

export interface ReassignResult {
  success: boolean;
  error?: string;
  appointment_id?: string;
  previous_owner_id?: string;
  previous_owner_role?: OwnerRole;
  new_owner_id?: string;
  new_owner_role?: OwnerRole;
  first_reassignment?: boolean;
  reassigned_at?: string;
}

const UNDO_WINDOW_MS = 6000;

const ERROR_COPY: Record<string, { de: string; en: string }> = {
  unauthenticated: { de: "Nicht angemeldet.", en: "Not signed in." },
  forbidden_level_below_l6: {
    de: "Nur Senior Closer (L6+) oder Admins dürfen Termine neu zuweisen.",
    en: "Only Senior Closers (L6+) or admins can reassign appointments.",
  },
  invalid_owner_role: { de: "Ungültige Rolle.", en: "Invalid role." },
  invalid_reassignment_type: { de: "Ungültiger Vorgang.", en: "Invalid action." },
  self_takeover_must_target_caller: {
    de: "Selbstübernahme muss auf dich zeigen.",
    en: "Self-takeover must target yourself.",
  },
  missing_new_owner: { de: "Kein neuer Eigentümer angegeben.", en: "Missing new owner." },
  new_owner_not_found: { de: "Neuer Eigentümer existiert nicht.", en: "New owner not found." },
  appointment_not_found: { de: "Termin nicht gefunden.", en: "Appointment not found." },
  appointment_not_active: {
    de: "Dieser Termin ist nicht mehr aktiv.",
    en: "This appointment is no longer active.",
  },
  already_owner: {
    de: "Diese Person ist bereits der aktuelle Eigentümer.",
    en: "This person already owns this appointment.",
  },
};

export function useReassignAppointment(onUndoSuccess?: () => void) {
  const [loading, setLoading] = useState(false);

  /** Undo a reassignment by reassigning back to the previous owner */
  async function undoReassign(
    appointmentId: string,
    previousOwnerId: string,
    previousOwnerRole: OwnerRole,
    actionSource: "manual" | "drag_and_drop",
  ) {
    try {
      const { data, error } = await supabase.rpc("reassign_appointment", {
        p_appointment_id: appointmentId,
        p_new_owner_id: previousOwnerId,
        p_new_owner_role: previousOwnerRole,
        p_reassignment_type: "reassignment" as const,
        p_reason: "undo_reassignment",
        _action_source: actionSource,
      });

      if (error || !(data as any)?.success) {
        toast.error("Rückgängig fehlgeschlagen", {
          description: error?.message || (data as any)?.error || "Unbekannter Fehler",
        });
        return;
      }

      toast.success("Zuweisung rückgängig gemacht");
      onUndoSuccess?.();
    } catch (err: any) {
      toast.error("Rückgängig fehlgeschlagen", {
        description: err?.message || "Unbekannter Fehler",
      });
    }
  }

  async function reassign(params: ReassignParams): Promise<ReassignResult> {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("reassign_appointment", {
        p_appointment_id: params.appointmentId,
        p_new_owner_id: params.newOwnerId,
        p_new_owner_role: params.newOwnerRole,
        p_reassignment_type: params.reassignmentType,
        p_reason: params.reason ?? null,
        _action_source: params.actionSource ?? "manual",
        p_retain_block: params.retainBlock ?? true,
      });

      if (error) {
        toast.error("Reassignment fehlgeschlagen", {
          description: error.message,
        });
        return { success: false, error: error.message };
      }

      const result = (data ?? {}) as unknown as ReassignResult;

      if (!result.success) {
        const copy = result.error ? ERROR_COPY[result.error] : undefined;
        toast.error("Reassignment abgelehnt", {
          description: copy?.de ?? result.error ?? "Unbekannter Fehler",
        });
        return result;
      }

      const description =
        params.reassignmentType === "self_takeover"
          ? "Du hast den Termin übernommen."
          : "Termin wurde neu zugewiesen.";

      // Show undo toast if we have previous owner info
      if (result.previous_owner_id && result.previous_owner_role) {
        const prevOwnerId = result.previous_owner_id;
        const prevOwnerRole = result.previous_owner_role;
        const apptId = result.appointment_id ?? params.appointmentId;
        const source = params.actionSource ?? "manual";

        toast.success("Termin neu zugewiesen", {
          description,
          duration: UNDO_WINDOW_MS,
          action: {
            label: "Rückgängig",
            onClick: () => undoReassign(apptId, prevOwnerId, prevOwnerRole, source),
          },
        });
      } else {
        toast.success("Termin neu zugewiesen", { description });
      }

      return result;
    } finally {
      setLoading(false);
    }
  }

  return { reassign, loading };
}
