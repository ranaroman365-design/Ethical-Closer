import { useEffect } from "react";
import { LanguageProvider } from "@/components/webinar/LanguageContext";
import WebinarEntry from "@/components/webinar/WebinarEntry";
import FooterSection from "@/components/landing/FooterSection";
import PublicMemberNavLink from "@/components/landing/PublicMemberNavLink";
import { captureCurrentPageAttribution } from "@/lib/lead-attribution";

/**
 * /webinar — Strategic nurture entry layer.
 *
 * Replaces the legacy 3-part scroll deck (still mounted at /webinar/full via
 * <WebinarFull/>) with a focused trust+clarity bridge that funnels into /apply.
 * Attribution chain is preserved; funnel_source is NEVER overwritten by this
 * route (see funnel-source.ts — /webinar is intentionally unmapped).
 */
const Webinar = () => {
  useEffect(() => {
    captureCurrentPageAttribution("Webinar");
  }, []);
  return (
    <LanguageProvider>
      <PublicMemberNavLink page="webinar" tone="dark" />
      <WebinarEntry />
      <FooterSection />
    </LanguageProvider>
  );
};

export default Webinar;
