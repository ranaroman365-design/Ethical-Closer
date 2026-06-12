import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface KpiSubmissionFormProps {
  onSuccess?: () => void;
}

const SUBMISSION_TYPES = [
  { value: "badge_application", label: "Badge-Antrag (ETC Closer Gold)" },
  { value: "champion_claim", label: "Champion Track Nachweis (5 Closes)" },
  { value: "monthly_update", label: "Monatliches KPI-Update" },
] as const;

export default function KpiSubmissionForm({ onSuccess }: KpiSubmissionFormProps) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([""]);
  const [form, setForm] = useState({
    submission_type: "badge_application" as string,
    closes_count: 0,
    revenue_total: "",
    period_start: "",
    period_end: "",
    message: "",
  });

  const set = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.submission_type === "champion_claim" && form.closes_count < 5) {
      toast.error("Champion Track erfordert mindestens 5 Closes.");
      return;
    }
    if (form.submission_type === "badge_application" && form.closes_count < 1) {
      toast.error("Badge-Antrag erfordert mindestens 1 Close.");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht eingeloggt");
      const urls = evidenceUrls.filter(u => u.trim());
      const { error } = await supabase.from("kpi_submissions").insert({
        user_id: user.id,
        submission_type: form.submission_type as "badge_application" | "champion_claim" | "monthly_update",
        closes_count: form.closes_count,
        revenue_total: form.revenue_total || null,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        evidence_urls: urls,
      });
      if (error) throw error;
      setSubmitted(true);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fehler beim Einreichen";
      toast.error(message);
    } finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <div className="py-8 text-center">
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '22px', fontWeight: 300, color: '#141410' }}>
          Eingereicht — wird geprüft.
        </p>
        <p className="mt-2" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>
          Wir melden uns innerhalb von 48 Stunden.
        </p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontFamily: "'DM Sans', sans-serif",
    fontSize: "13px", background: "#F7F2E9", border: "1px solid #D4C9A8", color: "#141410",
  };
  const lblStyle: React.CSSProperties = {
    display: "block", marginBottom: 4, fontFamily: "'DM Sans', sans-serif",
    fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.14em", color: "#7A7568",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" style={{ padding: 28, background: '#F7F2E9', border: '1px solid #D4C9A8' }}>
      <div>
        <label style={lblStyle}>Art des Nachweises</label>
        <select style={inputStyle} value={form.submission_type} onChange={e => set("submission_type", e.target.value)}>
          {SUBMISSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label style={lblStyle}>Anzahl Closes</label>
        <input type="number" min={0} style={inputStyle} value={form.closes_count} onChange={e => set("closes_count", Number(e.target.value) || 0)} />
      </div>
      <div>
        <label style={lblStyle}>Gesamtumsatz (optional)</label>
        <input type="text" style={inputStyle} placeholder="z.B. 47.500 €" value={form.revenue_total} onChange={e => set("revenue_total", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label style={lblStyle}>Zeitraum von</label><input type="date" style={inputStyle} value={form.period_start} onChange={e => set("period_start", e.target.value)} /></div>
        <div><label style={lblStyle}>Zeitraum bis</label><input type="date" style={inputStyle} value={form.period_end} onChange={e => set("period_end", e.target.value)} /></div>
      </div>
      <div>
        <label style={lblStyle}>Nachweise (URLs)</label>
        {evidenceUrls.map((url, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input style={inputStyle} placeholder="Link zu Nachweis" value={url}
              onChange={e => { const u = [...evidenceUrls]; u[i] = e.target.value; setEvidenceUrls(u); }} />
            {evidenceUrls.length > 1 && (
              <button type="button" onClick={() => setEvidenceUrls(evidenceUrls.filter((_, j) => j !== i))}
                className="px-2 cursor-pointer" style={{ border: '1px solid #D4C9A8', background: 'none', color: '#7A7568', fontFamily: 'DM Sans, sans-serif', fontSize: '11px' }}>×</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setEvidenceUrls([...evidenceUrls, ""])}
          className="cursor-pointer" style={{ background: 'none', border: 'none', color: '#B8952A', fontFamily: 'DM Sans, sans-serif', fontSize: '11px' }}>+ Weiteren Nachweis hinzufügen</button>
      </div>
      <div>
        <label style={lblStyle}>Nachricht (optional)</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'none' }} maxLength={300} value={form.message} onChange={e => set("message", e.target.value)} />
        <p className="text-right" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', color: '#7A7568' }}>{form.message.length}/300</p>
      </div>
      <button type="submit" disabled={loading} className="w-full uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
        {loading ? "..." : "KPI einreichen"}
      </button>
    </form>
  );
}
