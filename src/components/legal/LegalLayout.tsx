import { Link } from "react-router-dom";
import { ReactNode } from "react";
import { useLanguage, LanguageToggle } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const LEGAL_LINKS = [
  { to: "/legal-notice", de: "Impressum", en: "Legal Notice" },
  { to: "/privacy", de: "Datenschutz", en: "Privacy Policy" },
  { to: "/terms", de: "AGB", en: "Terms of Service" },
  { to: "/refund-policy", de: "Widerruf & Erstattung", en: "Refund & Cancellation" },
  { to: "/cookie-policy", de: "Cookies", en: "Cookie Policy" },
];

const LegalLayout = ({ title, subtitle, children }: LegalLayoutProps) => {
  const { tx } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link
            to="/"
            className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {tx("Zur Startseite", "Back to home")}
          </Link>
          <LanguageToggle />
        </div>
      </header>

      {/* Hero */}
      <div className="container mx-auto max-w-3xl px-6 pt-12 pb-6 md:pt-20">
        <p className="mb-3 font-sans text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {PRODUCT.legal.company} · {tx("Rechtliches", "Legal")}
        </p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground md:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 font-sans text-sm text-muted-foreground">{subtitle}</p>
        )}
        <p className="mt-4 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
          {tx("Stand", "Last updated")}: {PRODUCT.legal.lastUpdated} · v{PRODUCT.legal.version}
        </p>
      </div>

      {/* Sub-nav */}
      <nav className="container mx-auto max-w-3xl border-y border-border/40 px-6 py-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_LINKS.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {tx(l.de, l.en)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Body */}
      <main className="container mx-auto max-w-3xl px-6 py-12 md:py-16">
        <div className="space-y-10 font-sans text-[15px] leading-[1.75] text-foreground/85">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10">
        <div className="container mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 text-center font-sans text-[11px] text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {PRODUCT.legal.company} ·{" "}
            {PRODUCT.legal.jurisdictionState}, {PRODUCT.legal.jurisdictionCountry}
          </p>
          <p>
            {tx("Operative Marken", "Operating brands")}:{" "}
            {PRODUCT.legal.brands.map((b) => b.name).join(" · ")}
          </p>
        </div>
      </footer>
    </div>
  );
};

export const LegalSection = ({
  number,
  title,
  children,
}: {
  number?: string | number;
  title: string;
  children: ReactNode;
}) => (
  <section>
    <h2 className="mb-4 font-serif text-xl font-semibold text-foreground">
      {number !== undefined && (
        <span className="mr-3 text-muted-foreground/60">{number}</span>
      )}
      {title}
    </h2>
    <div className="space-y-3">{children}</div>
  </section>
);

export default LegalLayout;
