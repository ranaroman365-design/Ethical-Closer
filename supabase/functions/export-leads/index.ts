import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Service client for data
    const sb = createClient(supabaseUrl, serviceKey);

    // Get caller level
    const { data: profile } = await sb
      .from("profiles")
      .select("current_phase, director_id")
      .eq("id", userId)
      .single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const level = profile.current_phase ?? 1;

    const body = await req.json();
    const { export_type, date_from, date_to } = body;

    // Validate
    if (!export_type || !["my_leads", "team_leads"].includes(export_type)) {
      return new Response(JSON.stringify({ error: "Invalid export_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!date_from || !date_to) {
      return new Response(JSON.stringify({ error: "date_from and date_to required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (export_type === "team_leads" && level < 6) {
      return new Response(JSON.stringify({ error: "Insufficient permissions for team export" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build owner filter
    let ownerFilter: string[] | null = null;

    if (export_type === "my_leads") {
      ownerFilter = [userId];
    } else if (level === 6) {
      const { data: teamProfiles } = await sb
        .from("profiles")
        .select("id")
        .eq("director_id", userId);
      const teamIds = (teamProfiles || []).map((p: any) => p.id);
      ownerFilter = [userId, ...teamIds];
    }
    // L7+ → ownerFilter stays null → all leads

    // ── QUERY LEADS ──
    let leadsQuery = sb
      .from("leads")
      .select("*")
      .eq("is_simulation", false)
      .gte("created_at", date_from)
      .lte("created_at", date_to)
      .order("created_at", { ascending: false });

    if (ownerFilter) {
      leadsQuery = leadsQuery.in("owner_id", ownerFilter);
    }

    const { data: leads, error: leadsErr } = await leadsQuery.limit(5000);
    if (leadsErr) {
      console.error("[export-leads] leads query error:", leadsErr);
      return new Response(JSON.stringify({ error: leadsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Empty result — return valid structure with zero leads
    if (!leads || leads.length === 0) {
      console.info("[export-leads] No leads found for range", { date_from, date_to, export_type });
      return new Response(
        JSON.stringify({
          tabs: { booked: [], no_booking: [], no_show: [], no_close: [] },
          total: 0,
          caller_level: level,
          message: "Keine Leads im gewählten Zeitraum gefunden",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadIds = leads.map((l: any) => l.id);

    // ── QUERY APPOINTMENTS ──
    const { data: appointments } = await sb
      .from("appointments")
      .select("*")
      .in("lead_id", leadIds);
    const apptMap = new Map<string, any[]>();
    for (const a of appointments || []) {
      if (!apptMap.has(a.lead_id)) apptMap.set(a.lead_id, []);
      apptMap.get(a.lead_id)!.push(a);
    }

    // ── QUERY CALLS ──
    const apptIds = (appointments || []).map((a: any) => a.id).filter(Boolean);
    let callByAppt = new Map<string, any>();
    if (apptIds.length > 0) {
      const { data: calls } = await sb
        .from("calls")
        .select("id, user_id, duration, result, self_rating, appointment_id, created_at")
        .in("appointment_id", apptIds)
        .eq("is_simulation", false);
      for (const c of calls || []) {
        if (c.appointment_id) callByAppt.set(c.appointment_id, c);
      }
    }

    // ── QUERY TOUCHPOINTS ──
    const { data: dispatches } = await sb
      .from("communication_dispatch_log")
      .select("lead_id, dispatched_at, event_key, status")
      .in("lead_id", leadIds)
      .order("dispatched_at", { ascending: true });
    const touchpointMap = new Map<string, any[]>();
    for (const d of dispatches || []) {
      if (!d.lead_id) continue;
      if (!touchpointMap.has(d.lead_id)) touchpointMap.set(d.lead_id, []);
      touchpointMap.get(d.lead_id)!.push(d);
    }

    // ── PROFILES for names ──
    const userIds = new Set<string>();
    for (const l of leads) {
      if (l.setter_id) userIds.add(l.setter_id);
      if (l.closer_id) userIds.add(l.closer_id);
      if (l.owner_id) userIds.add(l.owner_id);
    }
    for (const a of appointments || []) {
      if (a.setter_id) userIds.add(a.setter_id);
      if (a.closer_id) userIds.add(a.closer_id);
    }
    const nameMap = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: names } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(userIds));
      for (const n of names || []) {
        nameMap.set(n.id, n.full_name || "–");
      }
    }
    const getName = (id: string | null) => (id ? nameMap.get(id) || "–" : "–");

    // ── BUILD TABS ──
    const booked = leads
      .filter((l: any) => l.has_booking)
      .map((l: any) => {
        const appts = apptMap.get(l.id) || [];
        const latestAppt = appts.sort(
          (a: any, b: any) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
        )[0];
        const showed = latestAppt?.attendance_flag === true;
        const isFuture = latestAppt && new Date(latestAppt.starts_at) > new Date();
        const call = latestAppt ? callByAppt.get(latestAppt.id) : null;

        return {
          lead_id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone,
          booking_date: latestAppt?.starts_at?.split("T")[0] || "",
          booking_time: latestAppt?.starts_at?.split("T")[1]?.slice(0, 5) || "",
          funnel_source: l.source_funnel || l.quiz_funnel_source || l.source,
          quiz_score: l.quiz_score,
          quiz_result: l.quiz_result,
          setter: getName(latestAppt?.setter_id || l.setter_id),
          closer: getName(latestAppt?.closer_id || l.closer_id),
          show_status: isFuture ? "" : showed ? "Show" : "No-Show",
          close_status: isFuture ? "" : l.outcome === "closed_won" ? "Closed" : "Not Closed",
          deal_value: l.deal_value,
          lead_created_at: l.created_at,
          booking_timestamp: latestAppt?.created_at || "",
        };
      });

    const noBooking = leads
      .filter((l: any) => !l.has_booking)
      .map((l: any) => {
        const tps = touchpointMap.get(l.id) || [];
        const diffHours = (a: string | null, b: string | null) => {
          if (!a || !b) return null;
          return Math.round(((new Date(a).getTime() - new Date(b).getTime()) / 3600000) * 10) / 10;
        };
        return {
          lead_id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone,
          quiz_score: l.quiz_score,
          funnel_source: l.source_funnel || l.quiz_funnel_source || l.source,
          created_at: l.created_at,
          touchpoint_count: tps.length,
          time_to_first_contact_h: diffHours(l.first_action_at, l.created_at),
          response: l.last_action_at && l.last_action_at !== l.created_at ? "Ja" : "Nein",
          recovery_status: l.lead_status || "",
        };
      });

    const noShow = leads
      .filter((l: any) => {
        const appts = apptMap.get(l.id) || [];
        return appts.some((a: any) => a.attendance_flag === false || a.appointment_status === "no_show");
      })
      .map((l: any) => {
        const appts = apptMap.get(l.id) || [];
        const nsAppt = appts.find(
          (a: any) => a.attendance_flag === false || a.appointment_status === "no_show"
        );
        const tps = touchpointMap.get(l.id) || [];
        const preApptTps = nsAppt
          ? tps.filter((t: any) => new Date(t.dispatched_at) < new Date(nsAppt.starts_at))
          : [];
        const reminderSent = tps.some((t: any) => t.event_key?.includes("reminder"));

        return {
          lead_id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone,
          booking_date: nsAppt?.starts_at?.split("T")[0] || "",
          booking_time: nsAppt?.starts_at?.split("T")[1]?.slice(0, 5) || "",
          setter: getName(nsAppt?.setter_id || l.setter_id),
          closer: getName(nsAppt?.closer_id || l.closer_id),
          reminder_sent: reminderSent ? "Ja" : "Nein",
          touchpoints_before_appointment: preApptTps.length,
          funnel_source: l.source_funnel || l.quiz_funnel_source || l.source,
          quiz_score: l.quiz_score,
        };
      });

    const noClose = leads
      .filter((l: any) => {
        const appts = apptMap.get(l.id) || [];
        const showedAppt = appts.find((a: any) => a.attendance_flag === true);
        return showedAppt && l.outcome !== "closed_won";
      })
      .map((l: any) => {
        const appts = apptMap.get(l.id) || [];
        const showedAppt = appts.find((a: any) => a.attendance_flag === true);
        const call = showedAppt ? callByAppt.get(showedAppt.id) : null;

        return {
          lead_id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone,
          closer_name: getName(showedAppt?.closer_id || l.closer_id),
          call_duration_min: call?.duration ? Math.round(call.duration / 60) : null,
          follow_up_status: l.follow_up_date ? "Geplant" : l.close_reason ? "Abgeschlossen" : "Offen",
          close_reason: l.close_reason || "",
          funnel_source: l.source_funnel || l.quiz_funnel_source || l.source,
          quiz_score: l.quiz_score,
          deal_value: l.deal_value,
        };
      });

    console.info("[export-leads] success", {
      total: leads.length,
      booked: booked.length,
      noBooking: noBooking.length,
      noShow: noShow.length,
      noClose: noClose.length,
      export_type,
      caller_level: level,
    });

    return new Response(
      JSON.stringify({
        tabs: { booked, no_booking: noBooking, no_show: noShow, no_close: noClose },
        total: leads.length,
        caller_level: level,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[export-leads] error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
