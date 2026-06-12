/**
 * CuratedSlotPicker — Psychologically optimized slot picker
 *
 * Uses get_public_booking_slots RPC to show a curated subset of real
 * availability with scarcity labels. Supports reservation locking.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, Loader2, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isToday, isTomorrow, parseISO, format } from "date-fns";
import { de } from "date-fns/locale";

interface CuratedSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  slot_type: string;
}

interface DayGroup {
  date: string;
  day_offset: number;
  slots: CuratedSlot[];
  visible_count: number;
  scarcity_label: string;
}

interface CuratedData {
  days: DayGroup[];
  total_visible: number;
  generated_at: string;
}

interface CuratedSlotPickerProps {
  onSlotSelected: (slotId: string, startsAt: string) => void;
  disabled?: boolean;
  leadId?: string | null;
}

export default function CuratedSlotPicker({
  onSlotSelected,
  disabled,
  leadId,
}: CuratedSlotPickerProps) {
  const [data, setData] = useState<CuratedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MIN_LEAD_TIME_MS = 2 * 60 * 60 * 1000;
  const filterMinLeadTime = (d: CuratedData | null): CuratedData | null => {
    if (!d) return null;
    const cutoff = Date.now() + MIN_LEAD_TIME_MS;
    const filteredDays = d.days
      .map((day) => ({
        ...day,
        slots: day.slots.filter((s) => new Date(s.starts_at).getTime() >= cutoff),
      }))
      .filter((day) => day.slots.length > 0)
      .map((day) => ({ ...day, visible_count: day.slots.length }));
    const totalVisible = filteredDays.reduce((sum, day) => sum + day.visible_count, 0);
    return { ...d, days: filteredDays, total_visible: totalVisible };
  };

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data: result, error: rpcError } = await supabase.rpc(
        "get_public_booking_slots" as any,
        { p_timezone: tz, p_lead_id: leadId ?? null } as any
      );

      if (rpcError) throw rpcError;

      const parsed = result as unknown as CuratedData;
      if (!parsed?.days || parsed.days.length === 0) {
        // Trigger replenishment and retry once
        await supabase.rpc("replenish_visible_slots" as any);
        const { data: retry } = await supabase.rpc(
          "get_public_booking_slots" as any,
          { p_timezone: tz, p_lead_id: leadId ?? null } as any
        );
        setData(filterMinLeadTime((retry as unknown as CuratedData) ?? null));
      } else {
        setData(filterMinLeadTime(parsed));
      }
    } catch (e: any) {
      console.error("[CuratedSlotPicker] load failed", e);
      setError("Termine konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleSelect = async (slot: CuratedSlot) => {
    if (disabled || reserving) return;
    setSelectedSlot(slot.id);
    setReserving(true);

    try {
      // Reserve the slot atomically
      const { data: res, error: resErr } = await supabase.rpc(
        "reserve_booking_slot" as any,
        { p_slot_id: slot.id, p_lead_id: leadId ?? null } as any
      );

      const result = res as any;
      if (resErr || !result?.success) {
        // Slot taken — refresh
        setSelectedSlot(null);
        await loadSlots();
        return;
      }

      // Success — notify parent
      onSlotSelected(slot.id, slot.starts_at);
    } catch {
      setSelectedSlot(null);
      await loadSlots();
    } finally {
      setReserving(false);
    }
  };

  const dayLabel = (dateStr: string, offset: number): string => {
    const d = parseISO(dateStr + "T00:00:00");
    if (isToday(d)) return "Heute";
    if (isTomorrow(d)) return "Morgen";
    if (offset === 2) return "Übermorgen";
    return format(d, "EEEE, d. MMMM", { locale: de });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--funnel-grey))]" />
        <p className="font-sans text-sm text-[hsl(var(--funnel-grey))]">
          Verfügbare Termine werden geladen…
        </p>
      </div>
    );
  }

  if (error || !data || data.days.length === 0) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--funnel-sand))] bg-white p-8 text-center space-y-4">
        <Calendar className="mx-auto h-8 w-8 text-[hsl(var(--funnel-grey))]" />
        <p className="font-sans text-sm text-[hsl(var(--funnel-grey))]">
          {error || "Aktuell sind keine Termine verfügbar. Bitte versuche es später erneut."}
        </p>
        <button
          onClick={loadSlots}
          className="rounded-xl bg-[hsl(var(--funnel-gold))] px-5 py-2.5 font-sans text-sm font-semibold text-white hover:brightness-110 transition-all"
        >
          Erneut prüfen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Scarcity header */}
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="font-sans text-xs text-amber-800">
          Nächste freie Termine · Nur {data.total_visible} {data.total_visible === 1 ? "Termin" : "Termine"} verfügbar
        </p>
      </div>

      <AnimatePresence mode="sync">
        {data.days.map((day, dayIdx) => (
          <motion.div
            key={day.date}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIdx * 0.05, duration: 0.3 }}
            className="mb-4"
          >
            {/* Day header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="font-display text-sm font-semibold text-[hsl(30,10%,12%)]">
                {dayLabel(day.date, day.day_offset)}
              </h3>
              <span className="font-sans text-[11px] text-[hsl(var(--funnel-grey))]">
                {day.scarcity_label}
              </span>
            </div>

            {/* Slots */}
            <div className="space-y-2">
              {day.slots.map((slot, slotIdx) => {
                const start = new Date(slot.starts_at);
                const localTime = start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
                const localDate = start.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
                const isSelected = selectedSlot === slot.id;
                const isFirst = day.day_offset === 0 && slotIdx === 0;

                return (
                  <button
                    key={slot.id}
                    onClick={() => handleSelect(slot)}
                    disabled={disabled || reserving}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-[hsl(var(--funnel-gold))] bg-[hsl(var(--funnel-gold))]/5 ring-1 ring-[hsl(var(--funnel-gold))]"
                        : "border-[hsl(var(--funnel-sand))] bg-white hover:border-[hsl(var(--funnel-gold))]/40 hover:bg-[hsl(var(--funnel-gold))]/5",
                      (disabled || reserving) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Clock
                        className={cn(
                          "h-4 w-4",
                          isSelected ? "text-[hsl(var(--funnel-gold))]" : "text-[hsl(var(--funnel-grey))]"
                        )}
                      />
                      <div>
                        <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)]">
                          {localTime} Uhr
                        </p>
                        <p className="font-sans text-[11px] text-[hsl(var(--funnel-grey))]">
                          {localDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isFirst && (
                        <span className="rounded-lg bg-amber-100 px-2 py-0.5 font-sans text-[10px] font-bold text-amber-700">
                          Empfohlen
                        </span>
                      )}
                      {isSelected && (
                        reserving ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--funnel-gold))]" />
                        ) : (
                          <Check className="h-4 w-4 text-[hsl(var(--funnel-gold))]" />
                        )
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Footer */}
      <p className="mt-4 text-center font-sans text-[11px] text-[hsl(var(--funnel-grey))]">
        Weitere passende Termine werden automatisch freigeschaltet.
      </p>
    </div>
  );
}
