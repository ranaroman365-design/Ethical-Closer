/**
 * A/B Funnel Test — client splitter.
 *
 * Sequential, single-active-test architecture. The server is the source of
 * truth; this client merely:
 *   1. Reads the active test (cached for the session).
 *   2. If the current page funnel is one of the two arms, asks the RPC
 *      `ab_assign_funnel(session_id, page_funnel)` for a sticky bucket
 *      assignment (deterministic 50/50 via SHA-256 server-side).
 *   3. Caches the assigned funnel so funnel_source stays IMMUTABLE for the
 *      session — every page view in the visit returns the same answer.
 *
 * No active test → page funnel passes through unchanged. Zero risk to the
 * existing capture path.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  getOrCreateAttributionSessionId,
} from "@/lib/attribution-session";
import { funnelSourceForPath, type FunnelSource } from "@/lib/funnel-source";

const SS_ASSIGNMENT_PREFIX = "etc_ab_funnel_assignment_v1:";
const SS_ACTIVE_TEST_KEY = "etc_ab_funnel_active_test_v1";

interface ActiveTest {
  id: string;
  test_key: string;
  test_number: number;
  champion_funnel: FunnelSource;
  challenger_funnel: FunnelSource;
}

function readActiveTestCache(): ActiveTest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_ACTIVE_TEST_KEY);
    return raw ? (JSON.parse(raw) as ActiveTest) : null;
  } catch { return null; }
}

function writeActiveTestCache(t: ActiveTest | null) {
  if (typeof window === "undefined") return;
  try {
    if (t) window.sessionStorage.setItem(SS_ACTIVE_TEST_KEY, JSON.stringify(t));
    else window.sessionStorage.removeItem(SS_ACTIVE_TEST_KEY);
  } catch { /* ignore */ }
}

/** Resolve the active test from server (cached per session). */
export async function getActiveAbFunnelTest(): Promise<ActiveTest | null> {
  const cached = readActiveTestCache();
  if (cached) return cached;
  try {
    const { data, error } = await supabase.rpc("ab_active_test" as never);
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row || !row.id) return null;
    const t: ActiveTest = {
      id: String(row.id),
      test_key: String(row.test_key),
      test_number: Number(row.test_number),
      champion_funnel: row.champion_funnel as FunnelSource,
      challenger_funnel: row.challenger_funnel as FunnelSource,
    };
    writeActiveTestCache(t);
    return t;
  } catch { return null; }
}

/**
 * Returns the funnel_source the current visitor should be attributed to,
 * honoring the active A/B test if the page matches one of its arms.
 *
 * Sticky for the lifetime of the session. Safe to call on every page view.
 */
export async function resolveAbFunnelSource(): Promise<FunnelSource | null> {
  if (typeof window === "undefined") return null;
  const pageFunnel = funnelSourceForPath(window.location.pathname);
  if (!pageFunnel) return null;

  const test = await getActiveAbFunnelTest();
  if (!test) return pageFunnel;
  if (pageFunnel !== test.champion_funnel && pageFunnel !== test.challenger_funnel) {
    return pageFunnel;
  }

  const cacheKey = SS_ASSIGNMENT_PREFIX + test.test_key;
  try {
    const cached = window.sessionStorage.getItem(cacheKey);
    if (cached) return cached as FunnelSource;
  } catch { /* ignore */ }

  const sessionId = getOrCreateAttributionSessionId();
  try {
    const { data, error } = await supabase.rpc("ab_assign_funnel" as never, {
      p_session_id: sessionId,
      p_page_funnel: pageFunnel,
    } as never);
    if (error || !data) return pageFunnel;
    const assigned = data as FunnelSource;
    try { window.sessionStorage.setItem(cacheKey, assigned); } catch { /* ignore */ }
    return assigned;
  } catch {
    return pageFunnel;
  }
}

/** Once a lead row exists, link the assignment so KPI views can roll up. */
export async function linkAbFunnelAssignment(leadId: string): Promise<void> {
  if (!leadId) return;
  const sessionId = getOrCreateAttributionSessionId();
  try {
    await supabase.rpc("ab_link_assignment" as never, {
      p_session_id: sessionId,
      p_lead_id: leadId,
    } as never);
  } catch { /* non-blocking */ }
}
