// Capacity Engine Phase 1 — Slot Generator (READ-ONLY)
// Returns available 30min slots per operator over a window.
// Does NOT mutate any booking state. Does NOT call check_setter_availability.
// Architecture: Supabase = SoT, this function = pure derivation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WorkingHour { weekday: number; start: string; end: string; }
interface Operator {
  operator_id: string;
  current_level: number;
  display_name: string | null;
  is_active: boolean;
  timezone: string;
  working_hours: WorkingHour[];
  max_per_day: number;
  max_per_hour: number;
  buffer_minutes: number;
  slot_duration_minutes: number;
  has_explicit_profile: boolean;
}
interface Block { starts_at: string; ends_at: string; block_type: string; recurrence_pattern: any; }
interface Appt { starts_at: string; ends_at: string | null; setter_id: string | null; closer_id: string | null; status: string; }
interface ExtEvent { start: string; end: string; summary?: string; }
interface ExtSource { operator_id: string; cached_events: ExtEvent[]; status: string; }

interface Slot {
  operator_id: string;
  starts_at: string;
  ends_at: string;
  status: 'free' | 'partial' | 'full' | 'blocked' | 'external_busy' | 'booked';
  reason?: string;
}

interface DayBucket {
  date: string;        // YYYY-MM-DD
  operator_id: string;
  total: number;
  free: number;
  booked: number;
  blocked: number;
  utilization: number; // 0..1
}

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

// ISO weekday 1..7 (Mon=1)
function isoWeekday(d: Date): number {
  const w = d.getUTCDay(); // 0..6 Sun..Sat
  return w === 0 ? 7 : w;
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function expandRecurringBlocks(block: Block, windowStart: Date, windowEnd: Date): Array<{ s: Date; e: Date }> {
  if (block.block_type !== 'recurring_weekly' || !block.recurrence_pattern) {
    return [{ s: new Date(block.starts_at), e: new Date(block.ends_at) }];
  }
  const pat = block.recurrence_pattern as { weekdays: number[]; start_time: string; end_time: string; until?: string };
  const out: Array<{ s: Date; e: Date }> = [];
  const until = pat.until ? new Date(pat.until) : windowEnd;
  const cap = until < windowEnd ? until : windowEnd;
  const cursor = new Date(windowStart);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= cap) {
    if (pat.weekdays?.includes(isoWeekday(cursor))) {
      const { h: sh, m: sm } = parseHM(pat.start_time);
      const { h: eh, m: em } = parseHM(pat.end_time);
      const s = new Date(cursor); s.setUTCHours(sh, sm, 0, 0);
      const e = new Date(cursor); e.setUTCHours(eh, em, 0, 0);
      if (e > s) out.push({ s, e });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function generateSlotsForOperator(
  op: Operator,
  windowStart: Date,
  windowEnd: Date,
  appts: Appt[],
  blocks: Block[],
  extEvents: ExtEvent[],
): { slots: Slot[]; days: DayBucket[] } {
  const slots: Slot[] = [];
  const dayMap = new Map<string, DayBucket>();
  const stepMs = op.slot_duration_minutes * 60 * 1000;
  const bufferMs = op.buffer_minutes * 60 * 1000;

  // Pre-expand blocks
  const blockRanges: Array<{ s: Date; e: Date }> = [];
  for (const b of blocks) {
    blockRanges.push(...expandRecurringBlocks(b, windowStart, windowEnd));
  }

  // Pre-parse busy ranges (appointments + external)
  const apptRanges = appts
    .filter(a => ['booked', 'confirmed', 'scheduled', 'pending_payment'].includes(a.status))
    .map(a => {
      const s = new Date(a.starts_at);
      const e = a.ends_at ? new Date(a.ends_at) : new Date(s.getTime() + stepMs);
      return { s: new Date(s.getTime() - bufferMs), e: new Date(e.getTime() + bufferMs) };
    });

  const extRanges = extEvents.map(ev => ({ s: new Date(ev.start), e: new Date(ev.end) }));

  // Iterate day by day in operator timezone — Phase 1 keeps it UTC for determinism;
  // working_hours times are interpreted as local-naive applied to UTC date.
  const cursor = new Date(windowStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor < windowEnd) {
    const wd = isoWeekday(cursor);
    const wh = op.working_hours.find(w => w.weekday === wd);
    const dKey = dayKey(cursor);
    if (!dayMap.has(dKey)) {
      dayMap.set(dKey, { date: dKey, operator_id: op.operator_id, total: 0, free: 0, booked: 0, blocked: 0, utilization: 0 });
    }
    const bucket = dayMap.get(dKey)!;

    if (!wh) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }

    const { h: sh, m: sm } = parseHM(wh.start);
    const { h: eh, m: em } = parseHM(wh.end);
    const dayStart = new Date(cursor); dayStart.setUTCHours(sh, sm, 0, 0);
    const dayEnd = new Date(cursor); dayEnd.setUTCHours(eh, em, 0, 0);

    let bookedToday = 0;
    const slotStart = new Date(dayStart);
    while (slotStart.getTime() + stepMs <= dayEnd.getTime() && slotStart < windowEnd) {
      if (slotStart >= windowStart) {
        const slotEnd = new Date(slotStart.getTime() + stepMs);
        let status: Slot['status'] = 'free';
        let reason: string | undefined;

        if (blockRanges.some(r => overlaps(slotStart, slotEnd, r.s, r.e))) {
          status = 'blocked'; reason = 'calendar_block';
        } else if (extRanges.some(r => overlaps(slotStart, slotEnd, r.s, r.e))) {
          status = 'external_busy'; reason = 'external_calendar';
        } else if (apptRanges.some(r => overlaps(slotStart, slotEnd, r.s, r.e))) {
          status = 'booked'; reason = 'appointment';
          bookedToday++;
        } else if (bookedToday >= op.max_per_day) {
          status = 'full'; reason = 'max_per_day_reached';
        } else {
          // Per-hour cap check
          const hourStart = new Date(slotStart); hourStart.setUTCMinutes(0, 0, 0);
          const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
          const inHour = apptRanges.filter(r => overlaps(r.s, r.e, hourStart, hourEnd)).length;
          if (inHour >= op.max_per_hour) {
            status = 'full'; reason = 'max_per_hour_reached';
          }
        }

        slots.push({
          operator_id: op.operator_id,
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          status,
          reason,
        });

        bucket.total++;
        if (status === 'free') bucket.free++;
        else if (status === 'booked') bucket.booked++;
        else bucket.blocked++;
      }
      slotStart.setTime(slotStart.getTime() + stepMs);
    }

    bucket.utilization = bucket.total > 0 ? (bucket.booked + bucket.blocked) / bucket.total : 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { slots, days: Array.from(dayMap.values()) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // User-scoped client to honor RLS for permission checks
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Permission gate: L6+ or admin
    const { data: lvl } = await userClient
      .from('user_level_status')
      .select('current_level')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    const { data: isAdmin } = await userClient.rpc('has_role', {
      _user_id: userData.user.id, _role: 'admin',
    });
    const allowed = (lvl?.current_level ?? 0) >= 6 || isAdmin === true;
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden — L6+/admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 14 * 86400 * 1000);
    const windowStart = body.window_start ? new Date(body.window_start) : now;
    const windowEnd = body.window_end ? new Date(body.window_end) : defaultEnd;
    const operatorFilter: string[] | null = Array.isArray(body.operator_ids) && body.operator_ids.length ? body.operator_ids : null;

    if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime()) || windowEnd <= windowStart) {
      return new Response(JSON.stringify({ error: 'Invalid window' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service role client for read aggregation across operators (read-only, no writes)
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Eligible operators
    let opsQuery = svc.from('v_capacity_eligible_operators').select('*').eq('is_active', true);
    if (operatorFilter) opsQuery = opsQuery.in('operator_id', operatorFilter);
    const { data: ops, error: opsErr } = await opsQuery;
    if (opsErr) throw opsErr;
    const operators = (ops ?? []) as Operator[];

    if (operators.length === 0) {
      return new Response(JSON.stringify({
        window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
        operators: [], slots: [], days: [],
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const opIds = operators.map(o => o.operator_id);

    // 2. Appointments overlapping window
    const { data: apptsRaw } = await svc
      .from('appointments')
      .select('starts_at, ends_at, setter_id, closer_id, status')
      .gte('starts_at', new Date(windowStart.getTime() - 86400000).toISOString())
      .lte('starts_at', new Date(windowEnd.getTime() + 86400000).toISOString());
    const apptsByOp = new Map<string, Appt[]>();
    for (const a of (apptsRaw ?? []) as Appt[]) {
      for (const opId of [a.setter_id, a.closer_id]) {
        if (opId && opIds.includes(opId)) {
          if (!apptsByOp.has(opId)) apptsByOp.set(opId, []);
          apptsByOp.get(opId)!.push(a);
        }
      }
    }

    // 3. Blocks overlapping window (+ all recurring)
    const { data: blocksRaw } = await svc
      .from('setter_calendar_blocks')
      .select('operator_id, starts_at, ends_at, block_type, recurrence_pattern')
      .in('operator_id', opIds)
      .or(`and(starts_at.lte.${windowEnd.toISOString()},ends_at.gte.${windowStart.toISOString()}),block_type.eq.recurring_weekly`);
    const blocksByOp = new Map<string, Block[]>();
    for (const b of (blocksRaw ?? []) as any[]) {
      if (!blocksByOp.has(b.operator_id)) blocksByOp.set(b.operator_id, []);
      blocksByOp.get(b.operator_id)!.push(b);
    }

    // 4. External calendar cache
    const { data: extRaw } = await svc
      .from('external_calendar_sources')
      .select('operator_id, cached_events, status')
      .in('operator_id', opIds)
      .eq('status', 'active');
    const extByOp = new Map<string, ExtEvent[]>();
    for (const s of (extRaw ?? []) as ExtSource[]) {
      const evs = (s.cached_events ?? []).filter(e => {
        const es = new Date(e.start), ee = new Date(e.end);
        return ee >= windowStart && es <= windowEnd;
      });
      if (!extByOp.has(s.operator_id)) extByOp.set(s.operator_id, []);
      extByOp.get(s.operator_id)!.push(...evs);
    }

    // 5. Generate slots per operator
    const allSlots: Slot[] = [];
    const allDays: DayBucket[] = [];
    for (const op of operators) {
      const { slots, days } = generateSlotsForOperator(
        op, windowStart, windowEnd,
        apptsByOp.get(op.operator_id) ?? [],
        blocksByOp.get(op.operator_id) ?? [],
        extByOp.get(op.operator_id) ?? [],
      );
      allSlots.push(...slots);
      allDays.push(...days);
    }

    return new Response(JSON.stringify({
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      operators: operators.map(o => ({
        operator_id: o.operator_id,
        display_name: o.display_name,
        current_level: o.current_level,
        has_explicit_profile: o.has_explicit_profile,
        max_per_day: o.max_per_day,
        max_per_hour: o.max_per_hour,
        slot_duration_minutes: o.slot_duration_minutes,
        buffer_minutes: o.buffer_minutes,
      })),
      slots: allSlots,
      days: allDays,
      meta: {
        generated_at: new Date().toISOString(),
        slot_count: allSlots.length,
        operator_count: operators.length,
        engine_version: 'capacity-v1-readonly',
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[capacity-generate-slots] error', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
