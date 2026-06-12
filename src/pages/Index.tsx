/**
 * ROOT (/) — System Router v3.
 *
 * Role: TRUST + CLARITY + ROUTING. Does not convert.
 * Primary CTA -> /apply (A/B test entry). Secondary CTA -> /webinar (nurture).
 *
 * Tracking is mounted via `useHomeTracking` (home_view, scroll_*, section_view,
 * exit_intent). Section observers fire from [data-home-section] attributes
 * inside RootRouterV3. CTA clicks are emitted via trackHomeCta with
 * experiment_id="root_v3".
 */
import RootRouterV3 from "@/components/landing/RootRouterV3";
import FooterSection from "@/components/landing/FooterSection";
import StickyCtaBar from "@/components/landing/StickyCtaBar";
import { useHomeTracking } from "@/lib/home-tracking";

const Index = () => {
  useHomeTracking();

  return (
    <main className="bg-background text-foreground">
      <RootRouterV3 />
      <FooterSection />
      <StickyCtaBar />
    </main>
  );
};

export default Index;
