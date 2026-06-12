import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function maskEmail(email: string | null): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${phone.slice(0, 4)} *** *** ${digits.slice(-4)}`;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;
    const userEmail = claims.claims.email as string;

    // ── User level + admin role ──
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("current_phase")
      .eq("id", userId)
      .maybeSingle();
    const userLevel = (profile as any)?.current_phase ?? 0;

    const { data: roleRows } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");

    // ── Parse body ──
    const body = await req.json();
    const exportType = body.export_type as string;
    const ipAddr =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      null;

    if (!["lead", "appointment"].includes(exportType)) {
      return json({ error: "Invalid export_type" }, 400);
    }

    // ════════════════════════════════════════════════
    // LEAD EXPORT — CONTAINMENT POLICY
    // Only admin, requires re-authentication + reason
    // ════════════════════════════════════════════════
    if (exportType === "lead") {
      // Hard gate: admin only
      if (!isAdmin && userLevel < 8) {
        return json(
          { error: "Lead-Daten bleiben aus Sicherheits- und Qualitätsgründen innerhalb der Plattform." },
          403
        );
      }

      // Re-authentication required
      const reAuthPassword = body.password as string | undefined;
      if (!reAuthPassword) {
        return json(
          { error: "Re-Authentifizierung erforderlich. Bitte Passwort erneut eingeben." },
          403
        );
      }

      // Verify password via sign-in
      const { error: signInErr } = await serviceClient.auth.signInWithPassword({
        email: userEmail,
        password: reAuthPassword,
      });
      if (signInErr) {
        return json({ error: "Passwort ungültig. Export verweigert." }, 403);
      }

      // Reason is mandatory
      const reason = (body.reason as string || "").trim();
      if (!reason || reason.length < 10) {
        return json(
          { error: "Pflichtfeld: Begründung mit mindestens 10 Zeichen erforderlich." },
          400
        );
      }

      // Fetch leads
      const { data: leads, error: leadErr } = await serviceClient
        .from("leads")
        .select(
          "id, name, email, phone, source, stage, outcome, lead_score, deal_value, has_booking, created_at, appointment_date, payment_status, no_show_flag"
        )
        .eq("is_simulation", false)
        .order("created_at", { ascending: false })
        .limit(10000);

      if (leadErr) throw leadErr;
      const rows = leads ?? [];
      const columns = [
        "id", "name", "email", "phone", "source", "stage", "outcome",
        "lead_score", "deal_value", "has_booking", "created_at",
        "appointment_date", "payment_status", "no_show_flag",
      ];

      // Full audit log with reason
      await serviceClient.from("export_audit_logs").insert({
        user_id: userId,
        level: userLevel,
        export_type: "lead",
        record_count: rows.length,
        scope: "all",
        reason,
        included_fields: columns,
        ip_address: ipAddr,
      });

      const csv = toCsv(rows, columns);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="leads_export_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // ════════════════════════════════════════════════
    // APPOINTMENT EXPORT — level-scoped, masked
    // ════════════════════════════════════════════════
    if (exportType === "appointment") {
      let scope = "own";
      let query = serviceClient
        .from("appointments")
        .select(
          "id, lead_id, starts_at, appointment_status, attendance_flag, outcome, setter_id, closer_id, current_owner_id, original_owner_id, created_at, leads(name, email, phone)"
        )
        .order("starts_at", { ascending: false })
        .limit(10000);

      if (userLevel >= 8 || isAdmin) {
        scope = "all";
      } else if (userLevel >= 7) {
        scope = "director";
        const { data: teamIds } = await supabase.rpc(
          "get_team_member_ids" as any,
          { p_user_id: userId } as any
        );
        const ids = (teamIds ?? []).map((t: any) => t.member_id);
        ids.push(userId);
        query = query.or(
          `setter_id.in.(${ids.join(",")}),closer_id.in.(${ids.join(",")}),current_owner_id.in.(${ids.join(",")})`
        );
      } else if (userLevel >= 4) {
        scope = "team";
        const { data: teamIds } = await supabase.rpc(
          "get_team_member_ids" as any,
          { p_user_id: userId } as any
        );
        const ids = (teamIds ?? []).map((t: any) => t.member_id);
        ids.push(userId);
        query = query.or(
          `setter_id.in.(${ids.join(",")}),closer_id.in.(${ids.join(",")}),current_owner_id.in.(${ids.join(",")})`
        );
      } else {
        scope = "own";
        query = query.or(
          `setter_id.eq.${userId},closer_id.eq.${userId},current_owner_id.eq.${userId}`
        );
      }

      const { data: appointments, error: apptErr } = await query;
      if (apptErr) throw apptErr;
      const rows = appointments ?? [];
      const canSeeFullData = userLevel >= 8 || isAdmin;

      const flatRows = rows.map((a: any) => ({
        id: a.id,
        lead_name: a.leads?.name ?? "",
        lead_email: canSeeFullData
          ? (a.leads?.email ?? "")
          : maskEmail(a.leads?.email),
        lead_phone: canSeeFullData
          ? (a.leads?.phone ?? "")
          : maskPhone(a.leads?.phone),
        starts_at: a.starts_at,
        status: a.appointment_status,
        attendance: a.attendance_flag,
        outcome: a.outcome,
        setter_id: a.setter_id,
        closer_id: a.closer_id,
        created_at: a.created_at,
      }));

      const columns = [
        "id", "lead_name", "lead_email", "lead_phone", "starts_at",
        "status", "attendance", "outcome", "setter_id", "closer_id", "created_at",
      ];

      await serviceClient.from("export_audit_logs").insert({
        user_id: userId,
        level: userLevel,
        export_type: "appointment",
        record_count: flatRows.length,
        scope,
        included_fields: columns,
        ip_address: ipAddr,
      });

      const csv = toCsv(flatRows, columns);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="appointments_export_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return json({ error: "Invalid request" }, 400);
  } catch (e) {
    console.error("secure-export error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
