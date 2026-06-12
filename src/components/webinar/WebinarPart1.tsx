import { motion } from "framer-motion";
import Slide, { SlideH2, SlideP, SlideBullets, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import lakeLifestyle from "@/assets/lake-lifestyle.jpeg";
import summitClouds from "@/assets/summit-clouds.jpeg";
import groupMastermind from "@/assets/group-mastermind.jpg";
import groupDinner from "@/assets/group-dinner-rooftop.jpg";
import slideIdentificationBg from "@/assets/slide-identification-bg.jpg";
import SlideErfolgsStories from "./SlideErfolgsStories";
import SlideMarketOpportunity from "./SlideMarketOpportunity";

const WebinarPart1 = () => {
  const { tx } = useLanguage();

  return (
    <>
      {/* SLIDE 1 — HERO */}
      <section className="min-h-screen flex items-center justify-center snap-start bg-background relative overflow-hidden">
        <div className="container mx-auto max-w-4xl px-6 py-20 md:py-28 text-center">
          <p className="font-serif text-lg md:text-2xl opacity-60 mb-8">
            {tx("The quiet path.", "Der stille Weg.")}
          </p>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight text-foreground mb-8 max-w-3xl mx-auto">
            {tx(
              "How to build professional income with one learnable skill — location-independent, performance-based, without your own product.",
              "Wie du mit einer einzigen erlernbaren Fähigkeit professionelles Einkommen aufbaust — ortsunabhängig, leistungsbasiert, ohne eigenes Produkt."
            )}
          </h1>
          <div className="mx-auto mb-8 h-px w-24 bg-accent" />
          <h2 className="font-serif text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tight text-foreground leading-[0.9] mb-4">
            Ethical Top Closer™
          </h2>
          <p className="font-sans text-xs md:text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground mb-10">
            by Radiant — Manuel & Wolfgang
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#masterclass-video" className="rounded-sm bg-primary px-10 py-4 font-sans text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90">
              {tx("Watch masterclass", "Masterclass ansehen")}
            </a>
            <a href="/start/bewerbung" className="rounded-sm border border-border px-10 py-4 font-sans text-sm font-medium tracking-wide text-foreground transition-colors hover:bg-muted">
              {tx("Apply now", "Jetzt bewerben")}
            </a>
          </div>
        </div>
      </section>

      {/* LOOM VIDEO */}
      <section id="masterclass-video" className="min-h-screen flex items-center justify-center snap-start bg-card">
        <div className="container mx-auto max-w-5xl px-6 py-20">
          <p className="text-center font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-8">
            Masterclass
          </p>
          <div className="aspect-video rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <p className="text-sm text-muted-foreground">Loom video embed placeholder</p>
            </div>
          </div>
        </div>
      </section>

      {/* SLIDE 2 — THIS MASTERCLASS IS FOR YOU */}
      <Slide variant="light">
        <SlideH2>{tx("This masterclass is for you if you know one of these thoughts:", "Diese Masterclass ist für dich, wenn du einen dieser Sätze kennst:")}</SlideH2>
        <div className="space-y-6 mt-8 max-w-2xl">
          {[
            tx(
              '"I know I can do more — but the model I work in won\'t allow it."',
              '„Ich weiß, dass ich mehr kann — aber das Modell, in dem ich arbeite, lässt das nicht zu."'
            ),
            tx(
              '"I don\'t want to build a rocket. I just want to design my everyday life."',
              '„Ich will keine Rakete bauen. Ich will einfach meinen Alltag selbst gestalten."'
            ),
            tx(
              '"I\'ve been looking at this topic for months and still don\'t know if it\'s really for me."',
              '„Ich schaue seit Monaten auf dieses Thema und weiß immer noch nicht, ob es wirklich für mich ist."'
            ),
          ].map((q, i) => (
            <p key={i} className="font-serif text-lg md:text-xl leading-relaxed italic opacity-80">{q}</p>
          ))}
        </div>
        <SlideSupport>
          {tx("If you know one of these thoughts — you are in the right place.", "Wenn du einen dieser Gedanken kennst — bist du hier richtig.")}
        </SlideSupport>
      </Slide>

      {/* SLIDE 3 — WHAT YOU GET / WHAT YOU DON'T */}
      <Slide variant="dark">
        <SlideH2>{tx("What you get today", "Was du heute bekommst")}</SlideH2>
        <div className="grid sm:grid-cols-2 gap-8 mt-8">
          <div>
            <div className="space-y-3">
              {[
                tx("Complete insight", "Vollständigen Einblick"),
                tx("Real numbers", "Reale Zahlen"),
                tx("A clear next step", "Einen klaren nächsten Schritt"),
                tx("Respect for your time", "Respekt für deine Zeit"),
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="text-accent font-medium">✓</span>
                  <p className="font-sans text-base opacity-85">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.15em] opacity-50 mb-4">
              {tx("What you won't get", "Was du nicht bekommst")}
            </p>
            <div className="space-y-3">
              {[
                tx("Get-rich-quick promises", "Schnell-reich-Versprechen"),
                tx("Artificial scarcity", "Künstliche Knappheit"),
                tx("Motivation show", "Motivationsshow"),
                tx("Sales pressure", "Verkaufsdruck"),
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="opacity-40">×</span>
                  <p className="font-sans text-base opacity-50 line-through">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Slide>

      {/* SLIDE 4 — AGENDA */}
      <Slide variant="white">
        <SlideH2>{tx("The next 75 minutes", "Die nächsten 75 Minuten")}</SlideH2>
        <div className="mt-8 max-w-xl space-y-4">
          {[
            tx("The model and its limit", "Das Modell und seine Grenze"),
            tx("What High-Ticket Closing really is", "Was High-Ticket Closing wirklich ist"),
            tx("Why ethical closers win the market", "Warum ethische Closer den Markt gewinnen"),
            tx("The complete system", "Das vollständige System"),
            tx("Real people and real numbers", "Echte Menschen und echte Zahlen"),
            tx("The offer", "Das Angebot"),
            tx("Your next step", "Dein nächster Schritt"),
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center font-sans text-xs font-medium shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="font-sans text-base">{item}</p>
            </div>
          ))}
        </div>
      </Slide>

      {/* SLIDE 5 — THREE QUESTIONS */}
      <Slide variant="dark">
        <SlideH2>{tx("Three questions.", "Drei Fragen.")}</SlideH2>
        <div className="space-y-10 mt-8">
          {[
            tx(
              "What would be possible if your income were no longer tied to presence?",
              "Was wäre möglich, wenn dein Einkommen nicht mehr an Anwesenheit gebunden wäre?"
            ),
            tx(
              "What would be possible if you could choose your clients worldwide?",
              "Was wäre möglich, wenn du dir deine Auftraggeber weltweit selbst aussuchen könntest?"
            ),
            tx(
              "What would be possible if one skill made all of this possible?",
              "Was wäre möglich, wenn eine einzige Fähigkeit das möglich macht?"
            ),
          ].map((q, i) => (
            <p key={i} className="font-serif text-xl md:text-2xl leading-relaxed opacity-90">{q}</p>
          ))}
        </div>
      </Slide>

      {/* SLIDE 6 — TIME = INCOME LIMIT */}
      <Slide variant="light">
        <SlideH2>{tx("Time = Income limit", "Zeit = Einkommensgrenze")}</SlideH2>
        <div className="space-y-4 mt-8">
          <p className="font-sans text-base opacity-70">
            {tx("More time → more income", "Mehr Zeit → mehr Einkommen")}
          </p>
          <p className="font-sans text-base opacity-70">
            {tx("Less time → less income", "Weniger Zeit → weniger Einkommen")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 mt-8">
          {[
            tx("Illness", "Krankheit"),
            tx("Vacation", "Urlaub"),
            tx("Life changes", "Lebensveränderung"),
          ].map((item) => (
            <span key={item} className="px-4 py-2 rounded-full border border-destructive/30 text-destructive font-sans text-sm">{item}</span>
          ))}
        </div>
        <SlideP className="mt-8">
          {tx("Every pause becomes an income gap. That is not a personal weakness. That is the structure of the model.",
            "Jede Pause wird zur Einkommenslücke. Das ist keine persönliche Schwäche. Das ist die Struktur des Modells.")}
        </SlideP>
      </Slide>

      {/* SLIDE 7 — IDENTIFICATION */}
      <section className="min-h-screen flex items-center justify-center snap-start relative overflow-hidden">
        <img src={slideIdentificationBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-background/80" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="container mx-auto max-w-4xl px-6 py-20 md:py-28 relative z-10"
        >
          <SlideH2>{tx("The real problem is rarely the job.", "Das eigentliche Problem ist selten der Job.")}</SlideH2>
          <SlideP>
            {tx(
              "Many people feel a moment like this at some point:",
              "Viele Menschen spüren irgendwann einen Moment wie diesen:"
            )}
          </SlideP>
          <div className="space-y-4 mt-6 mb-8">
            <p className="font-sans text-base opacity-70">
              {tx("You work hard. You truly give your best.", "Du arbeitest hart. Du gibst wirklich dein Bestes.")}
            </p>
            <p className="font-serif text-lg md:text-xl italic opacity-80">
              {tx(
                "And yet you slowly realize: This model is not giving me back what I actually hoped for from life.",
                "Und trotzdem merkst du langsam: Dieses Modell gibt mir nicht zurück, was ich mir eigentlich vom Leben erhofft habe."
              )}
            </p>
          </div>
          <div className="space-y-4 mt-8 mb-8">
            <p className="font-sans text-sm opacity-60">
              {tx("That shows in small moments:", "Das zeigt sich in kleinen Momenten:")}
            </p>
            {[
              tx(
                "You think about booking a vacation — not just financially, but time-wise.",
                "Du überlegst beim Urlaub buchen nicht nur finanziell — sondern zeitlich."
              ),
              tx(
                'You see someone working remotely and think: How does he do that?',
                'Du siehst jemanden, der remote arbeitet, und denkst: Wie macht der das eigentlich?'
              ),
              tx(
                "You get a raise — and realize: it changes nothing fundamental.",
                "Du bekommst eine Gehaltserhöhung — und merkst: Es verändert nichts Grundsätzliches."
              ),
            ].map((item, i) => (
              <p key={i} className="font-sans text-base opacity-70 pl-4 border-l-2 border-accent/30">{item}</p>
            ))}
          </div>
          <p className="font-serif text-lg md:text-xl italic opacity-70 mt-8">
            {tx(
              '"If I keep going like this — where will I be in 10 years?"',
              '„Wenn ich so weitermache — wo stehe ich in 10 Jahren?"'
            )}
          </p>
          <SlideSupport>
            {tx(
              "That is not a sign of ingratitude. It is a sign of awareness.",
              "Das ist kein Zeichen von Undankbarkeit. Es ist ein Zeichen von Bewusstsein."
            )}
          </SlideSupport>
        </motion.div>
      </section>

      {/* SLIDE 8 — HAMSTER WHEEL */}
      <Slide variant="white">
        <SlideH2>{tx("Many then try:", "Viele versuchen dann:")}</SlideH2>
        <div className="flex flex-wrap gap-3 justify-center my-10">
          {["Online Business", "Social Media", tx("Own product", "Eigenes Produkt"), "Funnels", "Ads"].map((item) => (
            <span key={item} className="px-5 py-2.5 rounded-full border border-border bg-muted font-sans text-sm">{item}</span>
          ))}
        </div>
        <SlideP className="text-center">
          {tx("For some, that works. For many, it becomes just another hamster wheel.",
            "Für manche funktioniert das. Für viele wird es nur ein neues Hamsterrad.")}
        </SlideP>
      </Slide>

      {/* SLIDE 9 — THE THIRD PATH */}
      <Slide variant="dark">
        <div className="text-center">
          <SlideP>{tx("Between being employed and becoming an entrepreneur, there is:", "Zwischen Angestellt sein und Unternehmer werden liegt:")}</SlideP>
          <SlideH2 className="mt-4">{tx("Skill-based income.", "Fähigkeitsbasiertes Einkommen.")}</SlideH2>
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            {[
              tx("One skill", "Eine Fähigkeit"),
              tx("Directly usable", "Direkt einsetzbar"),
              "Remote",
              tx("Performance-based", "Leistungsbasiert"),
            ].map((item) => (
              <span key={item} className="px-5 py-2.5 rounded-full border border-primary-foreground/20 font-sans text-sm opacity-80">{item}</span>
            ))}
          </div>
        </div>
      </Slide>

      {/* SLIDE 10 — HIGH-TICKET CLOSING */}
      <Slide variant="light">
        <div className="text-center">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
            {tx("This skill is called:", "Diese Fähigkeit heißt:")}
          </p>
          <h2 className="font-serif text-5xl md:text-7xl font-semibold mb-8">High-Ticket Closing.</h2>
          <SlideP>
            {tx("A professional conversational skill. You guide people through important decisions. Without pressure. Without manipulation. With clarity.",
              "Eine professionelle Gesprächsfähigkeit. Du begleitest Menschen bei wichtigen Entscheidungen. Ohne Druck. Ohne Manipulation. Mit Klarheit.")}
          </SlideP>
        </div>
      </Slide>

      {/* SLIDE 11 — WHAT YOU DO */}
      <Slide variant="white">
        <SlideH2>{tx("You work with people who already showed interest.", "Du arbeitest mit Menschen, die bereits Interesse gezeigt haben.")}</SlideH2>
        <SlideP>{tx("No cold calling. No persuasion.", "Keine Kaltakquise. Keine Überredung.")}</SlideP>
        <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mt-8 mb-4">
          {tx("Your task:", "Deine Aufgabe:")}
        </p>
        <SlideBullets items={[
          tx("Understand", "Verstehen"),
          tx("Qualify", "Qualifizieren"),
          tx("Lead", "Führen"),
          tx("Close clearly", "Klar abschließen"),
        ]} />
      </Slide>

      {/* SLIDE 12 — WHY VALUABLE */}
      <Slide variant="muted">
        <SlideH2>{tx("Why this skill is so valuable", "Warum diese Fähigkeit so wertvoll ist")}</SlideH2>
        <SlideP>{tx("Premium offers are not sold by buttons. They are decided in conversations.", "Premiumangebote werden nicht über Buttons verkauft. Sie werden in Gesprächen entschieden.")}</SlideP>
        <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mt-8 mb-4">
          {tx("Industries", "Branchen")}
        </p>
        <div className="flex flex-wrap gap-3">
          {["Coaching", tx("Health", "Gesundheit"), tx("Finance", "Finanzen"), tx("Education", "Bildung"), tx("Consulting", "Beratung"), "Premium Services"].map((item) => (
            <span key={item} className="px-4 py-2 rounded-full bg-card border border-border font-sans text-sm">{item}</span>
          ))}
        </div>
      </Slide>

      {/* NEW — MARKET OPPORTUNITY */}
      <SlideMarketOpportunity />

      {/* NEW — ERFOLGS-STORIES (THOMAS) */}
      <SlideErfolgsStories />

      {/* SLIDE 13 — INCOME LOGIC */}
      <Slide variant="white">
        <div className="text-center">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">
            {tx("Income logic", "Die Einkommenslogik")}
          </p>
          <SlideH2>{tx("Example", "Beispiel")}</SlideH2>
          <div className="max-w-md mx-auto mt-8 space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="font-sans text-sm text-muted-foreground">{tx("Program price", "Programmpreis")}</span>
              <span className="font-sans text-base font-medium">5.000 €</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="font-sans text-sm text-muted-foreground">{tx("Commission", "Provision")}</span>
              <span className="font-sans text-base font-medium">10 %</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="font-sans text-sm text-muted-foreground">{tx("Per close", "Pro Abschluss")}</span>
              <span className="font-serif text-xl font-semibold">500 €</span>
            </div>
            <div className="pt-4">
              <div className="flex justify-between items-center">
                <span className="font-sans text-sm">10 {tx("closes", "Abschlüsse")}</span>
                <span className="font-serif text-2xl font-semibold">5.000 €</span>
              </div>
            </div>
          </div>
          <SlideSupport>{tx("No guarantee. Only market logic.", "Keine Garantie. Nur Marktlogik.")}</SlideSupport>
        </div>
      </Slide>

      {/* SLIDE 14 — SETUP */}
      <Slide variant="muted">
        <SlideH2>{tx("Your setup", "Dein Setup")}</SlideH2>
        <div className="grid sm:grid-cols-2 gap-8 mt-8">
          <div>
            <SlideBullets items={["Laptop", "Headset", tx("Zoom or phone", "Zoom oder Telefon"), tx("Your voice", "Deine Stimme"), tx("Your skill", "Deine Fähigkeit")]} />
          </div>
          <div>
            <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-4">{tx("Not needed", "Nicht nötig")}</p>
            <div className="flex flex-wrap gap-2">
              {[tx("Office", "Büro"), "Team", tx("Product", "Produkt"), tx("Reach", "Reichweite")].map((item) => (
                <span key={item} className="px-3 py-1.5 rounded-full border border-border bg-card font-sans text-xs opacity-60 line-through">{item}</span>
              ))}
            </div>
          </div>
        </div>
      </Slide>

      {/* SLIDE 15 — WHY PEOPLE CHOOSE THIS */}
      <Slide variant="light">
        <SlideH2>{tx("Why many choose this path", "Warum viele diesen Weg wählen")}</SlideH2>
        <SlideBullets items={[
          tx("Work remotely", "Remote arbeiten"),
          tx("Work with premium partners", "Mit Premium-Partnern arbeiten"),
          tx("Work from beautiful places", "Von schönen Orten arbeiten"),
          tx("Earn based on skill", "Nach Fähigkeit verdienen"),
          tx("Reinvent yourself professionally", "Sich beruflich neu erfinden"),
        ]} />
        <div className="grid grid-cols-2 gap-3 mt-8">
          <img src={lakeLifestyle} alt="Lake lifestyle" className="rounded-lg object-cover aspect-video" />
          <img src={summitClouds} alt="Summit view" className="rounded-lg object-cover aspect-video" />
        </div>
      </Slide>

      {/* SLIDE 16 — STORY: ANNA */}
      <Slide variant="dark">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] opacity-50 mb-6">
          {tx("A story", "Eine Geschichte")}
        </p>
        <SlideH2>Anna, 34.</SlideH2>
        <SlideP>
          {tx("Marketing manager. Good salary. But one question:", "Marketingmanagerin. Gutes Gehalt. Aber eine Frage:")}
        </SlideP>
        <p className="font-serif text-2xl md:text-3xl italic opacity-80 my-8">
          {tx('"Is this all there is?"', '„Soll das alles gewesen sein?"')}
        </p>
        <SlideP>
          {tx(
            "Today she works remotely with two premium providers. Not because she became a salesperson. But because she learned to guide people clearly through decisions.",
            "Heute arbeitet sie remote mit zwei Premium-Anbietern. Nicht weil sie Verkäuferin wurde. Sondern weil sie gelernt hat, Menschen klar durch Entscheidungen zu führen."
          )}
        </SlideP>
      </Slide>

      {/* SLIDE 17 — WHO WE ARE */}
      <Slide variant="white">
        <div className="text-center">
          <p className="font-serif text-3xl md:text-4xl font-semibold tracking-tight opacity-60 mb-4">ETHICAL TOP CLOSER™</p>
          <p className="font-sans text-xs uppercase tracking-[0.2em] opacity-40 mb-10">by Radiant</p>
          <SlideH2>{tx("Founded by Manuel & Wolfgang", "Gegründet von Manuel & Wolfgang")}</SlideH2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {[
              tx("30+ years sales experience", "30+ Jahre Vertriebserfahrung"),
              tx("Corporate + online sales", "Corporate + Online Sales"),
              tx("580+ graduates", "580+ Absolventen"),
              tx("Built for quality, not mass", "Aufgebaut für Qualität. Nicht für Masse."),
            ].map((item) => (
              <div key={item} className="p-4 rounded-lg border border-border/50">
                <p className="font-sans text-sm">{item}</p>
              </div>
            ))}
          </div>
          <img src={groupMastermind} alt="Premium group workshop" className="rounded-lg mt-10 w-full object-cover max-h-56" />
        </div>
      </Slide>

      {/* SLIDE 18 — WHY WE BUILT THIS */}
      <Slide variant="muted">
        <SlideH2>{tx("Why we built this program", "Warum wir dieses Programm gebaut haben")}</SlideH2>
        <SlideP>
          {tx("The market had two extremes: aggressive sales methods — or pure theory. We wanted something different: a complete system for professional closing careers.",
            "Der Markt hatte zwei Extreme: aggressive Sales-Methoden — oder reine Theorie. Wir wollten etwas anderes: ein vollständiges System für professionelle Closing-Karrieren.")}
        </SlideP>
        <img src={groupDinner} alt="Community dinner" className="rounded-lg mt-8 w-full object-cover max-h-56" />
      </Slide>
    </>
  );
};

export default WebinarPart1;
