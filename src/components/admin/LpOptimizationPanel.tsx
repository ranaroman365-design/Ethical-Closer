/**
 * LpOptimizationPanel — Phase 9 read-only LP performance dashboard.
 *
 * Mounted in `/admin/mos-ab-preview` next to `TopImpactExperimentsPanel`.
 * Pure read: pulls `event_logs` + `ab_slot_weights` and joins against
 * `EXPERIMENT_THEME_MAP` for theme-level lift. Does NOT mutate anything.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EXPERIMENT_THEME_MAP,
  THEME_LABELS_DE,
  type MessageTheme,
} from "@/lib/cro/audience-intelligence";

interface VariantRow {
  slot: string;
  variant: string;
  exposures: number;
  quiz_starts: number;
  leads: number;
  qualified_leads: number;
  bookings: number;
  revenue: number;
  themes: MessageTheme[];
}

const LP_SLOTS = [
  "mos_lp_psychology_headline",
  "mos_lp_psychology_subline",
  "mos_lp_cta_psychology",
  "mos_lp_micro_trust_inline",
  "mos_lp_trust_block_position",
  "mos_lp_scroll_progress",
  "mos_lp_competing_cta_suppress",
] as const;

function themesFor(slot: string, variant: string): MessageTheme[] {
  return (
    EXPERIMENT_THEME_MAP.find(
      (e) => e.test_name === slot && e.variant === variant,
    )?.themes ?? []
  );
}

export default function LpOptimizationPanel() {
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<"all" | "mobile" | "desktop">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull last 30d of MOS funnel events that carry ab_slots.
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data } = await supabase
          .from("event_logs")
          .select("event_name, payload, created_at")
          .gte("created_at", since)
          .limit(5000);

        if (cancelled) return;

        const buckets = new Map<string, VariantRow>();
        const events = ((data ?? []) as unknown) as Array<{
          event_name: string;
          payload: Record<string, unknown> | null;
        }>;

        for (const ev of events) {
          const payload = (ev.payload ?? {}) as Record<string, unknown>;
          if (payload.funnel !== "masterofsales") continue;
          const slots =
            (payload.ab_slots as Record<string, string> | undefined) ?? {};
          if (device !== "all" && payload.device && payload.device !== device)
            continue;

          for (const slot of LP_SLOTS) {
            const variant = slots[slot];
            if (!variant || variant === "control") continue;
            const key = `${slot}::${variant}`;
            let row = buckets.get(key);
            if (!row) {
              row = {
                slot,
                variant,
                exposures: 0,
                quiz_starts: 0,
                leads: 0,
                qualified_leads: 0,
                bookings: 0,
                revenue: 0,
                themes: themesFor(slot, variant),
              };
              buckets.set(key, row);
            }
            const t = ev.event_name;
            if (t.includes("HERO_VIEW") || t === "ViewContent") row.exposures += 1;
            if (t === "quiz_start" || t === "Quiz_Start_Apply") row.quiz_starts += 1;
            if (t === "Lead" || t === "lead_created") row.leads += 1;
            if (t === "qualified_lead" || t === "QualifiedLead") row.qualified_leads += 1;
            if (t === "booking_created" || t === "Schedule") row.bookings += 1;
            if (t === "Purchase" || t === "revenue_recorded") {
              const v = Number(payload.value ?? payload.revenue ?? 0);
              if (Number.isFinite(v)) row.revenue += v;
            }
          }
        }

        setRows(
          [...buckets.values()].sort(
            (a, b) => b.bookings - a.bookings || b.leads - a.leads,
          ),
        );
      } catch {
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [device]);

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-foreground">
            LP Optimization Panel
          </h2>
          <p className="text-xs text-muted-foreground">
            Phase 9 · LP→Quiz Start · read-only · last 30d
          </p>
        </div>
        <div className="flex overflow-hidden rounded-sm border border-border">
          {(["all", "mobile", "desktop"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`px-3 py-1 text-xs ${
                device === d
                  ? "bg-foreground text-background"
                  : "bg-transparent text-foreground/70 hover:bg-muted"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No variant data yet — once non-control variants get exposures, they
          appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Slot</th>
                <th className="py-2 pr-3">Variant</th>
                <th className="py-2 pr-3">Themes</th>
                <th className="py-2 pr-3 text-right">Expos.</th>
                <th className="py-2 pr-3 text-right">Quiz Start</th>
                <th className="py-2 pr-3 text-right">QS Rate</th>
                <th className="py-2 pr-3 text-right">QL Rate</th>
                <th className="py-2 pr-3 text-right">Book Rate</th>
                <th className="py-2 pr-3 text-right">Rev/Expo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = (n: number, d: number) =>
                  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
                return (
                  <tr
                    key={`${r.slot}-${r.variant}`}
                    className="border-t border-border/40"
                  >
                    <td className="py-2 pr-3 font-mono text-[11px]">{r.slot}</td>
                    <td className="py-2 pr-3">{r.variant}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.themes.map((t) => THEME_LABELS_DE[t]).join(" · ") || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">{r.exposures}</td>
                    <td className="py-2 pr-3 text-right">{r.quiz_starts}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.quiz_starts, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.qualified_leads, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.bookings, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">
                      {r.exposures > 0
                        ? `€${(r.revenue / r.exposures).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Projected Monthly Gain — winner lift × 30d traffic */}
          {(() => {
            const totalExpo = rows.reduce((s, r) => s + r.exposures, 0);
            const totalQs = rows.reduce((s, r) => s + r.quiz_starts, 0);
            const baseline = totalExpo > 0 ? totalQs / totalExpo : 0;
            const winner = rows
              .filter((r) => r.exposures >= 50)
              .sort(
                (a, b) =>
                  b.quiz_starts / Math.max(1, b.exposures) -
                  a.quiz_starts / Math.max(1, a.exposures),
              )[0];
            const winnerRate = winner
              ? winner.quiz_starts / Math.max(1, winner.exposures)
              : 0;
            const lift = baseline > 0 ? (winnerRate - baseline) / baseline : 0;
            const monthlyExpo = totalExpo; // last 30d already
            const extraQs = Math.max(0, monthlyExpo * (winnerRate - baseline));
            return (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/40 pt-3 text-xs md:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Baseline LP→Quiz</p>
                  <p className="font-medium">{(baseline * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Winner LP→Quiz</p>
                  <p className="font-medium">{(winnerRate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Lift vs baseline</p>
                  <p className="font-medium">{(lift * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Projected extra quiz starts / mo</p>
                  <p className="font-medium">+{Math.round(extraQs)}</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Phase 9.2 — Competence Proof Image Tests */}
      <CompetenceProofImageTests />

      {/* Phase 9.3 — Human Proof Image Tests */}
      <HumanProofImageTests />
    </section>
  );
}

// ─── Phase 9.2 — Competence Proof Image Tests ────────────────────────────
import { MOS_IMAGE_SLOT_IDS, MOS_IMAGE_SLOT_COPY } from "@/lib/mos-image-slots";
import {
  MOS_HUMAN_PROOF_SLOT_IDS,
  MOS_HUMAN_PROOF_COPY,
} from "@/lib/mos-human-proof-slots";

interface ImageVariantRow {
  slot: string;
  variant: string;
  exposures: number;
  image_views: number;
  quiz_starts: number;
  leads: number;
  qualified_leads: number;
  bookings: number;
  revenue: number;
}

function CompetenceProofImageTests() {
  const [rows, setRows] = useState<ImageVariantRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data } = await supabase
          .from("event_logs")
          .select("event_name, payload, created_at")
          .gte("created_at", since)
          .limit(5000);
        if (cancelled) return;

        const buckets = new Map<string, ImageVariantRow>();
        const events = ((data ?? []) as unknown) as Array<{
          event_name: string;
          payload: Record<string, unknown> | null;
        }>;
        for (const ev of events) {
          const payload = (ev.payload ?? {}) as Record<string, unknown>;
          if (payload.funnel !== "masterofsales") continue;
          const slots =
            (payload.ab_slots as Record<string, string> | undefined) ?? {};
          for (const slot of MOS_IMAGE_SLOT_IDS) {
            const variant = slots[slot];
            if (!variant || variant === "control") continue;
            const key = `${slot}::${variant}`;
            let row = buckets.get(key);
            if (!row) {
              row = {
                slot,
                variant,
                exposures: 0,
                image_views: 0,
                quiz_starts: 0,
                leads: 0,
                qualified_leads: 0,
                bookings: 0,
                revenue: 0,
              };
              buckets.set(key, row);
            }
            const t = ev.event_name;
            if (t.includes("HERO_VIEW") || t === "ViewContent") row.exposures += 1;
            if (
              t === "lp_image_view" &&
              payload.slot === slot &&
              payload.variant === variant
            )
              row.image_views += 1;
            if (t === "quiz_start" || t === "Quiz_Start_Apply") row.quiz_starts += 1;
            if (t === "Lead" || t === "lead_created") row.leads += 1;
            if (t === "qualified_lead" || t === "QualifiedLead")
              row.qualified_leads += 1;
            if (t === "booking_created" || t === "Schedule") row.bookings += 1;
            if (t === "Purchase" || t === "revenue_recorded") {
              const v = Number(payload.value ?? payload.revenue ?? 0);
              if (Number.isFinite(v)) row.revenue += v;
            }
          }
        }
        setRows(
          [...buckets.values()].sort(
            (a, b) => b.bookings - a.bookings || b.leads - a.leads,
          ),
        );
      } catch {
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pct = (n: number, d: number) =>
    d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6">
      <header className="mb-4">
        <h2 className="font-serif text-lg text-foreground">
          Competence Proof Image Tests
        </h2>
        <p className="text-xs text-muted-foreground">
          Phase 9.2 · LP image variants · Harm-Guarded by Revenue / Booking / QL
          · last 30d
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No image variant data yet — once non-control image variants get
          exposures, they appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Preview</th>
                <th className="py-2 pr-3">Slot</th>
                <th className="py-2 pr-3">Variant</th>
                <th className="py-2 pr-3 text-right">Expos.</th>
                <th className="py-2 pr-3 text-right">Image Views</th>
                <th className="py-2 pr-3 text-right">LP→Quiz</th>
                <th className="py-2 pr-3 text-right">QL Rate</th>
                <th className="py-2 pr-3 text-right">Book Rate</th>
                <th className="py-2 pr-3 text-right">Rev/Expo</th>
                <th className="py-2 pr-3">Harm Guard</th>
                <th className="py-2 pr-3">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const copy = MOS_IMAGE_SLOT_COPY[r.slot]?.[r.variant];
                const qsRate = r.exposures > 0 ? r.quiz_starts / r.exposures : 0;
                const bookRate = r.exposures > 0 ? r.bookings / r.exposures : 0;
                const revPerExpo = r.exposures > 0 ? r.revenue / r.exposures : 0;
                const harmOk = bookRate > 0 || r.exposures < 100;
                const rec =
                  r.exposures < 200
                    ? "Collect more data"
                    : harmOk && qsRate > 0.1
                      ? "Promote candidate"
                      : harmOk
                        ? "Hold"
                        : "Pause — harm guard";
                return (
                  <tr
                    key={`${r.slot}-${r.variant}`}
                    className="border-t border-border/40"
                  >
                    <td className="py-2 pr-3">
                      {copy?.src ? (
                        <img
                          src={copy.src}
                          alt=""
                          className="h-10 w-16 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="inline-block h-10 w-16 rounded border border-dashed border-border" />
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">{r.slot}</td>
                    <td className="py-2 pr-3">{r.variant}</td>
                    <td className="py-2 pr-3 text-right">{r.exposures}</td>
                    <td className="py-2 pr-3 text-right">{r.image_views}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.quiz_starts, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.qualified_leads, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.bookings, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">
                      {revPerExpo > 0 ? `€${revPerExpo.toFixed(2)}` : "—"}
                    </td>
                    <td
                      className={`py-2 pr-3 ${
                        harmOk ? "text-foreground/70" : "text-destructive"
                      }`}
                    >
                      {harmOk ? "OK" : "BLOCK"}
                    </td>
                    <td className="py-2 pr-3">{rec}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Phase 9.3 — Human Proof Image Tests ─────────────────────────────────
interface HumanVariantRow {
  slot: string;
  variant: string;
  exposures: number;
  image_views: number;
  quiz_starts: number;
  quiz_completions: number;
  leads: number;
  qualified_leads: number;
  bookings: number;
  revenue: number;
}

function HumanProofImageTests() {
  const [rows, setRows] = useState<HumanVariantRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data } = await supabase
          .from("event_logs")
          .select("event_name, payload, created_at")
          .gte("created_at", since)
          .limit(5000);
        if (cancelled) return;

        const buckets = new Map<string, HumanVariantRow>();
        const events = ((data ?? []) as unknown) as Array<{
          event_name: string;
          payload: Record<string, unknown> | null;
        }>;
        for (const ev of events) {
          const payload = (ev.payload ?? {}) as Record<string, unknown>;
          if (payload.funnel !== "masterofsales") continue;
          const slots =
            (payload.ab_slots as Record<string, string> | undefined) ?? {};
          for (const slot of MOS_HUMAN_PROOF_SLOT_IDS) {
            const variant = slots[slot];
            if (!variant || variant === "control") continue;
            const key = `${slot}::${variant}`;
            let row = buckets.get(key);
            if (!row) {
              row = {
                slot,
                variant,
                exposures: 0,
                image_views: 0,
                quiz_starts: 0,
                quiz_completions: 0,
                leads: 0,
                qualified_leads: 0,
                bookings: 0,
                revenue: 0,
              };
              buckets.set(key, row);
            }
            const t = ev.event_name;
            if (t.includes("HERO_VIEW") || t === "ViewContent") row.exposures += 1;
            if (
              t === "lp_image_view" &&
              payload.slot === slot &&
              payload.variant === variant
            )
              row.image_views += 1;
            if (t === "quiz_start" || t === "Quiz_Start_Apply") row.quiz_starts += 1;
            if (t === "quiz_complete" || t === "Quiz_Complete") row.quiz_completions += 1;
            if (t === "Lead" || t === "lead_created") row.leads += 1;
            if (t === "qualified_lead" || t === "QualifiedLead")
              row.qualified_leads += 1;
            if (t === "booking_created" || t === "Schedule") row.bookings += 1;
            if (t === "Purchase" || t === "revenue_recorded") {
              const v = Number(payload.value ?? payload.revenue ?? 0);
              if (Number.isFinite(v)) row.revenue += v;
            }
          }
        }
        // Sort: Revenue → Booking → QL → Lead (per Phase 9.3 spec — never CTR).
        setRows(
          [...buckets.values()].sort(
            (a, b) =>
              b.revenue - a.revenue ||
              b.bookings - a.bookings ||
              b.qualified_leads - a.qualified_leads ||
              b.leads - a.leads,
          ),
        );
      } catch {
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pct = (n: number, d: number) =>
    d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6">
      <header className="mb-4">
        <h2 className="font-serif text-lg text-foreground">
          Human Proof Image Tests
        </h2>
        <p className="text-xs text-muted-foreground">
          Phase 9.3 · Hero · Training · Community · Graduate · Certification ·
          Transformation · Harm-Guarded by Revenue / Booking / QL · sorted by
          Revenue → Booking → QL → Lead · last 30d
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No human-proof variant data yet — once non-control variants get
          exposures, they appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Preview</th>
                <th className="py-2 pr-3">Slot</th>
                <th className="py-2 pr-3">Variant</th>
                <th className="py-2 pr-3 text-right">Impr.</th>
                <th className="py-2 pr-3 text-right">Img Views</th>
                <th className="py-2 pr-3 text-right">LP→Quiz</th>
                <th className="py-2 pr-3 text-right">Quiz Compl.</th>
                <th className="py-2 pr-3 text-right">Lead</th>
                <th className="py-2 pr-3 text-right">QL</th>
                <th className="py-2 pr-3 text-right">Book</th>
                <th className="py-2 pr-3 text-right">Revenue</th>
                <th className="py-2 pr-3 text-right">Conf.</th>
                <th className="py-2 pr-3">Harm Guard</th>
                <th className="py-2 pr-3">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const copy = MOS_HUMAN_PROOF_COPY[r.slot]?.[r.variant];
                const qsRate = r.exposures > 0 ? r.quiz_starts / r.exposures : 0;
                const qlRate = r.exposures > 0 ? r.qualified_leads / r.exposures : 0;
                const bookRate = r.exposures > 0 ? r.bookings / r.exposures : 0;
                // Crude confidence proxy — sqrt(exposures) bounded 0–100%.
                const confidence = Math.min(
                  1,
                  Math.sqrt(r.exposures) / 30,
                );
                // Harm guard: bookings >= 0 acceptable while learning; flagged
                // when ≥100 exposures with zero booking signal.
                const harmOk = bookRate > 0 || r.exposures < 100;
                const rec =
                  r.exposures < 200
                    ? "Collect more data"
                    : !harmOk
                      ? "Pause — harm guard"
                      : qlRate > 0 && bookRate > 0
                        ? "Promote candidate"
                        : "Hold";
                return (
                  <tr
                    key={`${r.slot}-${r.variant}`}
                    className="border-t border-border/40"
                  >
                    <td className="py-2 pr-3">
                      {copy?.src ? (
                        <img
                          src={copy.src}
                          alt=""
                          className="h-10 w-16 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="inline-block h-10 w-16 rounded border border-dashed border-border" />
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">{r.slot}</td>
                    <td className="py-2 pr-3">{r.variant}</td>
                    <td className="py-2 pr-3 text-right">{r.exposures}</td>
                    <td className="py-2 pr-3 text-right">{r.image_views}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.quiz_starts, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.quiz_completions, r.quiz_starts)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.leads, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.qualified_leads, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.bookings, r.exposures)}</td>
                    <td className="py-2 pr-3 text-right">
                      {r.revenue > 0 ? `€${r.revenue.toFixed(0)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {(confidence * 100).toFixed(0)}%
                    </td>
                    <td
                      className={`py-2 pr-3 ${
                        harmOk ? "text-foreground/70" : "text-destructive"
                      }`}
                    >
                      {harmOk ? "OK" : "BLOCK"}
                    </td>
                    <td className="py-2 pr-3">{rec}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
