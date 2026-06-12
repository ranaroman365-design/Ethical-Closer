import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackHomeFaqOpen } from "@/lib/home-tracking";

/*
 * MECE FAQ – chronologisch geordnet nach der Customer Journey:
 * 1. Einstieg & Voraussetzungen
 * 2. Programm & Ablauf
 * 3. Praxis & Zertifizierung
 * 4. Ergebnisse & Karriere
 * 5. Sicherheit & Vertrauen
 */

interface FaqCategory {
  heading: string;
  items: { q: string; a: string }[];
}

const faqCategories: FaqCategory[] = [
  {
    heading: "1. Einstieg & Voraussetzungen",
    items: [
      {
        q: "Brauche ich Sales-Erfahrung?",
        a: "Nein. Das Programm startet bei null und baut Schritt für Schritt auf. Es ist für Quereinsteiger genauso geeignet wie für Leute mit Erfahrung.",
      },
      {
        q: "Gibt es eine Aufnahmeprüfung?",
        a: "Keine Prüfung, aber einen kurzen Fit-Check. Wir möchten sicherstellen, dass das Programm zu dir passt – und du zu uns.",
      },
      {
        q: "Welche Branchen sind geeignet?",
        a: "Überall, wo hochpreisige Dienstleistungen verkauft werden: Coaching, Beratung, SaaS, Agenturen, Finanzdienstleistungen und mehr.",
      },
    ],
  },
  {
    heading: "2. Programm & Ablauf",
    items: [
      {
        q: "Wie läuft die Masterclass ab?",
        a: "Du bekommst sofort Zugang zu einer 32-minütigen Live-Session. Danach folgt ein Eignungs-Check und optional ein persönlicher Strategie-Call.",
      },
      {
        q: "Wie viel Zeit pro Woche muss ich einplanen?",
        a: "Rechne mit 5–10 Stunden pro Woche für Module, Übungen und Feedback-Sessions.",
      },
      {
        q: "Ist das Programm remote möglich?",
        a: "Ja, 100 % remote. Alle Sessions, Rollenspiele und Feedback-Runden finden online statt.",
      },
    ],
  },
  {
    heading: "3. Praxis & Zertifizierung",
    items: [
      {
        q: "Wie funktionieren die Practice Calls?",
        a: "Du übst mit anderen Teilnehmern in strukturierten Rollenspielen und bekommst Feedback nach jedem Gespräch.",
      },
      {
        q: "Was beinhaltet die Zertifizierung?",
        a: "Eine Vorbereitung, eine Mock-Prüfung und eine Abschlussprüfung. Du zeigst, dass du ethisch und kompetent closen kannst.",
      },
      {
        q: "Was, wenn ich die Prüfung nicht bestehe?",
        a: "Du kannst sie wiederholen. Nutze das Feedback, um dich gezielt zu verbessern.",
      },
    ],
  },
  {
    heading: "4. Ergebnisse & Karriere",
    items: [
      {
        q: "Welche Ergebnisse kann ich erwarten?",
        a: "Das hängt von deinem Einsatz ab. Wir geben keine Einkommensversprechen, aber klare Skills, Strukturen und ein Netzwerk.",
      },
      {
        q: "Was ist ein Placement?",
        a: "Eine direkte Vorstellung bei einem qualifizierten High-Ticket Anbieter aus unserem Netzwerk. Du arbeitest dann als Closer für diesen Anbieter.",
      },
    ],
  },
  {
    heading: "5. Sicherheit & Vertrauen",
    items: [
      {
        q: "Ist das seriös – oder eine Hardsell-Schule?",
        a: "Unser gesamtes Modell basiert auf Ethik-Standards, Fit-Checks und No-Sale-Kompetenz. Wir lehren das Gegenteil von Hardsell.",
      },
      {
        q: "Was unterscheidet euch von anderen Closing-Ausbildungen?",
        a: "Drei Dinge: ein verbindlicher Ethik-Standard, echte Praxis mit Feedback und ein modulares System statt Motivations-Events.",
      },
      {
        q: "Was, wenn es nicht zu mir passt?",
        a: "Dann sagen wir das ehrlich. Unser Versprechen: Wir verkaufen dir nichts, was nicht zu dir passt.",
      },
    ],
  },
];

const FaqSection = () => {
  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-4 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
            Häufige Fragen
          </h2>
          <p className="mb-12 text-center text-sm text-muted-foreground">
            Geordnet nach deinem Weg – vom Einstieg bis zum Ergebnis.
          </p>

          <div className="space-y-8">
            {faqCategories.map((cat, catIdx) => (
              <div key={catIdx}>
                <h3 className="mb-3 font-serif text-base font-semibold text-foreground md:text-lg">
                  {cat.heading}
                </h3>
                <Accordion
                  type="single"
                  collapsible
                  onValueChange={(v) => {
                    if (v) trackHomeFaqOpen(v, `cat-${catIdx}`);
                  }}
                >
                  {cat.items.map((f, i) => (
                    <AccordionItem key={i} value={`faq-${catIdx}-${i}`} className="border-border">
                      <AccordionTrigger className="text-left font-serif text-sm font-medium text-foreground hover:no-underline md:text-base">
                        {f.q}
                      </AccordionTrigger>
                      <AccordionContent className="font-sans text-sm leading-relaxed text-muted-foreground">
                        {f.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FaqSection;
