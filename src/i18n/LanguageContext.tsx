import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { translations, type Lang, type TranslationKey } from './translations';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  /** For inline translations not in the key-value store */
  tx: (de: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'de',
  setLang: () => {},
  t: (key) => translations[key]?.de ?? key,
  tx: (de) => de,
});

export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('etc_lang');
    return (stored === 'en' || stored === 'de') ? stored : 'de';
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('etc_lang', newLang);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[key]?.[lang] ?? key;
  }, [lang]);

  const tx = useCallback((de: string, en: string): string => {
    return lang === 'en' ? en : de;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, tx }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/90 backdrop-blur-md px-1 py-1 shadow-sm">
      <button
        onClick={() => setLang('de')}
        className={`rounded-full px-3 py-1.5 font-sans text-xs font-medium tracking-wide transition-all ${
          lang === 'de'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        DE
      </button>
      <button
        onClick={() => setLang('en')}
        className={`rounded-full px-3 py-1.5 font-sans text-xs font-medium tracking-wide transition-all ${
          lang === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
