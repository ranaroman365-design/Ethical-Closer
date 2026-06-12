import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

const L = PRODUCT.legal;

const TermsOfService = () => {
  const { tx } = useLanguage();

  return (
    <LegalLayout
      title={tx("Allgemeine Geschäftsbedingungen", "Terms of Service")}
      subtitle={tx(
        `Vertragsbedingungen für alle Programme, Plattformen und Dienste von ${L.company}.`,
        `Contractual terms for all programs, platforms and services of ${L.company}.`
      )}
    >
      <LegalSection number="1" title={tx("Geltungsbereich & Leistungen", "Scope of Services")}>
        <p>
          {tx(
            `Diese AGB gelten für sämtliche Verträge zwischen ${L.company} ("Anbieter") und dem Nutzer ("Kunde") über die Nutzung der Plattformen und Programme der Marken Radiant, Ethical Top Closer und Lunama.`,
            `These Terms govern all contracts between ${L.company} ("Provider") and the user ("Customer") regarding the platforms and programs operated under the brands Radiant, Ethical Top Closer and Lunama.`
          )}
        </p>
        <p>
          {tx(
            "Es handelt sich ausschließlich um Bildungs- und Trainingsleistungen. Es wird keine Erfolgs-, Einkommens- oder Vermittlungsgarantie gegeben.",
            "Services consist exclusively of education and training. No guarantee is given regarding income, professional outcomes or placement."
          )}
        </p>
      </LegalSection>

      <LegalSection number="2" title={tx("Keine Erfolgsgarantie", "No Guaranteed Results")}>
        <p className="rounded-lg border border-border/60 bg-card/30 p-5 font-medium text-foreground">
          {tx(
            "Es werden keine finanziellen oder beruflichen Ergebnisse garantiert. Der Erfolg hängt vom individuellen Einsatz, der Marktlage und externen Faktoren ab.",
            "No guaranteed financial or professional results. Success depends on individual effort, market conditions and external factors."
          )}
        </p>
      </LegalSection>

      <LegalSection number="3" title={tx("Vertragsschluss", "Conclusion of Contract")}>
        <p>
          {tx(
            "Die Darstellung von Programmen stellt kein bindendes Angebot dar. Der Vertrag kommt erst durch Bestätigung der Buchung oder Bezahlung zustande.",
            "The presentation of programs does not constitute a binding offer. A contract is concluded only upon confirmation of booking or payment."
          )}
        </p>
      </LegalSection>

      <LegalSection number="4" title={tx("Pflichten des Nutzers", "User Responsibilities")}>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>{tx("Wahrheitsgemäße Angaben bei Registrierung", "Truthful information at registration")}</li>
          <li>{tx("Vertrauliche Behandlung von Login-Daten", "Confidential treatment of login credentials")}</li>
          <li>{tx("Keine Weitergabe von Inhalten an Dritte", "No sharing of content with third parties")}</li>
          <li>{tx("Respektvoller Umgang in Communities und Calls", "Respectful behavior in communities and calls")}</li>
          <li>{tx("Einhaltung geltenden Rechts", "Compliance with applicable law")}</li>
        </ul>
      </LegalSection>

      <LegalSection number="5" title={tx("Geistiges Eigentum", "Intellectual Property")}>
        <p>
          {tx(
            `Alle Inhalte (Videos, Skripte, Frameworks, Software, Markenzeichen) sind Eigentum von ${L.company} oder ihrer Lizenzgeber. Vervielfältigung, Weitergabe, öffentliche Wiedergabe oder kommerzielle Nutzung sind ohne ausdrückliche schriftliche Zustimmung untersagt.`,
            `All content (videos, scripts, frameworks, software, trademarks) is the property of ${L.company} or its licensors. Reproduction, distribution, public performance or commercial use is prohibited without prior written consent.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="6" title={tx("Zahlung", "Payment")}>
        <p>
          {tx(
            "Zahlungen erfolgen über zertifizierte Drittanbieter (Stripe, Apple Pay, Banküberweisung). Es gelten die jeweiligen AGB der Zahlungsdienstleister.",
            "Payments are processed by certified third-party providers (Stripe, Apple Pay, bank transfer). Their respective terms apply."
          )}
        </p>
        <p>
          {tx(
            "Ratenzahlungen sind nach vorheriger Vereinbarung möglich. Die volle Zahlungsverpflichtung bleibt auch bei Nichtteilnahme bestehen.",
            "Payment plans are available subject to prior agreement. Outstanding installments remain due even if the user discontinues participation."
          )}
        </p>
      </LegalSection>

      <LegalSection number="7" title={tx("Haftungsbeschränkung", "Limitation of Liability")}>
        <p>
          {tx(
            `${L.company} haftet unbeschränkt nur bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten). Im Übrigen ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt.`,
            `${L.company} shall only be liable without limitation in cases of intent and gross negligence as well as breach of essential contractual obligations. In all other cases, liability is limited to foreseeable damages typical for the contract.`
          )}
        </p>
        <p>
          {tx(
            "Eine Haftung für entgangenen Gewinn, mittelbare Schäden oder Folgeschäden ist im gesetzlich zulässigen Umfang ausgeschlossen.",
            "Liability for lost profits, indirect damages or consequential damages is excluded to the extent permitted by law."
          )}
        </p>
      </LegalSection>

      <LegalSection number="8" title={tx("Erstattung & Widerruf", "Refunds & Cancellation")}>
        <p>
          {tx("Es gelten die separaten Bestimmungen der ", "Refunds are governed separately by the ")}
          <a href="/refund-policy" className="text-primary hover:underline">
            {tx("Widerrufs- & Erstattungsrichtlinie", "Refund & Cancellation Policy")}
          </a>.
        </p>
      </LegalSection>

      <LegalSection number="9" title={tx("Kündigung", "Termination")}>
        <p>
          {tx(
            "Beide Parteien können das Vertragsverhältnis bei Vorliegen eines wichtigen Grundes außerordentlich kündigen. Bei groben Verstößen (Betrug, Belästigung, Missbrauch) behält sich der Anbieter das Recht zur sofortigen Sperrung des Accounts vor.",
            "Either party may terminate for good cause. In case of serious violations (fraud, harassment, abuse), the Provider reserves the right to suspend the account immediately."
          )}
        </p>
      </LegalSection>

      <LegalSection number="10" title={tx("Änderungen", "Changes")}>
        <p>
          {tx(
            "Wir können diese AGB anpassen. Wesentliche Änderungen werden mit angemessener Vorankündigung kommuniziert.",
            "We may update these Terms. Material changes will be communicated with reasonable notice."
          )}
        </p>
      </LegalSection>

      <LegalSection number="11" title={tx("Anwendbares Recht & Gerichtsstand", "Governing Law & Jurisdiction")}>
        <p>{tx(
          `Es gilt das Recht des Bundesstaates ${L.jurisdictionState}, USA. Zwingende Verbraucherschutzvorschriften des Wohnsitzstaates des Nutzers innerhalb der EU bleiben unberührt.`,
          L.governingLaw
        )}</p>
      </LegalSection>

      <LegalSection number="12" title={tx("Salvatorische Klausel", "Severability")}>
        <p>
          {tx(
            "Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
            "If any provision is held invalid, the remaining provisions shall remain in full force and effect."
          )}
        </p>
      </LegalSection>
    </LegalLayout>
  );
};

export default TermsOfService;
