import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Target, Sparkles, Flame, FolderOpen, Star, BarChart3,
  ShieldAlert, ArrowRight, RefreshCw, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';

type Section = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  body: React.ReactNode;
  raw: string;
};

const Item = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-2 text-sm text-foreground/85 leading-relaxed">
    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
    <span>{children}</span>
  </li>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <Badge variant="secondary" className="rounded-full border border-border/60 bg-background font-normal">
    {children}
  </Badge>
);

const SECTIONS: Section[] = [
  {
    id: 'audience',
    title: '1 — Zielgruppe',
    subtitle: 'Wer genau wird angesprochen, damit Hooks treffen?',
    icon: Target,
    body: (
      <div className="space-y-4">
        <ul className="space-y-2">
          <Item><strong>Primär:</strong> Männer 22–40, ambitioniert, ortsunabhängig, sucht echten Karriereweg statt Hustle.</Item>
          <Item><strong>Sekundär:</strong> Frauen 24–38, leistungsorientiert, hochwertige Ästhetik, Karriere + Freiheit.</Item>
          <Item><strong>Erfahrungsstand:</strong> 70 % Anfänger ohne Sales-Background · 30 % Closer/Setter, die mehr Income wollen.</Item>
          <Item><strong>Pain Points:</strong> festgefahrener Job, niedrige Decke, fehlende Anerkennung, Angst vor AI/Job-Loss.</Item>
          <Item><strong>Wünsche:</strong> echtes Einkommen (€5–25k), Freiheit, Status, ein Skill der nicht ersetzbar ist.</Item>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Pill>22–40</Pill><Pill>Karriere-suchend</Pill><Pill>Remote</Pill><Pill>High-Performer-DNA</Pill>
        </div>
      </div>
    ),
    raw: 'Zielgruppe: M 22–40 ambitioniert, Remote-Karriere; sekundär F 24–38. 70% Beginner, 30% bestehende Closer. Pains: Decke, AI-Angst, fehlende Anerkennung. Wünsche: Income €5–25k, Freiheit, nicht-ersetzbarer Skill.',
  },
  {
    id: 'brand',
    title: '2 — Brand Positioning',
    subtitle: 'Wofür ETC steht — und wofür nicht.',
    icon: Sparkles,
    body: (
      <div className="space-y-4">
        <ul className="space-y-2">
          <Item><strong>Mission:</strong> Karriereweg im ethischen Closing — Selektion statt Druck.</Item>
          <Item><strong>Unterschied:</strong> kein Coaching-Bootcamp, sondern echtes Performance-System mit Platzierung in Teams.</Item>
          <Item><strong>Tonalität:</strong> intelligent · leistungsorientiert · ruhig · hochwertig · ethisch.</Item>
          <Item><strong>Ästhetik:</strong> Apple × Loro Piana. Cream, Gold-Akzent, Ink. Cormorant Serif + DM Sans.</Item>
          <Item><strong>Voice:</strong> sicher, ohne Hype. Klartext. Keine Ausrufezeichen, kein Emoji-Spam.</Item>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Pill>Ethisch</Pill><Pill>High-End</Pill><Pill>Performance</Pill><Pill>Selektion vor Druck</Pill>
        </div>
      </div>
    ),
    raw: 'ETC = Karriereweg im ethischen Closing. Unterschied zu Coaches: echte Platzierung & System. Tonalität: intelligent, ruhig, hochwertig, ethisch. Aesthetik Apple × Loro Piana.',
  },
  {
    id: 'hooks',
    title: '3 — Top Hook-Themen',
    subtitle: 'Priorisierte Themenfelder für maximale Watchtime.',
    icon: Flame,
    body: (
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Geld & Freiheit', 'Income-Realität, Steuern, Lifestyle ohne Flexing.'],
          ['Closing & Sales', 'Frameworks, Ethical Closing, ehrliche Mechaniken.'],
          ['Kommunikation', 'Tonalität, Rapport, Status-Sprache, Stimme.'],
          ['AI & Zukunft der Jobs', 'Welcher Skill bleibt — und warum Closing es ist.'],
          ['Selbstbewusstsein / Status', 'Innere Haltung, Auftreten, Standards.'],
          ['Performance & Disziplin', 'Routinen, Fokus, mentale Belastbarkeit.'],
          ['Karriere & Remote Work', 'Wege raus aus dem 9-to-5 ohne Hustle-Vibe.'],
        ].map(([h, d]) => (
          <div key={h} className="rounded-xl border border-border/60 bg-background/60 p-3">
            <div className="text-sm font-semibold text-foreground">{h}</div>
            <div className="mt-1 text-xs text-muted-foreground">{d}</div>
          </div>
        ))}
      </div>
    ),
    raw: 'Hook-Themen: Geld & Freiheit · Closing & Sales · Kommunikation · AI & Zukunft Jobs · Selbstbewusstsein/Status · Performance/Disziplin · Karriere & Remote.',
  },
  {
    id: 'library',
    title: '4 — Rohmaterial / Content Library',
    subtitle: 'Je mehr emotional starke Aussagen, desto besser performen die Clips.',
    icon: FolderOpen,
    body: (
      <div className="space-y-4">
        <ul className="space-y-2">
          <Item>Podcasts (lang, mind. 30 Min, mit ehrlichen Momenten)</Item>
          <Item>Zoom Calls / Team-Sessions (mit Einwilligung)</Item>
          <Item>1:1 Interviews & Q&A</Item>
          <Item>Voice Notes & spontane Gedanken</Item>
          <Item>TikToks / Reels / Storys (Repurpose-fähig)</Item>
          <Item>Monologe vor Kamera (Studio + handheld)</Item>
        </ul>
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <strong className="text-foreground">Asset-Drop:</strong> Rohmaterial wird zentral abgelegt (Drive / Frame.io).
          Link wird hier ergänzt, sobald Ordnerstruktur steht. Jede Datei trägt Datum, Setting & Thema im Namen.
        </div>
      </div>
    ),
    raw: 'Library: Podcasts, Zoom Calls, Interviews, Voice Notes, TikToks/Reels, Storys, Monologe, Q&A. Zentraler Drop folgt.',
  },
  {
    id: 'references',
    title: '5 — Referenz-Clips & Stilvorbilder',
    subtitle: 'Klare Optik & Pacing als Benchmark.',
    icon: Star,
    body: (
      <div className="space-y-3">
        <ul className="space-y-2">
          <Item><strong>Pacing:</strong> Hook in den ersten 1,2 Sek — Aussage zuerst, Kontext danach.</Item>
          <Item><strong>Cut-Stil:</strong> minimal-elegant, wenige Schnitte, keine Zoom-Spam.</Item>
          <Item><strong>Captions:</strong> serifenlos, weiß, mit Akzentwort in Gold (#C9A84C).</Item>
          <Item><strong>Hook-Beispiele:</strong> "Der Job, der AI überlebt." · "Niemand sagt dir das über Closing." · "€10k/Monat ist nicht der Plan. Der Plan ist Selektion."</Item>
        </ul>
        <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
          Konkrete Creator-Referenzen (Account-Handles) werden hier nach interner Freigabe ergänzt.
        </div>
      </div>
    ),
    raw: 'Referenzen: Hook in 1.2s, minimal Cuts, Captions weiß + Gold-Akzent. Beispiel-Hooks dokumentiert.',
  },
  {
    id: 'kpi',
    title: '6 — KPI-Ziele (NICHT nur Views)',
    subtitle: 'Worauf wir wirklich optimieren.',
    icon: BarChart3,
    body: (
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {[
          ['Profilbesuche', 'Brand-Pull statt zufälliger Reach.'],
          ['Kommentare', 'Diskussion ≫ Likes.'],
          ['Saves & Shares', 'Inhalt mit Relevanz.'],
          ['Quiz Starts', '/masterofsales → Quiz.'],
          ['Leads', 'Vollständig erfasst (Name, Mail, Phone).'],
          ['Bookings & Show-Ups', 'Echte Outcomes, nicht Vanity.'],
        ].map(([k, d]) => (
          <div key={k} className="rounded-xl border border-border/60 bg-background/60 p-3">
            <div className="text-sm font-semibold text-foreground">{k}</div>
            <div className="mt-1 text-xs text-muted-foreground">{d}</div>
          </div>
        ))}
      </div>
    ),
    raw: 'KPIs: Profilbesuche, Kommentare, Saves, Quiz Starts, Leads, Bookings. NICHT: reine Views.',
  },
  {
    id: 'boundaries',
    title: '7 — Brand-Grenzen (NICHT posten)',
    subtitle: 'Was die Marke beschädigen würde.',
    icon: ShieldAlert,
    body: (
      <ul className="space-y-2">
        <Item>Fake-Guru-Vibe — keine inszenierten Luxus-Shots.</Item>
        <Item>Aggressives Flexing — kein Geld-fächern, keine Auto-Posing.</Item>
        <Item>Scam-/Hustle-Content — keine "passive income"-Versprechen.</Item>
        <Item>Billige Motivation — keine Sprüche ohne Substanz.</Item>
        <Item>Druck-Sprache — kein FOMO-Spam, kein "letzte Chance".</Item>
        <Item>Politik, Religion, Diss-Tracks gegen andere Brands.</Item>
      </ul>
    ),
    raw: 'Verboten: Fake-Guru, Flexing, Scam/Hustle, billige Motivation, Druck-Sprache, Politik/Religion/Diss.',
  },
  {
    id: 'cta',
    title: '8 — CTA / Funnel-Routing',
    subtitle: 'Wohin jeder Clip führen darf.',
    icon: ArrowRight,
    body: (
      <div className="space-y-3">
        <ul className="space-y-2">
          <Item><strong>Primär-CTA:</strong> <code className="rounded bg-muted px-1.5 py-0.5 text-xs">ethicalcloser.de/masterofsales</code> — Conversion-Engine.</Item>
          <Item><strong>Sekundär-CTA:</strong> Quiz-Link (nur wenn der Hook qualifiziert).</Item>
          <Item><strong>Tertiär:</strong> Instagram-Profil → Bio-Link → /masterofsales.</Item>
          <Item><strong>Optional:</strong> WhatsApp-Community / Broadcast — nur für warme Audience.</Item>
        </ul>
        <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">UTM-Konvention:</strong> <code>?utm_source=ig&utm_medium=clip&utm_campaign=&lt;hook-id&gt;</code> — pro Clip eindeutig.
        </div>
      </div>
    ),
    raw: 'CTA: 1) /masterofsales 2) Quiz 3) IG Bio 4) WhatsApp (warm only). UTMs verpflichtend pro Clip.',
  },
  {
    id: 'iteration',
    title: '9 — Iteration & Feedback-Loop',
    subtitle: 'Damit das System Woche für Woche schärfer wird.',
    icon: RefreshCw,
    body: (
      <ul className="space-y-2">
        <Item><strong>Wöchentlich:</strong> Top 5 Clips nach Hook, Watchtime, CTR, Kommentaren, Conversions rückspielen.</Item>
        <Item><strong>Hook-Pool:</strong> jede Woche +5 neue Hook-Formate testen, 2 davon skalieren.</Item>
        <Item><strong>Stop-Rule:</strong> Clips unter 30 % Watchtime werden nicht repurposed.</Item>
        <Item><strong>Doppel-Schienen:</strong> max. 2 A/B-Varianten parallel — keine Traffic-Zersplitterung.</Item>
        <Item><strong>Briefing-Update:</strong> dieses Dokument wird monatlich nachgezogen.</Item>
      </ul>
    ),
    raw: 'Iteration: wöchentlich Top 5 review, +5 Hooks/Woche, Stop <30% Watchtime, max 2 A/B parallel, Briefing monatlich updaten.',
  },
];

export default function ClipperBrief() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyAll = async () => {
    const all = SECTIONS.map(s => `${s.title}\n${s.raw}`).join('\n\n');
    await navigator.clipboard.writeText(all);
    toast.success('Komplettes Briefing kopiert');
  };

  const copySection = async (s: Section) => {
    await navigator.clipboard.writeText(`${s.title}\n${s.raw}`);
    setCopied(s.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/5 text-primary">
            Internal · Clipper Briefing
          </Badge>
          <Badge variant="outline" className="rounded-full">v1.0</Badge>
        </div>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Clipper Briefing — ETC
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Vor Start brauchen Clipper diese Informationen, um überperformende Clips zu erstellen.
          Single Source of Truth für Zielgruppe, Brand, Hooks, Material, KPIs, Grenzen, CTA und Iteration.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="default" size="sm" onClick={copyAll}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Komplettes Briefing kopieren
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="https://www.ethicalcloser.de/masterofsales" target="_blank" rel="noopener noreferrer">
              /masterofsales öffnen
            </a>
          </Button>
        </div>
      </header>

      <Separator />

      {/* Sections */}
      <div className="space-y-5">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.id} id={s.id} className="border-border/70 bg-card/60 backdrop-blur-sm">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="font-serif text-xl text-foreground">{s.title}</CardTitle>
                      <CardDescription className="mt-1">{s.subtitle}</CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => copySection(s)}
                  >
                    {copied === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>{s.body}</CardContent>
            </Card>
          );
        })}
      </div>

      <footer className="rounded-2xl border border-border/60 bg-muted/30 p-5 text-xs text-muted-foreground">
        Dieses Dokument ist die <strong className="text-foreground">verbindliche</strong> Grundlage für alle Clipper.
        Änderungen nur über Head of Brand. Letzte Pflege: monatlich.
      </footer>
    </div>
  );
}
