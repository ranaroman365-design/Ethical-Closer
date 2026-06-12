import { useState, useCallback } from "react";
import Slide, { SlideH2, SlideP, SlideBullets, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import volcanoLandscape from "@/assets/volcano-landscape.jpeg";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import SlideRealityCheck from "./SlideRealityCheck";
import SlideDecisionMoment from "./SlideDecisionMoment";

const FaqItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/50">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 text-left">
        <span className="font-sans text-base font-medium pr-4">{q}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <p className="pb-5 font-sans text-sm opacity-70 leading-relaxed">{a}</p>}
    </div>
  );
};

const WebinarPart3 = () => {
  const { tx } = useLanguage();

  const handleDownloadPdf = useCallback(() => {
    window.print();
  }, []);

  const faqItems = [
    {
      q: tx("I have no sales experience.", "Ich habe keine Vertriebserfahrung."),
      a: tx("Most of our graduates had no prior sales background. This skill is learnable from scratch with our structured system.",
        "Die meisten unserer Absolventen hatten keinen Vertriebshintergrund. Dieser Skill ist mit unserem strukturierten System von Grund auf erlernbar."),
    },
    {
      q: tx("I am introverted.", "Ich bin introvertiert."),
      a: tx("Many of our strongest closers are introverts. Closing is about listening, empathy, and precision — not being loud.",
        "Viele unserer stärksten Closer sind introvertiert. Closing dreht sich um Zuhören, Empathie und Präzision — nicht um Lautstärke."),
    },
    {
      q: tx("I fear rejection.", "Ich habe Angst vor Ablehnung."),
      a: tx("Professional closing is not cold calling. You speak with people who already expressed interest. The dynamic is collaborative, not adversarial.",
        "Professionelles Closing ist kein Kaltakquise. Du sprichst mit Menschen, die bereits Interesse gezeigt haben. Die Dynamik ist kooperativ, nicht konfrontativ."),
    },
    {
      q: tx("What if it does not work?", "Was, wenn es nicht funktioniert?"),
      a: tx("Success depends on your commitment and consistency. We provide the system, training, and support. Your effort determines the outcome.",
        "Erfolg hängt von deinem Engagement und deiner Beständigkeit ab. Wir bieten das System, Training und Support. Dein Einsatz bestimmt das Ergebnis."),
    },
  ];

  return (
    <>
      {/* NEW — REALITY CHECK (before pricing) */}
      <SlideRealityCheck />

      {/* SECTION 41 — CERTIFICATION */}
      <Slide variant="muted">
        <SlideH2>{tx("You are not buying a one-off course.", "Du kaufst keinen einmaligen Kurs.")}</SlideH2>
        <SlideP>{tx("You get:", "Du bekommst:")}</SlideP>
        <SlideBullets items={[
          tx("Certification", "Zertifizierung"),
          tx("Lifetime access", "Lebenslanger Zugang"),
          "Updates",
          "Community",
          tx("Long-term career infrastructure", "Langfristige Karriere-Infrastruktur"),
        ]} />
      </Slide>

      {/* SECTION 42 — WHAT MAKES YOU DIFFERENT */}
      <Slide variant="dark">
        <SlideH2>{tx("Most people do not fail because they do not want it.", "Die meisten scheitern nicht, weil sie es nicht wollen.")}</SlideH2>
        <SlideP>{tx("They fail because they lack a system.", "Sie scheitern, weil ihnen ein System fehlt.")}</SlideP>
        <SlideBullets items={[
          tx("Psychology", "Psychologie"),
          tx("Practice", "Praxis"),
          tx("Conversation skill", "Gesprächskompetenz"),
          tx("Self-regulation", "Selbstregulation"),
          tx("Market access", "Marktzugang"),
        ]} />
      </Slide>

      {/* SECTION 43 — WHAT YOU'RE REALLY BUYING */}
      <Slide variant="white">
        <div className="text-center">
          <SlideH2>{tx("Not just a program.", "Nicht nur ein Programm.")}</SlideH2>
          <p className="font-serif text-xl md:text-2xl opacity-70 mb-8">{tx("You are buying:", "Du kaufst:")}</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              tx("A marketable skill", "Einen marktfähigen Skill"),
              tx("A new professional option", "Eine neue berufliche Option"),
              tx("A system", "Ein System"),
              tx("A network", "Ein Netzwerk"),
              tx("Access to a growing market", "Zugang zu einem wachsenden Markt"),
            ].map((item) => (
              <div key={item} className="p-5 rounded-lg border border-border/50">
                <p className="font-sans text-sm font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>

      {/* SECTION 44 — THE CORE PROGRAM */}
      <Slide variant="light">
        <div className="text-center">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
            {tx("The Program", "Das Programm")}
          </p>
          <SlideH2>Ethical Top Closer Program</SlideH2>
          <p className="font-serif text-xl opacity-70 mb-8">{tx("9-week complete training.", "9 Wochen Komplett-Training.")}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              tx("8 modules", "8 Module"),
              "Live Calls",
              tx("Practice", "Praxis"),
              "Community",
              tx("Certification", "Zertifizierung"),
              tx("Lifetime access", "Lebenslanger Zugang"),
            ].map((item) => (
              <span key={item} className="px-4 py-2 rounded-full border border-border bg-card font-sans text-sm">{item}</span>
            ))}
          </div>
        </div>
      </Slide>

      {/* NEW SLIDE — REMOTE WORK & FREEDOM */}
      <Slide variant="muted">
        <div className="text-center">
          <SlideH2>
            {tx(
              "One skill. One laptop. A market that already exists.",
              "Eine Fähigkeit. Ein Laptop. Ein Markt, der bereits existiert."
            )}
          </SlideH2>
          <SlideP className="max-w-2xl mx-auto">
            {tx(
              "High-Ticket Closing is not a business idea. It is a skill. And skills can be used from anywhere.",
              "High-Ticket Closing ist keine Business-Idee. Es ist eine Fähigkeit. Und Fähigkeiten können von überall eingesetzt werden."
            )}
          </SlideP>
          <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mt-10 mb-4">
            {tx("Many of our graduates now work:", "Viele unserer Absolventen arbeiten heute:")}
          </p>
          <div className="max-w-md mx-auto space-y-3 text-left">
            {[
              tx("Remote from home", "Remote von zu Hause"),
              tx("From co-working spaces", "Aus Co-Working-Spaces"),
              tx("While traveling", "Während Reisen"),
              tx("Alongside their existing job", "Neben ihrem bestehenden Job"),
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                <p className="font-sans text-base">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 p-6 rounded-lg border border-border/50 bg-card max-w-lg mx-auto">
            <p className="font-sans text-base opacity-80">
              {tx(
                "Most participants complete the program in about 9 weeks. Depending on personal pace, it can take between 9 and 22 weeks.",
                "Die meisten Teilnehmer absolvieren das Programm in etwa 9 Wochen. Je nach persönlichem Tempo kann es jedoch zwischen 9 und 22 Wochen dauern."
              )}
            </p>
            <p className="font-serif text-lg font-medium mt-4">
              {tx("You set your pace.", "Du bestimmst dein Tempo.")}
            </p>
            <p className="font-sans text-sm opacity-60 mt-2">
              {tx("Many participants complete the program alongside their job.", "Viele Teilnehmer absolvieren das Programm berufsbegleitend.")}
            </p>
          </div>
          <SlideSupport>
            {tx("You build a skill that is not tied to a place.", "Du baust eine Fähigkeit auf, die nicht an einen Ort gebunden ist.")}
          </SlideSupport>
        </div>
      </Slide>

      {/* SECTION 45 — INVESTMENT */}
      <Slide variant="white">
        <div className="text-center">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
            {tx("Investment", "Investition")}
          </p>
          <SlideH2>{tx("Investment into the Core Program", "Investition in das Kernprogramm")}</SlideH2>
          <div className="grid md:grid-cols-3 gap-6 mt-10 max-w-3xl mx-auto">
            <div className="p-8 rounded-lg border-2 border-accent bg-card">
              <p className="font-sans text-xs uppercase tracking-[0.15em] text-accent mb-2">{tx("One-time", "Einmalig")}</p>
              <p className="font-serif text-4xl font-semibold">€4,400</p>
            </div>
            <div className="p-8 rounded-lg border border-border/50 bg-card">
              <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground mb-2">{tx("3 payments", "3 Raten")}</p>
              <p className="font-serif text-3xl font-semibold">3 × €1,550</p>
            </div>
            <div className="p-8 rounded-lg border border-border/50 bg-card">
              <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground mb-2">{tx("6 payments", "6 Raten")}</p>
              <p className="font-serif text-3xl font-semibold">6 × €800</p>
            </div>
          </div>
          <SlideSupport>{tx("Not for everyone. Very fair for what you build.", "Nicht für jeden. Sehr fair für das, was du aufbaust.")}</SlideSupport>
        </div>
      </Slide>

      {/* SECTION 46 — PLACEMENT TRACK */}
      <Slide variant="muted">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
          {tx("Optional", "Optional")}
        </p>
        <SlideH2>Placement Track</SlideH2>
        <SlideBullets items={[
          tx("Closer profile", "Closer-Profil"),
          tx("Application video", "Bewerbungsvideo"),
          tx("CV optimization", "CV-Optimierung"),
          tx("Network access", "Netzwerkzugang"),
          tx("Up to 2 qualified partner introductions", "Bis zu 2 qualifizierte Partner-Vorstellungen"),
        ]} />
        <div className="mt-8 p-6 rounded-lg border border-border/50 bg-card inline-block">
          <p className="font-sans text-sm text-muted-foreground">{tx("Additional investment", "Zusätzliche Investition")}</p>
          <p className="font-serif text-2xl font-semibold mt-1">€2,900</p>
        </div>
      </Slide>

      {/* SECTION 47 — WHY PRICE MAKES SENSE */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideH2>{tx("The price is not the right question.", "Der Preis ist nicht die richtige Frage.")}</SlideH2>
          <p className="font-serif text-xl md:text-2xl opacity-80 mt-8 max-w-2xl mx-auto">
            {tx("The right question is: What is a skill worth that can open income opportunities for years?",
              "Die richtige Frage ist: Was ist ein Skill wert, der dir über Jahre Einkommensmöglichkeiten eröffnen kann?")}
          </p>
          <SlideSupport>
            {tx("A few stable months at a solid level can already change the economics completely. No guarantee. Strong logic.",
              "Ein paar stabile Monate auf solidem Niveau können die Rechnung bereits komplett verändern. Keine Garantie. Starke Logik.")}
          </SlideSupport>
        </div>
      </Slide>

      {/* NEW — DECISION MOMENT (after pricing, before who-its-for) */}
      <SlideDecisionMoment />

      {/* SECTION 48 — TRUE VALUE */}
      <Slide variant="white">
        <SlideH2>{tx("The real value is not only knowledge.", "Der echte Wert ist nicht nur Wissen.")}</SlideH2>
        <SlideP>{tx("It is the combination of:", "Es ist die Kombination aus:")}</SlideP>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {[
            "Skill",
            tx("Practice", "Praxis"),
            tx("Nervous system", "Nervensystem"),
            tx("Network", "Netzwerk"),
            "Positioning",
            tx("Market access", "Marktzugang"),
          ].map((item) => (
            <div key={item} className="p-4 rounded-lg border border-border/50 text-center">
              <p className="font-serif text-lg font-medium">{item}</p>
            </div>
          ))}
        </div>
      </Slide>

      {/* SECTION 49 — WHO THIS IS FOR */}
      <Slide variant="light">
        <SlideH2>{tx("This program is right for you if you:", "Dieses Programm ist richtig für dich, wenn du:")}</SlideH2>
        <SlideBullets items={[
          tx("Truly want to learn", "Wirklich lernen willst"),
          tx("Take responsibility", "Verantwortung übernimmst"),
          tx("Want to work professionally", "Professionell arbeiten willst"),
          tx("Are committed, not just curious", "Committed bist, nicht nur neugierig"),
          tx("Seek a serious next career option", "Eine seriöse nächste Karriereoption suchst"),
        ]} />
      </Slide>

      {/* SECTION 50 — WHO THIS IS NOT FOR */}
      <Slide variant="muted">
        <SlideH2>{tx("This program is not for you if you:", "Dieses Programm ist nicht für dich, wenn du:")}</SlideH2>
        <SlideBullets items={[
          tx("Want easy side income without effort", "Einfaches Nebeneinkommen ohne Aufwand willst"),
          tx("Fundamentally avoid conversations", "Gespräche grundsätzlich vermeidest"),
          tx("Are unwilling to develop", "Dich nicht weiterentwickeln willst"),
          tx("Hope for miracles instead of competence", "Auf Wunder statt auf Kompetenz hoffst"),
        ]} />
      </Slide>

      {/* SECTION 51 — THE NEXT STEP */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideH2>{tx("The next step is not blind buying. It is a conversation.", "Der nächste Schritt ist kein Blindkauf. Es ist ein Gespräch.")}</SlideH2>
          <SlideP>{tx("A qualification call where we honestly assess together:", "Ein Qualifikationsgespräch, in dem wir ehrlich gemeinsam bewerten:")}</SlideP>
          <SlideBullets items={[
            tx("Does closing fit you?", "Passt Closing zu dir?"),
            tx("Does our program fit you?", "Passt unser Programm zu dir?"),
            tx("Is the timing right?", "Ist der Zeitpunkt richtig?"),
            tx("Should we work together?", "Sollten wir zusammenarbeiten?"),
          ]} />
        </div>
      </Slide>

      {/* SECTION 52 — WHY THE CALL IS VALUABLE */}
      <Slide variant="white">
        <SlideH2>{tx("Even if you do not start, the call can still give you clarity.", "Selbst wenn du nicht startest, kann das Gespräch dir Klarheit geben.")}</SlideH2>
        <SlideP>{tx("You will better understand:", "Du wirst besser verstehen:")}</SlideP>
        <SlideBullets items={[
          tx("Whether this path fits you", "Ob dieser Weg zu dir passt"),
          tx("What your strongest professional option is", "Was deine stärkste berufliche Option ist"),
          tx("What is holding you back", "Was dich zurückhält"),
          tx("What the next sensible step is", "Was der nächste sinnvolle Schritt ist"),
        ]} />
      </Slide>

      {/* SECTION 53 — WHY WE SAY NO */}
      <Slide variant="light">
        <SlideH2>{tx("Sometimes we say: not yet.", "Manchmal sagen wir: noch nicht.")}</SlideH2>
        <SlideP>
          {tx("Not out of arrogance. Out of responsibility. Our goal is not maximum sales. Our goal is strong fit and strong outcomes.",
            "Nicht aus Arroganz. Aus Verantwortung. Unser Ziel ist nicht maximaler Umsatz. Unser Ziel ist starker Fit und starke Ergebnisse.")}
        </SlideP>
      </Slide>

      {/* SECTION 54 — IF IT FITS */}
      <Slide variant="muted">
        <SlideH2>{tx("If it fits, this path can give you a lot.", "Wenn es passt, kann dir dieser Weg viel geben.")}</SlideH2>
        <SlideBullets items={[
          tx("More freedom", "Mehr Freiheit"),
          tx("More income", "Mehr Einkommen"),
          tx("More self-determination", "Mehr Selbstbestimmung"),
          tx("More professional future", "Mehr berufliche Zukunft"),
          tx("Stronger communication", "Stärkere Kommunikation"),
          tx("More quality of life", "Mehr Lebensqualität"),
        ]} />
        <img src={volcanoLandscape} alt="Aspirational landscape" className="rounded-lg mt-8 w-full object-cover max-h-56" />
      </Slide>

      {/* SECTION 55 — HOW TO PROCEED */}
      <Slide variant="white">
        <div className="text-center">
          <SlideH2>{tx("This is how you move forward.", "So gehst du den nächsten Schritt.")}</SlideH2>
          <div className="max-w-md mx-auto mt-10 space-y-6">
            {[
              { step: "1", label: tx("Fill out the questionnaire", "Fragebogen ausfüllen") },
              { step: "2", label: tx("Book a time", "Termin buchen") },
              { step: "3", label: tx("Have the conversation", "Gespräch führen") },
              { step: "4", label: tx("Make an honest decision", "Ehrliche Entscheidung treffen") },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-4">
                <span className="w-10 h-10 rounded-full border border-border flex items-center justify-center font-serif text-lg font-semibold shrink-0">{item.step}</span>
                <p className="font-sans text-base text-left">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>

      {/* SECTION 56 — FAQ */}
      <Slide variant="light">
        <SlideH2>{tx("Common objections, answered directly.", "Häufige Einwände, direkt beantwortet.")}</SlideH2>
        <div className="mt-8 max-w-2xl">
          {faqItems.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </Slide>

      {/* SECTION 57 — HONEST STATEMENT */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideH2>{tx("We will not make the decision for you.", "Wir werden die Entscheidung nicht für dich treffen.")}</SlideH2>
          <SlideP>
            {tx("But we have given you enough clarity to make it consciously. Not from pressure. From self-respect.",
              "Aber wir haben dir genug Klarheit gegeben, um sie bewusst zu treffen. Nicht aus Druck. Aus Selbstachtung.")}
          </SlideP>
        </div>
      </Slide>

      {/* SECTION 58 — FINAL CTA (enhanced) */}
      <Slide variant="white" id="apply">
        <div className="text-center">
          <p className="font-serif text-xl md:text-2xl opacity-70 mb-6">
            {tx("Maybe today is not the day you decide everything.", "Vielleicht ist heute nicht der Tag, an dem du alles entscheidest.")}
          </p>
          <SlideH2>
            {tx("But maybe today is the day you stop postponing your next level.",
              "Aber vielleicht ist heute der Tag, an dem du aufhörst, deine nächste Stufe aufzuschieben.")}
          </SlideH2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <a href="/start/bewerbung" className="rounded-sm bg-primary px-10 py-4 font-sans text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90">
              {tx("Start application", "Jetzt bewerben")}
            </a>
          </div>
        </div>
      </Slide>

      {/* SECTION 59 — CLOSING + PDF DOWNLOAD */}
      <Slide variant="dark">
        <div className="text-center">
          <h2 className="font-serif text-4xl md:text-6xl font-semibold tracking-tight leading-[0.9] mb-4">
            ETHICAL<br />TOP CLOSER™
          </h2>
          <p className="font-sans text-xs uppercase tracking-[0.25em] opacity-40 mb-8">
            Ethical High-Ticket Closing System by Radiant
          </p>
          <p className="font-serif text-xl md:text-2xl opacity-70 mb-2">
            {tx("The quiet path to freedom, professionalism, and marketable income.",
              "Der ruhige Weg zu Freiheit, Professionalität und marktfähigem Einkommen.")}
          </p>
          <div className="mt-10">
            <p className="font-sans text-sm opacity-60">Manuel & Wolfgang</p>
            <p className="font-sans text-xs opacity-40 mt-1">Made with 🧡 in Germany 🇪🇺</p>
          </div>

          {/* PDF Download Button */}
          <button
            onClick={handleDownloadPdf}
            className="mt-10 inline-flex items-center gap-2 rounded-sm border border-primary-foreground/20 px-8 py-3 font-sans text-xs font-medium tracking-wide text-primary-foreground/70 transition-all hover:bg-primary-foreground/10 hover:text-primary-foreground print:hidden"
          >
            <Download className="h-4 w-4" />
            {tx("Save as PDF", "Als PDF speichern")}
          </button>

          <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 justify-center">
            {[
              { label: "Legal Notice", path: "/legal-notice" },
              { label: "Privacy", path: "/privacy" },
              { label: "Terms", path: "/terms" },
              { label: "Refund", path: "/refund-policy" },
              { label: "Cookies", path: "/cookie-policy" },
            ].map((link) => (
              <a key={link.label} href={link.path} className="font-sans text-xs opacity-40 hover:opacity-70 transition-opacity">{link.label}</a>
            ))}
          </div>
        </div>
      </Slide>
    </>
  );
};

export default WebinarPart3;
