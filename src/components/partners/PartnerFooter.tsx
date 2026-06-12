import { Link } from "react-router-dom";
import { PRODUCT } from '@/config/product';
import { useLanguage } from "@/i18n/LanguageContext";

interface PartnerFooterProps {
  /** Optional override; defaults to the global LanguageContext locale. */
  lang?: "de" | "en";
}

const PartnerFooter = ({ lang: langOverride }: PartnerFooterProps = {}) => {
  const { lang: ctxLang } = useLanguage();
  const lang = langOverride ?? ctxLang;
  const t = (en: string, de: string) => (lang === "en" ? en : de);

  return (
    <footer className="border-t border-border/40 py-10 px-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="text-center md:text-left">
            <p className="font-display text-sm text-foreground font-medium">{PRODUCT.nameTM}</p>
            <p className="mt-1">
              {t(
                "Adaptive performance infrastructure for ethical high-ticket sales",
                "Adaptive Performance-Infrastruktur für ethischen High-Ticket Vertrieb"
              )}
            </p>
          </div>
          <nav className="flex flex-wrap justify-center gap-5">
            <Link to="/legal-notice" className="hover:text-foreground transition-colors">
              {t("Legal Notice", "Impressum")}
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              {t("Privacy", "Datenschutz")}
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              {t("Terms", "AGB")}
            </Link>
            <Link to="/refund-policy" className="hover:text-foreground transition-colors">
              {t("Refund", "Widerruf")}
            </Link>
            <Link to="/cookie-policy" className="hover:text-foreground transition-colors">
              {t("Cookies", "Cookies")}
            </Link>
            <a
              href="mailto:contact@radiant.global"
              className="hover:text-foreground transition-colors"
            >
              {t("Contact", "Kontakt")}
            </a>
          </nav>
        </div>

        {/* Location line */}
        <div className="text-center space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
            {t("Operating across Europe", "Europaweit aktiv")}
          </p>
          <p className="text-[11px] text-muted-foreground/50 tracking-wider">
            München · Wien · London
          </p>
        </div>
      </div>
    </footer>
  );
};

export default PartnerFooter;
