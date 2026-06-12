/**
 * Audience Export — Meta Custom Audiences + Google Customer Match
 *
 * Generates upload-ready CSVs per retargeting segment:
 *  - Meta Custom Audience (SHA-256 hashed: email, phone, fn, ln, country)
 *  - Google Customer Match (SHA-256 hashed: Email, Phone, First Name, Last Name, Country)
 *  - UTM Enrichment CSV (raw; for internal analytics / offline conversion uploads)
 *
 * All PII is normalized (lowercase, trimmed, phone → E.164 digits) then SHA-256
 * hashed per Meta / Google spec. The raw UTM CSV is INTERNAL ONLY — do not
 * upload to ad platforms (UTM is not a recognized audience field).
 */

export type AudienceLead = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  do_not_contact?: boolean | null;
  // UTM / first-touch
  origin_source?: string | null;
  origin_campaign?: string | null;
  origin_adset?: string | null;
  origin_ad?: string | null;
  origin_content?: string | null;
  origin_medium?: string | null;
  origin_term?: string | null;
  landing_url?: string | null;
  referrer_url?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
};

// ── normalization ──────────────────────────────────────────────────────────
const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();
const normPhone = (p?: string | null) => {
  const digits = (p ?? "").replace(/[^\d]/g, "");
  return digits; // Meta + Google both want digits only (no +). Country code included.
};
const splitName = (full?: string | null): { fn: string; ln: string } => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { fn: "", ln: "" };
  if (parts.length === 1) return { fn: parts[0].toLowerCase(), ln: "" };
  return { fn: parts[0].toLowerCase(), ln: parts.slice(1).join(" ").toLowerCase() };
};

// ── SHA-256 via WebCrypto ──────────────────────────────────────────────────
async function sha256(input: string): Promise<string> {
  if (!input) return "";
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── CSV serializer ─────────────────────────────────────────────────────────
const csvCell = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], headers: string[]): string => {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\n");
};

// ── public exporters ───────────────────────────────────────────────────────

/** Meta Custom Audience CSV. Columns: email, phone, fn, ln (all SHA-256). */
export async function buildMetaCustomAudienceCsv(leads: AudienceLead[]): Promise<string> {
  const eligible = leads.filter((l) => !l.do_not_contact && (l.email || l.phone));
  const rows = await Promise.all(
    eligible.map(async (l) => {
      const { fn, ln } = splitName(l.name);
      const [email, phone, fnH, lnH] = await Promise.all([
        sha256(normEmail(l.email)),
        sha256(normPhone(l.phone)),
        sha256(fn),
        sha256(ln),
      ]);
      return { email, phone, fn: fnH, ln: lnH };
    }),
  );
  return toCsv(rows, ["email", "phone", "fn", "ln"]);
}

/** Google Customer Match CSV. Columns: Email, Phone, First Name, Last Name (all SHA-256). */
export async function buildGoogleCustomerMatchCsv(leads: AudienceLead[]): Promise<string> {
  const eligible = leads.filter((l) => !l.do_not_contact && (l.email || l.phone));
  const rows = await Promise.all(
    eligible.map(async (l) => {
      const { fn, ln } = splitName(l.name);
      const [email, phone, fnH, lnH] = await Promise.all([
        sha256(normEmail(l.email)),
        sha256(normPhone(l.phone)),
        sha256(fn),
        sha256(ln),
      ]);
      return { Email: email, Phone: phone, "First Name": fnH, "Last Name": lnH };
    }),
  );
  return toCsv(rows, ["Email", "Phone", "First Name", "Last Name"]);
}

/** Internal UTM enrichment CSV. RAW data — do NOT upload to ad platforms as audience. */
export function buildUtmEnrichmentCsv(leads: AudienceLead[]): string {
  const headers = [
    "lead_id", "email", "phone",
    "origin_source", "origin_medium", "origin_campaign", "origin_adset", "origin_ad",
    "origin_content", "origin_term", "landing_url", "referrer_url", "fbclid", "gclid",
  ];
  const rows = leads.map((l) => ({
    lead_id: l.id,
    email: normEmail(l.email),
    phone: normPhone(l.phone),
    origin_source: l.origin_source ?? "",
    origin_medium: l.origin_medium ?? "",
    origin_campaign: l.origin_campaign ?? "",
    origin_adset: l.origin_adset ?? "",
    origin_ad: l.origin_ad ?? "",
    origin_content: l.origin_content ?? "",
    origin_term: l.origin_term ?? "",
    landing_url: l.landing_url ?? "",
    referrer_url: l.referrer_url ?? "",
    fbclid: l.fbclid ?? "",
    gclid: l.gclid ?? "",
  }));
  return toCsv(rows, headers);
}

/** Trigger a browser download for a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
