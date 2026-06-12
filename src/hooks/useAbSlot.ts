import { useMemo } from "react";
import { getAbSlot, type AbSlotDef, type AbSlotAssignment } from "@/lib/ab-multivariant";

/**
 * React-Hook für einen multivariant A/B-Slot. Liefert die sticky Variante
 * für die aktuelle Browser-Session. Reagiert nicht auf Live-Änderungen der
 * Server-Gewichte (bewusst — keine Re-Bucketing-Flicker).
 */
export function useAbSlot(def: AbSlotDef): AbSlotAssignment {
  // useMemo mit slot-id als Key, damit eine Komponente bei Slot-Wechsel
  // korrekt neu zuteilt. Variantenliste muss stabil sein.
  return useMemo(() => getAbSlot(def), [def.slot]);
}
