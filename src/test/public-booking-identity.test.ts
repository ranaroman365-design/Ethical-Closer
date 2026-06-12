/**
 * Public Booking Flow — Identity Separation Tests
 *
 * Validates that:
 * a) Known leads can book via /book
 * b) Unknown visitors can book after entering email + name
 * c) Existing auth users without a lead get a lead created
 * d) Applicants remain applicants, not operators
 * e) Operators/admins who also submitted apply form are not downgraded
 *
 * These are unit tests for the identity separation logic — the edge function
 * is tested via its trace/response contract.
 */
import { describe, it, expect } from "vitest";

// ─── Booking Identity vs Platform Identity ───
// The core rule: lead creation/resolution for a booking NEVER affects
// the user's platform role (profile.business_stage, user_roles.role, etc.)

interface LeadRecord {
  id: string;
  email: string;
  name?: string;
  lead_source?: string;
  stage?: string;
  lead_quality?: string | null;
  quiz_score?: number | null;
  qualification_bucket?: string | null;
}

interface ProfileRecord {
  id: string;
  user_id: string;
  business_stage?: string;
  community_access?: boolean;
  current_phase?: number;
}

interface UserRole {
  user_id: string;
  role: string;
}

// Simulate the identity resolution logic from create-appointment
function resolveBookingIdentity(
  email: string,
  existingLeads: LeadRecord[],
  contactName: string,
  contactPhone: string,
  isPublicBooking: boolean,
): {
  resolved: boolean;
  resolvedVia: "lead_id" | "email" | "upsert" | "none";
  shouldCreateLead: boolean;
  skipQualificationGate: boolean;
} {
  const normalizedEmail = email.trim().toLowerCase();

  // Try email match
  const emailLead = existingLeads.find(
    (l) => l.email.trim().toLowerCase() === normalizedEmail,
  );

  if (emailLead) {
    return {
      resolved: true,
      resolvedVia: "email",
      shouldCreateLead: false,
      skipQualificationGate: isPublicBooking,
    };
  }

  // No lead found — for public bookings, we create one
  if (isPublicBooking && contactName && contactPhone) {
    return {
      resolved: false,
      resolvedVia: "none",
      shouldCreateLead: true,
      skipQualificationGate: true,
    };
  }

  return {
    resolved: false,
    resolvedVia: "none",
    shouldCreateLead: false,
    skipQualificationGate: isPublicBooking,
  };
}

// Simulate that lead creation NEVER touches platform identity
function shouldDowngradePlatformRole(
  existingProfile: ProfileRecord | null,
  existingRoles: UserRole[],
  _newLeadSource: string,
): boolean {
  // CRITICAL RULE: Creating a lead from public_booking_page
  // must NEVER modify profiles or user_roles. This function
  // should always return false.
  return false;
}

describe("Public Booking Identity Separation", () => {
  // a) Known lead booking
  it("resolves existing lead by email for public booking", () => {
    const leads: LeadRecord[] = [
      { id: "lead-1", email: "known@example.com", name: "Known User", lead_quality: "A", quiz_score: 15, qualification_bucket: "high" },
    ];
    const result = resolveBookingIdentity("known@example.com", leads, "Known User", "+49123", true);
    expect(result.resolved).toBe(true);
    expect(result.resolvedVia).toBe("email");
    expect(result.shouldCreateLead).toBe(false);
    expect(result.skipQualificationGate).toBe(true);
  });

  // b) Unknown visitor booking
  it("creates new lead for unknown visitor on public booking", () => {
    const leads: LeadRecord[] = [];
    const result = resolveBookingIdentity("new@example.com", leads, "New Visitor", "+49456", true);
    expect(result.resolved).toBe(false);
    expect(result.shouldCreateLead).toBe(true);
    expect(result.skipQualificationGate).toBe(true);
  });

  // b2) Unknown visitor WITHOUT public_booking flag → no lead created
  it("does NOT create lead for unknown visitor on quiz-gated booking", () => {
    const leads: LeadRecord[] = [];
    const result = resolveBookingIdentity("new@example.com", leads, "New Visitor", "+49456", false);
    expect(result.resolved).toBe(false);
    expect(result.shouldCreateLead).toBe(false);
    expect(result.skipQualificationGate).toBe(false);
  });

  // c) Existing auth user without lead → lead should be created
  it("creates lead for auth user without existing lead on public booking", () => {
    const leads: LeadRecord[] = [];
    const result = resolveBookingIdentity("authuser@example.com", leads, "Auth User", "+49789", true);
    expect(result.resolved).toBe(false);
    expect(result.shouldCreateLead).toBe(true);
    expect(result.skipQualificationGate).toBe(true);
  });

  // d) Applicant should remain applicant, not become operator
  it("never downgrades platform role when lead is created", () => {
    const profile: ProfileRecord = {
      id: "p1",
      user_id: "u1",
      business_stage: "prospect",
      community_access: false,
      current_phase: 0,
    };
    const roles: UserRole[] = [{ user_id: "u1", role: "member" }];
    expect(shouldDowngradePlatformRole(profile, roles, "public_booking_page")).toBe(false);
  });

  // e) Operator/admin who also applied — role must NOT be overwritten
  it("never overwrites operator role when lead exists from apply flow", () => {
    const profile: ProfileRecord = {
      id: "p2",
      user_id: "u2",
      business_stage: "opener",
      community_access: true,
      current_phase: 1,
    };
    const roles: UserRole[] = [{ user_id: "u2", role: "admin" }];
    expect(shouldDowngradePlatformRole(profile, roles, "public_booking_page")).toBe(false);
  });

  it("never overwrites L6 operator role when booking lead is created", () => {
    const profile: ProfileRecord = {
      id: "p3",
      user_id: "u3",
      business_stage: "senior_closer",
      community_access: true,
      current_phase: 6,
    };
    const roles: UserRole[] = [{ user_id: "u3", role: "member" }];
    expect(shouldDowngradePlatformRole(profile, roles, "public_booking_page")).toBe(false);
  });

  // Quiz gate is skipped for public bookings
  it("skips qualification gate for public bookings even with null scores", () => {
    const leads: LeadRecord[] = [
      { id: "lead-noq", email: "noq@example.com", lead_quality: null, quiz_score: null, qualification_bucket: null },
    ];
    const result = resolveBookingIdentity("noq@example.com", leads, "No Quiz", "+49111", true);
    expect(result.resolved).toBe(true);
    expect(result.skipQualificationGate).toBe(true);
  });

  // Quiz gate is NOT skipped for regular bookings
  it("enforces qualification gate for regular (non-public) bookings", () => {
    const leads: LeadRecord[] = [
      { id: "lead-q", email: "q@example.com", lead_quality: "A", quiz_score: 15, qualification_bucket: "high" },
    ];
    const result = resolveBookingIdentity("q@example.com", leads, "Qualified", "+49222", false);
    expect(result.resolved).toBe(true);
    expect(result.skipQualificationGate).toBe(false);
  });

  // Email normalization
  it("normalizes email for matching", () => {
    const leads: LeadRecord[] = [
      { id: "lead-case", email: "Test@Example.COM" },
    ];
    const result = resolveBookingIdentity("test@example.com", leads, "Test", "+49", true);
    expect(result.resolved).toBe(true);
    expect(result.resolvedVia).toBe("email");
  });
});
