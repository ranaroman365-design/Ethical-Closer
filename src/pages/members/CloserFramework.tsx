import { CreditCard, Wallet, Globe, CheckCircle, ArrowRight, ShieldCheck, AlertTriangle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface PaymentMethod {
  id: string;
  name: string;
  icon: typeof CreditCard;
  color: string;
  steps: string[];
  tips: string[];
  warnings: string[];
}

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'digistore',
    name: 'Digistore24',
    icon: Globe,
    color: 'text-blue-500',
    steps: [
      'Kunden den Digistore-Bestelllink zusenden',
      'Sicherstellen, dass der korrekte Produktlink verwendet wird',
      'Kunde wählt Zahlungsmethode (Kreditkarte, SEPA, PayPal, Sofort)',
      'Bestellung wird automatisch im System erfasst',
      'Bestätigungsmail wird automatisch versendet',
      'Zugang wird nach Zahlungseingang freigeschaltet',
    ],
    tips: [
      'Bestelllink immer direkt während des Calls senden',
      'Bildschirmfreigabe anbieten um durch den Prozess zu führen',
      'Bei Ratenzahlung: Alle Konditionen vorher klar kommunizieren',
    ],
    warnings: [
      'Niemals den Bestellprozess für den Kunden durchführen',
      'Keine Zahlungsdaten telefonisch entgegennehmen',
    ],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    icon: Wallet,
    color: 'text-indigo-500',
    steps: [
      'PayPal.me-Link oder Rechnungs-Link bereitstellen',
      'Betrag und Beschreibung korrekt angeben',
      'Kunde loggt sich in sein PayPal-Konto ein',
      'Zahlung bestätigen lassen',
      'Zahlungsbestätigung prüfen und dokumentieren',
      'Zugang manuell oder per Webhook freischalten',
    ],
    tips: [
      'PayPal-Links vorformatiert bereithalten',
      'Bei größeren Beträgen: "Waren und Dienstleistungen" verwenden',
      'Bestätigung per Screenshot anfordern falls nötig',
    ],
    warnings: [
      'Keine "Freunde & Familie"-Zahlungen für Business akzeptieren',
      'Bei Rückbuchungsrisiko: Digistore bevorzugen',
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe / Kreditkarte',
    icon: CreditCard,
    color: 'text-emerald-500',
    steps: [
      'Stripe Payment Link generieren oder bestehenden verwenden',
      'Link an den Kunden senden (Chat, E-Mail oder SMS)',
      'Kunde gibt Kartendaten auf der Stripe-Seite ein',
      'Zahlung wird in Echtzeit verarbeitet',
      'Automatische Bestätigung und Rechnung',
      'Zugang wird per Webhook automatisch freigeschaltet',
    ],
    tips: [
      'Stripe Checkout bietet die höchste Conversion-Rate',
      'Unterstützt Apple Pay, Google Pay und Klarna',
      'Automatische Rechnungsstellung aktivieren',
    ],
    warnings: [
      'PCI-Compliance beachten — nie Kartendaten direkt speichern',
      'Testmodus vs. Live-Modus vor dem Call prüfen',
    ],
  },
  {
    id: 'bank',
    name: 'Banküberweisung / SEPA',
    icon: FileText,
    color: 'text-amber-500',
    steps: [
      'Rechnung mit Bankdaten erstellen und versenden',
      'Zahlungsfrist klar kommunizieren (z.B. 3 Werktage)',
      'Verwendungszweck mit Bestell-ID angeben',
      'Zahlungseingang manuell prüfen',
      'Zugang nach Zahlungseingang freischalten',
      'Bestätigung an Kunden senden',
    ],
    tips: [
      'Bei Banküberweisung immer eine Frist setzen',
      'Automatische Erinnerung einrichten bei Nicht-Zahlung',
      'SEPA-Lastschrift als komfortablere Alternative anbieten',
    ],
    warnings: [
      'Längere Bearbeitungszeit einkalkulieren (1-3 Werktage)',
      'Risiko von Zahlungsausfällen höher als bei Sofort-Zahlungen',
    ],
  },
];

const DEAL_COMPLETION_FLOW = [
  { step: 1, title: 'Verbindliche Zusage', desc: 'Kunde bestätigt mündlich die Teilnahme und den Preis.' },
  { step: 2, title: 'Zahlungsmethode klären', desc: 'Bevorzugte Zahlungsmethode und Modalitäten besprechen.' },
  { step: 3, title: 'Zahlungslink senden', desc: 'Den passenden Zahlungslink direkt im Call teilen.' },
  { step: 4, title: 'Zahlung begleiten', desc: 'Bildschirmfreigabe anbieten und durch den Prozess führen.' },
  { step: 5, title: 'Bestätigung einholen', desc: 'Zahlungsbestätigung prüfen und dokumentieren.' },
  { step: 6, title: 'Onboarding einleiten', desc: 'Zugangsdaten und nächste Schritte kommunizieren.' },
];

export default function CloserFramework() {
  const [expandedMethod, setExpandedMethod] = useState<string | null>('digistore');

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Closer Framework</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operatives Referenzwerk für Payment-Workflows — von „Ja" bis „Zahlung eingegangen".
        </p>
      </div>

      {/* Deal Completion Flow */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Deal-Abschluss: 6-Schritte-Workflow</h2>
        <div className="space-y-2">
          {DEAL_COMPLETION_FLOW.map((item) => (
            <div key={item.step} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card p-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                {item.step}
              </div>
              <div>
                <p className="text-[13px] font-medium text-foreground">{item.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Zahlungsmethoden</h2>
        <div className="space-y-3">
          {PAYMENT_METHODS.map((method) => {
            const isExpanded = expandedMethod === method.id;
            return (
              <div key={method.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedMethod(isExpanded ? null : method.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <method.icon className={`h-5 w-5 shrink-0 ${method.color}`} />
                  <span className="text-[14px] font-medium text-foreground flex-1">{method.name}</span>
                  <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {isExpanded && (
                  <div className="border-t border-border/30 p-4 space-y-4">
                    {/* Steps */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ablauf</p>
                      <div className="space-y-1.5">
                        {method.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                            <span className="text-[12px] text-foreground">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tips */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipps</p>
                      <div className="space-y-1.5">
                        {method.tips.map((tip, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent mt-0.5" />
                            <span className="text-[12px] text-foreground">{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Warnings */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Achtung</p>
                      <div className="space-y-1.5">
                        {method.warnings.map((warn, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                            <span className="text-[12px] text-foreground">{warn}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Reference */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quick Reference</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="text-[12px]"><span className="font-medium text-foreground">Bevorzugt:</span> <span className="text-muted-foreground">Digistore24 (automatisch)</span></div>
          <div className="text-[12px]"><span className="font-medium text-foreground">Schnellste:</span> <span className="text-muted-foreground">Stripe / Kreditkarte</span></div>
          <div className="text-[12px]"><span className="font-medium text-foreground">Flexibelste:</span> <span className="text-muted-foreground">PayPal</span></div>
          <div className="text-[12px]"><span className="font-medium text-foreground">Backup:</span> <span className="text-muted-foreground">Banküberweisung / SEPA</span></div>
        </div>
      </div>
    </div>
  );
}
