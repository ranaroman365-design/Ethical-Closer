import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "en" | "de";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  tx: (en: string, de: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "de",
  setLang: () => {},
  tx: (en) => en,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Lang>("de");
  const tx = (en: string, de: string) => (lang === "en" ? en : de);

  return (
    <LanguageContext.Provider value={{ lang, setLang, tx }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const LanguageToggle = () => {
  const { lang, setLang } = useLanguage();

  return (
    <div className="fixed top-4 right-4 z-[60] flex items-center gap-1 rounded-full border border-border bg-card/90 backdrop-blur-md px-1 py-1 shadow-sm">
      <button
        onClick={() => setLang("de")}
        className={`rounded-full px-3 py-1.5 font-sans text-xs font-medium tracking-wide transition-all ${
          lang === "de"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        DE
      </button>
      <button
        onClick={() => setLang("en")}
        className={`rounded-full px-3 py-1.5 font-sans text-xs font-medium tracking-wide transition-all ${
          lang === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  );
};
