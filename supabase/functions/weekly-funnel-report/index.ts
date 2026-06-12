// Weekly funnel report — aggregates leads by funnel_source × traffic_owner,
// computes conversion lift vs prior-period baseline, identifies underperformers.
// Returns JSON summary + base64 CSV + base64 PDF.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadRow {
  funnel_source: string | null;
  traffic_owner: string | null;
  closed_at: string | null;
  outcome: string | null;
  payment_status: string | null;
  deal_value: number | null;
  has_booking: boolean | null;
  created_at: string;
}

interface AggKey { funnel_source: string; traffic_owner: string; }
interface AggRow extends AggKey {
  leads: number;
  bookings: number;
  closed_won: number;
  revenue: number;
  conv_rate: number; // closed_won / leads
  book_rate: number; // bookings / leads
}

function bucket(rows: LeadRow[]): Map<string, AggRow> {
  const m = new Map<string, AggRow>();
  for (const r of rows) {
    const fs = r.funnel_source ?? "unknown";
    const to = r.traffic_owner ?? "system";
    const key = `${fs}::${to}`;
    let a = m.get(key);
    if (!a) {
      a = { funnel_source: fs, traffic_owner: to, leads: 0, bookings: 0, closed_won: 0, revenue: 0, conv_rate: 0, book_rate: 0 };
      m.set(key, a);
    }
    a.leads += 1;
    if (r.has_booking) a.bookings += 1;
    const won = r.outcome === "closed_won" || r.payment_status === "paid";
    if (won) {
      a.closed_won += 1;
      a.revenue += Number(r.deal_value ?? 0);
    }
  }
  for (const a of m.values()) {
    a.conv_rate = a.leads ? a.closed_won / a.leads : 0;
    a.book_rate = a.leads ? a.bookings / a.leads : 0;
  }
  return m;
}

function csv(rows: any[][]): string {
  return rows.map(r => r.map(c => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return j({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const srv = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await srv.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    const role = roleRow?.role ?? "member";
    if (!["owner", "admin", "director"].includes(role)) {
      return j({ error: "Forbidden" }, 403);
    }

    const now = new Date();
    const weekStart = new Date(now); weekStart.setUTCDate(now.getUTCDate() - 7);
    const baselineStart = new Date(now); baselineStart.setUTCDate(now.getUTCDate() - 14);

    const cols = "funnel_source,traffic_owner,closed_at,outcome,payment_status,deal_value,has_booking,created_at";
    const { data: current } = await srv.from("leads").select(cols)
      .gte("created_at", weekStart.toISOString()).lt("created_at", now.toISOString())
      .eq("is_simulation", false).limit(50000);
    const { data: baseline } = await srv.from("leads").select(cols)
      .gte("created_at", baselineStart.toISOString()).lt("created_at", weekStart.toISOString())
      .eq("is_simulation", false).limit(50000);

    const cur = bucket((current ?? []) as LeadRow[]);
    const base = bucket((baseline ?? []) as LeadRow[]);

    // Resolve owner labels
    const ownerIds = [...new Set([...cur.values()].map(r => r.traffic_owner).filter(v => v !== "system"))];
    const ownerMap = new Map<string, string>();
    if (ownerIds.length) {
      const { data: profs } = await srv.from("profiles").select("id,display_name,email").in("id", ownerIds);
      for (const p of profs ?? []) ownerMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8));
    }

    type Out = AggRow & { conv_lift_pp: number; book_lift_pp: number; owner_label: string };
    const rows: Out[] = [...cur.values()].map(r => {
      const b = base.get(`${r.funnel_source}::${r.traffic_owner}`);
      return {
        ...r,
        owner_label: r.traffic_owner === "system" ? "system" : (ownerMap.get(r.traffic_owner) ?? r.traffic_owner.slice(0, 8)),
        conv_lift_pp: (r.conv_rate - (b?.conv_rate ?? 0)) * 100,
        book_lift_pp: (r.book_rate - (b?.book_rate ?? 0)) * 100,
      };
    }).sort((a, b) => b.leads - a.leads);

    // Top underperformers: lift_pp < 0, ranked by absolute negative lift × leads (impact)
    const underperformers = [...rows]
      .filter(r => r.conv_lift_pp < 0 && r.leads >= 5)
      .sort((a, b) => (a.conv_lift_pp * a.leads) - (b.conv_lift_pp * b.leads))
      .slice(0, 10);

    // CSV
    const csvText = csv([
      ["funnel_source", "traffic_owner", "owner_label", "leads", "bookings", "closed_won", "revenue", "conv_rate_%", "book_rate_%", "conv_lift_pp", "book_lift_pp"],
      ...rows.map(r => [r.funnel_source, r.traffic_owner, r.owner_label, r.leads, r.bookings, r.closed_won, r.revenue.toFixed(2),
        (r.conv_rate * 100).toFixed(2), (r.book_rate * 100).toFixed(2), r.conv_lift_pp.toFixed(2), r.book_lift_pp.toFixed(2)]),
    ]);

    // PDF
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const W = pdf.internal.pageSize.getWidth();
    let y = 40;
    pdf.setFontSize(16); pdf.text("Weekly Funnel Report", 40, y); y += 18;
    pdf.setFontSize(9); pdf.setTextColor(120);
    pdf.text(`${weekStart.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)} · baseline prior 7d`, 40, y); y += 18;
    pdf.setTextColor(0);

    const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
    const totalWon = rows.reduce((s, r) => s + r.closed_won, 0);
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    pdf.setFontSize(10);
    pdf.text(`Total leads: ${totalLeads}   ·   Closed won: ${totalWon}   ·   Revenue: €${totalRev.toFixed(0)}`, 40, y); y += 22;

    pdf.setFontSize(11); pdf.text("Performance by funnel_source × traffic_owner", 40, y); y += 14;
    pdf.setFontSize(8);
    const headers = ["funnel_source", "owner", "leads", "won", "conv%", "lift pp", "rev"];
    const colX = [40, 150, 260, 305, 350, 400, 460];
    headers.forEach((h, i) => pdf.text(h, colX[i], y));
    y += 4; pdf.line(40, y, W - 40, y); y += 10;

    for (const r of rows.slice(0, 35)) {
      if (y > 780) { pdf.addPage(); y = 40; }
      const cells = [
        r.funnel_source.slice(0, 18),
        r.owner_label.slice(0, 16),
        String(r.leads),
        String(r.closed_won),
        (r.conv_rate * 100).toFixed(1),
        (r.conv_lift_pp >= 0 ? "+" : "") + r.conv_lift_pp.toFixed(1),
        "€" + r.revenue.toFixed(0),
      ];
      cells.forEach((c, i) => pdf.text(c, colX[i], y));
      y += 12;
    }

    y += 14;
    if (y > 720) { pdf.addPage(); y = 40; }
    pdf.setFontSize(11); pdf.text("Top underperforming ladders (negative lift, ≥5 leads)", 40, y); y += 14;
    pdf.setFontSize(8);
    if (underperformers.length === 0) {
      pdf.setTextColor(120); pdf.text("No underperformers detected.", 40, y); pdf.setTextColor(0);
    } else {
      const uh = ["funnel_source", "owner", "leads", "conv%", "lift pp", "impact"];
      uh.forEach((h, i) => pdf.text(h, colX[i], y));
      y += 4; pdf.line(40, y, W - 40, y); y += 10;
      for (const r of underperformers) {
        if (y > 780) { pdf.addPage(); y = 40; }
        const impact = (r.conv_lift_pp * r.leads).toFixed(1);
        const cells = [r.funnel_source.slice(0, 18), r.owner_label.slice(0, 16), String(r.leads),
          (r.conv_rate * 100).toFixed(1), r.conv_lift_pp.toFixed(1), impact];
        cells.forEach((c, i) => pdf.text(c, colX[i], y));
        y += 12;
      }
    }

    const pdfB64 = pdf.output("datauristring").split(",")[1];
    const csvB64 = btoa(unescape(encodeURIComponent(csvText)));

    // Audit
    await srv.from("audit_logs").insert({
      actor_id: user.id, action: "weekly_funnel_report_generated",
      action_type: "report_generated", resource_type: "report", actor_role_key: role,
      after_state: { rows: rows.length, totalLeads, totalWon, underperformers: underperformers.length },
    });

    return j({
      success: true,
      generated_at: now.toISOString(),
      window: { from: weekStart.toISOString(), to: now.toISOString() },
      summary: { totalLeads, totalWon, totalRev, ladders: rows.length, underperformers: underperformers.length },
      rows, underperformers,
      pdf_base64: pdfB64, csv_base64: csvB64,
    });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});

function j(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
