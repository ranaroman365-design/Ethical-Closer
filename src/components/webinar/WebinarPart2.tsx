import Slide, { SlideH2, SlideP, SlideBullets, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import LifestyleBreaker from "@/components/landing/LifestyleBreaker";
import teamCommunity from "@/assets/team-community.png";
import teamCollage from "@/assets/team-collage.png";
import testimonialLuzi from "@/assets/testimonial-luzi.jpg";
import testimonialMarco from "@/assets/testimonial-marco.jpg";
import testimonialSarah from "@/assets/testimonial-sarah.jpg";
import founderLandrover from "@/assets/founder-landrover.jpg";
import teamTraining from "@/assets/team-training-session.jpg";

const WebinarPart2 = () => {
  const { tx } = useLanguage();

  return (
    <>
      {/* SECTION 21 — MARKET PROBLEM */}
      <Slide variant="muted">
        <SlideH2>{tx("Most closing programs teach the wrong things.", "Die meisten Closing-Programme lehren die falschen Dinge.")}</SlideH2>
        <SlideBullets items={[
          tx("Memorized scripts", "Auswendig gelernte Skripte"),
          tx("Pressure-based objection handling", "Druckbasierte Einwandbehandlung"),
          tx("Manipulation", "Manipulation"),
          tx("Short-term thinking", "Kurzfristiges Denken"),
        ]} />
        <SlideSupport>{tx("Sometimes that works briefly. Long term it destroys trust.", "Manchmal funktioniert das kurz. Langfristig zerstört es Vertrauen.")}</SlideSupport>
      </Slide>

      {/* SECTION 22 — WHY ETHICAL CLOSING WINS */}
      <Slide variant="dark">
        <SlideH2>{tx("The market does not need louder salespeople.", "Der Markt braucht keine lauteren Verkäufer.")}</SlideH2>
        <SlideP>{tx("It needs people who create trust in conversations.", "Er braucht Menschen, die Vertrauen in Gesprächen aufbauen.")}</SlideP>
        <SlideBullets items={[
          tx("Customer interest first", "Kundeninteresse zuerst"),
          tx("Clarity instead of pressure", "Klarheit statt Druck"),
          tx("Respect instead of manipulation", "Respekt statt Manipulation"),
          tx("Long-term partnership", "Langfristige Partnerschaft"),
        ]} />
      </Slide>

      {/* SECTION 23 — LUZI STORY */}
      <Slide variant="white">
        <div className="grid md:grid-cols-[1fr_auto] gap-10 items-center">
          <div>
            <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
              {tx("A story many need", "Die Geschichte, die viele brauchen")}
            </p>
            <SlideH2>Luzi.</SlideH2>
            <div className="space-y-1 mb-6">
              <p className="font-sans text-base opacity-70">{tx("Office job. 40 hours.", "Bürojob. 40 Stunden.")}</p>
              <p className="font-sans text-base opacity-70">2.200 € brutto.</p>
            </div>
            <p className="font-serif text-lg italic opacity-70 mb-6">
              {tx('"I\'m too quiet for sales."', '„Ich bin zu ruhig für Vertrieb."')}
            </p>
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-accent mb-3">{tx("Today", "Heute")}</p>
            <div className="space-y-1 mb-8">
              <p className="font-sans text-base font-medium">{tx("Trainer at Radiant", "Trainerin bei Radiant")}</p>
              <p className="font-sans text-base font-medium">5.000–6.000 € {tx("monthly", "monatlich")}</p>
              <p className="font-sans text-base opacity-70">3–10 {tx("hours closing per week", "Stunden Closing pro Woche")}</p>
              <p className="font-sans text-base opacity-70">Remote</p>
            </div>
            <div className="p-6 rounded-lg border border-accent/20 bg-muted/30">
              <p className="font-serif text-lg italic leading-relaxed">
                {tx(
                  '"Exactly what I thought was my weakness — my calmness — is my greatest advantage today."',
                  '„Genau das, was ich für meine Schwäche hielt — meine Ruhe — ist heute mein größter Vorteil."'
                )}
              </p>
              <p className="font-sans text-xs text-muted-foreground mt-3">— Luzi · Radiant Trainerin</p>
            </div>
          </div>
          <img src={testimonialLuzi} alt="Luzi" className="rounded-lg w-48 md:w-56 object-cover aspect-[3/4] hidden md:block" />
        </div>
      </Slide>

      {/* TESTIMONIALS — SOCIAL PROOF */}
      <Slide variant="light">
        <div className="text-center mb-10">
          <SlideH2>{tx("Voices from the community.", "Stimmen aus der Community.")}</SlideH2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              img: testimonialMarco,
              name: "Marco, 38",
              role: tx("Former IT consultant", "Ehem. IT-Berater"),
              quote: tx(
                '"I was looking for a way out of the corporate world. This gave me a real skill, not just motivation."',
                '„Ich suchte einen Weg aus der Konzernwelt. Das hier hat mir einen echten Skill gegeben, nicht nur Motivation."'
              ),
              result: tx("4 months in: €4,200/month, remote from Portugal", "4 Monate dabei: 4.200 €/Monat, remote aus Portugal"),
            },
            {
              img: testimonialSarah,
              name: "Sarah, 44",
              role: tx("Former teacher", "Ehem. Lehrerin"),
              quote: tx(
                '"I thought closing was aggressive selling. It\'s the opposite — it\'s structured empathy."',
                '„Ich dachte, Closing wäre aggressives Verkaufen. Es ist das Gegenteil — strukturierte Empathie."'
              ),
              result: tx("Now working with 3 premium clients", "Arbeitet jetzt mit 3 Premium-Kunden"),
            },
            {
              img: testimonialLuzi,
              name: "Julia, 29",
              role: tx("Former retail manager", "Ehem. Einzelhandelsmanagerin"),
              quote: tx(
                '"The nervous system work changed everything. I\'m calm, clear, and confident on calls now."',
                '„Die Nervensystem-Arbeit hat alles verändert. Ich bin jetzt ruhig, klar und souverän in Gesprächen."'
              ),
              result: tx("Full-time closer after 6 weeks", "Vollzeit-Closerin nach 6 Wochen"),
            },
          ].map((t) => (
            <div key={t.name} className="flex flex-col">
              <img src={t.img} alt={t.name} className="w-full aspect-square object-cover rounded-lg mb-4" />
              <p className="font-serif text-base italic opacity-80 mb-4 flex-1">{t.quote}</p>
              <div>
                <p className="font-sans text-sm font-medium">{t.name}</p>
                <p className="font-sans text-xs text-muted-foreground">{t.role}</p>
                <p className="font-sans text-xs text-accent mt-1">{t.result}</p>
              </div>
            </div>
          ))}
        </div>
      </Slide>

      {/* SECTION 24 — OUR PRINCIPLES */}
      <Slide variant="white">
        <div className="text-center">
          <SlideH2>{tx("What Ethical Top Closer stands for.", "Wofür Ethical Top Closer steht.")}</SlideH2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-10">
            {[
              tx("Integrity", "Integrität"),
              tx("Transparency", "Transparenz"),
              tx("Listening", "Zuhören"),
              tx("Responsibility", "Verantwortung"),
              tx("Precision", "Präzision"),
              tx("Respect", "Respekt"),
              tx("Sustainable impact", "Nachhaltiger Impact"),
            ].map((item) => (
              <div key={item} className="p-5 rounded-lg border border-border/50 hover:border-accent transition-colors">
                <p className="font-serif text-lg font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>

      {/* LIFESTYLE BREAKER — Team Training */}
      <LifestyleBreaker src={teamTraining} alt="Ethical Top Closer Team Training Session" aspect="aspect-[16/9]" />

      {/* SECTION 25 — OUR PEOPLE */}
      <Slide variant="muted">
        <SlideH2>{tx("Our graduates do not all come from sales.", "Unsere Absolventen kommen nicht alle aus dem Vertrieb.")}</SlideH2>
        <div className="flex flex-wrap gap-3 mb-8">
          {[
            tx("Employment", "Anstellung"),
            tx("Health professions", "Gesundheitsberufe"),
            tx("Education", "Bildung"),
            "IT",
            tx("Retail", "Einzelhandel"),
            tx("Self-employment", "Selbstständigkeit"),
          ].map((item) => (
            <span key={item} className="px-4 py-2 rounded-full border border-border bg-card font-sans text-sm">{item}</span>
          ))}
        </div>
        <SlideP>
          {tx("What they share: They wanted more — and were willing to approach it professionally.",
            "Was sie teilen: Sie wollten mehr — und waren bereit, es professionell anzugehen.")}
        </SlideP>
        <img src={teamCommunity} alt="Community" className="rounded-lg object-cover aspect-video w-full mt-8" />
      </Slide>

      {/* SECTION 26 — CASE STUDY */}
      <Slide variant="white">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">Case Study</p>
        <SlideH2>{tx("From limited job model to real freedom.", "Vom begrenzten Jobmodell zu echter Freiheit.")}</SlideH2>
        <div className="grid sm:grid-cols-2 gap-8 mt-8">
          <div className="p-6 rounded-lg border border-border/50 bg-card">
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground mb-4">{tx("Before", "Vorher")}</p>
            <ul className="space-y-2 font-sans text-sm opacity-80">
              <li>{tx("Full-time job", "Vollzeitjob")}</li>
              <li>{tx("Limited income", "Begrenztes Einkommen")}</li>
              <li>{tx("Limited leverage", "Begrenzter Hebel")}</li>
            </ul>
          </div>
          <div className="p-6 rounded-lg border border-accent/30 bg-card">
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-accent mb-4">{tx("After", "Nachher")}</p>
            <ul className="space-y-2 font-sans text-sm opacity-80">
              <li>{tx("Fewer hours", "Weniger Stunden")}</li>
              <li>{tx("Stronger income", "Stärkeres Einkommen")}</li>
              <li>{tx("Remote and self-determined", "Remote und selbstbestimmt")}</li>
            </ul>
          </div>
        </div>
      </Slide>

      {/* SECTION 27 — IDENTIFICATION */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideH2>{tx("The point is not admiration. It is identification.", "Es geht nicht um Bewunderung. Es geht um Identifikation.")}</SlideH2>
          <p className="font-serif text-2xl md:text-3xl mt-10 opacity-80">{tx("Can I learn this?", "Kann ich das lernen?")}</p>
          <p className="font-serif text-3xl md:text-4xl font-semibold mt-4">
            {tx("Yes — if you are ready to do it properly.", "Ja — wenn du bereit bist, es richtig zu machen.")}
          </p>
        </div>
      </Slide>

      {/* SECTION 28 — THREE TYPES */}
      <Slide variant="white">
        <SlideH2>{tx("Three types benefit especially strongly.", "Drei Typen profitieren besonders stark.")}</SlideH2>
        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {[
            { title: tx("The career exit", "Der Karrierewechsel"), desc: tx("Ready for reinvention", "Bereit für Neuerfindung") },
            { title: tx("The new beginning", "Der Neuanfang"), desc: tx("Starting fresh with purpose", "Mit Sinn neu starten") },
            { title: tx("The ambitious self-employed", "Die ambitionierten Selbstständigen"), desc: tx("Adding a high-value skill", "Einen High-Value-Skill ergänzen") },
          ].map((type) => (
            <div key={type.title} className="p-6 rounded-lg border border-border/50 text-center">
              <p className="font-serif text-xl font-semibold mb-2">{type.title}</p>
              <p className="font-sans text-sm text-muted-foreground">{type.desc}</p>
            </div>
          ))}
        </div>
      </Slide>

      {/* SECTION 29 — NERVOUS SYSTEM (enhanced) */}
      <Slide variant="muted">
        <SlideH2>{tx("The difference between good and exceptional closers.", "Der Unterschied zwischen guten und außergewöhnlichen Closern.")}</SlideH2>
        <div className="grid sm:grid-cols-2 gap-6 mt-10">
          <div className="p-6 rounded-lg border border-destructive/20 bg-card">
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-destructive mb-4">
              {tx("When your nervous system is stressed", "Wenn dein Nervensystem gestresst ist")}
            </p>
            <ul className="space-y-3 font-sans text-sm opacity-80">
              <li>{tx("You talk faster than you think", "Du redest schneller als du denkst")}</li>
              <li>{tx("You no longer truly listen", "Du hörst nicht mehr richtig zu")}</li>
              <li>{tx("You appear insecure", "Du wirkst unsicher")}</li>
              <li>{tx("You lose presence", "Du verlierst Präsenz")}</li>
            </ul>
          </div>
          <div className="p-6 rounded-lg border border-accent/30 bg-card">
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-accent mb-4">
              {tx("When your nervous system is regulated", "Wenn dein Nervensystem reguliert ist")}
            </p>
            <ul className="space-y-3 font-sans text-sm opacity-80">
              <li>{tx("You lead calmly", "Du führst ruhig")}</li>
              <li>{tx("You truly listen", "Du hörst wirklich zu")}</li>
              <li>{tx("You tolerate silence", "Du hältst Stille aus")}</li>
              <li>{tx("You radiate trust", "Du strahlst Vertrauen aus")}</li>
            </ul>
          </div>
        </div>
        <SlideSupport>
          {tx("Most programs ignore this factor. We don't.", "Die meisten Programme ignorieren diesen Faktor. Wir nicht.")}
        </SlideSupport>
      </Slide>

      {/* SECTION 30 — DECISION */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideH2>{tx("They made a decision.", "Sie haben eine Entscheidung getroffen.")}</SlideH2>
          <div className="max-w-lg mx-auto mt-10 space-y-6">
            <p className="font-sans text-lg opacity-60 line-through">
              {tx('"I will see."', '„Ich schau mal."')}
            </p>
            <p className="font-serif text-2xl md:text-3xl font-semibold">
              {tx('"If I do this, I do it properly."', '„Wenn ich das mache, dann richtig."')}
            </p>
          </div>
        </div>
      </Slide>

      {/* SECTION 31 — THE SYSTEM */}
      <Slide variant="white">
        <div className="text-center">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
            {tx("The System", "Das System")}
          </p>
          <SlideH2>The Ethical High-Ticket<br />Closing System™</SlideH2>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {[
              tx("Sales Psychology", "Verkaufspsychologie"),
              tx("Conversation Leadership", "Gesprächsführung"),
              tx("Nervous System Regulation", "Nervensystem-Regulation"),
            ].map((pillar) => (
              <div key={pillar} className="p-6 rounded-lg border border-border/50">
                <p className="font-serif text-lg font-medium">{pillar}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>

      {/* SECTION 32 — SALES PSYCHOLOGY */}
      <Slide variant="light">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">{tx("Pillar 1", "Säule 1")}</p>
        <SlideH2>{tx("Understand how people decide.", "Verstehe, wie Menschen entscheiden.")}</SlideH2>
        <SlideBullets items={[
          tx("Build trust", "Vertrauen aufbauen"),
          tx("Recognize motives", "Motive erkennen"),
          tx("Understand uncertainty", "Unsicherheit verstehen"),
          tx("Create clarity", "Klarheit schaffen"),
        ]} />
      </Slide>

      {/* SECTION 33 — CONVERSATION LEADERSHIP */}
      <Slide variant="muted">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">{tx("Pillar 2", "Säule 2")}</p>
        <SlideH2>{tx("Excellent conversations have structure.", "Exzellente Gespräche haben Struktur.")}</SlideH2>
        <SlideBullets items={[
          tx("Conversation architecture", "Gesprächsarchitektur"),
          tx("Deep questions", "Tiefe Fragen"),
          tx("Precise listening", "Präzises Zuhören"),
          tx("Objection resolution", "Einwandauflösung"),
          tx("Clear closing", "Klarer Abschluss"),
        ]} />
      </Slide>

      {/* SECTION 34 — RADIANT PROTOCOL */}
      <Slide variant="dark">
        <SlideH2>{tx("A differentiator almost nobody integrates properly.", "Ein Differenzierungsmerkmal, das fast niemand richtig integriert.")}</SlideH2>
        <SlideP>{tx("The Radiant Nervous System Closing Alignment Protocol supports you:", "Das Radiant Nervous System Closing Alignment Protocol unterstützt dich:")}</SlideP>
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {[
            tx("Before the conversation", "Vor dem Gespräch"),
            tx("During the conversation", "Während des Gesprächs"),
            tx("After the conversation", "Nach dem Gespräch"),
          ].map((item) => (
            <div key={item} className="p-5 rounded-lg border border-primary-foreground/15 text-center">
              <p className="font-sans text-sm opacity-85">{item}</p>
            </div>
          ))}
        </div>
      </Slide>

      {/* SECTION 35 — THE TRAINING */}
      <Slide variant="white">
        <div className="text-center">
          <SlideH2>{tx("9 weeks. 8 modules. Complete training.", "9 Wochen. 8 Module. Komplettes Training.")}</SlideH2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-10 max-w-3xl mx-auto">
            {[
              "Foundations",
              "Conversation Framework",
              "Setting & Qualification",
              "Discovery & Closing",
              "Objection Mastery",
              "Deal Psychology",
              "Positioning & Job Acquisition",
              "Presence & Communication",
            ].map((mod, i) => (
              <div key={mod} className="p-4 rounded-lg border border-border/50 text-left">
                <p className="font-sans text-xs text-muted-foreground mb-1">Module {i + 1}</p>
                <p className="font-sans text-sm font-medium">{mod}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>

      {/* SECTION 36 — MASTERCLASS PIVOT */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideH2>{tx("You are already in the process.", "Du bist bereits im Prozess.")}</SlideH2>
          <SlideP>
            {tx(
              "What you just experienced is Level 1 of our system. The Masterclass.",
              "Was du gerade erlebt hast, ist Level 1 unseres Systems. Die Masterclass."
            )}
          </SlideP>
          <div className="flex flex-wrap gap-4 justify-center mt-8 mb-6">
            {[
              tx("90 minutes", "90 Minuten"),
              tx("Complete insight", "Vollständiger Einblick"),
              tx("Honest foundations", "Ehrliche Grundlagen"),
            ].map((item) => (
              <span key={item} className="px-4 py-2 rounded-full border border-primary-foreground/20 font-sans text-sm opacity-80">{item}</span>
            ))}
          </div>
          <p className="font-serif text-3xl md:text-4xl font-semibold mt-6 mb-4">27 €</p>
          <SlideP className="max-w-lg mx-auto">
            {tx(
              "Why not free? Because we distinguish real interest from spectators. And because commitment always starts with a decision.",
              "Warum nicht kostenlos? Weil wir echte Interessenten von Zuschauern unterscheiden. Und weil Commitment immer mit einer Entscheidung beginnt."
            )}
          </SlideP>
          <div className="mt-8 p-6 rounded-lg border border-accent/30 max-w-lg mx-auto">
            <p className="font-serif text-lg font-medium opacity-90">
              {tx(
                "If you are here today, you are already qualified to apply for the program.",
                "Wenn du heute hier bist, bist du bereits qualifiziert, dich für das Programm zu bewerben."
              )}
            </p>
          </div>
        </div>
      </Slide>

      {/* SECTION 37 — PRACTICE */}
      <Slide variant="light">
        <SlideH2>{tx("Knowledge without practice is worthless.", "Wissen ohne Praxis ist wertlos.")}</SlideH2>
        <SlideBullets items={[
          tx("Live coaching calls", "Live-Coaching-Calls"),
          tx("Conversation simulations", "Gesprächssimulationen"),
          tx("Deal reviews", "Deal-Reviews"),
          tx("Real scenarios", "Echte Szenarien"),
          tx("Active feedback culture", "Aktive Feedbackkultur"),
        ]} />
      </Slide>

      {/* SECTION 38 — NETWORK */}
      <Slide variant="muted">
        <SlideH2>{tx("We do not just train you. We help connect you to the market.", "Wir trainieren dich nicht nur. Wir verbinden dich mit dem Markt.")}</SlideH2>
        <SlideBullets items={[
          tx("500+ high-ticket partners", "500+ High-Ticket-Partner"),
          tx("Structured market access", "Strukturierter Marktzugang"),
          tx("Premium segments", "Premium-Segmente"),
          tx("Optional placement track", "Optionaler Placement-Track"),
        ]} />
        <img src={teamCollage} alt="Team network" className="rounded-lg mt-8 w-full object-cover max-h-56" />
      </Slide>

      {/* PLACEMENT SLIDE — THE MOMENT */}
      <Slide variant="white">
        <div className="text-center">
          <SlideH2>{tx("The moment that changes everything for many.", "Der Moment, der für viele alles verändert.")}</SlideH2>
          <SlideP className="max-w-2xl mx-auto">
            {tx(
              "After successfully completing the program, we introduce you to up to three qualified high-ticket providers from our partner network.",
              "Nach erfolgreichem Abschluss des Programms stellen wir dich bis zu drei qualifizierten High-Ticket Anbietern aus unserem Partnernetzwerk vor."
            )}
          </SlideP>
          <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mt-10 mb-4">
            {tx("That means:", "Das bedeutet:")}
          </p>
          <div className="max-w-md mx-auto space-y-3 text-left">
            {[
              tx("Real conversations with real decision-makers", "Reale Gespräche mit echten Entscheidern"),
              tx("No anonymous applications", "Keine anonymen Bewerbungen"),
              tx("No job boards", "Keine Jobbörsen"),
              tx("Direct introductions from our network", "Direkte Introductions aus unserem Netzwerk"),
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                <p className="font-sans text-base">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 max-w-xl mx-auto">
            <p className="font-serif text-lg md:text-xl italic opacity-80">
              {tx(
                "You don't just leave the program with a skill. You leave with real opportunities to use it.",
                "Du verlässt das Programm nicht nur mit einer Fähigkeit. Du verlässt es mit echten Chancen, sie einzusetzen."
              )}
            </p>
          </div>

          {/* Network visual */}
          <div className="mt-10 p-6 rounded-lg border border-accent/20 bg-muted/30">
            <p className="font-serif text-2xl md:text-3xl font-semibold mb-2">500+</p>
            <p className="font-sans text-sm text-muted-foreground">
              High-Ticket {tx("providers in the Radiant network", "Anbieter im Radiant Netzwerk")}
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["Coaching", "Education", "Health", "Finance", "Consulting"].map((s) => (
                <span key={s} className="px-3 py-1 rounded-full border border-border font-sans text-xs text-muted-foreground">{s}</span>
              ))}
            </div>
          </div>

          <p className="font-sans text-xs opacity-40 mt-6">
            {tx("Placement after successful completion and fulfilled quality criteria.", "Placement erfolgt nach erfolgreichem Abschluss und erfüllten Qualitätskriterien.")}
          </p>
        </div>
      </Slide>

      {/* LIFESTYLE BREAKER — FOUNDER */}
      <section className="min-h-[50vh] snap-start relative overflow-hidden">
        <img src={founderLandrover} alt="Founder working remotely" className="w-full h-[50vh] object-cover object-[50%_30%]" />
      </section>

      {/* SECTION 39 — WE ALSO SAY NO */}
      <Slide variant="dark">
        <SlideH2>{tx("We do not accept everyone.", "Wir nehmen nicht jeden auf.")}</SlideH2>
        <SlideP>{tx("Because the wrong person harms themselves, the group, and the standard.", "Weil die falsche Person sich selbst, der Gruppe und dem Standard schadet.")}</SlideP>
        <SlideBullets items={[
          tx("Personal conversation", "Persönliches Gespräch"),
          "Vibe Check",
          tx("Honest fit assessment", "Ehrliche Fit-Bewertung"),
        ]} />
      </Slide>

      {/* SECTION 40 — RED-FLAG LIST */}
      <Slide variant="white">
        <SlideH2>{tx("Something almost nobody offers.", "Etwas, das fast niemand bietet.")}</SlideH2>
        <SlideP>
          {tx("We show you not only where opportunities are. We also show you where to stay away.",
            "Wir zeigen dir nicht nur, wo Chancen liegen. Wir zeigen dir auch, wo du dich fernhalten solltest.")}
        </SlideP>
        <div className="flex flex-wrap gap-3 mt-6">
          {[
            tx("Unethical providers", "Unethische Anbieter"),
            "Overpromising",
            tx("Lack of transparency", "Mangelnde Transparenz"),
          ].map((item) => (
            <span key={item} className="px-4 py-2 rounded-full border border-destructive/30 text-destructive font-sans text-sm">{item}</span>
          ))}
        </div>
      </Slide>
    </>
  );
};

export default WebinarPart2;
