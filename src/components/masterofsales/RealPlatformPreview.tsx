import PlatformProofSlot, { useProofViewOnce } from "./PlatformProofSlot";
import performanceDashboardAsset from "@/assets/platform-real/performance-dashboard.jpg.asset.json";
import aiCopilotAsset from "@/assets/platform-real/ai-copilot.jpg.asset.json";
import careerPathAsset from "@/assets/platform-real/career-path.jpg.asset.json";

/**
 * REAL PLATFORM PREVIEW™ — directly below Hero.
 *
 * 3 real platform screens. Desktop: 3-column grid. Mobile: snap-scroll carousel.
 * Slots stay honest-empty until real /members captures are dropped in.
 */
const RealPlatformPreview = () => {
  const ref = useProofViewOnce("MASTER_PLATFORM_PREVIEW_VIEW", {
    section: "real_platform_preview",
  });

  const screens = [
    {
      label: "Performance Dashboard™",
      route: "/members/performance",
      caption: "Level · KPIs · Fortschritt · Performance — alles in einem Blick.",
      src: performanceDashboardAsset.url,
    },
    {
      label: "AI Closing Assistant™",
      route: "/members/ai-copilot",
      caption: "Live-Copilot · Echtzeit-Guidance · Coaching im Gespräch.",
      src: aiCopilotAsset.url,
    },
    {
      label: "Career Path™",
      route: "/members/career-path",
      caption: "L0 → L8 · Placement Ready™ · Placed Closer™ · Top Performer™.",
      src: careerPathAsset.url,
    },
  ];

  return (
    <section
      ref={ref}
      data-mos-section="real_platform_preview"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
            Real Platform Preview™
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            See the platform behind the system.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/65 md:text-lg">
            Performance. Placement. Progress.
          </p>
        </div>

        {/* Desktop: 3-col · Mobile: snap-scroll carousel */}
        <div className="mt-12 hidden gap-6 md:grid md:grid-cols-3">
          {screens.map((s) => (
            <PlatformProofSlot key={s.route} {...s} />
          ))}
        </div>
        <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:hidden">
          {screens.map((s) => (
            <div key={s.route} className="min-w-[82%] snap-center">
              <PlatformProofSlot {...s} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RealPlatformPreview;
