import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Email audit export — pulls deduplicated rows from email_send_log for the
 * given window (last N days) and emits CSV or PDF. One row per message_id,
 * keeping the latest status (final_delivery_status preferred, then status).
 */

export type AuditRow = {
  message_id: string;
  recipient_email: string | null;
  template_name: string | null;
  final_delivery_status: string | null;
  status: string | null;
  delivery_resolved_at: string | null;
  created_at: string;
  error_message: string | null;
};

export async function fetchAuditRows(days: 7 | 30): Promise<AuditRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("email_send_log")
    .select("message_id, recipient_email, template_name, final_delivery_status, status, delivery_resolved_at, created_at, error_message")
    .gte("created_at", since)
    .not("message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  // Dedup by message_id, keep latest (rows already DESC).
  const seen = new Map<string, AuditRow>();
  for (const r of (data as AuditRow[]) ?? []) {
    if (!seen.has(r.message_id)) seen.set(r.message_id, r);
  }
  return Array.from(seen.values());
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/["\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: AuditRow[]): string {
  const headers = [
    "message_id",
    "recipient_email",
    "template_name",
    "final_delivery_status",
    "status",
    "delivery_resolved_at",
    "created_at",
    "error_message",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.message_id,
      r.recipient_email,
      r.template_name,
      r.final_delivery_status,
      r.status,
      r.delivery_resolved_at,
      r.created_at,
      r.error_message,
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAuditCsv(days: 7 | 30) {
  const rows = await fetchAuditRows(days);
  const csv = rowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `email-audit-${days}d-${stamp}.csv`,
  );
  return rows.length;
}

export async function exportAuditPdf(days: 7 | 30) {
  const rows = await fetchAuditRows(days);
  const stamp = new Date().toISOString().slice(0, 10);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Email Delivery Audit — Letzte ${days} Tage`, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generiert am ${new Date().toLocaleString("de-DE")} • ${rows.length} eindeutige Mails (dedupliziert nach message_id)`, 40, 56);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 72,
    head: [[
      "message_id",
      "Empfänger",
      "Template",
      "Final Status",
      "Resolved At",
      "Created At",
      "Fehler",
    ]],
    body: rows.map((r) => [
      r.message_id.slice(0, 18) + (r.message_id.length > 18 ? "…" : ""),
      r.recipient_email ?? "",
      r.template_name ?? "",
      r.final_delivery_status ?? r.status ?? "",
      r.delivery_resolved_at ? new Date(r.delivery_resolved_at).toLocaleString("de-DE") : "",
      new Date(r.created_at).toLocaleString("de-DE"),
      (r.error_message ?? "").slice(0, 60),
    ]),
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 140 },
      2: { cellWidth: 110 },
      3: { cellWidth: 70 },
      4: { cellWidth: 95 },
      5: { cellWidth: 95 },
      6: { cellWidth: "auto" },
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(`email-audit-${days}d-${stamp}.pdf`);
  return rows.length;
}
