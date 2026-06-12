import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

const L = PRODUCT.legal;

const LegalNotice = () => {
  const { tx } = useLanguage();

  return (
    <LegalLayout
      title={tx("Impressum", "Legal Notice")}
      subtitle={tx(
        "Anbieterkennzeichnung gemäß § 5 TMG / § 18 MStV und internationaler Transparenzanforderungen.",
        "Provider identification under EU transparency requirements (§ 5 TMG / § 18 MStV) and international best practices."
      )}
    >
      <LegalSection number="1" title={tx("Diensteanbieter", "Service Provider")}>
        <p>
          {tx(
            "Diese Website und alle zugehörigen Dienste werden betrieben von:",
            "This website and all associated services are operated by:"
          )}
        </p>
        <div className="rounded-lg border border-border/60 bg-card/30 p-5">
          <p className="font-medium text-foreground">{L.company}</p>
          <p className="mt-2">{L.street}</p>
          <p>{L.zipCity}</p>
          <p>{L.country}</p>
          <p className="mt-3">
            <span className="text-muted-foreground">{tx("Vertretungsberechtigt", "Authorized Representative")}:</span>{" "}
            {L.representative}
          </p>
        </div>
      </LegalSection>

      <LegalSection number="2" title={tx("Registereintrag", "Company Registration")}>
        <p>
          {tx(
            `${L.company} ist eine im US-Bundesstaat ${L.jurisdictionState} eingetragene Limited Liability Company (LLC).`,
            `${L.company} is a limited liability company duly registered in the State of ${L.jurisdictionState}, ${L.jurisdictionCountry}.`
          )}
        </p>
        <ul className="ml-5 list-disc space-y-1 text-foreground/80">
          <li>{tx("Filing-ID", "Filing ID")}: {L.filingId}</li>
          <li>{tx("Gründungsdatum", "Date of Formation")}: {L.formationDate}</li>
          <li>{tx("Organisator", "Organizer")}: {L.organizer}</li>
        </ul>
      </LegalSection>

      <LegalSection number="3" title={tx("Registered Agent", "Registered Agent")}>
        <div className="rounded-lg border border-border/60 bg-card/30 p-5">
          <p className="font-medium text-foreground">{L.registeredAgent.name}</p>
          <p className="mt-2">{L.registeredAgent.street}</p>
          <p>{L.registeredAgent.zipCity}</p>
          <p>{L.registeredAgent.country}</p>
        </div>
      </LegalSection>

      <LegalSection number="4" title={tx("Bestätigung der Vertretungsbefugnis", "Certification of Incumbency")}>
        <p>
          {tx(
            `Gemäß den amtlichen Registern und der Bestätigung des Registered Agent ist ${L.company} ordnungsgemäß gegründet und nach dem Recht des Staates ${L.jurisdictionState} rechtswirksam bestehend. Die eingetragene Adresse und der Registered Agent entsprechen den oben genannten Angaben. Alleiniges Mitglied und vertretungsberechtigte Person ist ${L.representative}.`,
            `According to official records and certification by the registered agent, ${L.company} is duly formed and validly existing under the laws of the State of ${L.jurisdictionState}. The registered address and agent are as stated above. The sole member and authorized representative is ${L.representative}.`
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {tx(
            `Die Certificate of Incumbency ist im Bundesstaat ${L.jurisdictionState} notariell beglaubigt.`,
            `The Certificate of Incumbency is notarized in the State of ${L.jurisdictionState}.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="5" title={tx("Operative Marken", "Operating Brands")}>
        <p>
          {tx(
            `${L.company} betreibt folgende Marken, Programme und Plattformen:`,
            `${L.company} operates the following brands, programs and platforms:`
          )}
        </p>
        <ul className="ml-5 list-disc space-y-2">
          {L.brands.map((b) => (
            <li key={b.name}>
              <span className="font-medium text-foreground">{b.name}</span> — {b.purpose}
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection number="6" title={tx("Kontakt", "Contact")}>
        <p>
          {tx("E-Mail", "Email")}:{" "}
          <a href={`mailto:${L.email}`} className="text-primary underline-offset-2 hover:underline">
            {L.email}
          </a>
        </p>
        <p className="text-sm text-muted-foreground">
          {tx(
            `Wir bemühen uns, alle Anfragen innerhalb von ${L.responseTime} zu beantworten.`,
            `We aim to respond to all inquiries within ${L.responseTime}.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="7" title={tx("Verantwortlich für redaktionelle Inhalte", "Responsible for Editorial Content")}>
        <p>
          {tx(
            "Verantwortlich für redaktionelle Inhalte gemäß § 18 Abs. 2 MStV:",
            "Responsible for editorial content pursuant to § 18 para. 2 of the German State Media Treaty (MStV):"
          )}
        </p>
        <div className="rounded-lg border border-border/60 bg-card/30 p-5">
          <p className="font-medium text-foreground">{L.representative}</p>
          <p className="mt-2">c/o {L.company}</p>
          <p>{L.street}</p>
          <p>{L.zipCity}, {L.country}</p>
          <p className="mt-2">{L.email}</p>
        </div>
      </LegalSection>

      <LegalSection number="8" title={tx("Datenschutz", "Data Protection")}>
        <p>
          {tx(
            "Informationen zur Verarbeitung personenbezogener Daten — einschließlich der Anforderungen der Datenschutz-Grundverordnung (DSGVO) — finden Sie in unserer ",
            "Information regarding the processing of personal data, including details required under the General Data Protection Regulation (GDPR), is provided in our "
          )}
          <a href="/privacy" className="text-primary underline-offset-2 hover:underline">
            {tx("Datenschutzerklärung", "Privacy Policy")}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection number="9" title={tx("Steuerliche Angaben", "Tax Information")}>
        <p>
          {tx(
            `${L.company} ist eine US-amerikanische Limited Liability Company. Da es sich um ein Nicht-EU-Unternehmen handelt, ist keine EU-USt-IdNr. anwendbar.`,
            `${L.company} is a United States limited liability company. As a non-EU entity, no EU VAT identification number is applicable.`
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {tx(
            "Für B2B-Transaktionen innerhalb der Europäischen Union, die steuerliche Dokumentation erfordern, wenden Sie sich bitte an ",
            "For B2B transactions within the European Union requiring tax documentation, please contact "
          )}
          <a href={`mailto:${L.email}`} className="text-primary hover:underline">{L.email}</a>.
        </p>
      </LegalSection>

      <LegalSection number="10" title={tx("Geistiges Eigentum", "Intellectual Property")}>
        <p>
          {tx(
            `Sämtliche Inhalte, Materialien, Designs, Grafiken, Texte und Software, die von ${L.company} veröffentlicht werden, sind durch internationales Urheberrecht und gewerbliche Schutzrechte geschützt.`,
            `All content, materials, designs, graphics, text and software published by ${L.company} are protected under applicable international copyright and intellectual property laws.`
          )}
        </p>
        <p>
          {tx(
            `Die folgenden Bezeichnungen und das zugehörige Branding sind Marken von ${L.company}: `,
            `The following names and associated branding are trademarks of ${L.company}: `
          )}
          {L.brands.map((b) => b.name).join(" · ")}
        </p>
        <p className="text-sm text-muted-foreground">
          {tx(
            "Jede Vervielfältigung, Verbreitung, Bearbeitung oder kommerzielle Nutzung bedarf der vorherigen schriftlichen Zustimmung.",
            "Any reproduction, distribution, modification or commercial use requires prior written consent."
          )}
        </p>
      </LegalSection>

      <LegalSection number="11" title={tx("Haftung für Inhalte", "Liability for Content")}>
        <p>
          {tx(
            `Die Inhalte dieser Websites wurden mit größtmöglicher Sorgfalt erstellt. ${L.company} übernimmt jedoch keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität der Informationen. Eine Haftung ist im gesetzlich zulässigen Umfang ausgeschlossen.`,
            `The information provided on these websites has been prepared with the greatest care. However, ${L.company} does not guarantee the accuracy, completeness or timeliness of the information provided. Liability is excluded to the extent permitted by applicable law.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="12" title={tx("Externe Links", "External Links")}>
        <p>
          {tx(
            `Diese Website kann Links zu externen Drittanbieter-Websites enthalten. ${L.company} hat keinen Einfluss auf deren Inhalte und übernimmt hierfür keine Haftung. Für den Inhalt verlinkter Seiten sind ausschließlich deren Betreiber verantwortlich.`,
            `This website may contain links to external third-party websites. ${L.company} has no influence over the content of such websites and assumes no liability for them. The operators of linked websites are solely responsible for their content.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="13" title={tx("Bildungs-Disclaimer", "Educational Disclaimer")}>
        <p>
          {tx(
            `${L.company} stellt Bildungsprogramme, Coaching, Trainings und damit verbundene Dienstleistungen bereit. Die Teilnahme an einem Programm garantiert keine bestimmten finanziellen, beruflichen oder persönlichen Ergebnisse. Individuelle Resultate hängen vom persönlichen Einsatz, der Erfahrung und externen Faktoren ab.`,
            `${L.company} provides educational programs, coaching, training and related services. Participation in any program does not guarantee specific financial, professional or personal results. Individual outcomes depend on personal effort, experience and external factors.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="14" title={tx("Online-Streitbeilegung (EU)", "Online Dispute Resolution (EU)")}>
        <p>
          {tx(
            "Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:",
            "The European Commission provides a platform for Online Dispute Resolution (ODR):"
          )}
        </p>
        <p>
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline break-all"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
        </p>
        <p className="text-sm text-muted-foreground">
          {tx(
            `${L.company} ist nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.`,
            `${L.company} is not obligated and not willing to participate in dispute resolution proceedings before a consumer arbitration board.`
          )}
        </p>
      </LegalSection>

      <LegalSection number="15" title={tx("Anwendbares Recht", "Governing Law")}>
        <p>{tx(
          `Dieses Impressum unterliegt dem Recht des Bundesstaates ${L.jurisdictionState}, USA, unbeschadet zwingender Verbraucherschutzvorschriften der Europäischen Union im Wohnsitzstaat des Nutzers.`,
          L.governingLaw
        )}</p>
      </LegalSection>
    </LegalLayout>
  );
};

export default LegalNotice;
