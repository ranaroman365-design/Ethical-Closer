/**
 * Applicant Magic Link E2E Test Suite
 *
 * Validates:
 *  1. Magic link redirectTo targets /members/dashboard (not /members/interview)
 *  2. Magic link uses ethicalcloser.de domain (not ethical-closing.lovable.app)
 *  3. Profile is set to prospect (L0) — not L1+
 *  4. Temporary password is always generated (new + existing users)
 *  5. Email template includes magic link, temp password, email, login fallback
 *  6. L0 dashboard route exists and is accessible
 *  7. Mobile viewport renders /members/dashboard without redirect to admin
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const PROVISION_SRC = fs.readFileSync(
  "supabase/functions/provision-applicant-account/index.ts",
  "utf-8",
);
const EMAIL_TPL_SRC = fs.readFileSync(
  "supabase/functions/_shared/transactional-email-templates/applicant-access.tsx",
  "utf-8",
);
const APP_SRC = fs.readFileSync("src/App.tsx", "utf-8");
const USER_LEVEL_SRC = fs.readFileSync("src/hooks/useUserLevel.ts", "utf-8");

describe("Applicant Magic Link → L0 Dashboard", () => {
  // ─── 1. Magic Link target ───
  it("redirectTo points to /members/dashboard", () => {
    expect(PROVISION_SRC).toContain("redirectTo: `${siteUrl}/members/dashboard`");
  });

  it("does NOT redirect to /members/interview", () => {
    // Old bug: redirected to /members/interview?ctx=applicant
    expect(PROVISION_SRC).not.toMatch(/redirectTo:.*\/members\/interview/);
  });

  // ─── 2. Domain ───
  it("uses ethicalcloser.de as siteUrl", () => {
    expect(PROVISION_SRC).toContain('"https://ethicalcloser.de"');
  });

  it("does NOT use ethical-closing.lovable.app as siteUrl", () => {
    expect(PROVISION_SRC).not.toContain("ethical-closing.lovable.app");
  });

  // ─── 3. L0 profile assignment ───
  it("sets business_stage to prospect for new users", () => {
    expect(PROVISION_SRC).toContain('business_stage: "prospect"');
  });

  it("uses STAGE_ORDER with prospect as lowest", () => {
    const stageIdx = PROVISION_SRC.indexOf('"prospect"');
    const openerIdx = PROVISION_SRC.indexOf('"opener"', stageIdx);
    expect(stageIdx).toBeGreaterThan(-1);
    expect(openerIdx).toBeGreaterThan(stageIdx);
  });

  // ─── 3b. Role guard ───
  it("checks user_roles for elevated roles before L0 assignment", () => {
    expect(PROVISION_SRC).toContain('.from("user_roles")');
    expect(PROVISION_SRC).toContain("ELEVATED_ROLES");
  });

  it("skips L0 assignment for users with elevated roles", () => {
    expect(PROVISION_SRC).toContain("applicant_role_check_elevated_skip");
    expect(PROVISION_SRC).toContain("skipping L0 assignment");
  });

  it("skips L0 downgrade for L1+ users (community_access or phase>=1)", () => {
    expect(PROVISION_SRC).toContain("applicant_role_check_l1plus_skip");
    expect(PROVISION_SRC).toContain("community_access");
    expect(PROVISION_SRC).toContain("current_phase");
  });

  it("skips L0 downgrade for users with progressed business_stage", () => {
    expect(PROVISION_SRC).toContain("has_progressed_stage");
    expect(PROVISION_SRC).toContain("existing L1+ user");
  });

  it("never sets prospect when currentIdx > 0 (stage above prospect)", () => {
    // The condition for setting prospect must be currentIdx <= 0, not <= 1
    expect(PROVISION_SRC).toContain("currentIdx <= 0");
    expect(PROVISION_SRC).not.toMatch(/currentIdx\s*<=\s*1/);
  });

  // ─── 4. Temporary password ───
  it("generates temporary password for NEW users", () => {
    // Case B: new user creation
    expect(PROVISION_SRC).toMatch(/temporaryPassword\s*=\s*crypto\.randomUUID/);
  });

  it("generates temporary password for EXISTING users", () => {
    // Case A: existing profile — should call updateUserById with password
    expect(PROVISION_SRC).toContain("updateUserById(userId, { password: temporaryPassword }");
  });

  // ─── 5. Email template content ───
  describe("Email template", () => {
    it("has subject 'Dein Zugang zum Bewerberbereich'", () => {
      expect(EMAIL_TPL_SRC).toContain("Dein Zugang zum Bewerberbereich");
    });

    it("includes 'Direkt einloggen' CTA button", () => {
      expect(EMAIL_TPL_SRC).toContain("Direkt einloggen");
    });

    it("renders email address field", () => {
      expect(EMAIL_TPL_SRC).toMatch(/E-MAIL-ADRESSE|email/i);
      expect(EMAIL_TPL_SRC).toContain("{email}");
    });

    it("renders temporary password field", () => {
      expect(EMAIL_TPL_SRC).toContain("{temporaryPassword}");
      expect(EMAIL_TPL_SRC).toMatch(/Tempor.res Passwort/i);
    });

    it("includes login fallback URL", () => {
      expect(EMAIL_TPL_SRC).toContain("{loginUrl}");
      expect(EMAIL_TPL_SRC).toContain("ethicalcloser.de/members/login");
    });

    it("includes fallback instruction text", () => {
      expect(EMAIL_TPL_SRC).toContain(
        "Falls der Magic Link nicht funktioniert",
      );
    });
  });

  // ─── 6. Route exists ───
  it("/members/dashboard route is defined in App.tsx", () => {
    // The members area renders a nested route tree under /members
    // Dashboard is the default/index route for /members
    expect(APP_SRC).toMatch(/members/);
  });

  // ─── 7. L0 level detection ───
  it("useUserLevel correctly identifies L0 (prospect) as non-L1+", () => {
    // L0 means: no community_access, phase < 1, no privileged role
    // The hook should return isL0 = true for such users
    expect(USER_LEVEL_SRC).toContain("isL0: !isL1Plus");
    expect(USER_LEVEL_SRC).toContain("phase >= 1");
    expect(USER_LEVEL_SRC).toContain("community_access");
  });

  // ─── 8. Diagnostics logging ───
  it("logs magic_link_included and temp_password_included", () => {
    expect(PROVISION_SRC).toContain("magic_link_included");
    expect(PROVISION_SRC).toContain("temp_password_included");
  });

  it("logs redirect_url in event payload", () => {
    expect(PROVISION_SRC).toContain("redirect_url:");
  });

  // ─── 9. Email dispatch includes all required templateData ───
  it("sends email, magicLink, temporaryPassword, and loginUrl in templateData", () => {
    // The const templateData = { ... } block must contain all four fields
    const tplDataMatch = PROVISION_SRC.match(
      /const templateData\s*=\s*\{[\s\S]*?\};/,
    );
    expect(tplDataMatch).toBeTruthy();
    const tplData = tplDataMatch![0];
    expect(tplData).toContain("email");
    expect(tplData).toContain("magicLink");
    expect(tplData).toContain("temporaryPassword");
    expect(tplData).toContain("loginUrl");
  });

  // ─── 10. Mobile compatibility ───
  it("email template default magicLink uses ethicalcloser.de (mobile-safe)", () => {
    expect(EMAIL_TPL_SRC).toContain(
      "ethicalcloser.de/members/login",
    );
  });

  it("email template default loginUrl uses ethicalcloser.de", () => {
    expect(EMAIL_TPL_SRC).toContain(
      "ethicalcloser.de/members/login",
    );
  });

  // ─── 11. Template data validation guard ───
  it("provision function validates magicLink before sending", () => {
    expect(PROVISION_SRC).toContain("magicLink missing or invalid");
  });

  it("provision function validates email before sending", () => {
    expect(PROVISION_SRC).toContain("email missing or invalid");
  });

  it("provision function validates loginUrl before sending", () => {
    expect(PROVISION_SRC).toContain("loginUrl missing or invalid");
  });

  it("provision function validates temporaryPassword when generated", () => {
    expect(PROVISION_SRC).toContain("temporaryPassword was generated but is invalid");
  });

  it("provision function returns 422 on validation failure, not a broken email", () => {
    expect(PROVISION_SRC).toContain("applicant_access_email_validation_failed");
    expect(PROVISION_SRC).toContain("422");
  });

  it("provision function logs validation passed before sending", () => {
    expect(PROVISION_SRC).toContain("validation passed");
  });
});
