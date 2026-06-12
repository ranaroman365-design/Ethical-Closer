import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

const L = PRODUCT.legal;

const CookiePolicy = () => {
  const { tx } = useLanguage();

  return (
    <LegalLayout
      title={tx("Cookie-Richtlinie", "Cookie Policy")}
      subtitle={tx(
        "Welche Cookies wir verwenden, warum, und wie Sie Ihre Einwilligung jederzeit anpassen können.",
        "Which cookies we use, why, and how you can adjust your consent at any time."
      )}
    >
      <LegalSection number="1" title={tx("Was sind Cookies?", "What are cookies?")}>
        <p>
          {tx(
            "Cookies sind kleine Textdateien, die auf Ihrem Endgerät gespeichert werden, wenn Sie unsere Website besuchen. Sie ermöglichen u. a. das Wiedererkennen Ihres Browsers und das Speichern von Einstellungen.",
            "Cookies are small text files stored on your device when you visit our website. They allow us to recognize your browser and remember preferences."
          )}
        </p>
      </LegalSection>

      <LegalSection number="2" title={tx("Kategorien", "Categories")}>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-card/30 p-5">
            <p className="font-medium text-foreground">
              {tx("Technisch notwendig (immer aktiv)", "Strictly necessary (always active)")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx(
                "Login, Session, Sicherheits-Token, Sprachpräferenz. Ohne diese Cookies funktioniert die Plattform nicht.",
                "Login, session, security tokens, language preference. The platform cannot function without these."
              )}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/30 p-5">
            <p className="font-medium text-foreground">
              {tx("Analyse (optional)", "Analytics (optional)")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx(
                "Anonyme Nutzungsstatistiken zur Produktverbesserung. Aktivierung nur mit Ihrer Einwilligung.",
                "Anonymous usage statistics to improve the product. Only activated with your consent."
              )}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/30 p-5">
            <p className="font-medium text-foreground">
              {tx("Marketing (optional)", "Marketing (optional)")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx(
                "Conversion-Tracking, Retargeting (z. B. Meta, Google). Aktivierung nur mit Ihrer Einwilligung.",
                "Conversion tracking and retargeting (e.g. Meta, Google). Only activated with your consent."
              )}
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection number="3" title={tx("Ihre Kontrolle", "Your Control")}>
        <p>
          {tx(
            "Sie können Ihre Einwilligung jederzeit über das Cookie-Banner anpassen oder vollständig widerrufen. Zusätzlich können Sie Cookies in Ihrem Browser löschen oder blockieren.",
            "You may adjust or fully withdraw your consent at any time via the cookie banner. Additionally, you can delete or block cookies in your browser settings."
          )}
        </p>
      </LegalSection>

      <LegalSection number="4" title={tx("Drittanbieter", "Third Parties")}>
        <p>
          {tx(
            "Eingesetzte Drittanbieter (nur bei Einwilligung): Stripe (Zahlung), Cloudflare (Sicherheit), ggf. Meta Pixel & Google Analytics 4 (Marketing/Analyse).",
            "Third-party services (only with consent): Stripe (payments), Cloudflare (security), and optionally Meta Pixel & Google Analytics 4 (marketing/analytics)."
          )}
        </p>
      </LegalSection>

      <LegalSection number="5" title={tx("Rechtsgrundlage", "Legal Basis")}>
        <p>
          {tx(
            "Technisch notwendige Cookies: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO). Optionale Cookies: ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TTDSG).",
            "Strictly necessary cookies: legitimate interest (Art. 6(1)(f) GDPR). Optional cookies: explicit consent (Art. 6(1)(a) GDPR, § 25(1) TTDSG)."
          )}
        </p>
      </LegalSection>

      <LegalSection number="6" title={tx("Kontakt", "Contact")}>
        <p>
          {tx("Fragen zu Cookies: ", "Cookie questions: ")}
          <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
};

export default CookiePolicy;
