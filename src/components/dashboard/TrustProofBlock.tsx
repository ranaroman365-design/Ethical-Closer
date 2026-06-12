import { useLanguage } from '@/i18n/LanguageContext';
import { Shield, Award, Users } from 'lucide-react';

/**
 * Lightweight trust/proof block for applicant and early member areas.
 * Premium, calm — no hype, no loud social proof.
 */
export default function TrustProofBlock() {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const proofs = [
    {
      icon: Award,
      title: tl('Zertifiziertes System', 'Certified System'),
      text: tl(
        'Jeder Closer wird durch ein 3-Säulen-Modell geprüft: Theorie, Praxis und reale KPIs.',
        'Every closer is verified through a 3-pillar model: theory, practice, and real KPIs.'
      ),
    },
    {
      icon: Users,
      title: tl('Echte Platzierungen', 'Real Placements'),
      text: tl(
        'Absolventen werden aktiv bei Partnern platziert — kein leeres Versprechen.',
        'Graduates are actively placed with partners — not an empty promise.'
      ),
    },
    {
      icon: Shield,
      title: tl('Ethisch & transparent', 'Ethical & Transparent'),
      text: tl(
        'Kein Druckverkauf. Kein Fake-Scarcity. Echte Ergebnisse durch echte Fähigkeiten.',
        'No pressure selling. No fake scarcity. Real results through real skills.'
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {proofs.map((proof, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/80 px-4 py-3"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 mt-0.5">
            <proof.icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{proof.title}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{proof.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
