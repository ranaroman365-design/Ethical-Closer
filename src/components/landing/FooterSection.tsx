import { Link } from "react-router-dom";
import { PRODUCT } from '@/config/product';
import { trackHomeCta } from "@/lib/home-tracking";

const FooterSection = () => (
  <footer className="border-t border-border py-10">
    <div className="container mx-auto max-w-4xl">
      <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
        <div>
          <p className="font-serif text-sm font-medium text-foreground">
            {PRODUCT.nameTM} by {PRODUCT.brand}
          </p>
          <p className="mt-1 font-sans text-xs text-muted-foreground">
            Keine Einkommensgarantie. Ergebnisse hängen von Einsatz und Markt ab.
          </p>
        </div>
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link
            to="/partners"
            onClick={() => trackHomeCta("b2b_partners", "footer", "/partners", { cta_type: "b2b" })}
            className="font-sans text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            For Companies & Sales Teams
          </Link>
          {[
            { label: "Legal Notice", path: "/legal-notice" },
            { label: "Privacy", path: "/privacy" },
            { label: "Terms", path: "/terms" },
            { label: "Refund Policy", path: "/refund-policy" },
            { label: "Cookies", path: "/cookie-policy" },
          ].map((link) => (
            <Link
              key={link.label}
              to={link.path}
              className="font-sans text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  </footer>
);

export default FooterSection;
