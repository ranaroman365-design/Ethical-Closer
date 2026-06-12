import { useState } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/i18n/LanguageContext';

const faqCategories = [
  {
    name: { de: '1. Login & Zugang', en: '1. Login & Access' },
    items: [
      { q: { de: 'Wie erhalte ich meine Zugangsdaten?', en: 'How do I receive my login credentials?' }, a: { de: 'Du bekommst deine Login-Daten per E-Mail nach erfolgreichem Kauf. Prüfe auch deinen Spam-Ordner.', en: 'You will receive your login details via email after a successful purchase. Also check your spam folder.' } },
      { q: { de: 'Ich kann mich nicht einloggen — was tun?', en: 'I can\'t log in — what should I do?' }, a: { de: 'Stelle sicher, dass du die richtige E-Mail verwendest. Nutze "Passwort vergessen" oder kontaktiere den Support.', en: 'Make sure you\'re using the correct email. Use "Forgot Password" or contact support.' } },
    ],
  },
  {
    name: { de: '2. Plattform & Navigation', en: '2. Platform & Navigation' },
    items: [
      { q: { de: 'Wo finde ich meine Module?', en: 'Where do I find my modules?' }, a: { de: 'Gehe zu "Academy" im Menü. Dort siehst du alle Phasen und Module in der richtigen Reihenfolge.', en: 'Go to "Academy" in the menu. There you\'ll see all phases and modules in the correct order.' } },
      { q: { de: 'Wie funktioniert das Dashboard?', en: 'How does the dashboard work?' }, a: { de: 'Das Dashboard zeigt deinen Gesamtfortschritt, die aktuelle Phase und Ankündigungen auf einen Blick.', en: 'The dashboard shows your overall progress, current phase, and announcements at a glance.' } },
    ],
  },
  {
    name: { de: '3. Training & Module', en: '3. Training & Modules' },
    items: [
      { q: { de: 'In welcher Reihenfolge soll ich die Module bearbeiten?', en: 'In what order should I complete the modules?' }, a: { de: 'Folge der vorgegebenen Phasenstruktur. Jede Phase baut auf der vorherigen auf.', en: 'Follow the predefined phase structure. Each phase builds on the previous one.' } },
      { q: { de: 'Kann ich Module überspringen?', en: 'Can I skip modules?' }, a: { de: 'Nein. Module werden in der richtigen Reihenfolge freigeschaltet, damit du ein solides Fundament aufbaust.', en: 'No. Modules are unlocked in order so you build a solid foundation.' } },
      { q: { de: 'Wie markiere ich ein Modul als abgeschlossen?', en: 'How do I mark a module as completed?' }, a: { de: 'Klicke im Modul auf "Als abgeschlossen markieren". Dein Fortschritt wird automatisch gespeichert.', en: 'Click "Mark as completed" in the module. Your progress is saved automatically.' } },
    ],
  },
  {
    name: { de: '4. Practice Calls', en: '4. Practice Calls' },
    items: [
      { q: { de: 'Wie organisiere ich Practice Calls?', en: 'How do I organize practice calls?' }, a: { de: 'Nutze die Community, um Practice-Partner zu finden. Koordiniert euch über den Community-Bereich.', en: 'Use the Community to find practice partners. Coordinate via the Community section.' } },
      { q: { de: 'Wie lade ich eine Aufnahme hoch?', en: 'How do I upload a recording?' }, a: { de: 'Gehe zum Practice-Bereich und nutze den Upload-Bereich für Audio- oder Video-Dateien.', en: 'Go to the Practice section and use the upload area for audio or video files.' } },
    ],
  },
  {
    name: { de: '5. Zertifizierung', en: '5. Certification' },
    items: [
      { q: { de: 'Wann kann ich die Zertifizierung starten?', en: 'When can I start the certification?' }, a: { de: 'Die Zertifizierung wird freigeschaltet, nachdem du alle Kernmodule und Practice Calls abgeschlossen hast.', en: 'Certification is unlocked after you complete all core modules and practice calls.' } },
      { q: { de: 'Was passiert, wenn ich durchfalle?', en: 'What happens if I fail?' }, a: { de: 'Du kannst die Prüfung wiederholen. Nutze das Feedback, um dich gezielt zu verbessern.', en: 'You can retake the exam. Use the feedback to improve specifically.' } },
    ],
  },
  {
    name: { de: '6. Placement', en: '6. Placement' },
    items: [
      { q: { de: 'Was genau ist ein Placement?', en: 'What exactly is a placement?' }, a: { de: 'Eine direkte Vorstellung bei einem qualifizierten High-Ticket Anbieter aus unserem Netzwerk.', en: 'A direct introduction to a qualified high-ticket provider from our network.' } },
      { q: { de: 'Wie werde ich Placement Ready?', en: 'How do I become Placement Ready?' }, a: { de: 'Erfülle alle Kriterien: Module abschließen, Practice Calls absolvieren, Zertifizierung bestehen und Profil vervollständigen.', en: 'Meet all criteria: complete modules, do practice calls, pass certification, and complete your profile.' } },
    ],
  },
  {
    name: { de: '7. Technische Probleme', en: '7. Technical Issues' },
    items: [
      { q: { de: 'Videos laden nicht – was tun?', en: 'Videos won\'t load – what should I do?' }, a: { de: 'Prüfe deine Internetverbindung und versuche einen anderen Browser. Lösche ggf. den Browser-Cache.', en: 'Check your internet connection and try a different browser. Clear the browser cache if needed.' } },
      { q: { de: 'Mein Fortschritt wird nicht gespeichert', en: 'My progress is not being saved' }, a: { de: 'Stelle sicher, dass du eingeloggt bist. Lade die Seite neu und versuche es erneut.', en: 'Make sure you\'re logged in. Reload the page and try again.' } },
    ],
  },
];

export default function HelpCenter() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const toggleItem = (q: string) => {
    setExpandedItems(prev =>
      prev.includes(q) ? prev.filter(i => i !== q) : [...prev, q]
    );
  };

  const filteredCategories = faqCategories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(
        item =>
          item.q[lang].toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.a[lang].toLowerCase().includes(searchTerm.toLowerCase())
      ),
    }))
    .filter(cat => cat.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{t('Hilfe', 'Help')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Antworten auf die häufigsten Fragen – geordnet nach deiner Lernreise.', 'Answers to the most common questions – organized by your learning journey.')}</p>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={t('Suche nach Antworten…', 'Search for answers…')}
          className="pl-10 border-border/40 bg-card"
        />
      </div>

      <div className="space-y-3">
        {filteredCategories.map(cat => {
          const catName = cat.name[lang];
          return (
            <div key={catName} className="rounded-xl border border-border/40 bg-card overflow-hidden">
              <button
                onClick={() => toggleCategory(catName)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-[14px] font-semibold text-foreground">{catName}</span>
                {expandedCategories.includes(catName) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {expandedCategories.includes(catName) && (
                <div className="border-t border-border/30 px-4 py-2">
                  {cat.items.map(item => {
                    const qText = item.q[lang];
                    return (
                      <div key={qText} className="border-b border-border/20 last:border-0">
                        <button
                          onClick={() => toggleItem(qText)}
                          className="flex w-full items-center justify-between py-3 text-left"
                        >
                          <span className="text-[13px] font-medium text-foreground pr-4">{qText}</span>
                          {expandedItems.includes(qText) ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                        {expandedItems.includes(qText) && (
                          <p className="pb-3 text-[12px] leading-relaxed text-muted-foreground">{item.a[lang]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
