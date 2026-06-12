import PlatformProofSlot, { useProofViewOnce } from "./PlatformProofSlot";

/**
 * HOW PROGRESSION LOOKS INSIDE ETC™ — directly below RoadmapManifestBar.
 * 3 real screens · screens do the work · no walls of text.
 */
const RoadmapInsideStrip = () => {
  const ref = useProofViewOnce("MASTER_CAREER_PATH_PREVIEW_VIEW", {
    section: "roadmap_inside",
  });

  const screens = [
    {
      label: "Career Path",
      route: "/members/career-path",
      caption: "L0 → L8 — sichtbarer Fortschritt, Level für Level.",
    },
    {
      label: "KPI Verification",
      route: "/members/performance/intelligence",
      caption: "Verifizierte Leistungsdaten statt Selbstauskunft.",
    },
    {
      label: "Placement",
      route: "/members/placement",
      caption: "Placement Ready™ → Placement Qualified™ → Placed Closer™.",
    },
  ];

  return (
    <section
      ref={ref}
      data-mos-section="roadmap_inside"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
            How progression looks inside ETC™
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            So sieht Fortschritt von innen aus.
          </h2>
        </div>

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

export default RoadmapInsideStrip;
