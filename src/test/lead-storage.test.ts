/**
 * Unit tests for src/lib/lead-storage.ts
 *
 * Covers the localStorage half of the requalification fix (T5):
 *   - parseLeadVerdict extracts only the trusted shape from RPC output
 *   - persistLeadVerdict mirrors the FRESH server verdict and clears any
 *     stale "low_lead_locked" flag once the bucket flips up
 *   - routeForVerdict honours both qualification_bucket and lead_quality
 *
 * These run fully in jsdom — no DB / network needed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  parseLeadVerdict,
  persistLeadVerdict,
  routeForVerdict,
} from "@/lib/lead-storage";

beforeEach(() => {
  localStorage.clear();
});

describe("parseLeadVerdict", () => {
  it("returns empty object for null/array/primitive input", () => {
    expect(parseLeadVerdict(null)).toEqual({});
    expect(parseLeadVerdict("nope")).toEqual({});
    expect(parseLeadVerdict([1, 2, 3])).toEqual({});
  });

  it("extracts the canonical shape from a valid RPC payload", () => {
    const v = parseLeadVerdict({
      lead_id: "11111111-1111-1111-1111-111111111111",
      quiz_score: 85,
      lead_score: 72,
      lead_quality: "A",
      qualification_bucket: "high",
      // ignored fields:
      success: true,
      hello: "world",
    });
    expect(v).toEqual({
      leadId: "11111111-1111-1111-1111-111111111111",
      quizScore: 85,
      leadScore: 72,
      leadQuality: "A",
      qualificationBucket: "high",
    });
  });

  it("coerces missing fields to null", () => {
    const v = parseLeadVerdict({ lead_id: "abc" });
    expect(v.quizScore).toBeNull();
    expect(v.leadScore).toBeNull();
    expect(v.leadQuality).toBeNull();
    expect(v.qualificationBucket).toBeNull();
  });
});

describe("persistLeadVerdict — T5 (localStorage reflects latest verdict)", () => {
  it("writes every score/quality field plus the historical qualification_score key", () => {
    persistLeadVerdict(
      {
        lead_id: "lead-1",
        quiz_score: 82,
        lead_score: 70,
        lead_quality: "A",
        qualification_bucket: "high",
      },
      { name: " Tom ", email: " TOM@Example.com ", phone: " +49 123 " },
    );

    expect(localStorage.getItem("lead_id")).toBe("lead-1");
    expect(localStorage.getItem("quiz_score")).toBe("82");
    expect(localStorage.getItem("lead_score")).toBe("70");
    expect(localStorage.getItem("lead_quality")).toBe("A");
    expect(localStorage.getItem("qualification_bucket")).toBe("high");
    // Historical key consumed by Booking.tsx must stay in sync.
    expect(localStorage.getItem("qualification_score")).toBe("82");
    expect(localStorage.getItem("lead_name")).toBe("Tom");
    expect(localStorage.getItem("lead_email")).toBe("tom@example.com");
    expect(localStorage.getItem("lead_phone")).toBe("+49 123");
  });

  it("sets low_lead_locked when bucket=low and clears it on requalification", () => {
    // Step 1: low result
    persistLeadVerdict({
      lead_id: "lead-1",
      quiz_score: 12,
      lead_score: 18,
      lead_quality: "C",
      qualification_bucket: "low",
    });
    expect(localStorage.getItem("low_lead_locked")).toBe("1");

    // Step 2: same lead, retake with better answers → bucket flips
    persistLeadVerdict({
      lead_id: "lead-1",
      quiz_score: 75,
      lead_score: 68,
      lead_quality: "B",
      qualification_bucket: "mid",
    });
    expect(localStorage.getItem("low_lead_locked")).toBeNull();
    expect(localStorage.getItem("qualification_bucket")).toBe("mid");
    expect(localStorage.getItem("quiz_score")).toBe("75");
  });
});

describe("routeForVerdict", () => {
  it("routes low bucket to /quiz/low-result", () => {
    const dest = routeForVerdict(
      { qualificationBucket: "low" },
      { defaultPath: "/booking" },
    );
    expect(dest).toBe("/quiz/low-result");
  });

  it("routes lead_quality=C to /quiz/low-result even without bucket", () => {
    const dest = routeForVerdict(
      { leadQuality: "C" },
      { defaultPath: "/booking" },
    );
    expect(dest).toBe("/quiz/low-result");
  });

  it("routes mid/high to defaultPath", () => {
    expect(
      routeForVerdict(
        { qualificationBucket: "mid" },
        { defaultPath: "/booking" },
      ),
    ).toBe("/booking");
    expect(
      routeForVerdict(
        { qualificationBucket: "high" },
        { defaultPath: "/booking" },
      ),
    ).toBe("/booking");
  });

  it("respects explicit lowPath override", () => {
    const dest = routeForVerdict(
      { qualificationBucket: "low" },
      { defaultPath: "/booking", lowPath: "/custom-low" },
    );
    expect(dest).toBe("/custom-low");
  });
});
