/**
 * useCalendarDragDrop — HTML5 drag-and-drop for calendar reschedule.
 *
 * Flow: drag appointment → drop on time slot → confirm dialog → RPC → undo toast.
 * Uses reschedule_appointment RPC. All mutations server-side, atomic, auditable.
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DragData {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  leadId: string | null;
  leadName: string | null;
  currentOwnerId: string | null;
  appointmentStatus: string | null;
}

export interface DropTarget {
  date: string; // yyyy-MM-dd
  hour: number;
  minute: number;
}

export interface PendingDrop {
  data: DragData;
  target: DropTarget;
  newStart: Date;
  newEnd: Date;
}

const DRAG_MIME = "application/x-etc-appointment";
const UNDO_WINDOW_MS = 6000;

/** Statuses that block drag */
const NON_DRAGGABLE = ["cancelled", "completed", "no_show", "rescheduled", "closed_won", "closed_lost"];

export function canDragAppointment(_status: string | null): boolean {
  // Drag-and-drop is disabled by policy — appointments may only be rescheduled
  // or reassigned through explicit actions, not via drag/drop.
  return false;
}

export function useCalendarDragDrop(onSuccess: () => void) {
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const dragRef = useRef<DragData | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, data: DragData) => {
      if (!canDragAppointment(data.appointmentStatus)) {
        e.preventDefault();
        return;
      }
      dragRef.current = data;
      setDragging(data);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(data));
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.5";
      }
    },
    []
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragging(null);
    setDropTarget(null);
    dragRef.current = null;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, target: DropTarget) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(target);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, target: DropTarget) => {
      e.preventDefault();
      setDropTarget(null);

      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;

      let data: DragData;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      setDragging(null);
      dragRef.current = null;

      if (!data.appointmentId || !data.leadId) {
        toast.error("Verschieben nicht möglich", {
          description: "Termin hat keinen verknüpften Lead.",
        });
        return;
      }

      // Calculate new start time
      const oldStart = new Date(data.startsAt);
      const oldEnd = new Date(data.endsAt);
      const durationMs = oldEnd.getTime() - oldStart.getTime();

      const newStart = new Date(`${target.date}T${String(target.hour).padStart(2, "0")}:${String(target.minute).padStart(2, "0")}:00`);
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Skip if same time
      if (
        oldStart.getFullYear() === newStart.getFullYear() &&
        oldStart.getMonth() === newStart.getMonth() &&
        oldStart.getDate() === newStart.getDate() &&
        oldStart.getHours() === newStart.getHours() &&
        oldStart.getMinutes() === newStart.getMinutes()
      ) {
        return;
      }

      // Future check
      if (newStart.getTime() < Date.now()) {
        toast.error("Ungültige Zeit", {
          description: "Termine können nur in die Zukunft verschoben werden.",
        });
        return;
      }

      // Stage the drop for confirmation
      setPendingDrop({ data, target, newStart, newEnd });
    },
    []
  );

  /** Undo a reschedule by rescheduling the new appointment back to the original time */
  const undoReschedule = useCallback(
    async (newApptId: string, originalStart: string, originalEnd: string) => {
      try {
        const { data: result, error } = await supabase.rpc("reschedule_appointment", {
          _old_id: newApptId,
          _new_starts_at: originalStart,
          _new_ends_at: originalEnd,
          _reason: "undo_drag_and_drop",
          _action_source: "drag_and_drop",
        });

        if (error || (result as any)?.success === false) {
          toast.error("Rückgängig fehlgeschlagen", {
            description: error?.message || (result as any)?.error || "Unbekannter Fehler",
          });
          return;
        }

        toast.success("Verschiebung rückgängig gemacht");
        onSuccess();
      } catch (err: any) {
        toast.error("Rückgängig fehlgeschlagen", {
          description: err?.message || "Unbekannter Fehler",
        });
      }
    },
    [onSuccess]
  );

  /** Execute the confirmed drop */
  const confirmDrop = useCallback(async () => {
    if (!pendingDrop) return;
    const { data, newStart, newEnd } = pendingDrop;
    const originalStart = data.startsAt;
    const originalEnd = data.endsAt;
    setPendingDrop(null);
    setProcessing(true);

    try {
      const { data: result, error } = await supabase.rpc("reschedule_appointment", {
        _old_id: data.appointmentId,
        _new_starts_at: newStart.toISOString(),
        _new_ends_at: newEnd.toISOString(),
        _reason: "drag_and_drop_reschedule",
        _action_source: "drag_and_drop",
      });

      if (error) {
        toast.error("Verschieben fehlgeschlagen", {
          description: error.message,
        });
        return;
      }

      const res = result as any;
      if (res && res.success === false) {
        toast.error("Verschieben abgelehnt", {
          description: res.error || "Unbekannter Fehler",
        });
        return;
      }

      const newApptId = res?.new_id ?? res?.appointment_id ?? null;
      const timeLabel = `${data.leadName || "Termin"} → ${newStart.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })} um ${newStart.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}`;

      if (newApptId) {
        toast.success("✓ Termin verschoben", {
          description: timeLabel,
          duration: UNDO_WINDOW_MS,
          action: {
            label: "Rückgängig",
            onClick: () => undoReschedule(newApptId, originalStart, originalEnd),
          },
        });
      } else {
        toast.success("✓ Termin verschoben", {
          description: timeLabel,
        });
      }
      onSuccess();
    } catch (err: any) {
      toast.error("Fehler", {
        description: err?.message || "Unbekannter Fehler",
      });
    } finally {
      setProcessing(false);
    }
  }, [pendingDrop, onSuccess, undoReschedule]);

  /** Cancel the pending drop */
  const cancelDrop = useCallback(() => {
    setPendingDrop(null);
  }, []);

  return {
    dragging,
    dropTarget,
    processing,
    pendingDrop,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    confirmDrop,
    cancelDrop,
  };
}
