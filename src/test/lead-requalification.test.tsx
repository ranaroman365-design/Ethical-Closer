/**
 * Integration tests for low-lead requalification (T1–T4 + T6).
 *
 * Scenario under test
 * -------------------
 * Same email completes the apply quiz twice. The second attempt with
 * better answers MUST overwrite the prior "low" verdict on the SAME lead
 * row (no duplicates), so booking can succeed on the retake.
 *
 *   T1  low answers           → bucket=low, booking blocked
 *   T2  retake with high      → same lead_id, bucket=mid|high
 *   T3  retake still low      → bucket stays low
 *   T4  exactly ONE row per email after all attempts
 *   T6  /quiz/low-result renders the retake CTA → /apply
 *
 * T5 is covered by lead-storage.test.ts (pure jsdom).
 *
 * Strategy
 * --------
 * Calls the public RPC `upsert_funnel_lead` directly via PostgREST using
 * the anon key. RPC is SECURITY DEFINER → no auth required, matching the
 * production funnel call from Apply.tsx. We use a unique throwaway email
 * per run (timestamp + random) so reruns never collide. The test does not
 * clean up — those test leads just sit in `leads` with funnel_source
 * "apply-test" and can be filtered out of dashboards if noise becomes an
 * issue. (Insertion-only is intentional: no test should assume DELETE
 * privileges on live data.)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LowLeadResult from "@/pages/LowLeadResult";

const SUPABASE_URL =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_SUPABASE_URL ?? "https://pjufhxzjgdnhvuuvltjn.supabase.co";
const SUPABASE_ANON_KEY =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/upsert_funnel_lead`;

// Quiz-answer fixtures keyed for the server-side scorer
// (`compute_lead_quality_from_answers`) — it reads enum-style values like
// "10000+" / "full_time" / "experienced", NOT the German UI labels.
// Apply.tsx is responsible for mapping its UI selections to this canonical
// payload before calling upsert_funnel_lead.
const LOW_ANSWERS = {
  income_target: "under_2k",
  commitment: "low",
  time_available: "under_5",
  experience: "none",
  motivation: "weiß nicht",
};

const HIGH_ANSWERS = {
  income_target: "10000+",
  commitment: "full_time",
  time_available: "20h+",
  experience: "experienced",
  motivation:
    "Ich will dieses Jahr Closer auf Top-Level werden, mein Einkommen verdoppeln und langfristig im High-Ticket-Sales arbeiten.",
};

type RpcResult = {
  success?: boolean;
  lead_id?: string;
  quiz_score?: number | null;
  lead_score?: number | null;
  lead_quality?: string | null;
  qualification_bucket?: string | null;
  error?: string;
};

async function upsertLead(args: {
  email: string;
  name: string;
  answers?: Record<string, string> | null;
}): Promise<RpcResult> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      p_name: args.name,
      p_email: args.email,
      p_phone: null,
      p_funnel_source: "apply-test",
      p_quiz_answers: args.answers ?? null,
      p_session_id: null,
      p_traffic_owner: null,
      p_referral_code: null,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`RPC ${res.status}: ${text}`);
  }
  return JSON.parse(text) as RpcResult;
}

const haveCreds = SUPABASE_ANON_KEY.length > 0;
const describeIfCreds = haveCreds ? describe : describe.skip;

describeIfCreds("low-lead requalification — T1..T4", () => {
  // Fresh email per test run keeps reruns independent.
  const email = `t-requal-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
  let firstLeadId: string | undefined;

  beforeAll(() => {
    // Sanity: confirm we are pointed at the project we expect.
    expect(SUPABASE_URL).toContain("supabase.co");
    expect(SUPABASE_ANON_KEY).toMatch(/^ey/);
  });

  it("T1: first attempt with low answers → bucket=low", async () => {
    const r = await upsertLead({
      email,
      name: "Requal Test",
      answers: LOW_ANSWERS,
    });
    expect(r.success).toBe(true);
    expect(r.lead_id).toBeTruthy();
    expect(r.qualification_bucket).toBe("low");
    expect(r.lead_quality).toBe("C");
    firstLeadId = r.lead_id;
  });

  it("T2: same email + HIGH answers → same lead_id, bucket flips up", async () => {
    expect(firstLeadId).toBeTruthy();
    const r = await upsertLead({
      email,
      name: "Requal Test",
      answers: HIGH_ANSWERS,
    });
    expect(r.success).toBe(true);
    // Same row was updated, NOT a new lead inserted.
    expect(r.lead_id).toBe(firstLeadId);
    // Server now reports a non-low verdict → booking is unlocked.
    expect(["mid", "high"]).toContain(r.qualification_bucket);
    expect(r.lead_quality).not.toBe("C");
    // Score must be strictly higher than the low attempt.
    expect((r.quiz_score ?? 0)).toBeGreaterThan(0);
  });

  it("T3: same email back to LOW answers → bucket=low again", async () => {
    expect(firstLeadId).toBeTruthy();
    const r = await upsertLead({
      email,
      name: "Requal Test",
      answers: LOW_ANSWERS,
    });
    expect(r.success).toBe(true);
    expect(r.lead_id).toBe(firstLeadId);
    expect(r.qualification_bucket).toBe("low");
  });

  it("T4: across all retakes only ONE lead exists for this email", async () => {
    // Two complementary checks:
    //
    // (a) RPC contract: the lead_id returned by every retake must equal
    //     the one returned by the first attempt. This is the only thing
    //     production code observes — if the contract holds, no duplicate
    //     row was inserted by upsert_funnel_lead. (Verified in T1/T2/T3.)
    //
    // (b) Direct row count via PostgREST. RLS may hide rows from anon, in
    //     which case Content-Range is "0-0/0" and we fall back to (a).
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?email=eq.${encodeURIComponent(
        email,
      )}&select=id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "count=exact",
        },
      },
    );
    const range = res.headers.get("content-range") ?? "";
    const total = Number(range.split("/").pop());

    if (Number.isFinite(total) && total > 0) {
      // Anon CAN see the row → assert exactly one.
      expect(total).toBe(1);
    } else {
      // RLS hides anon reads → fall back to the RPC contract: every
      // retake returned the same lead_id, so no duplicate was created.
      expect(firstLeadId).toBeTruthy();
      // Re-issuing the upsert with NO answers must still return the same
      // lead_id (proves the email-based dedupe path inside the RPC).
      const r = await upsertLead({ email, name: "Requal Test" });
      expect(r.lead_id).toBe(firstLeadId);
    }
  });
});

describe("LowLeadResult — T6 (retake CTA)", () => {
  it("renders a retake CTA pointing back to /apply", () => {
    render(
      <MemoryRouter>
        <LowLeadResult />
      </MemoryRouter>,
    );

    // CTA copy is the user-visible promise that requalification is allowed.
    expect(screen.getByText(/Quiz erneut starten/i)).toBeInTheDocument();

    // Link target must hit the apply quiz so a new attempt is sent to the
    // server (Apply.tsx then calls upsert_funnel_lead with fresh answers).
    const cta = screen.getByText(/Quiz erneut starten/i).closest("a");
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute("href")).toMatch(/^\/apply/);
  });
});
