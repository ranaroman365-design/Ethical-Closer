import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, ChevronRight, Loader2, Check, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { usePriorityPricing } from "@/hooks/usePriorityPricing";
import { PriorityPriceBadge, ScarcityBanner } from "./PriorityPriceBadge";

interface Slot {
  id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  slot_type: string;
  current_bookings: number;
  max_bookings: number;
}

type SlotType = "standard" | "priority" | "orientation";

interface SlotPickerProps {
  /** Primary calendar/slot_type to load. */
  callType: SlotType;
  onSlotSelected: (slotId: string, startsAt: string, priceCents?: number, pricingTier?: string) => void;
  disabled?: boolean;
  maxVisibleSlots?: number | null;
  /**
   * Ordered fallback list of slot_types to try if `callType` returns no slots.
   * Guarantees the user always sees at least one bookable option.
   */
  fallbackChain?: SlotType[];
  /** Notifies parent when fallback was activated, with the actually-shown slot_type. */
  onCalendarResolved?: (resolvedType: SlotType, usedFallback: boolean) => void;
}

type DayFilter = "today" | "tomorrow" | "this_week";

const triggerReplenishment = async () => {
  try {
    await supabase.functions.invoke("generate-availability-slots", {
      body: { replenish: true },
    });
  } catch {
    // Silent
  }
};

export default function SlotPicker({
  callType,
  onSlotSelected,
  disabled,
  maxVisibleSlots,
  fallbackChain,
  onCalendarResolved,
}: SlotPickerProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState<DayFilter | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [resolvedType, setResolvedType] = useState<SlotType>(callType);

  const isPriority = resolvedType === "priority";
  const pricing = usePriorityPricing();

  const loadSlots = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    // Try primary type first, then walk the fallback chain.
    const chain: SlotType[] = [callType, ...((fallbackChain ?? []).filter(t => t !== callType))];

    let chosenType: SlotType = callType;
    let bookable: Slot[] = [];

    for (const type of chain) {
      const { data, error } = await supabase
        .from("availability_slots")
        .select("id, date, starts_at, ends_at, slot_type, current_bookings, max_bookings")
        .eq("slot_type", type)
        .eq("is_active", true)
        .gt("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(200);

      if (!error && data) {
        const filtered = data.filter(s => s.current_bookings < s.max_bookings);
        if (filtered.length > 0) {
          chosenType = type;
          bookable = filtered;
          break;
        }
      }
    }

    // Last resort: trigger replenishment for the primary type and re-query.
    if (bookable.length === 0) {
      await triggerReplenishment();
      const { data: fresh } = await supabase
        .from("availability_slots")
        .select("id, date, starts_at, ends_at, slot_type, current_bookings, max_bookings")
        .eq("slot_type", callType)
        .eq("is_active", true)
        .gt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(200);
      if (fresh) {
        bookable = fresh.filter(s => s.current_bookings < s.max_bookings);
        chosenType = callType;
      }
    }

    // Filter out slots within 2h minimum lead time (client-side)
    const minLeadCutoff = Date.now() + 2 * 60 * 60 * 1000;
    bookable = bookable.filter(s => new Date(s.starts_at).getTime() >= minLeadCutoff);

    setSlots(bookable);
    setResolvedType(chosenType);
    onCalendarResolved?.(chosenType, chosenType !== callType);

    // Top-up in background if still below threshold (non-blocking)
    const MIN_THRESHOLD = chosenType === "priority" ? 3 : 8;
    if (bookable.length < MIN_THRESHOLD) {
      triggerReplenishment().catch(() => {});
    }

    setLoading(false);
  }, [callType, fallbackChain, onCalendarResolved]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const filteredSlots = useMemo(() => {
    if (!dayFilter) return [];
    let result = slots.filter(s => {
      const d = parseISO(s.starts_at);
      if (dayFilter === "today") return isToday(d);
      if (dayFilter === "tomorrow") return isTomorrow(d);
      if (dayFilter === "this_week") return isThisWeek(d, { weekStartsOn: 1 });
      return true;
    });
    // Apply lead-quality slot cap
    if (maxVisibleSlots != null && maxVisibleSlots > 0) {
      result = result.slice(0, maxVisibleSlots);
    }
    return result;
  }, [slots, dayFilter, maxVisibleSlots]);

  const defaultCount = isPriority ? 3 : 5;
  const displaySlots = showAll ? filteredSlots : filteredSlots.slice(0, defaultCount);

  const dayOptions: { key: DayFilter; label: string; count: number }[] = [
    { key: "today", label: "Heute", count: slots.filter(s => isToday(parseISO(s.starts_at))).length },
    { key: "tomorrow", label: "Morgen", count: slots.filter(s => isTomorrow(parseISO(s.starts_at))).length },
    { key: "this_week", label: "Diese Woche", count: slots.filter(s => isThisWeek(parseISO(s.starts_at), { weekStartsOn: 1 })).length },
  ];

  const visibleDayOptions = isPriority
    ? dayOptions.filter(o => o.key !== "this_week")
    : dayOptions.filter(o => o.key !== "today" || o.count > 0);

  const hasAnySlots = visibleDayOptions.some(o => o.count > 0);

  const handleSelect = (slotId: string, startsAt: string) => {
    setSelectedSlot(slotId);
    if (isPriority && pricing.currentTier) {
      onSlotSelected(slotId, startsAt, pricing.currentTier.price_cents, pricing.currentTier.tier_key);
    } else {
      onSlotSelected(slotId, startsAt);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white/70 p-8 text-center space-y-4">
        <Calendar className="mx-auto mb-3 h-8 w-8 text-[hsl(var(--funnel-grey))]" />
        <p className="text-sm text-[hsl(var(--funnel-grey))]">Termine werden geladen…</p>
        <button
          onClick={() => { triggerReplenishment().then(() => loadSlots()); }}
          className="rounded-sm bg-[hsl(var(--funnel-teal))] px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        >
          Verfügbarkeit aktualisieren
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Priority: Price badge + scarcity */}
      {isPriority && pricing.currentTier && (
        <div className="space-y-2">
          <PriorityPriceBadge
            tierKey={pricing.currentTier.tier_key}
            priceFormatted={pricing.priceFormatted}
            label={pricing.currentTier.label}
            availableSlots={slots.length}
          />
          <ScarcityBanner availableSlots={slots.length} />
        </div>
      )}

      {/* Day filter */}
      {!dayFilter && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <p className="font-sans text-sm font-medium text-[hsl(var(--funnel-grey))]">Wann passt es dir?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {visibleDayOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => opt.count > 0 && setDayFilter(opt.key)}
                disabled={opt.count === 0 || disabled}
                className={cn(
                  "flex items-center justify-between rounded-sm border p-4 text-left transition-all",
                  opt.count > 0
                    ? isPriority
                      ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10"
                      : "border-[hsl(var(--funnel-sand))] bg-white hover:border-[hsl(var(--funnel-teal))]/50 hover:bg-[hsl(var(--funnel-teal))]/5"
                    : "border-[hsl(var(--funnel-sand))] bg-[hsl(var(--funnel-sand))]/30 opacity-50 cursor-not-allowed"
                )}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {isPriority && opt.count > 0 && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)]">{opt.label}</p>
                  </div>
                  <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">
                    {opt.count} {opt.count === 1 ? "Slot" : "Slots"} verfügbar
                  </p>
                </div>
                {opt.count > 0 && <ChevronRight className="h-4 w-4 text-[hsl(var(--funnel-grey))]" />}
              </button>
            ))}

            {!hasAnySlots && slots.length > 0 && (
              <button
                onClick={() => setDayFilter("this_week")}
                className="flex items-center justify-between rounded-sm border border-[hsl(var(--funnel-teal))]/30 bg-[hsl(var(--funnel-teal))]/5 p-4 text-left transition-all hover:border-[hsl(var(--funnel-teal))]/50 sm:col-span-3"
              >
                <div>
                  <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)]">Nächste verfügbare Termine</p>
                  <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">{slots.length} Termine anzeigen</p>
                </div>
                <ChevronRight className="h-4 w-4 text-[hsl(var(--funnel-teal))]" />
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Slot list */}
      {dayFilter && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-sans text-sm font-medium text-muted-foreground">Wähle deinen Termin</p>
            <button
              onClick={() => { setDayFilter(null); setSelectedSlot(null); setShowAll(false); }}
              className="font-sans text-xs text-primary hover:underline"
            >
              ← Zurück
            </button>
          </div>

          {filteredSlots.length === 0 && slots.length > 0 ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground py-2">
                Für diesen Zeitraum keine Termine – hier sind die nächsten verfügbaren:
              </p>
              <div className="space-y-2">
                {slots.slice(0, defaultCount).map(slot => (
                  <SlotButton key={slot.id} slot={slot} isPriority={isPriority} isSelected={selectedSlot === slot.id} disabled={disabled} onSelect={handleSelect} />
                ))}
                {slots.length > defaultCount && !showAll && (
                  <ShowMoreButton count={slots.length - defaultCount} onClick={() => setShowAll(true)} />
                )}
                {showAll && slots.slice(defaultCount).map(slot => (
                  <SlotButton key={slot.id} slot={slot} isPriority={isPriority} isSelected={selectedSlot === slot.id} disabled={disabled} onSelect={handleSelect} />
                ))}
              </div>
            </div>
          ) : filteredSlots.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Keine Slots für diesen Zeitraum.</p>
          ) : (
            <div className="space-y-2">
              {displaySlots.map(slot => (
                <SlotButton key={slot.id} slot={slot} isPriority={isPriority} isSelected={selectedSlot === slot.id} disabled={disabled} onSelect={handleSelect} />
              ))}
              {!showAll && filteredSlots.length > defaultCount && (
                <ShowMoreButton count={filteredSlots.length - defaultCount} onClick={() => setShowAll(true)} />
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SlotButton({
  slot,
  isPriority,
  isSelected,
  disabled,
  onSelect,
}: {
  slot: Slot;
  isPriority: boolean;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: (id: string, startsAt: string) => void;
}) {
  const start = parseISO(slot.starts_at);
  const remaining = slot.max_bookings - slot.current_bookings;

  return (
    <button
      onClick={() => onSelect(slot.id, slot.starts_at)}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between rounded-sm border p-4 text-left transition-all",
        isSelected
          ? isPriority
            ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500"
            : "border-[hsl(var(--funnel-teal))] bg-[hsl(var(--funnel-teal))]/8 ring-1 ring-[hsl(var(--funnel-teal))]"
          : isPriority
            ? "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40"
            : "border-[hsl(var(--funnel-sand))] bg-white hover:border-[hsl(var(--funnel-teal))]/40 hover:bg-[hsl(var(--funnel-teal))]/5"
      )}
    >
      <div className="flex items-center gap-3">
        {isPriority ? (
          <Crown className={cn("h-4 w-4", isSelected ? "text-amber-500" : "text-amber-400")} />
        ) : (
          <Clock className={cn("h-4 w-4", isSelected ? "text-[hsl(var(--funnel-teal))]" : "text-[hsl(var(--funnel-grey))]")} />
        )}
        <div>
          <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)]">
            {format(start, "EEEE, d. MMMM", { locale: de })}
          </p>
          <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">
            {format(start, "HH:mm")} Uhr
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {remaining <= 2 && (
          <span className="rounded-sm bg-destructive/10 px-2 py-0.5 font-sans text-[10px] font-bold text-destructive">
            Nur noch {remaining}
          </span>
        )}
        {isSelected && <Check className={cn("h-4 w-4", isPriority ? "text-amber-500" : "text-[hsl(var(--funnel-teal))]")} />}
      </div>
    </button>
  );
}

function ShowMoreButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-sm border border-dashed border-[hsl(var(--funnel-sand))] p-3 text-center font-sans text-xs text-[hsl(var(--funnel-grey))] hover:bg-[hsl(var(--funnel-sand))]/30 transition-all"
    >
      Weitere {count} Zeiten anzeigen
    </button>
  );
}
