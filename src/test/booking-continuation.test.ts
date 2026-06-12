/**
 * Booking Continuation — Acceptance Tests
 *
 * Validates the canonical unbooked-lead booking continuation flow:
 * 1. Token generation after quiz completion
 * 2. Token validation on booking page
 * 3. Email fallback resolution
 * 4. No duplicate lead creation
 * 5. Correct lead_id attachment to appointments
 * 6. Lead Pool visibility for unbooked leads
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const BOOKING_SRC = fs.readFileSync("src/pages/Booking.tsx", "utf-8");
const LEAD_STORAGE_SRC = fs.readFileSync("src/lib/lead-storage.ts", "utf-8");
const APPLY_QUIZ_SRC = fs.readFileSync("src/pages/ApplyQuiz.tsx", "utf-8");
const APPLY_SRC = fs.readFileSync("src/pages/Apply.tsx", "utf-8");
const BEWERBUNG_SRC = fs.readFileSync("src/pages/Bewerbung.tsx", "utf-8");

// ── 1. Token generation infrastructure ──

describe("Booking token generation", () => {
  it("lead-storage exports generateBookingToken", () => {
    expect(LEAD_STORAGE_SRC).toContain("export async function generateBookingToken");
  });

  it("generateBookingToken calls generate_booking_token RPC", () => {
    expect(LEAD_STORAGE_SRC).toContain('rpc("generate_booking_token"');
  });

  it("generateBookingToken returns null on error (never throws)", () => {
    const fnStart = LEAD_STORAGE_SRC.indexOf("async function generateBookingToken");
    const fnBody = LEAD_STORAGE_SRC.substring(fnStart, fnStart + 500);
    expect(fnBody).toContain("return null");
    expect(fnBody).toContain("catch");
  });

  it("lead-storage exports resolveBookingToken", () => {
    expect(LEAD_STORAGE_SRC).toContain("export async function resolveBookingToken");
  });

  it("resolveBookingToken calls validate_booking_token RPC", () => {
    expect(LEAD_STORAGE_SRC).toContain('rpc("validate_booking_token"');
  });

  it("lead-storage exports resolveLeadByEmail", () => {
    expect(LEAD_STORAGE_SRC).toContain("export async function resolveLeadByEmail");
  });

  it("resolveLeadByEmail calls resolve_lead_by_email RPC", () => {
    expect(LEAD_STORAGE_SRC).toContain('rpc("resolve_lead_by_email"');
  });

  it("lead-storage exports markBookingTokenUsed", () => {
    expect(LEAD_STORAGE_SRC).toContain("export async function markBookingTokenUsed");
  });

  it("lead-storage exports buildBookingUrl helper", () => {
    expect(LEAD_STORAGE_SRC).toContain("export function buildBookingUrl");
    expect(LEAD_STORAGE_SRC).toContain("/booking?token=");
  });

  it("BookingContinuationResult type has resolvedVia field", () => {
    expect(LEAD_STORAGE_SRC).toContain('resolvedVia: "token" | "email"');
  });
});

// ── 2. Quiz → Token → Booking redirect ──

describe("Quiz completion generates token and redirects", () => {
  it("ApplyQuiz imports generateBookingToken", () => {
    expect(APPLY_QUIZ_SRC).toContain("generateBookingToken");
  });

  it("ApplyQuiz generates token before navigating to /booking", () => {
    const navSection = APPLY_QUIZ_SRC.substring(
      APPLY_QUIZ_SRC.indexOf("setTimeout(async"),
      APPLY_QUIZ_SRC.indexOf("}, 600)")
    );
    expect(navSection).toContain("generateBookingToken");
    expect(navSection).toContain("token=");
  });

  it("ApplyQuiz only generates token for non-low leads", () => {
    const navSection = APPLY_QUIZ_SRC.substring(
      APPLY_QUIZ_SRC.indexOf("setTimeout(async"),
      APPLY_QUIZ_SRC.indexOf("}, 600)")
    );
    expect(navSection).toContain('resolvedBucket !== "low"');
  });

  it("Apply.tsx imports generateBookingToken", () => {
    expect(APPLY_SRC).toContain("generateBookingToken");
  });

  it("Apply.tsx generates token before navigating", () => {
    expect(APPLY_SRC).toContain("generateBookingToken(verdict.leadId)");
  });

  it("Bewerbung.tsx imports generateBookingToken", () => {
    expect(BEWERBUNG_SRC).toContain("generateBookingToken");
  });

  it("Bewerbung.tsx generates token before navigating", () => {
    expect(BEWERBUNG_SRC).toContain("generateBookingToken(verdict.leadId)");
  });
});

// ── 3. Booking page token resolution ──

describe("Booking page handles ?token= param", () => {
  it("imports resolveBookingToken", () => {
    expect(BOOKING_SRC).toContain("resolveBookingToken");
  });

  it("imports markBookingTokenUsed", () => {
    expect(BOOKING_SRC).toContain("markBookingTokenUsed");
  });

  it("reads token from URL params", () => {
    expect(BOOKING_SRC).toContain('params.get("token")');
  });

  it("has tokenResolving state for loading UX", () => {
    expect(BOOKING_SRC).toContain("tokenResolving");
    expect(BOOKING_SRC).toContain("setTokenResolving");
  });

  it("has continuationLead state", () => {
    expect(BOOKING_SRC).toContain("continuationLead");
    expect(BOOKING_SRC).toContain("setContinuationLead");
  });

  it("prefills name/email/phone from resolved token", () => {
    const startIdx = BOOKING_SRC.indexOf("BOOKING CONTINUATION");
    const endIdx = BOOKING_SRC.indexOf("return () => { cancelled = true; };", startIdx);
    const tokenEffect = BOOKING_SRC.substring(startIdx, endIdx + 200);
    expect(tokenEffect).toContain("setName(result.name)");
    expect(tokenEffect).toContain("setEmail(result.email)");
    expect(tokenEffect).toContain("setPhone(result.phone)");
  });

  it("persists resolved lead_id to localStorage", () => {
    const startIdx = BOOKING_SRC.indexOf("BOOKING CONTINUATION");
    const endIdx = BOOKING_SRC.indexOf("return () => { cancelled = true; };", startIdx);
    const tokenEffect = BOOKING_SRC.substring(startIdx, endIdx + 200);
    expect(tokenEffect).toContain('localStorage.setItem("lead_id", result.leadId)');
  });

  it("skips contact step when token provides full data", () => {
    const startIdx = BOOKING_SRC.indexOf("BOOKING CONTINUATION");
    const endIdx = BOOKING_SRC.indexOf("return () => { cancelled = true; };", startIdx);
    const tokenEffect = BOOKING_SRC.substring(startIdx, endIdx + 200);
    expect(tokenEffect).toContain('setStep("slots")');
  });

  it("marks token as used after successful resolution", () => {
    expect(BOOKING_SRC).toContain("markBookingTokenUsed(token)");
  });

  it("tracks booking_continuation_resolved event", () => {
    expect(BOOKING_SRC).toContain("booking_continuation_resolved");
  });

  it("tracks booking_continuation_token_expired for invalid tokens", () => {
    expect(BOOKING_SRC).toContain("booking_continuation_token_expired");
  });

  it("falls back to contact form when token is invalid", () => {
    // When token is expired/invalid, tokenResolving becomes false and no
    // step change happens — user sees contact form
    const tokenEffect = BOOKING_SRC.substring(
      BOOKING_SRC.indexOf("BOOKING CONTINUATION"),
      BOOKING_SRC.indexOf("return () => { cancelled = true; };")
    );
    // After the else branch (token invalid), only setTokenResolving(false) — no setStep
    const elseBranch = tokenEffect.substring(tokenEffect.indexOf("} else {"));
    expect(elseBranch).toContain("setTokenResolving(false)");
    expect(elseBranch).not.toContain('setStep("slots")');
  });
});

// ── 4. Email fallback (no token) ──

describe("Email fallback — existing lead resolution", () => {
  it("Booking uses upsert_funnel_lead (dedup by email)", () => {
    expect(BOOKING_SRC).toContain("upsert_funnel_lead");
  });

  it("handleSaveLead persists verdict with lead_id", () => {
    expect(BOOKING_SRC).toContain("persistLeadVerdict(data,");
  });

  it("lead_id is stored in localStorage after save", () => {
    // persistLeadVerdict stores lead_id
    expect(LEAD_STORAGE_SRC).toContain('localStorage.setItem("lead_id", v.leadId)');
  });
});

// ── 5. Security ──

describe("Booking token security", () => {
  it("token is generated server-side (gen_random_bytes)", () => {
    // Check migration exists with secure token generation
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("lead_booking_tokens") && content.includes("gen_random_bytes")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("token validation is via SECURITY DEFINER RPC (not client query)", () => {
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("validate_booking_token") && content.includes("SECURITY DEFINER")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("tokens expire (expires_at checked in validation)", () => {
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("validate_booking_token") && content.includes("expires_at > now()")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("internal lead_id is never exposed in public URL (only token)", () => {
    // Quiz navigation should use token, not lead_id
    expect(APPLY_QUIZ_SRC).not.toMatch(/\/booking\?.*lead_id=/);
    expect(APPLY_SRC).not.toMatch(/\/booking\?.*lead_id=/);
    expect(BEWERBUNG_SRC).not.toMatch(/\/booking\?.*lead_id=/);
  });

  it("token only returns booking-relevant fields (not full profile)", () => {
    // validate_booking_token should return limited fields
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("validate_booking_token")) {
        // Should NOT return sensitive fields like deal_value, setter_notes, etc.
        expect(content).not.toContain("deal_value");
        expect(content).not.toContain("setter_notes");
        expect(content).not.toContain("closer_notes");
        break;
      }
    }
  });
});

// ── 6. No duplicate leads ──

describe("No duplicate lead creation", () => {
  it("Booking handleSaveLead uses upsert (not insert)", () => {
    // upsert_funnel_lead finds-or-creates by email
    expect(BOOKING_SRC).toContain("upsert_funnel_lead");
    expect(BOOKING_SRC).not.toMatch(/from\(['"]leads['"]\)\.insert/);
  });

  it("Token resolution stores lead_id so handleConfirmBooking uses it", () => {
    // handleConfirmBooking reads lead_id from localStorage
    expect(BOOKING_SRC).toContain('localStorage.getItem("lead_id")');
  });
});

// ── 7. DB migration structure ──

describe("lead_booking_tokens table migration", () => {
  it("migration creates lead_booking_tokens table with correct columns", () => {
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("CREATE TABLE") && content.includes("lead_booking_tokens")) {
        expect(content).toContain("lead_id UUID");
        expect(content).toContain("token TEXT");
        expect(content).toContain("expires_at TIMESTAMPTZ");
        expect(content).toContain("used_at TIMESTAMPTZ");
        expect(content).toContain("ENABLE ROW LEVEL SECURITY");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("has unique index on token", () => {
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("lead_booking_tokens")) {
        expect(content).toContain("UNIQUE INDEX");
        break;
      }
    }
  });

  it("generates token via gen_random_bytes(32) hex-encoded", () => {
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("lead_booking_tokens") && content.includes("gen_random_bytes")) {
        expect(content).toContain("gen_random_bytes(32)");
        expect(content).toContain("encode(");
        expect(content).toContain("'hex'");
        break;
      }
    }
  });

  it("token default expiry is 30 days", () => {
    const migrationDir = "supabase/migrations";
    const files = fs.readdirSync(migrationDir).sort().reverse();
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, "utf-8");
      if (content.includes("lead_booking_tokens")) {
        expect(content).toContain("30 days");
        break;
      }
    }
  });
});
