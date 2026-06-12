import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

const L = PRODUCT.legal;

const PrivacyPolicy = () => {
  const { tx } = useLanguage();

  return (
    <LegalLayout
      title={tx("Datenschutzerklärung", "Privacy Policy")}
      subtitle={tx(
        "Transparente Information über die Verarbeitung personenbezogener Daten gemäß DSGVO und internationaler Datenschutzstandards.",
        "Transparent information on the processing of personal data under the GDPR and international data protection standards."
      )}
    >
      <LegalSection number="1" title={tx("Verantwortliche Stelle", "Data Controller")}>
        <div className="rounded-lg border border-border/60 bg-card/30 p-5">
          <p className="font-medium text-foreground">{L.company}</p>
          <p className="mt-2">{L.street}</p>
          <p>{L.zipCity}, {L.country}</p>
          <p className="mt-2">{tx("E-Mail", "Email")}: <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a></p>
          <p>{tx("Vertretungsberechtigt", "Representative")}: {L.representative}</p>
        </div>
      </LegalSection>

      <LegalSection number="2" title={tx("Erhobene Datenarten", "Categories of Data Collected")}>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>{tx("Stammdaten (Name, E-Mail, Telefonnummer)", "Account data (name, email, phone number)")}</li>
          <li>{tx("Nutzungsdaten (Login, Aktivität, Kursfortschritt)", "Usage data (logins, activity, course progress)")}</li>
          <li>{tx("Kommunikationsdaten (Nachrichten, Support-Anfragen, Calls)", "Communication data (messages, support requests, calls)")}</li>
          <li>{tx("Zahlungsdaten (über Drittanbieter wie Stripe)", "Payment data (via third-party processors such as Stripe)")}</li>
          <li>{tx("Server-Log-Daten (IP-Adresse, Browser, Zugriffszeit)", "Server log data (IP address, browser, access time)")}</li>
        </ul>
      </LegalSection>

      <LegalSection number="3" title={tx("Cookies & Tracking", "Cookies & Tracking")}>
        <p>
          {tx(
            "Wir verwenden technisch notwendige Cookies für den Betrieb der Plattform sowie optionale Analyse- und Marketing-Cookies (nur nach Einwilligung).",
            "We use strictly necessary cookies to operate the platform and optional analytics/marketing cookies (only with prior consent)."
          )}
        </p>
        <p>
          {tx("Details siehe ", "Details: see ")}
          <a href="/cookie-policy" className="text-primary hover:underline">
            {tx("Cookie-Richtlinie", "Cookie Policy")}
          </a>.
        </p>
      </LegalSection>

      <LegalSection number="4" title={tx("Rechtsgrundlagen (Art. 6 DSGVO)", "Legal Basis (Art. 6 GDPR)")}>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>{tx("Vertragserfüllung (Art. 6 Abs. 1 lit. b)", "Performance of a contract (Art. 6(1)(b))")}</li>
          <li>{tx("Berechtigtes Interesse (Art. 6 Abs. 1 lit. f) — Sicherheit, Analyse, Produktverbesserung", "Legitimate interest (Art. 6(1)(f)) — security, analytics, product improvement")}</li>
          <li>{tx("Einwilligung (Art. 6 Abs. 1 lit. a) — Marketing, optionale Cookies", "Consent (Art. 6(1)(a)) — marketing, optional cookies")}</li>
          <li>{tx("Rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c)", "Legal obligation (Art. 6(1)(c))")}</li>
        </ul>
      </LegalSection>

      <LegalSection number="5" title={tx("Verwendungszwecke", "Purposes of Processing")}>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>{tx("Bereitstellung der Plattform und Programmleistungen", "Providing the platform and program services")}</li>
          <li>{tx("Kommunikation mit Nutzern (Support, Erinnerungen, Termine)", "Communication with users (support, reminders, appointments)")}</li>
          <li>{tx("Zahlungsabwicklung über zertifizierte Anbieter", "Payment processing through certified providers")}</li>
          <li>{tx("Sicherheit, Betrugsprävention, Audit-Logs", "Security, fraud prevention, audit logging")}</li>
          <li>{tx("Produktverbesserung & Analyse", "Product improvement and analytics")}</li>
        </ul>
      </LegalSection>

      <LegalSection number="6" title={tx("Speicherdauer", "Data Retention")}>
        <p>
          {tx(
            "Personenbezogene Daten werden nur so lange gespeichert, wie es für den Zweck erforderlich ist oder gesetzliche Aufbewahrungspflichten bestehen (typischerweise 6–10 Jahre für Buchhaltungsunterlagen).",
            "Personal data is retained only as long as necessary for the purpose, or as required by statutory retention periods (typically 6–10 years for accounting records)."
          )}
        </p>
      </LegalSection>

      <LegalSection number="7" title={tx("Internationaler Datentransfer", "International Data Transfer")}>
        <p>
          {tx(
            `Da ${L.company} ihren Sitz in den USA hat, werden Daten in die USA übermittelt und dort verarbeitet. Sofern erforderlich, stützen wir Übermittlungen auf EU-Standardvertragsklauseln (SCCs gem. Art. 46 DSGVO) sowie ergänzende technische und organisatorische Maßnahmen.`,
            `As ${L.company} is based in the United States, data is transferred to and processed in the U.S. Where required, transfers are based on EU Standard Contractual Clauses (SCCs, Art. 46 GDPR) supplemented by additional technical and organizational measures.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="8" title={tx("Ihre Rechte (Art. 15–22 DSGVO)", "Your Rights (Art. 15–22 GDPR)")}>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>{tx("Auskunft", "Right of access")}</li>
          <li>{tx("Berichtigung", "Right to rectification")}</li>
          <li>{tx("Löschung (Recht auf Vergessenwerden)", "Right to erasure (right to be forgotten)")}</li>
          <li>{tx("Einschränkung der Verarbeitung", "Right to restriction of processing")}</li>
          <li>{tx("Datenübertragbarkeit", "Right to data portability")}</li>
          <li>{tx("Widerspruch", "Right to object")}</li>
          <li>{tx("Widerruf erteilter Einwilligungen jederzeit für die Zukunft", "Right to withdraw consent at any time with effect for the future")}</li>
          <li>{tx("Beschwerde bei einer Aufsichtsbehörde", "Right to lodge a complaint with a supervisory authority")}</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          {tx("Anfragen an: ", "Send requests to: ")}
          <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>
        </p>
      </LegalSection>

      <LegalSection number="9" title={tx("Sicherheitsmaßnahmen", "Security Measures")}>
        <p>
          {tx(
            "Wir setzen branchenübliche Sicherheitsmaßnahmen ein: TLS-Verschlüsselung, Zugriffskontrolle, Audit-Logs, regelmäßige Backups sowie Row-Level-Security auf Datenbankebene.",
            "We employ industry-standard security measures: TLS encryption, access control, audit logging, regular backups and row-level security at the database layer."
          )}
        </p>
      </LegalSection>

      <LegalSection number="10" title={tx("Drittanbieter-Tools", "Third-Party Tools")}>
        <p>{tx("Wir nutzen ausgewählte Auftragsverarbeiter:", "We use selected processors:")}</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Supabase (EU/US) — {tx("Datenbank, Auth, Storage", "database, auth, storage")}</li>
          <li>Stripe (US/EU) — {tx("Zahlungsabwicklung", "payment processing")}</li>
          <li>GoHighLevel (US) — {tx("Kommunikation (SMS/E-Mail)", "communications (SMS/email)")}</li>
          <li>Cloudflare (Global) — {tx("CDN, DDoS-Schutz", "CDN, DDoS protection")}</li>
        </ul>
      </LegalSection>

      <LegalSection number="11" title={tx("Kontakt zum Datenschutz", "Privacy Contact")}>
        <p>
          {tx("Datenschutzanfragen: ", "Privacy requests: ")}
          <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
};

export default PrivacyPolicy;
