import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Zap, Target, Users, Shield, Heart, DollarSign, Clock, Brain } from 'lucide-react';

interface Question {
  id: number;
  category: string;
  question: string;
  context: string;
}

const CATEGORIES = [
  { key: 'all', label: 'Alle', icon: Zap },
  { key: 'discovery', label: 'Discovery', icon: Search },
  { key: 'pain', label: 'Pain Points', icon: Target },
  { key: 'authority', label: 'Entscheider', icon: Users },
  { key: 'objection', label: 'Einwände', icon: Shield },
  { key: 'commitment', label: 'Commitment', icon: Heart },
  { key: 'value', label: 'Wert & ROI', icon: DollarSign },
  { key: 'urgency', label: 'Dringlichkeit', icon: Clock },
  { key: 'mindset', label: 'Mindset', icon: Brain },
];

const QUESTIONS: Question[] = [
  // Discovery (1-15)
  { id: 1, category: 'discovery', question: 'Was hat dich dazu gebracht, heute mit mir zu sprechen?', context: 'Öffner – zeigt den emotionalen Trigger' },
  { id: 2, category: 'discovery', question: 'Was würde sich in deinem Leben ändern, wenn dieses Problem gelöst wäre?', context: 'Zukunftsvision aktivieren' },
  { id: 3, category: 'discovery', question: 'Wie lange beschäftigt dich dieses Thema schon?', context: 'Zeigt Leidensdruck und Dringlichkeit' },
  { id: 4, category: 'discovery', question: 'Was hast du bisher versucht, um das Problem zu lösen?', context: 'Vorherige Lösungsversuche verstehen' },
  { id: 5, category: 'discovery', question: 'Warum hat das, was du bisher probiert hast, nicht funktioniert?', context: 'Differenzierung vorbereiten' },
  { id: 6, category: 'discovery', question: 'Wenn du dir das ideale Ergebnis vorstellst – wie sieht das konkret aus?', context: 'Klare Zielsetzung definieren' },
  { id: 7, category: 'discovery', question: 'Auf einer Skala von 1-10, wie wichtig ist dir dieses Thema gerade?', context: 'Priorität quantifizieren' },
  { id: 8, category: 'discovery', question: 'Was passiert, wenn du in 6 Monaten noch an derselben Stelle stehst?', context: 'Kosten des Nicht-Handelns' },
  { id: 9, category: 'discovery', question: 'Wer in deinem Umfeld ist noch von diesem Problem betroffen?', context: 'Breitere Auswirkungen zeigen' },
  { id: 10, category: 'discovery', question: 'Was bedeutet [Ziel] für dich persönlich?', context: 'Emotionale Tiefe erreichen' },
  { id: 11, category: 'discovery', question: 'Was hat dich davon abgehalten, das Problem früher anzugehen?', context: 'Blockaden identifizieren' },
  { id: 12, category: 'discovery', question: 'Wie wirkt sich das Problem auf deinen Alltag aus?', context: 'Konkreten Impact verstehen' },
  { id: 13, category: 'discovery', question: 'Was wäre der erste Schritt, den du gehen müsstest?', context: 'Handlungsbereitschaft testen' },
  { id: 14, category: 'discovery', question: 'Wenn Geld keine Rolle spielen würde – was würdest du tun?', context: 'Wahre Prioritäten aufdecken' },
  { id: 15, category: 'discovery', question: 'Was hat sich seit dem letzten Jahr verändert, dass du jetzt bereit bist?', context: 'Timing-Motivation verstehen' },

  // Pain Points (16-30)
  { id: 16, category: 'pain', question: 'Was ist die größte Frustration in deiner aktuellen Situation?', context: 'Kernproblem identifizieren' },
  { id: 17, category: 'pain', question: 'Wie viel kostet dich dieses Problem pro Monat – in Euro oder verlorener Zeit?', context: 'Schmerz quantifizieren' },
  { id: 18, category: 'pain', question: 'Wann war der Moment, in dem du gesagt hast: So geht es nicht weiter?', context: 'Emotionalen Wendepunkt finden' },
  { id: 19, category: 'pain', question: 'Wie beeinflusst das Problem deine Beziehungen / Familie / Gesundheit?', context: 'Ganzheitlichen Impact zeigen' },
  { id: 20, category: 'pain', question: 'Was ist das Schlimmste, das passieren könnte, wenn du nichts änderst?', context: 'Worst-Case visualisieren' },
  { id: 21, category: 'pain', question: 'Welche Chancen hast du bereits verpasst wegen dieses Problems?', context: 'Opportunity Cost aufzeigen' },
  { id: 22, category: 'pain', question: 'Wie fühlt es sich an, wenn du morgens aufwachst und weißt, dass sich nichts geändert hat?', context: 'Emotionalen Schmerz aktivieren' },
  { id: 23, category: 'pain', question: 'Was würdest du deinem besten Freund raten, wenn er in deiner Situation wäre?', context: 'Perspektivwechsel erzeugen' },
  { id: 24, category: 'pain', question: 'Wenn ich dir einen Zauberstab geben könnte – was würdest du sofort ändern?', context: 'Priorität ohne Limitierungen' },
  { id: 25, category: 'pain', question: 'Was hält dich nachts wach?', context: 'Tiefste Sorge ansprechen' },
  { id: 26, category: 'pain', question: 'Wie wirkt sich das auf dein Selbstvertrauen aus?', context: 'Innere Auswirkungen' },
  { id: 27, category: 'pain', question: 'Was würdest du mit der gewonnenen Zeit / Energie machen?', context: 'Positive Motivation' },
  { id: 28, category: 'pain', question: 'Hast du das Gefühl, dass du dein volles Potenzial ausschöpfst?', context: 'Gap zwischen Ist und Soll' },
  { id: 29, category: 'pain', question: 'Was sagen andere Menschen in deinem Umfeld zu deiner Situation?', context: 'Soziale Perspektive' },
  { id: 30, category: 'pain', question: 'Welchen Preis zahlst du emotional dafür, dass du wartest?', context: 'Emotionale Kosten benennen' },

  // Entscheider / Authority (31-42)
  { id: 31, category: 'authority', question: 'Wer außer dir ist an dieser Entscheidung beteiligt?', context: 'Entscheider-Struktur klären' },
  { id: 32, category: 'authority', question: 'Wie triffst du normalerweise solche Entscheidungen?', context: 'Entscheidungsprozess verstehen' },
  { id: 33, category: 'authority', question: 'Gibt es jemanden, mit dem du das besprechen möchtest?', context: 'Proaktiv Einwand vorwegnehmen' },
  { id: 34, category: 'authority', question: 'Was bräuchte dein Partner / deine Partnerin, um sich dabei wohlzufühlen?', context: 'Partner-Einwand lösen' },
  { id: 35, category: 'authority', question: 'Wie würde dein Chef / dein Team reagieren, wenn du das Problem löst?', context: 'Unterstützung visualisieren' },
  { id: 36, category: 'authority', question: 'Wer profitiert noch von deiner Entscheidung?', context: 'Weitere Stakeholder einbeziehen' },
  { id: 37, category: 'authority', question: 'Hast du in der Vergangenheit Entscheidungen allein getroffen?', context: 'Autonomie bestätigen' },
  { id: 38, category: 'authority', question: 'Was wäre, wenn du heute die Entscheidung für dich allein triffst?', context: 'Eigenverantwortung stärken' },
  { id: 39, category: 'authority', question: 'Wie schnell kannst du normalerweise Entscheidungen treffen?', context: 'Timeline klären' },
  { id: 40, category: 'authority', question: 'Was braucht es, damit du dich sicher fühlst?', context: 'Sicherheitsbedürfnis adressieren' },
  { id: 41, category: 'authority', question: 'Wessen Meinung ist dir bei solchen Entscheidungen am wichtigsten?', context: 'Einfluss-Hierarchie' },
  { id: 42, category: 'authority', question: 'Wenn alle Beteiligten ja sagen würden – würdest du starten?', context: 'Isolierte Kaufbereitschaft testen' },

  // Einwände / Objections (43-58)
  { id: 43, category: 'objection', question: 'Was genau meinst du, wenn du sagst, du musst noch darüber nachdenken?', context: 'Einwand konkretisieren' },
  { id: 44, category: 'objection', question: 'Was müsste passieren, damit du heute ja sagst?', context: 'Bedingungen klären' },
  { id: 45, category: 'objection', question: 'Ist es eine Frage des Geldes oder eine Frage der Priorität?', context: 'Wahren Einwand finden' },
  { id: 46, category: 'objection', question: 'Was wäre, wenn ich dir zeigen könnte, dass sich die Investition in X Monaten amortisiert?', context: 'ROI-Brücke bauen' },
  { id: 47, category: 'objection', question: 'Hast du schon einmal eine Entscheidung aufgeschoben und es später bereut?', context: 'Prokrastinations-Pattern aufzeigen' },
  { id: 48, category: 'objection', question: 'Was ist das Risiko, wenn du es versuchst – vs. das Risiko, wenn du es nicht tust?', context: 'Risiko-Vergleich' },
  { id: 49, category: 'objection', question: 'Wenn der Preis kein Thema wäre – würdest du dann starten?', context: 'Preis vs. Wert isolieren' },
  { id: 50, category: 'objection', question: 'Was genau macht dir Sorgen?', context: 'Verborgene Ängste aufdecken' },
  { id: 51, category: 'objection', question: 'Verstehe ich richtig, dass du [Zusammenfassung] möchtest – aber [Einwand] dich zurückhält?', context: 'Spiegeln und Isolieren' },
  { id: 52, category: 'objection', question: 'Was brauchst du, um dich bei der Entscheidung wohl zu fühlen?', context: 'Komfort-Level erhöhen' },
  { id: 53, category: 'objection', question: 'Hast du Bedenken, die wir noch nicht besprochen haben?', context: 'Versteckte Einwände aufdecken' },
  { id: 54, category: 'objection', question: 'Mal angenommen, alles läuft perfekt – wie sieht dein Leben dann aus?', context: 'Zurück zur Vision' },
  { id: 55, category: 'objection', question: 'Was würde dich davon überzeugen, dass das funktioniert?', context: 'Proof-Kriterien klären' },
  { id: 56, category: 'objection', question: 'Ist Timing wirklich das Problem – oder gibt es etwas anderes?', context: 'Timing-Einwand hinterfragen' },
  { id: 57, category: 'objection', question: 'Was wäre die Konsequenz, wenn du noch 3 Monate wartest?', context: 'Kosten des Wartens' },
  { id: 58, category: 'objection', question: 'Gibt es eine Garantie, die dir helfen würde?', context: 'Risiko-Umkehr anbieten' },

  // Commitment (59-72)
  { id: 59, category: 'commitment', question: 'Bist du bereit, dich voll auf den Prozess einzulassen?', context: 'Commitment-Level testen' },
  { id: 60, category: 'commitment', question: 'Wenn wir das zusammen angehen – bist du All-In?', context: 'Verbindlichkeit einfordern' },
  { id: 61, category: 'commitment', question: 'Was brauchst du von mir, damit das für dich funktioniert?', context: 'Erwartungen klären' },
  { id: 62, category: 'commitment', question: 'Siehst du das als Investment in dich selbst?', context: 'Mindset-Frame setzen' },
  { id: 63, category: 'commitment', question: 'Auf einer Skala von 1-10, wie bereit bist du, jetzt zu starten?', context: 'Kaufbereitschaft messen' },
  { id: 64, category: 'commitment', question: 'Was fehlt dir, um von [Zahl] auf eine 10 zu kommen?', context: 'Gap schließen' },
  { id: 65, category: 'commitment', question: 'Wenn du in einem Jahr zurückblickst – was willst du sagen können?', context: 'Zukunfts-Self ansprechen' },
  { id: 66, category: 'commitment', question: 'Wann ist der richtige Zeitpunkt, wenn nicht jetzt?', context: 'Dringlichkeit erzeugen' },
  { id: 67, category: 'commitment', question: 'Was wäre dein erster Schritt nach der Anmeldung?', context: 'Mentale Onboarding starten' },
  { id: 68, category: 'commitment', question: 'Möchtest du mit [Option A] oder [Option B] starten?', context: 'Alternativ-Close' },
  { id: 69, category: 'commitment', question: 'Soll ich dir den Platz sichern?', context: 'Direkter Assumptive Close' },
  { id: 70, category: 'commitment', question: 'Wie fühlt es sich an, wenn du dir vorstellst, morgen den ersten Schritt zu machen?', context: 'Emotionale Bestätigung' },
  { id: 71, category: 'commitment', question: 'Was hindert dich gerade daran, ja zu dir selbst zu sagen?', context: 'Innere Blockade lösen' },
  { id: 72, category: 'commitment', question: 'Lass uns gemeinsam den ersten Schritt gehen – bist du dabei?', context: 'Partnerschaftlicher Close' },

  // Wert & ROI (73-85)
  { id: 73, category: 'value', question: 'Was ist dir diese Veränderung wert?', context: 'Subjektiven Wert bestimmen' },
  { id: 74, category: 'value', question: 'Was kostet dich das Problem pro Jahr – in Geld, Zeit und Energie?', context: 'Gesamtkosten berechnen' },
  { id: 75, category: 'value', question: 'Wenn du in 3 Monaten [Ergebnis] erreichst – wie viel ist das wert?', context: 'Ergebnis monetarisieren' },
  { id: 76, category: 'value', question: 'Wie viel hast du bisher für Lösungen ausgegeben, die nicht funktioniert haben?', context: 'Sunk Costs bewusst machen' },
  { id: 77, category: 'value', question: 'Was würdest du mit dem zusätzlichen Einkommen von [X] € machen?', context: 'Ergebnis greifbar machen' },
  { id: 78, category: 'value', question: 'Ist es teurer, zu investieren – oder weiter das Problem zu haben?', context: 'Kosten-Vergleich umdrehen' },
  { id: 79, category: 'value', question: 'Wenn du den Preis auf die Monate aufteilst – sind das [X] € pro Tag. Ist dir die Veränderung das wert?', context: 'Preis herunterbrechen' },
  { id: 80, category: 'value', question: 'Was ist dir ein Jahr deines Lebens wert?', context: 'Zeitwert-Perspektive' },
  { id: 81, category: 'value', question: 'Wie viel mehr könntest du verdienen, wenn dieses Problem gelöst ist?', context: 'Einkommens-Uplift' },
  { id: 82, category: 'value', question: 'Was wäre dir ein garantiertes Ergebnis wert?', context: 'Wertanker setzen' },
  { id: 83, category: 'value', question: 'Siehst du das als Kosten oder als Investment?', context: 'Frame-Shift' },
  { id: 84, category: 'value', question: 'Was kostet dich Inaktivität pro Woche?', context: 'Wöchentlichen Verlust zeigen' },
  { id: 85, category: 'value', question: 'Welchen ROI erwartest du – und in welchem Zeitraum?', context: 'Erwartung managen' },

  // Dringlichkeit (86-95)
  { id: 86, category: 'urgency', question: 'Warum ist jetzt der richtige Zeitpunkt?', context: 'Eigene Dringlichkeit bestätigen lassen' },
  { id: 87, category: 'urgency', question: 'Was hat sich verändert, dass du jetzt handelst statt wie vorher zu warten?', context: 'Change-Moment verstärken' },
  { id: 88, category: 'urgency', question: 'Wenn nicht jetzt – wann dann?', context: 'Prokrastination challengen' },
  { id: 89, category: 'urgency', question: 'Wie viele Monate kannst du dir leisten, noch zu warten?', context: 'Zeitdruck quantifizieren' },
  { id: 90, category: 'urgency', question: 'Was verpasst du jeden Tag, an dem du nicht startest?', context: 'Tägliche Opportunitätskosten' },
  { id: 91, category: 'urgency', question: 'Stell dir vor, du hättest vor 6 Monaten angefangen – wo wärst du heute?', context: 'Rückblick-Perspektive' },
  { id: 92, category: 'urgency', question: 'Gibt es ein konkretes Datum, bis zu dem du Ergebnisse brauchst?', context: 'Deadline identifizieren' },
  { id: 93, category: 'urgency', question: 'Was passiert in deiner Branche / deinem Markt gerade, das Handeln erfordert?', context: 'Externe Dringlichkeit' },
  { id: 94, category: 'urgency', question: 'Welche Gelegenheit steht gerade vor der Tür?', context: 'Opportunity-Window' },
  { id: 95, category: 'urgency', question: 'Wenn du weißt, was du tun musst – warum wartest du?', context: 'Direkte Konfrontation (empathisch)' },

  // Mindset (96-105)
  { id: 96, category: 'mindset', question: 'Was unterscheidet die Menschen, die Ergebnisse erzielen, von denen, die es nur versuchen?', context: 'Commitment-Mindset Frame' },
  { id: 97, category: 'mindset', question: 'Wie wichtig ist dir persönliches Wachstum?', context: 'Growth-Mindset aktivieren' },
  { id: 98, category: 'mindset', question: 'Was würde die beste Version von dir tun?', context: 'Higher-Self ansprechen' },
  { id: 99, category: 'mindset', question: 'Wann hast du zuletzt etwas getan, das dich wirklich herausgefordert hat?', context: 'Komfortzone bewusst machen' },
  { id: 100, category: 'mindset', question: 'Was ist der Unterschied zwischen einer Ausgabe und einem Investment?', context: 'Mindset-Reframe' },
  { id: 101, category: 'mindset', question: 'Glaubst du, dass du das Ergebnis verdienst?', context: 'Self-Worth activieren' },
  { id: 102, category: 'mindset', question: 'Was wäre möglich, wenn Angst kein Faktor wäre?', context: 'Angst isolieren' },
  { id: 103, category: 'mindset', question: 'Wer in deinem Leben würde stolz sein, wenn du diesen Schritt gehst?', context: 'Soziale Motivation' },
  { id: 104, category: 'mindset', question: 'Was hast du zu verlieren?', context: 'Risikoanalyse umdrehen' },
  { id: 105, category: 'mindset', question: 'Was sagt dein Bauchgefühl?', context: 'Intuition einbeziehen' },
];

export default function ClosingQuestions() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  const filtered = QUESTIONS.filter(q => {
    const matchesCategory = category === 'all' || q.category === category;
    const matchesSearch = !search || q.question.toLowerCase().includes(search.toLowerCase()) || q.context.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFav = (id: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">100+ Killer Closing Questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Deine Bibliothek der wirkungsvollsten Fragen für jede Phase des Sales-Gesprächs.</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Frage suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 text-sm"
        />
      </div>

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
              category === c.key
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <c.icon className="h-3 w-3" />
            {c.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-3">
        <Badge variant="outline" className="text-[10px]">{filtered.length} Fragen</Badge>
        {favorites.size > 0 && <Badge variant="outline" className="text-[10px] text-accent border-accent/30">⭐ {favorites.size} Favoriten</Badge>}
      </div>

      {/* Questions */}
      <div className="space-y-2">
        {filtered.map(q => (
          <button
            key={q.id}
            onClick={() => toggleFav(q.id)}
            className={`w-full text-left rounded-xl border p-4 transition-all ${
              favorites.has(q.id)
                ? 'border-accent/40 bg-accent/[0.04]'
                : 'border-border/40 bg-card hover:border-border/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/50 text-[10px] font-bold text-muted-foreground">
                {q.id}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground leading-snug">{q.question}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{q.context}</p>
              </div>
              {favorites.has(q.id) && <span className="text-sm shrink-0">⭐</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
