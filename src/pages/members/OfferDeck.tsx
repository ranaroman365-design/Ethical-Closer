import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const styles: Record<string, React.CSSProperties> = {
  body: {
    background: "#F7F3EE",
    color: "#1C1A17",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 300,
    lineHeight: 1.7,
    padding: "60px 24px 100px",
    minHeight: "100vh",
  },
  doc: {
    maxWidth: 780,
    margin: "0 auto",
  },
  header: { textAlign: "center", marginBottom: 72 },
  brand: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 10,
    letterSpacing: "0.35em",
    textTransform: "uppercase",
    color: "#C9A96E",
    marginBottom: 20,
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: "clamp(32px, 5vw, 48px)",
    fontWeight: 400,
    color: "#1C1A17",
    lineHeight: 1.15,
    letterSpacing: "0.01em",
  },
  titleEm: { fontStyle: "italic", color: "#C9A96E" },
  subtitle: {
    marginTop: 14,
    fontSize: 13,
    color: "#8C857C",
    letterSpacing: "0.05em",
  },
  goldRule: {
    width: 60,
    height: 1,
    background: "#C9A96E",
    margin: "28px auto 0",
  },
  section: { marginBottom: 64 },
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
  },
  sectionNum: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 11,
    color: "#C9A96E",
    letterSpacing: "0.2em",
    fontStyle: "italic",
  },
  sectionTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 22,
    fontWeight: 500,
    color: "#1C1A17",
    letterSpacing: "0.03em",
  },
  sectionLine: { flex: 1, height: 1, background: "rgba(201,169,110,0.35)" },
  coreGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 2,
  },
  coreItem: {
    background: "#EDE7DC",
    padding: "16px 18px",
    fontSize: 12,
    color: "#4A4540",
    letterSpacing: "0.03em",
  },
  coreItemStrong: {
    display: "block",
    fontWeight: 500,
    color: "#1C1A17",
    marginBottom: 2,
    fontSize: 12,
  },
  tracksGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 2,
  },
  trackStarter: { background: "#EEE9E2", padding: "32px 24px", position: "relative" as const },
  trackCloser: { background: "#E8E2D8", padding: "32px 24px", position: "relative" as const },
  trackHt: { background: "#1C1A17", color: "#F7F3EE", padding: "32px 24px", position: "relative" as const },
  trackDotGreen: { width: 8, height: 8, borderRadius: "50%", background: "#7BAF8A", marginBottom: 20 },
  trackDotGold: { width: 8, height: 8, borderRadius: "50%", background: "#C9A96E", marginBottom: 20 },
  trackBadge: {
    fontSize: 9,
    letterSpacing: "0.25em",
    textTransform: "uppercase" as const,
    color: "#C9A96E",
    marginBottom: 8,
    fontWeight: 500,
  },
  trackName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 20,
    fontWeight: 500,
    lineHeight: 1.2,
    marginBottom: 16,
  },
  trackMeta: { fontSize: 11.5, color: "#8C857C", marginBottom: 4, lineHeight: 1.5 },
  trackMetaHt: { fontSize: 11.5, color: "rgba(247,243,238,0.55)", marginBottom: 4, lineHeight: 1.5 },
  trackPrice: {
    marginTop: 24,
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 28,
    fontWeight: 400,
    color: "#1C1A17",
    letterSpacing: "0.01em",
  },
  trackPriceHt: {
    marginTop: 24,
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 28,
    fontWeight: 400,
    color: "#E2C99A",
    letterSpacing: "0.01em",
  },
  trackPriceNote: { fontSize: 10.5, color: "#8C857C", marginTop: 4 },
  trackPriceNoteHt: { fontSize: 10.5, color: "rgba(247,243,238,0.45)", marginTop: 4 },
  trackUpgrade: {
    marginTop: 14,
    padding: "10px 12px",
    background: "rgba(201,169,110,0.12)",
    borderLeft: "2px solid #C9A96E",
    fontSize: 11,
    color: "#8C857C",
    lineHeight: 1.5,
  },
  timeboxGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 },
  timeboxItem: { background: "#EDE7DC", padding: "24px 26px" },
  timeboxLabel: { fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase" as const, color: "#C9A96E", marginBottom: 8 },
  timeboxTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 17, fontWeight: 500, marginBottom: 6 },
  timeboxWeeks: { fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 300, color: "#1C1A17", lineHeight: 1 },
  timeboxWeeksSub: { fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "#8C857C", fontWeight: 300 },
  backendCard: { background: "#EDE7DC", padding: "28px 24px" },
  backendCardFull: { background: "#EDE7DC", padding: "28px 24px", gridColumn: "1 / -1" as const },
  bcTag: { fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase" as const, color: "#C9A96E", marginBottom: 12, fontWeight: 500 },
  bcTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, marginBottom: 6 },
  bcSub: { fontSize: 11.5, color: "#8C857C", marginBottom: 14, lineHeight: 1.6 },
  bcTrigger: { fontSize: 11, color: "#4A4540", marginBottom: 6 },
  bcPrice: { marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(201,169,110,0.35)" },
  bcPriceMain: { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, color: "#1C1A17" },
  bcPriceDelay: { fontSize: 11, color: "#8C857C", marginTop: 4 },
  delayVal: { color: "#B85C50", fontWeight: 500 },
  bcTiers: { marginTop: 12 },
  bcTier: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid rgba(201,169,110,0.35)",
    fontSize: 12,
  },
  bcTierLabel: { color: "#4A4540" },
  bcTierPrice: { fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#1C1A17" },
  bcTierPriceRed: { fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#B85C50" },
  funnelWrap: { background: "#EDE7DC", padding: "36px 40px" },
  funnelSteps: { display: "flex", alignItems: "center", marginBottom: 32, flexWrap: "wrap" as const },
  funnelStep: { textAlign: "center" as const, flex: 1, minWidth: 80 },
  funnelNum: { fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 300, color: "#1C1A17", lineHeight: 1 },
  funnelLbl: { fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: "#8C857C", marginTop: 4 },
  funnelArrow: { color: "#C9A96E", fontSize: 16, padding: "0 8px", opacity: 0.6 },
  funnelDist: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 },
  distGroupTitle: { fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" as const, color: "#C9A96E", marginBottom: 12 },
  distRow: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(201,169,110,0.35)", fontSize: 12, color: "#4A4540" },
  distVal: { fontWeight: 500, color: "#1C1A17" },
  revenueGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 },
  revCard: { background: "#EDE7DC", padding: "28px 24px" },
  revCardTotal: { background: "#1C1A17", color: "#F7F3EE", padding: "28px 24px" },
  revLabel: { fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase" as const, color: "#C9A96E", marginBottom: 10 },
  revRange: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 400, color: "#1C1A17", lineHeight: 1.1 },
  revRangeTotal: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 400, color: "#E2C99A", lineHeight: 1.1 },
  revNote: { fontSize: 11, color: "#8C857C", marginTop: 8 },
  revNoteTotal: { fontSize: 11, color: "rgba(247,243,238,0.45)", marginTop: 8 },
  fokusList: { listStyle: "none", padding: 0 },
  fokusItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "14px 0",
    borderBottom: "1px solid rgba(201,169,110,0.35)",
    fontSize: 13,
    color: "#4A4540",
    lineHeight: 1.6,
  },
  fokusArrow: { color: "#C9A96E", flexShrink: 0, marginTop: 1, fontSize: 12 },
  footer: { marginTop: 80, textAlign: "center" as const },
  footerRule: { width: 60, height: 1, background: "#C9A96E", margin: "0 auto 20px" },
  footerText: { fontSize: 11, color: "#8C857C", letterSpacing: "0.08em" },
  lockedPlaceholder: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "120px 24px",
  },
};

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div style={styles.sectionLabel}>
      <span style={styles.sectionNum}>{num}</span>
      <span style={styles.sectionTitle}>{title}</span>
      <span style={styles.sectionLine} />
    </div>
  );
}

export default function AngebotsArchitektur() {
  const { user } = useAuth();
  const [userLevel, setUserLevel] = useState<number | null>(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_level_status')
      .select('current_level')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setUserLevel(data?.current_level ?? 0);
      });
  }, [user]);

  // Wait for level to load
  if (userLevel === null) return null;

  const canSeeL3 = userLevel >= 3;
  const canSeeL6 = userLevel >= 6;

  // If nothing is visible (level < 3), show placeholder
  if (!canSeeL3 && !canSeeL6) {
    return (
      <div style={styles.body}>
        <div style={styles.doc}>
          <header style={styles.header}>
            <p style={styles.brand}>Ethical Top Closer</p>
            <h1 style={styles.title}>
              Offer <span style={styles.titleEm}>Architektur</span>
            </h1>
            <p style={styles.subtitle}>Final — Intern</p>
            <div style={styles.goldRule} />
          </header>
          <div style={styles.lockedPlaceholder}>
            <div style={styles.goldRule} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8C857C", marginTop: 20 }}>
              Dieser Bereich wird mit Level 3 freigeschaltet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.body}>
      <div style={styles.doc}>
        {/* HEADER */}
        <header style={styles.header}>
          <p style={styles.brand}>Ethical Top Closer</p>
          <h1 style={styles.title}>
            Offer <span style={styles.titleEm}>Architektur</span>
          </h1>
          <p style={styles.subtitle}>Final — Intern</p>
          <div style={styles.goldRule} />
        </header>

        {/* 1. CORE LOGIK — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="01" title="Core Logik" />
            <div style={styles.coreGrid}>
              {[
                ["Frontend", "3 klare Einstiege"],
                ["Backend", "Level-basiert, nicht sichtbar im Verkauf"],
                ["Timebox", "Fortschritt erzwingen"],
                ["Booster", "Verlängerung bei Verzug"],
                ["Radiant", "Performance-Stabilität"],
                ["Advanced Scale Lab", "Wachstum & Leadership"],
                ["Quarterly Crossing", "Community & Deal Flow"],
                ["Inner Circle", "Equity Track · Invite Only"],
              ].map(([k, v]) => (
                <div key={k} style={styles.coreItem}>
                  <span style={styles.coreItemStrong}>{k}</span>
                  {v}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. FRONTEND TRACKS — L3+ */}
        {canSeeL3 && (
          <section style={styles.section}>
            <SectionHeader num="02" title="Frontend Tracks" />
            <div style={styles.tracksGrid}>
              <div style={styles.trackStarter}>
                <div style={styles.trackDotGreen} />
                <p style={styles.trackBadge}>Starter Track</p>
                <h3 style={styles.trackName}>
                  Earn While
                  <br />
                  You Learn
                </h3>
                <p style={styles.trackMeta}>Level 1–2 · Opener & Setter</p>
                <p style={styles.trackMeta}>Erste Einnahmen ab Tag 1</p>
                <p style={styles.trackPrice}>1.600 €</p>
                <div style={styles.trackUpgrade}>
                  Upgrade auf Closer Track: volle Anrechnung + 150 € Handling Fee
                </div>
              </div>

              <div style={styles.trackCloser}>
                <div style={styles.trackDotGold} />
                <p style={styles.trackBadge}>Closer Track · 9 Wochen</p>
                <h3 style={styles.trackName}>
                  Become
                  <br />a Closer
                </h3>
                <p style={styles.trackMeta}>Level 1–4 · Skill, Struktur & KPI</p>
                <p style={styles.trackMeta}>Closing-Standard erreichen</p>
                <p style={styles.trackPrice}>4.400 €</p>
              </div>

              <div style={styles.trackHt}>
                <div style={styles.trackDotGold} />
                <p style={styles.trackBadge}>High-Ticket Track · 8 Wochen</p>
                <h3 style={styles.trackName}>
                  Get Paid as a
                  <br />
                  High-Ticket Closer
                </h3>
                <p style={styles.trackMetaHt}>Level 1–6 · inkl. Placement</p>
                <p style={styles.trackMetaHt}>intern + extern</p>
                <p style={styles.trackPriceHt}>7.300 €</p>
                <p style={styles.trackPriceNoteHt}>All-in · Closer Track + Placement</p>
              </div>
            </div>
          </section>
        )}

        {/* 3. TIMEBOX — L3+ */}
        {canSeeL3 && (
          <section style={styles.section}>
            <SectionHeader num="03" title="Timebox" />
            <div style={styles.timeboxGrid}>
              <div style={styles.timeboxItem}>
                <p style={styles.timeboxLabel}>Closer Track · L1–L4</p>
                <p style={styles.timeboxTitle}>Skill & Struktur</p>
                <p style={styles.timeboxWeeks}>
                  8–10 <span style={styles.timeboxWeeksSub}>Wochen</span>
                </p>
              </div>
              <div style={styles.timeboxItem}>
                <p style={styles.timeboxLabel}>Placement Track · L4–L6</p>
                <p style={styles.timeboxTitle}>Placement & Praxis</p>
                <p style={styles.timeboxWeeks}>
                  6–8 <span style={styles.timeboxWeeksSub}>Wochen</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 4. BOOSTER — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="04" title="Booster" />
            <div style={styles.backendCard}>
              <p style={styles.bcTag}>Automatisch relevant · Timebox nicht eingehalten</p>
              <h3 style={styles.bcTitle}>Booster</h3>
              <p style={styles.bcSub}>
                Aktiviert sich situativ — nicht als gesondertes Angebot positioniert. Erzeugt
                Momentum, Verbindlichkeit und reduziert Drop-Off.
              </p>
              <div style={styles.bcTiers}>
                <div style={styles.bcTier}>
                  <span style={styles.bcTierLabel}>Direktanschluss</span>
                  <span style={styles.bcTierPrice}>297 € /Monat</span>
                </div>
                <div style={styles.bcTier}>
                  <span style={styles.bcTierLabel}>Nach Pause</span>
                  <span style={styles.bcTierPriceRed}>397 € /Monat</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 5. RADIANT — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="05" title="Radiant" />
            <div style={styles.backendCard}>
              <p style={styles.bcTag}>Situativ · Nicht im Frontend</p>
              <h3 style={styles.bcTitle}>Radiant</h3>
              <p style={styles.bcSub}>
                "Skill ist da — Performance noch nicht konstant abrufbar."
                <br />
                Wird nur bei konkretem Trigger angeboten.
              </p>
              <p style={styles.bcTrigger}>
                Trigger: Booster wird benötigt · Performance instabil · Blockaden sichtbar
              </p>
              <div style={styles.bcPrice}>
                <p style={styles.bcPriceMain}>3.997 € / 6 Monate</p>
                <p style={styles.bcPriceDelay}>
                  Nach Verzögerung: <span style={styles.delayVal}>nach Verzögerung: 4.997 €</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 6. SCALE LAB — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="06" title="Advanced Scale Lab" />
            <div style={styles.backendCard}>
              <p style={styles.bcTag}>Ab Level 5</p>
              <h3 style={styles.bcTitle}>From Closer to Sales Team Leader</h3>
              <p style={styles.bcSub}>
                Höhere Close Rates · Teamaufbau · Leadership · Skalierung
                <br />
                Der natürliche nächste Schritt für ambitionierte Closer.
              </p>
              <div style={styles.bcPrice}>
                <p style={styles.bcPriceMain}>3.997 €</p>
                <p style={styles.bcPriceDelay}>
                  Nach Verzögerung: <span style={styles.delayVal}>nach Verzögerung: 4.997 €</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 7. QUARTERLY CROSSING — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="07" title="Quarterly Crossing" />
            <div style={styles.backendCard}>
              <p style={styles.bcTag}>Ab Level 5 · Retention & Opportunity</p>
              <h3 style={styles.bcTitle}>Network & Deal Flow</h3>
              <p style={styles.bcSub}>
                Community mit High-Level Peers · Deals & Reisen · Hochkarätige Vorträge · Partner
                und Partnerunternehmen
              </p>
              <div style={styles.bcPrice}>
                <p style={styles.bcPriceMain}>97 € /Monat</p>
                <p style={styles.bcPriceDelay}>
                  Nach Verzögerung: <span style={styles.delayVal}>nach Verzögerung: 127 €/Monat</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 8. INNER CIRCLE — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="08" title="Inner Circle" />
            <div style={styles.backendCard}>
              <p style={styles.bcTag}>Ab Level 6 · Invite Only · Nicht öffentlich</p>
              <h3 style={styles.bcTitle}>Partner Track</h3>
              <p style={styles.bcSub}>
                Nicht sichtbar · Nicht gepitcht · Zugang ausschließlich über Einladung.
                <br />
                Fokus: Equity · Beteiligung · Leadership.
              </p>
              <div style={styles.bcTiers}>
                <div style={styles.bcTier}>
                  <span style={styles.bcTierLabel}>Membership</span>
                  <span style={styles.bcTierPrice}>333 € /Monat</span>
                </div>
                <div style={styles.bcTier}>
                  <span style={styles.bcTierLabel}>Membership + 1:1 Mentoring</span>
                  <span style={styles.bcTierPrice}>777 € /Monat</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 9. CUSTOMER FLOW — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="09" title="Customer Flow" />
            <div style={styles.funnelWrap}>
              <div style={styles.funnelSteps}>
                {[
                  ["100", "Bewerber"],
                  ["65", "Calls"],
                  ["25", "Sales"],
                ].map(([n, l], i) => (
                  <div key={l} style={{ display: "contents" }}>
                    <div style={styles.funnelStep}>
                      <p style={styles.funnelNum}>{n}</p>
                      <p style={styles.funnelLbl}>{l}</p>
                    </div>
                    {i < 2 && <span style={styles.funnelArrow}>→</span>}
                  </div>
                ))}
              </div>
              <div style={styles.funnelDist}>
                <div>
                  <p style={styles.distGroupTitle}>Frontend</p>
                  {[
                    ["Starter Track", "5"],
                    ["Closer Track", "10"],
                    ["High-Ticket Track", "10"],
                  ].map(([l, v]) => (
                    <div key={l} style={styles.distRow}>
                      <span>{l}</span>
                      <span style={styles.distVal}>{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={styles.distGroupTitle}>Backend</p>
                  {[
                    ["Booster", "10–12"],
                    ["Radiant", "4–6"],
                    ["Scale Lab", "6–8"],
                    ["Quarterly Crossing", "12–16"],
                    ["Inner Circle", "2–3"],
                  ].map(([l, v]) => (
                    <div key={l} style={styles.distRow}>
                      <span>{l}</span>
                      <span style={styles.distVal}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 10. REVENUE — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="10" title="Revenue Potential" />
            <div style={styles.revenueGrid}>
              <div style={styles.revCard}>
                <p style={styles.revLabel}>Frontend</p>
                <p style={styles.revRange}>
                  120k –
                  <br />
                  140k €
                </p>
                <p style={styles.revNote}>Starter · Closer · High-Ticket</p>
              </div>
              <div style={styles.revCard}>
                <p style={styles.revLabel}>Backend</p>
                <p style={styles.revRange}>
                  +60k –
                  <br />
                  120k €
                </p>
                <p style={styles.revNote}>Booster · Radiant · Scale Lab · Crossing · Inner Circle</p>
              </div>
              <div style={styles.revCardTotal}>
                <p style={styles.revLabel}>Gesamt</p>
                <p style={styles.revRangeTotal}>
                  180k –
                  <br />
                  260k €
                </p>
                <p style={styles.revNoteTotal}>Pro 100 Bewerber</p>
              </div>
            </div>
          </section>
        )}

        {/* 11. SALES FOKUS — L6+ */}
        {canSeeL6 && (
          <section style={styles.section}>
            <SectionHeader num="11" title="Sales Fokus" />
            <ul style={styles.fokusList}>
              {[
                "Ziel: möglichst viele in den High-Ticket Track — Placement ist der logische Standardpfad, nicht die Ausnahme.",
                "Starter Track nur bei echtem Need — kein Default-Einstieg, sondern bewusste Entscheidung.",
                "Backend entsteht durch Situation, nicht durch Push — Trigger-basiert, nie forced.",
                "Upgrade Starter → Closer: volle Anrechnung der 1.600 €, zuzüglich 150 € Handling Fee.",
                "Preiseskalation konsequent kommunizieren — Direkteinstieg ist Standardpreis, Verzögerung hat eine klare Konsequenz.",
              ].map((text, i) => (
                <li key={i} style={styles.fokusItem}>
                  <span style={styles.fokusArrow}>→</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Locked placeholder for L3–L5 users who can't see L6+ sections */}
        {canSeeL3 && !canSeeL6 && (
          <div style={styles.lockedPlaceholder}>
            <div style={styles.goldRule} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8C857C", marginTop: 20 }}>
              Dieser Bereich wird mit Level 6 freigeschaltet.
            </p>
          </div>
        )}

        {/* FOOTER */}
        <footer style={styles.footer}>
          <div style={styles.footerRule} />
          <p style={styles.footerText}>Ethical Top Closer · Intern · Vertraulich</p>
        </footer>
      </div>
    </div>
  );
}
