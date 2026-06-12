interface PartnerLanguageToggleProps {
  lang: "de" | "en";
  setLang: (lang: "de" | "en") => void;
}

const PartnerLanguageToggle = ({ lang, setLang }: PartnerLanguageToggleProps) => (
  <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/90 backdrop-blur-md px-0.5 py-0.5">
    {(["de", "en"] as const).map((l) => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`rounded-full px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-wider transition-all ${
          lang === l
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {l}
      </button>
    ))}
  </div>
);

export default PartnerLanguageToggle;
