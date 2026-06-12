/**
 * Operator System Canon — immutable principle wall
 * Displayed at top of Talent + Intelligence dashboards.
 * Loro Piana × Apple: dark, clean, high authority.
 */
import { useLanguage } from "@/i18n/LanguageContext";

const T = {
  bg: "#1A1A1A",
  card: "#242424",
  border: "#333",
  gold: "#C6A96B",
  text: "#E8E2D9",
  muted: "#8A8580",
  accent: "#FDFAF5",
} as const;

export default function OperatorCanonPanel() {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: T.bg, border: `1px solid ${T.border}` }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${T.border}` }}
      >
        <h2
          className="text-[13px] font-semibold tracking-[0.15em] uppercase"
          style={{ color: T.gold, fontFamily: "'DM Sans', sans-serif" }}
        >
          {t("Operator System Canon", "Operator System Canon")}
        </h2>
        <span
          className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded"
          style={{ background: T.card, color: T.muted, border: `1px solid ${T.border}` }}
        >
          {t("Unveränderlich", "Immutable")}
        </span>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        {/* Column 1: Core Principles */}
        <div className="px-6 py-5" style={{ borderRight: `1px solid ${T.border}` }}>
          <div
            className="text-[10px] uppercase tracking-[0.12em] mb-3 font-medium"
            style={{ color: T.muted }}
          >
            {t("Kernprinzipien", "Core Principles")}
          </div>
          <ul className="space-y-2">
            {[
              t(
                "Jeder L6 (Senior Closer) ist ein unabhängiger Operator",
                "Each L6 (Senior Closer) is an independent Operator"
              ),
              t(
                "Jeder Operator besitzt genau EINEN Funnel + EIN Budget",
                "Each Operator owns exactly ONE funnel + ONE budget"
              ),
              t(
                "Jeder Operator betreibt EINE kompakte Revenue Unit",
                "Each Operator runs ONE compact revenue unit"
              ),
            ].map((item, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed flex items-start gap-2"
                style={{ color: T.text }}
              >
                <span style={{ color: T.gold, flexShrink: 0, marginTop: 2 }}>•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Column 2: Team Structure */}
        <div className="px-6 py-5" style={{ borderRight: `1px solid ${T.border}` }}>
          <div
            className="text-[10px] uppercase tracking-[0.12em] mb-3 font-medium"
            style={{ color: T.muted }}
          >
            {t("Team-Struktur pro Operator", "Team Structure per Operator")}
          </div>
          <div className="space-y-1.5">
            {[
              { role: "2–4 Opener", level: "L1" },
              { role: "2 Setter", level: "L2–L3" },
              { role: "1–2 Closer", level: "L4–L5" },
            ].map((r) => (
              <div key={r.role} className="flex items-center justify-between text-[12px]">
                <span style={{ color: T.text }}>{r.role}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ background: T.card, color: T.muted, border: `1px solid ${T.border}` }}
                >
                  {r.level}
                </span>
              </div>
            ))}
          </div>
          <div
            className="mt-3 pt-3 text-[12px] font-medium"
            style={{ borderTop: `1px solid ${T.border}`, color: T.accent }}
          >
            Total: 5–8 {t("Personen pro Operator", "people per Operator")}
          </div>
        </div>

        {/* Column 3: Scaling + Director */}
        <div className="px-6 py-5">
          <div
            className="text-[10px] uppercase tracking-[0.12em] mb-3 font-medium"
            style={{ color: T.muted }}
          >
            {t("Skalierung", "Scaling")}
          </div>
          <div className="space-y-2 text-[12px]" style={{ color: T.text }}>
            <div className="flex items-start gap-2">
              <span style={{ color: T.gold, flexShrink: 0, marginTop: 2 }}>✦</span>
              <span>
                {t(
                  "Team-Größe NICHT erhöhen — stattdessen: Operator duplizieren",
                  "Do NOT increase team size — instead: duplicate Operators"
                )}
              </span>
            </div>
          </div>

          <div
            className="mt-4 pt-3"
            style={{ borderTop: `1px solid ${T.border}` }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.12em] mb-2 font-medium"
              style={{ color: T.muted }}
            >
              Director (L7)
            </div>
            <div className="space-y-1.5 text-[12px]" style={{ color: T.text }}>
              <div className="flex items-start gap-2">
                <span style={{ color: T.gold, flexShrink: 0, marginTop: 2 }}>•</span>
                {t("Verwaltet 3–6 Operatoren", "Manages 3–6 Operators")}
              </div>
              <div className="flex items-start gap-2">
                <span style={{ color: T.gold, flexShrink: 0, marginTop: 2 }}>•</span>
                {t(
                  "Verteilt Budget nach Performance",
                  "Allocates budget based on performance"
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
