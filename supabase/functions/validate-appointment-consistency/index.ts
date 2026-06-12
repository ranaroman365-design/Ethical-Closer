import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface ValidationIssue {
  appointment_id: string;
  lead_id: string | null;
  starts_at: string;
  issues: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin/L6+
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("level")
      .eq("id", user.id)
      .maybeSingle();
    const level = profile?.level ?? 0;

    if (!isAdmin && level < 6) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all appointments
    const { data: appointments, error } = await supabaseAdmin
      .from("appointments")
      .select("id, lead_id, starts_at, ends_at, booking_timezone, booking_utc_offset, original_local_date, original_local_time, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const issues: ValidationIssue[] = [];
    let totalChecked = 0;
    let totalValid = 0;

    for (const apt of appointments ?? []) {
      totalChecked++;
      const aptIssues: string[] = [];

      // Check 1: booking_timezone must exist
      if (!apt.booking_timezone) {
        aptIssues.push("missing_booking_timezone");
      }

      // Check 2: starts_at (UTC timestamp) must exist
      if (!apt.starts_at) {
        aptIssues.push("missing_utc_timestamp");
      }

      // Check 3: original_local_date and original_local_time should exist
      if (!apt.original_local_date) {
        aptIssues.push("missing_original_local_date");
      }
      if (!apt.original_local_time) {
        aptIssues.push("missing_original_local_time");
      }

      // Check 4: If all fields present, verify consistency
      if (apt.starts_at && apt.booking_timezone && apt.original_local_date && apt.original_local_time) {
        try {
          const utcDate = new Date(apt.starts_at);
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: apt.booking_timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const timeFormatter = new Intl.DateTimeFormat("en-GB", {
            timeZone: apt.booking_timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          const derivedDate = formatter.format(utcDate); // YYYY-MM-DD
          const derivedTime = timeFormatter.format(utcDate); // HH:MM

          if (derivedDate !== apt.original_local_date) {
            aptIssues.push(`date_mismatch: derived=${derivedDate} stored=${apt.original_local_date}`);
          }
          if (derivedTime !== apt.original_local_time) {
            aptIssues.push(`time_mismatch: derived=${derivedTime} stored=${apt.original_local_time}`);
          }
        } catch (e) {
          aptIssues.push(`timezone_error: ${(e as Error).message}`);
        }
      }

      // Check 5: booking_utc_offset format
      if (apt.booking_utc_offset && !/^[+-]\d{2}:\d{2}$/.test(apt.booking_utc_offset)) {
        aptIssues.push(`invalid_utc_offset_format: ${apt.booking_utc_offset}`);
      }

      if (aptIssues.length > 0) {
        issues.push({
          appointment_id: apt.id,
          lead_id: apt.lead_id,
          starts_at: apt.starts_at,
          issues: aptIssues,
        });
      } else {
        totalValid++;
      }
    }

    const result = {
      checked_at: new Date().toISOString(),
      total_checked: totalChecked,
      total_valid: totalValid,
      total_issues: issues.length,
      consistency_rate: totalChecked > 0 ? `${((totalValid / totalChecked) * 100).toFixed(1)}%` : "N/A",
      issues,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
