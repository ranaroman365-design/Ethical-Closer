import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

const L = PRODUCT.legal;

const RefundPolicy = () => {
  const { tx } = useLanguage();

  return (
    <LegalLayout
      title={tx("Widerrufs- & Erstattungsrichtlinie", "Refund & Cancellation Policy")}
      subtitle={tx(
        "Klare Regelungen zu Widerrufsrecht, Erstattungen, Ratenzahlungen und Chargebacks — abgestimmt auf EU- und US-Verbraucherrecht.",
        "Clear rules on withdrawal rights, refunds, payment plans and chargebacks — aligned with EU and US consumer law."
      )}
    >
      <LegalSection number="A" title={tx("Allgemeiner Grundsatz", "General Principle")}>
        <p className="rounded-lg border border-border/60 bg-card/30 p-5">
          {tx(
            `Alle Programme von ${L.company} sind Bildungsdienstleistungen. Es werden ausdrücklich keine finanziellen oder beruflichen Ergebnisse garantiert. Erstattungen werden ausschließlich nach Maßgabe dieser Richtlinie und zwingender gesetzlicher Bestimmungen gewährt.`,
            `All programs of ${L.company} are educational services. No financial or professional results are guaranteed. Refunds are granted exclusively under this policy and applicable mandatory law.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="B" title={tx("Digitale Inhalte (EU-Recht)", "Digital Products (EU Law)")}>
        <p>
          {tx(
            "Sofern digitale Inhalte unmittelbar nach Vertragsschluss bereitgestellt werden, erlischt das Widerrufsrecht gemäß Art. 16 lit. m der Verbraucherrechte-Richtlinie 2011/83/EU vorzeitig.",
            "Where digital content is made available immediately upon conclusion of the contract, the right of withdrawal expires pursuant to Art. 16(m) of Directive 2011/83/EU."
          )}
        </p>
        <p>
          {tx(
            "Voraussetzung: Der Nutzer hat beim Kauf ausdrücklich zugestimmt, dass mit der Ausführung sofort begonnen wird, und bestätigt, dass damit das Widerrufsrecht erlischt.",
            "Requirement: at checkout, the user expressly consents to immediate commencement of performance and acknowledges that the right of withdrawal is thereby waived."
          )}
        </p>
        <div className="rounded-lg border border-border/60 bg-card/30 p-4 font-medium text-foreground">
          ☑ {tx(
            "Ich verzichte ausdrücklich auf mein 14-tägiges Widerrufsrecht, sobald der Zugang freigeschaltet ist.",
            "I expressly waive my 14-day right of withdrawal once access begins."
          )}
        </div>
      </LegalSection>

      <LegalSection number="C" title={tx("Coaching- & Mentoring-Programme", "Coaching & Mentoring Programs")}>
        <p>
          {tx(
            "Für Coaching-, Mentoring- und High-Ticket-Programme gilt:",
            "For coaching, mentoring and high-ticket programs:"
          )}
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            {tx(
              "Keine Erstattung nach Programmstart oder nach erstem Live-Termin / Materialzugang.",
              "No refunds after program start or after the first live session / access to materials."
            )}
          </li>
          <li>
            {tx(
              "Ausnahmen bestehen nur, wenn (i) gesetzlich zwingend vorgeschrieben oder (ii) ausdrücklich vertraglich vereinbart.",
              "Exceptions only where (i) legally required or (ii) expressly stated in the contract."
            )}
          </li>
          <li>
            {tx(
              "Bei begründeten Einzelfällen entscheidet der Anbieter nach billigem Ermessen über teilweise Gutschriften (z. B. Programm-Credits).",
              "In justified individual cases, the Provider may grant partial credits at its reasonable discretion."
            )}
          </li>
        </ul>
      </LegalSection>

      <LegalSection number="D" title={tx("EU-Widerrufsrecht (14 Tage)", "EU Cooling-Off (14 days)")}>
        <p>
          {tx(
            "Verbraucher mit Wohnsitz in der EU haben grundsätzlich ein 14-tägiges Widerrufsrecht ab Vertragsschluss.",
            "EU consumers have a 14-day right of withdrawal from the conclusion of the contract."
          )}
        </p>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-card/30 p-4">
            <p className="font-medium text-foreground">
              {tx("Wenn KEIN Zugriff erfolgt ist:", "If NO content has been accessed:")}
            </p>
            <p className="mt-1 text-sm">
              {tx(
                "Widerruf ist möglich. Eine Mitteilung per E-Mail an ",
                "Withdrawal is possible. Send notice by email to "
              )}
              <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>
              {tx(" genügt. Erstattung innerhalb von 14 Tagen.", " is sufficient. Refund within 14 days.")}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/30 p-4">
            <p className="font-medium text-foreground">
              {tx("Wenn Zugriff bereits erfolgt ist:", "If content has already been accessed:")}
            </p>
            <p className="mt-1 text-sm">
              {tx(
                "Widerrufsrecht ist erloschen (siehe Abschnitt B).",
                "The right of withdrawal has expired (see Section B)."
              )}
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection number="E" title={tx("Ratenzahlungen", "Payment Plans")}>
        <p>
          {tx(
            "Bei Vereinbarung einer Ratenzahlung bleibt die volle Zahlungsverpflichtung auch dann bestehen, wenn der Nutzer die Teilnahme am Programm einstellt. Ein Erlöschen offener Raten erfolgt nur, soweit gesetzlich vorgeschrieben.",
            "Where a payment plan has been agreed, the full payment obligation remains even if the user discontinues participation. Outstanding installments are cancelled only where legally required."
          )}
        </p>
      </LegalSection>

      <LegalSection number="F" title={tx("Chargeback-Schutz", "Chargeback Protection")}>
        <p>
          {tx(
            "Streitigkeiten über Zahlungen sind zunächst direkt mit uns zu klären. Bitte kontaktieren Sie ",
            "Payment disputes must first be raised internally. Please contact "
          )}
          <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>
          {tx(
            " bevor Sie ein Chargeback-Verfahren einleiten.",
            " before initiating a chargeback."
          )}
        </p>
        <p className="rounded-lg border border-border/60 bg-card/30 p-5 text-sm">
          {tx(
            "Missbräuchliche Chargebacks (z. B. nach vollständigem Konsum digitaler Inhalte) können zur sofortigen Sperrung des Accounts und zur Geltendmachung von Schadensersatz inkl. anfallender Gebühren führen.",
            "Abusive chargebacks (e.g. after full consumption of digital content) may lead to immediate account suspension and a claim for damages including any associated fees."
          )}
        </p>
      </LegalSection>

      <LegalSection number="G" title={tx("Muster-Widerrufsformular", "Model Withdrawal Form")}>
        <p>
          {tx(
            "Wenn Sie den Vertrag widerrufen möchten, können Sie dieses Formular verwenden:",
            "If you wish to withdraw from the contract, you may use this form:"
          )}
        </p>
        <div className="rounded-lg border border-border/60 bg-card/30 p-5 font-mono text-sm">
          <p>{tx("An", "To")}: {L.company}, {L.street}, {L.zipCity}, {L.country}</p>
          <p>{tx("E-Mail", "Email")}: {L.email}</p>
          <p className="mt-3">
            {tx(
              "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung folgender Dienstleistung:",
              "I hereby give notice of withdrawal from the contract for the provision of the following service:"
            )}
          </p>
          <p className="mt-3">{tx("Bestellt am", "Ordered on")}: ____________</p>
          <p>{tx("Name des Verbrauchers", "Name of the consumer")}: ____________</p>
          <p>{tx("Anschrift", "Address")}: ____________</p>
          <p>{tx("Datum / Unterschrift", "Date / Signature")}: ____________</p>
        </div>
      </LegalSection>

      <LegalSection number="H" title={tx("Kontakt", "Contact")}>
        <p>
          {tx("Erstattungs- oder Widerrufsanfragen an: ", "Refund or withdrawal requests: ")}
          <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
};

export default RefundPolicy;
