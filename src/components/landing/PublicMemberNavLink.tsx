import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { trackFunnelEvent } from "@/lib/track-event";
import { cn } from "@/lib/utils";

/**
 * Consistent top-right Member Area link for all PUBLIC landing/funnel routes
 * (/apply, /qualify, /webinar, /start/quiz, …).
 *
 * - Never replaces the page's primary CTA.
 * - Does not affect funnel routing, A/B assignment, or funnel_source logic.
 * - Authenticated member dashboards have their own nav and do not render this.
 *
 * Tracking: reuses existing trackFunnelEvent schema with the canonical
 * `public_nav_click` name and standard payload (target, location).
 */
interface PublicMemberNavLinkProps {
  /** Optional override; defaults to a fixed top-right position. */
  className?: string;
  /** Tag the originating page so analytics can segment per landing route. */
  page?: string;
  /** Tone preset; "light" works on dark backgrounds, "dark" on light. */
  tone?: "light" | "dark";
}

const PublicMemberNavLink = ({
  className,
  page,
  tone = "dark",
}: PublicMemberNavLinkProps) => {
  const { tx } = useLanguage();
  const label = tx("Memberbereich", "Member Area");

  const handleClick = () => {
    try {
      trackFunnelEvent("public_nav_click", {
        target: "members_login",
        location: "top_nav",
        page: page ?? null,
      });
    } catch {
      /* tracking must never break the page */
    }
  };

  const toneClasses =
    tone === "light"
      ? "border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
      : "border-border/60 bg-card/80 text-muted-foreground hover:border-border hover:text-foreground";

  return (
    <div
      className={cn(
        "fixed right-3 top-3 z-50 md:right-6 md:top-5",
        className,
      )}
    >
      <Link
        to="/members/login"
        onClick={handleClick}
        aria-label={label}
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium backdrop-blur-sm transition-all md:px-4 md:py-2 md:text-xs",
          toneClasses,
        )}
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </div>
  );
};

export default PublicMemberNavLink;
