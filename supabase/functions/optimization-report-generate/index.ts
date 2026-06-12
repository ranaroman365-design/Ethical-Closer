// Layer 37 — PDF report generator for change/daily/weekly/operator/rollback.
// Invoke: { report_id?: string, change_id?: string, report_type, scope_type, scope_id?, module? }
// Renders a minimal but professional PDF with pdf-lib, uploads to
// storage bucket `optimization-reports`, then updates optimization_reports row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

interface Body {
  report_id?: string;
  change_id?: string;
  version_id?: string;
  report_type: "change" | "daily" | "weekly" | "operator" | "rollback";
  scope_type: "global" | "operator" | "funnel" | "lead";
  scope_id?: string | null;
  module?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.report_type) {
      return json({ error: "report_type required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) ensure / create the report row
    let reportId = body.report_id ?? null;
    if (!reportId) {
      const { data, error } = await supabase
        .from("optimization_reports")
        .insert({
          report_type: body.report_type,
          module: body.module ?? null,
          scope_type: body.scope_type,
          scope_id: body.scope_id ?? null,
          change_id: body.change_id ?? null,
          version_id: body.version_id ?? null,
          status: "pending",
          metadata: {},
        })
        .select("id")
        .single();
      if (error) throw error;
      reportId = data.id;
    }

    // 2) collect data per report type
    const ctx: Record<string, unknown> = {
      report_type: body.report_type,
      scope_type: body.scope_type,
      scope_id: body.scope_id ?? null,
      module: body.module ?? null,
      generated_at: new Date().toISOString(),
    };

    if (body.report_type === "change" || body.report_type === "rollback") {
      if (body.change_id) {
        const { data } = await supabase
          .from("change_audit_log")
          .select("*")
          .eq("change_id", body.change_id)
          .maybeSingle();
        if (data) ctx.change = data;
      }
    }

    if (body.report_type === "daily" || body.report_type === "weekly") {
      const days = body.report_type === "daily" ? 1 : 7;
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      let q = supabase
        .from("change_audit_log")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (body.scope_type !== "global" && body.scope_id) {
        q = q.eq("scope_type", body.scope_type).eq("scope_id", body.scope_id);
      }
      const { data } = await q;
      ctx.changes = data ?? [];
    }

    if (body.report_type === "operator" && body.scope_id) {
      const { data } = await supabase
        .from("change_audit_log")
        .select("*")
        .eq("scope_id", body.scope_id)
        .order("created_at", { ascending: false })
        .limit(100);
      ctx.changes = data ?? [];
    }

    // 3) render the PDF
    const pdfBytes = await renderPdf(ctx);

    // 4) upload
    const yyyy = new Date().getUTCFullYear();
    const mm = String(new Date().getUTCMonth() + 1).padStart(2, "0");
    const path = `${body.report_type}/${yyyy}/${mm}/${reportId}.pdf`;

    const { error: upErr } = await supabase.storage
      .from("optimization-reports")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: signed } = await supabase.storage
      .from("optimization-reports")
      .createSignedUrl(path, 60 * 60 * 24 * 30);

    await supabase
      .from("optimization_reports")
      .update({
        status: "ready",
        storage_path: path,
        file_url: signed?.signedUrl ?? null,
      })
      .eq("id", reportId);

    return json({ ok: true, report_id: reportId, storage_path: path, file_url: signed?.signedUrl });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function renderPdf(ctx: Record<string, unknown>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const gold = rgb(0.788, 0.659, 0.298);

  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const left = 56;

  function newPageIfNeeded(needed = 60) {
    if (y - needed < 56) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
  }

  function line(text: string, opts: { size?: number; color?: any; font?: any; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const f = opts.font ?? font;
    const color = opts.color ?? ink;
    const wrapped = wrap(text, 90);
    for (const w of wrapped) {
      newPageIfNeeded(size + 4);
      page.drawText(w, { x: left, y, size, font: f, color });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  }

  // Header
  page.drawRectangle({ x: 0, y: 820, width: 595, height: 22, color: gold });
  page.drawText("ETC — Optimization Report", { x: left, y: 826, size: 12, font: bold, color: rgb(1,1,1) });
  y = 790;

  const titleMap: Record<string, string> = {
    change: "Change Report",
    daily: "Daily Optimization Report",
    weekly: "Weekly Performance Report",
    operator: "Operator Report",
    rollback: "Rollback Report",
  };
  line(titleMap[String(ctx.report_type)] ?? "Report", { size: 20, font: bold, gap: 6 });
  line(`Generated: ${ctx.generated_at}`, { color: muted, gap: 2 });
  line(`Scope: ${ctx.scope_type}${ctx.scope_id ? ` · ${ctx.scope_id}` : ""}${ctx.module ? ` · module: ${ctx.module}` : ""}`, { color: muted, gap: 14 });

  // Body
  if (ctx.change) {
    const c: any = ctx.change;
    line("Summary", { size: 14, font: bold, gap: 4 });
    line(`Change ID: ${c.change_id}`);
    line(`Module: ${c.module}`);
    line(`Type: ${c.change_type}   Risk: ${c.risk_level ?? "n/a"}`);
    line(`Actor: ${c.changed_by_kind} ${c.changed_by ?? ""}`);
    line(`Reversible: ${c.reversible ? "yes" : "no"}`);
    line(`When: ${c.created_at}`, { gap: 10 });

    line("Reason", { size: 14, font: bold, gap: 4 });
    line(c.reason ?? "—", { gap: 10 });

    if (c.expected_impact) {
      line("Expected Impact", { size: 14, font: bold, gap: 4 });
      line(c.expected_impact, { gap: 10 });
    }

    line("Previous State", { size: 14, font: bold, gap: 4 });
    line(jsonPretty(c.previous_state), { size: 9, gap: 10 });

    line("New State", { size: 14, font: bold, gap: 4 });
    line(jsonPretty(c.new_state), { size: 9, gap: 10 });

    if (c.before_metric || c.after_metric) {
      line("Metrics", { size: 14, font: bold, gap: 4 });
      if (c.before_metric) line(`Before: ${jsonPretty(c.before_metric)}`, { size: 9 });
      if (c.after_metric)  line(`After:  ${jsonPretty(c.after_metric)}`, { size: 9, gap: 10 });
    }
  }

  if (Array.isArray(ctx.changes)) {
    line(`Changes (${(ctx.changes as any[]).length})`, { size: 14, font: bold, gap: 6 });
    for (const c of ctx.changes as any[]) {
      newPageIfNeeded(40);
      line(`• ${c.created_at}  [${c.module}] ${c.change_type}  risk=${c.risk_level ?? "—"}`, { size: 10 });
      line(`   ${c.reason ?? ""}`, { size: 9, color: muted, gap: 2 });
    }
  }

  // Footer
  newPageIfNeeded(40);
  y = Math.max(y, 60);
  page.drawText("Layer 37 · Audit, Versioning & Reporting · ETC Revenue OS", {
    x: left, y: 32, size: 8, font, color: muted,
  });

  return await doc.save();
}

function jsonPretty(v: unknown): string {
  try { return JSON.stringify(v ?? {}, null, 2); } catch { return String(v); }
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of String(text).split("\n")) {
    if (raw.length <= width) { out.push(raw); continue; }
    let line = "";
    for (const word of raw.split(" ")) {
      if ((line + " " + word).trim().length > width) {
        if (line) out.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
