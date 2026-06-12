import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, ChevronDown, ChevronUp, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const objections = [
  { id: 1, category: 'Price', objection: '"Das ist zu teuer."', mindset: 'Preis-Einwände bedeuten meist: Der Wert ist noch nicht klar genug.', response: '"Ich verstehe. Nur damit ich es besser einordnen kann — im Vergleich wozu?"', level: 'basic' },
  { id: 2, category: 'Time', objection: '"Ich habe gerade keine Zeit."', mindset: 'Zeit-Einwände bedeuten oft: Prioritäts-Unsicherheit oder emotionale Zurückhaltung.', response: '"Absolut verständlich. Darf ich fragen — wenn sich in den nächsten 12 Monaten nichts ändert, wie würde das für dich aussehen?"', level: 'basic' },
  { id: 3, category: 'Partner', objection: '"Ich muss erst mit meinem Partner sprechen."', mindset: 'Respektiere die Entscheidungsdynamik des Partners.', response: '"Natürlich. Wie trefft ihr beide normalerweise solche Entscheidungen zusammen?"', level: 'basic' },
  { id: 4, category: 'Trust', objection: '"Woher weiß ich, dass das funktioniert?"', mindset: 'Vertrauen wächst durch Klarheit und Beweise.', response: '"Gute Frage. Würde es helfen, wenn ich dir zeige, wie andere in ähnlichen Situationen vorgegangen sind?"', level: 'basic' },
  { id: 5, category: 'Past Experience', objection: '"Ich habe sowas schon mal probiert."', mindset: 'Verstehe, was beim letzten Mal nicht funktioniert hat.', response: '"Was hat deiner Meinung nach beim letzten Mal gefehlt?"', level: 'basic' },
  { id: 6, category: 'Skepticism', objection: '"Das klingt zu gut, um wahr zu sein."', mindset: 'Skepsis ist gesund. Reagiere mit Transparenz, nicht Defensivität.', response: '"Das verstehe ich. Lass mich dir genau zeigen, was realistisch ist und was von dir abhängt."', level: 'intermediate' },
  { id: 7, category: 'Commitment Fear', objection: '"Was, wenn ich mich falsch entscheide?"', mindset: 'Angst vor Fehlentscheidungen ist normal. Zeige den Support.', response: '"Eine faire Sorge. Lass uns durchgehen, was alles passiert, damit du auf dem richtigen Weg bleibst."', level: 'intermediate' },
  { id: 8, category: 'Overwhelm', objection: '"Das ist mir gerade zu viel."', mindset: 'Überforderung braucht Struktur, nicht mehr Information.', response: '"Ich verstehe. Lass uns das auf die 2-3 wichtigsten Punkte reduzieren."', level: 'intermediate' },
  { id: 9, category: 'Budget', objection: '"Ich habe das Budget nicht."', mindset: 'Budget-Einwände können real sein oder eine Prioritätsfrage.', response: '"Verstehe ich. Darf ich fragen — wenn das Budget keine Rolle spielen würde, wäre das die richtige Lösung für dich?"', level: 'intermediate' },
  { id: 10, category: 'Uncertainty', objection: '"Ich bin mir nicht sicher."', mindset: 'Unsicherheit braucht Klarheit, nicht Druck.', response: '"Was genau macht dich unsicher? Lass uns das konkret durchgehen."', level: 'intermediate' },
  { id: 11, category: 'Comparison', objection: '"Ich schaue mir noch andere Optionen an."', mindset: 'Vergleichssuche ist ein Kaufsignal. Hilf bei den Kriterien.', response: '"Das ist smart. Was sind die wichtigsten Kriterien, nach denen du vergleichst?"', level: 'advanced' },
  { id: 12, category: 'Timing', objection: '"Vielleicht nächstes Quartal."', mindset: 'Verschiebung ist oft Vermeidung. Zeige die Kosten des Wartens.', response: '"Natürlich. Was würde sich bis dahin an deiner Situation ändern?"', level: 'advanced' },
  { id: 13, category: 'Authority', objection: '"Ich bin nicht der Entscheider."', mindset: 'Identifiziere den Entscheidungsprozess und biete Unterstützung.', response: '"Verstehe. Wer ist noch an dieser Entscheidung beteiligt, und wie kann ich euch beiden am besten helfen?"', level: 'advanced' },
  { id: 14, category: 'Fear of Failure', objection: '"Was wenn das bei mir nicht funktioniert?"', mindset: 'Angst vor Versagen braucht Empathie und klare Erwartungen.', response: '"Diese Sorge ist völlig normal. Lass mich dir zeigen, wie unser Support-System genau dafür designt ist."', level: 'advanced' },
  { id: 15, category: 'Information', objection: '"Ich brauche mehr Informationen."', mindset: '"Mehr Info" bedeutet oft: "Ich bin noch nicht überzeugt."', response: '"Gerne. Welche spezifischen Fragen sind für deine Entscheidung am wichtigsten?"', level: 'advanced' },
  { id: 16, category: 'Value', objection: '"Ich sehe den Wert noch nicht."', mindset: 'Wert entsteht durch Verbindung zum konkreten Problem.', response: '"Was müsste passieren, damit sich das für dich lohnt?"', level: 'advanced' },
  { id: 17, category: 'Urgency', objection: '"Es ist nicht dringend."', mindset: 'Keine Dringlichkeit bedeutet: Die Konsequenzen sind nicht klar.', response: '"Verstehe. Was kostet es dich aktuell, diese Situation so zu lassen, wie sie ist?"', level: 'advanced' },
  { id: 18, category: 'Social Proof', objection: '"Kennt ihr jemand aus meiner Branche?"', mindset: 'Branchenrelevanz ist ein starkes Entscheidungskriterium.', response: '"Ja, tatsächlich. Lass mich dir ein konkretes Beispiel zeigen."', level: 'expert' },
  { id: 19, category: 'Risk', objection: '"Was ist das Risiko?"', mindset: 'Risikofragen zeigen, dass der Prospect kaufbereit ist.', response: '"Gute Frage. Lass uns die Risiken auf beiden Seiten anschauen — was passiert, wenn du es machst, und was passiert, wenn nicht."', level: 'expert' },
  { id: 20, category: 'Contract', objection: '"Gibt es eine Mindestlaufzeit?"', mindset: 'Vertragsfragen sind ein Kaufsignal.', response: '"Ja, und zwar aus einem guten Grund. Lass mich erklären, warum das für deinen Erfolg wichtig ist."', level: 'expert' },
  { id: 21, category: 'Complexity', objection: '"Das klingt kompliziert."', mindset: 'Komplexität braucht Vereinfachung, nicht mehr Details.', response: '"Im Kern sind es drei einfache Schritte. Lass mich dir den Weg zeigen."', level: 'expert' },
  { id: 22, category: 'Independence', objection: '"Ich mache das lieber selbst."', mindset: 'Selbstständigkeit respektieren, Zeitersparnis zeigen.', response: '"Respektiere ich total. Wie lange versuchst du es schon alleine, und wo stehst du dabei?"', level: 'expert' },
  { id: 23, category: 'Market', objection: '"Der Markt ist gerade schwierig."', mindset: 'Externe Faktoren als Argument — zeige Kontrolle.', response: '"Stimmt, der Markt ist herausfordernd. Genau deshalb ist eine systematische Herangehensweise jetzt wichtiger denn je."', level: 'expert' },
  { id: 24, category: 'Experience', objection: '"Ich habe keine Erfahrung damit."', mindset: 'Fehlende Erfahrung ist der Grund für das Training, nicht dagegen.', response: '"Genau dafür ist das System gebaut. 90% unserer erfolgreichsten Teilnehmer haben bei Null angefangen."', level: 'expert' },
  { id: 25, category: 'Indecision', objection: '"Ich muss darüber schlafen."', mindset: 'Schlaf-Einwand = offene Fragen identifizieren.', response: '"Natürlich. Was genau würdest du noch durchdenken wollen? Vielleicht kann ich jetzt schon Klarheit schaffen."', level: 'expert' },
];

const levelColors: Record<string, string> = {
  basic: 'bg-primary/10 text-primary',
  intermediate: 'bg-accent/10 text-accent',
  advanced: 'bg-orange-500/10 text-orange-600',
  expert: 'bg-red-500/10 text-red-600',
};

const levelLabels: Record<string, string> = {
  basic: 'Basis',
  intermediate: 'Fortgeschritten',
  advanced: 'Advanced',
  expert: 'Expert',
};

export default function ObjectionHandling() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<number[]>([]);
  const [mastered, setMastered] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Load mastered state from DB
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from('objection_mastery')
      .select('objection_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setMastered(data.map((d: any) => d.objection_id));
        setLoading(false);
      });
  }, [user]);

  const toggle = (id: number) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const markMastered = async (id: number) => {
    if (!user) return;
    const isMastered = mastered.includes(id);
    if (isMastered) {
      setMastered(prev => prev.filter(i => i !== id));
      await supabase.from('objection_mastery').delete().eq('user_id', user.id).eq('objection_id', id);
    } else {
      setMastered(prev => [...prev, id]);
      await supabase.from('objection_mastery').insert({ user_id: user.id, objection_id: id });
    }
  };

  const progress = Math.round((mastered.length / objections.length) * 100);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Objection Handling Mastery</h1>
        <p className="mt-1 text-sm text-muted-foreground">25 Einwände, die du im Schlaf behandeln können musst.</p>
      </div>

      {/* Progress */}
      <div className="mb-6 rounded-xl border border-border/40 bg-card p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>{mastered.length} / {objections.length} gemeistert</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Objections List */}
      <div className="space-y-2">
        {objections.map(obj => {
          const isOpen = expanded.includes(obj.id);
          const isDone = mastered.includes(obj.id);

          return (
            <div key={obj.id} className={`rounded-xl border ${isDone ? 'border-primary/30 bg-primary/[0.02]' : 'border-border/40 bg-card'} transition-all`}>
              <button onClick={() => toggle(obj.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isDone ? 'bg-primary/10' : 'bg-muted'}`}>
                  {isDone ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-foreground">{obj.category}</span>
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${levelColors[obj.level]}`}>
                      {levelLabels[obj.level]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground truncate italic">{obj.objection}</p>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Einwand</p>
                    <p className="text-[13px] text-foreground italic">{obj.objection}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Mindset</p>
                    <p className="text-[12px] text-foreground">{obj.mindset}</p>
                  </div>
                  <div className="rounded-lg bg-accent/[0.04] border border-accent/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-accent mb-1">Antwort-Vorlage</p>
                    <p className="text-[12px] text-foreground italic">{obj.response}</p>
                  </div>
                  <Button
                    variant={isDone ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs"
                    onClick={() => markMastered(obj.id)}
                  >
                    {isDone ? <><CheckCircle2 className="mr-2 h-3 w-3" /> Gemeistert</> : <><Shield className="mr-2 h-3 w-3" /> Als gemeistert markieren</>}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion Message */}
      {mastered.length === objections.length && (
        <div className="mt-8 rounded-xl border border-primary/20 bg-primary/[0.03] p-6 text-center">
          <Shield className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="font-serif text-base font-semibold text-foreground">Objection Handling Mastery Complete</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Du hast alle 25 Einwände gemeistert. Wissen schafft Bewusstsein — Praxis schafft Meisterschaft. Jetzt: echte Gespräche führen.
          </p>
        </div>
      )}
    </div>
  );
}
