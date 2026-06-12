/**
 * Consistency test for `home_cta_click` events.
 *
 * Pulls the most recent click events from `event_logs` and asserts that every
 * single payload satisfies the canonical CTA Ladder registry
 * (see {@link HOME_CTA_REGISTRY}).
 *
 * If the test fails, the report names the offending payload, the violation
 * reason, and what the registry expected — so the fix is either:
 *   - update the call site (wrong destination/type/intent), OR
 *   - add a new rule to the registry (intentional new ladder rung).
 *
 * Skipped automatically when no rows are present (e.g. in a fresh CI DB) so
 * this never blocks unrelated work.
 */

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  validateHomeCta,
  type HomeCtaPayload,
  HOME_CTA_REGISTRY,
} from "@/lib/home-cta-registry";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

describe("home_cta_click consistency", () => {
  it("registry itself is internally consistent", () => {
    // No two rules may have the same (location, cta_id, destination) triple.
    const seen = new Set<string>();
    for (const r of HOME_CTA_REGISTRY) {
      for (const dest of r.destinations) {
        const key = `${r.location}|${r.cta_id}|${dest}`;
        expect(seen.has(key), `duplicate registry entry: ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("validator catches all known violation classes", () => {
    expect(
      validateHomeCta({
        location: "ghost_section",
        cta_id: "primary_quiz",
        destination: "/start/quiz",
      })?.reason,
    ).toBe("unknown_location");

    expect(
      validateHomeCta({
        location: "hero_primary",
        cta_id: "masterclass",
        destination: "/start/quiz",
      })?.reason,
    ).toBe("unknown_cta_id_for_location");

    expect(
      validateHomeCta({
        location: "hero_primary",
        cta_id: "primary_quiz",
        destination: "/somewhere-else",
      })?.reason,
    ).toBe("destination_not_allowed");

    expect(
      validateHomeCta({
        location: "hero_primary",
        cta_id: "primary_quiz",
        destination: "/start/quiz",
        cta_type: "soft_yes",
      })?.reason,
    ).toBe("cta_type_mismatch");

    expect(
      validateHomeCta({
        location: "hero_primary",
        cta_id: "primary_quiz",
        destination: "/start/quiz",
        cta_type: "primary",
        intent: "masterclass",
      })?.reason,
    ).toBe("intent_mismatch");

    // Soft-yes Masterclass rung — must be intent=masterclass.
    expect(
      validateHomeCta({
        location: "masterclass_block",
        cta_id: "masterclass",
        destination: "/start/masterclass",
        cta_type: "soft_yes",
        intent: "masterclass",
      }),
    ).toBeNull();
  });

  it.runIf(HAS_SUPABASE)(
    "every recent home_cta_click row in event_logs matches the registry",
    async () => {
      const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

      const { data, error } = await supabase
        .from("event_logs")
        .select("id, payload, created_at")
        .eq("event_name", "home_cta_click")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        // Network/RLS error — surface it instead of silently passing.
        throw new Error(`event_logs query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        // No data yet — registry is the only thing we can check, and that is
        // covered by the other test cases.
        return;
      }

      const violations: Array<{
        id: string;
        created_at: string | null;
        payload: HomeCtaPayload;
        violation: ReturnType<typeof validateHomeCta>;
      }> = [];

      for (const row of data) {
        const p = (row.payload ?? {}) as Record<string, unknown>;
        const payload: HomeCtaPayload = {
          location: String(p.location ?? ""),
          cta_id: String(p.cta_id ?? ""),
          destination: String(p.destination ?? ""),
          cta_type: (p.cta_type as string | null | undefined) ?? null,
          intent: (p.intent as string | null | undefined) ?? null,
        };
        const violation = validateHomeCta(payload);
        if (violation) {
          violations.push({
            id: row.id as string,
            created_at: (row.created_at as string | null) ?? null,
            payload,
            violation,
          });
        }
      }

      if (violations.length > 0) {
        const report = violations
          .slice(0, 10)
          .map(
            (v) =>
              `  - [${v.created_at}] ${v.violation?.reason}\n` +
              `      payload : ${JSON.stringify(v.payload)}\n` +
              `      expected: ${JSON.stringify(v.violation?.expected)}`,
          )
          .join("\n");
        throw new Error(
          `home_cta_click consistency: ${violations.length}/${data.length} rows violate the registry.\n` +
            `First ${Math.min(10, violations.length)}:\n${report}`,
        );
      }

      expect(violations).toHaveLength(0);
    },
    20_000,
  );
});
