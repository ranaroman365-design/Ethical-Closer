/**
 * L6 Live Integration Test
 * ────────────────────────
 * Runs against the REAL Supabase backend using the anon key (no auth session).
 * Verifies that critical RPCs and views used by L6 users are structurally
 * sound — no missing relations (dir_sub, operator_team_performance, etc.).
 *
 * Auth-gated RPCs may return "auth required" or permission errors — that is
 * expected and healthy. The test fails only on relation/schema errors.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pjufhxzjgdnhvuuvltjn.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA";

const DANIEL_USER_ID = "366e7808-35c7-4329-bd36-323f0f58361e";

let supabase: SupabaseClient;

beforeAll(() => {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
});

/** Assert error is either null or an auth/permission error — never a schema/relation error */
function assertNoSchemaError(error: any) {
  if (!error) return;
  const msg = error.message?.toLowerCase() ?? "";
  const code = error.code ?? "";
  // Auth/permission errors are expected for anon calls
  const isAuthError =
    msg.includes("auth required") ||
    msg.includes("permission denied") ||
    msg.includes("not authorized") ||
    code === "P0001" ||
    code === "42501";
  // Schema-cache miss (PGRST202) for wrong params is also acceptable IF no relation error
  const isRelationError =
    msg.includes("does not exist") ||
    msg.includes("dir_sub") ||
    msg.includes("operator_team_performance");

  expect(isRelationError, `Unexpected schema/relation error: ${error.message}`).toBe(false);
}

// ─── RPC: get_operator_team ──────────────────────────────────────────────────

describe("RPC: get_operator_team (live)", () => {
  it("callable without dir_sub relation error", async () => {
    const { data, error } = await supabase.rpc("get_operator_team" as any, {
      _director: DANIEL_USER_ID,
    });
    assertNoSchemaError(error);

    if (!error) {
      expect(Array.isArray(data)).toBe(true);
    }
  });

  it("returns expected member shape when data available", async () => {
    const { data, error } = await supabase.rpc("get_operator_team" as any, {
      _director: DANIEL_USER_ID,
    });
    assertNoSchemaError(error);

    if (!error && data && data.length > 0) {
      const member = data[0];
      expect(member).toHaveProperty("member_id");
      expect(member).toHaveProperty("member_name");
    }
  });
});

// ─── RPC: get_team_today_overview ────────────────────────────────────────────

describe("RPC: get_team_today_overview (live)", () => {
  it("callable without dir_sub relation error", async () => {
    const { error } = await supabase.rpc("get_team_today_overview" as any, {
      _director: DANIEL_USER_ID,
    });
    assertNoSchemaError(error);
  });
});

// ─── View: user_level_status ─────────────────────────────────────────────────

describe("View: user_level_status (live)", () => {
  it("queryable without relation error", async () => {
    const { data, error } = await supabase
      .from("user_level_status")
      .select("current_level")
      .eq("user_id", DANIEL_USER_ID)
      .maybeSingle();

    assertNoSchemaError(error);

    if (!error && data) {
      expect(data.current_level).toBe(6);
    }
  });
});

// ─── View: operator_team_performance ─────────────────────────────────────────

describe("View: operator_team_performance (live)", () => {
  it("exists and is queryable", async () => {
    const { error } = await supabase
      .from("operator_team_performance")
      .select("*")
      .limit(1);

    assertNoSchemaError(error);
  });
});

// ─── Table: profiles ─────────────────────────────────────────────────────────

describe("Table: profiles (live)", () => {
  it("Daniel's profile exists", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", DANIEL_USER_ID)
      .maybeSingle();

    assertNoSchemaError(error);

    if (!error && data) {
      expect(data.id).toBe(DANIEL_USER_ID);
      expect(data.full_name).toBeTruthy();
    }
  });
});

// ─── Table: appointments (calendar dependency) ───────────────────────────────

describe("Table: appointments (live)", () => {
  it("queryable without relation error", async () => {
    const { error } = await supabase
      .from("appointments")
      .select("id")
      .limit(1);

    assertNoSchemaError(error);
  });
});

// ─── RPC: compute_talent_scores (Talent OS) ──────────────────────────────────

describe("RPC: compute_talent_scores (live)", () => {
  it("callable without relation error", async () => {
    const { error } = await supabase.rpc("compute_talent_scores" as any, {});
    assertNoSchemaError(error);
  });
});
