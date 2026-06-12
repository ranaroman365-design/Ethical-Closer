import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { getOrAssignVariant } from "@/lib/ab-variant";
import { trackEvent } from "@/lib/track-event";

/**
 * Hero A/B/C test — three positionings (not 10 small variants).
 *
 * A — Direct Outcome (default high-converter)
 * B — System Framing (premium / CEO-level)
 * C — Pain Resolution (cold-traffic trigger)
 *
 * Test key locked: `system_hero_v1`. Override via ?v=A|B|C.
 * Track: hero_view (impression), hero_cta_click, scroll_50, scroll_90.
 */
type HeroVariant = "A" | "B" | "C";
const HERO_TEST_KEY = "system_hero_v1";
const HERO_VARIANTS = ["A", "B", "C"] as const;

const HERO_COPY: Record<
  HeroVariant,
  { headline: React.ReactNode; subline: string; cta: string }
> = {
  A: {
    headline: (
      <>
        More qualified sales calls.
        <br />
        Higher show-up rates.
        <br />
        More revenue from the leads you already have.
      </>
    ),
    subline: "We build and run your sales system.",
    cta: "Book Strategy Call",
  },
  B: {
    headline: <>We build and run your entire sales system.</>,
    subline:
      "From leads to booked calls to revenue — in one connected system.",
    cta: "See if this fits your business",
  },
  C: {
    headline: (
      <>
        Your sales problem isn&rsquo;t leads.
        <br />
        It&rsquo;s the system behind them.
      </>
    ),
    subline: "We fix the structure that turns leads into revenue.",
    cta: "Build your sales system",
  },
};

/**
 * /system — B2B Landing Page (Radiant Sales OS™)
 *
 * Pixel-exact build per spec:
 *  - Container 1120px, side margins 160px @1440
 *  - 12-col grid, 24px gutter
 *  - Section padding 80px desktop / 56px mobile
 *  - Inter, H1 48/56 600, H2 32/40 600, H3 20/28 600, Body 16/24 400
 *  - Tokens: bg #FFFFFF, card #F7F7F7, text #111 / #6B6B6B, border #E5E5E5, accent #C7A97A
 *  - Button: 52px H, radius 12, #111 bg / #FFF text, padding 0 24
 *  - Card: 24 padding, radius 16, #F7F7F7 bg, 1px #E5E5E5 border
 *
 * Aesthetic: minimal, premium, calm. 1 section = 1 idea.
 */

const CTA_HREF = "/start/bewerbung?source=system";

// ────────────────────────────── Primitives ──────────────────────────────

const Container = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`mx-auto w-full max-w-[1120px] px-5 md:px-10 ${className}`}>
    {children}
  </div>
);

const Section = ({
  children,
  className = "",
  id,
  bg,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  bg?: string;
}) => (
  <section
    id={id}
    className={`w-full py-14 md:py-20 ${className}`}
    style={bg ? { background: bg } : undefined}
  >
    <Container>{children}</Container>
  </section>
);

const PrimaryButton = ({
  label = "Book Strategy Call",
  fullWidthMobile = false,
  onClick,
  href = CTA_HREF,
}: {
  label?: string;
  fullWidthMobile?: boolean;
  onClick?: () => void;
  href?: string;
}) => (
  <Link
    to={href}
    onClick={onClick}
    className={`inline-flex h-[52px] items-center justify-center rounded-[12px] bg-[#111111] px-6 text-[16px] font-semibold leading-[16px] text-white transition-colors duration-200 hover:bg-black ${
      fullWidthMobile ? "w-full sm:w-auto" : ""
    }`}
  >
    {label}
  </Link>
);

const Card = ({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) => (
  <div
    className="rounded-[16px] border bg-[#F7F7F7] p-6"
    style={{ borderColor: "#E5E5E5", minHeight: 140 }}
  >
    <h3 className="text-[20px] font-semibold leading-[28px] text-[#111111]">
      {title}
    </h3>
    <p className="mt-2 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
      {desc}
    </p>
  </div>
);

// ───────── Hero Flow Visual (Leads → ... → Revenue) ─────────
// Desktop: vertical stack, 480px wide, 32px gap, subtle traveling dot.
// Mobile: same vertical stack (already optimal for narrow screens).

const HERO_FLOW_STEPS = [
  "Leads",
  "Conversations",
  "Calls",
  "Show-Up",
  "Revenue",
];

const HeroFlowVisual = () => (
  <div
    className="relative w-full"
    style={{ maxWidth: 480 }}
    aria-label="Sales system flow: Leads to Conversations to Calls to Show-Up to Revenue"
  >
    <ol
      className="flex flex-col items-stretch"
      style={{ gap: 32, listStyle: "none", margin: 0, padding: 0 }}
    >
      {HERO_FLOW_STEPS.map((label, i) => {
        const isLast = i === HERO_FLOW_STEPS.length - 1;
        return (
          <li key={label} className="flex flex-col items-center">
            <div
              className="flex w-full items-center justify-center rounded-[16px] border bg-white"
              style={{
                borderColor: "#E5E5E5",
                height: 56,
                paddingLeft: 24,
                paddingRight: 24,
              }}
            >
              <span
                className="text-[16px] font-medium leading-[24px] text-[#111111]"
                style={{ letterSpacing: "-0.005em" }}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <div
                className="relative overflow-hidden"
                style={{ width: 1, height: 60, marginTop: 4, marginBottom: 4 }}
                aria-hidden
              >
                <div
                  className="absolute inset-0"
                  style={{ background: "#E5E5E5" }}
                />
                <span
                  className="absolute left-0 h-[6px] w-[1px] rounded-full"
                  style={{
                    background: "#C7A97A",
                    animation: `heroFlowDot 2s linear ${i * 0.4}s infinite`,
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>

    <style>{`
      @keyframes heroFlowDot {
        0%   { transform: translateY(-8px); opacity: 0; }
        15%  { opacity: 1; }
        85%  { opacity: 1; }
        100% { transform: translateY(60px); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        [aria-label^="Sales system flow"] span[style*="heroFlowDot"] {
          animation: none !important;
          opacity: 0 !important;
        }
      }
    `}</style>
  </div>
);


// ────────────────────────────── Page ──────────────────────────────

export default function SystemLanding() {
  // A/B/C variant — sticky per browser
  const variant = useMemo<HeroVariant>(
    () => getOrAssignVariant(HERO_TEST_KEY, HERO_VARIANTS),
    [],
  );
  const hero = HERO_COPY[variant];
  const ctaHref = `${CTA_HREF}&v=${variant}`;
  const impressionFired = useRef(false);
  const scroll50Fired = useRef(false);
  const scroll90Fired = useRef(false);

  useEffect(() => {
    document.title = "We build and run your sales system — ETC";
    const meta =
      document.querySelector('meta[name="description"]') ||
      Object.assign(document.createElement("meta"), { name: "description" });
    meta.setAttribute(
      "content",
      "More qualified calls. Higher show-up rates. More revenue from the leads you already have. One system that runs your sales engine."
    );
    if (!meta.parentElement) document.head.appendChild(meta);

    const canonical =
      document.querySelector('link[rel="canonical"]') ||
      Object.assign(document.createElement("link"), { rel: "canonical" });
    canonical.setAttribute("href", `${window.location.origin}/system`);
    if (!canonical.parentElement) document.head.appendChild(canonical);

    // Impression — fire once per page load
    if (!impressionFired.current) {
      impressionFired.current = true;
      void trackEvent({
        eventName: "ab_hero_view",
        category: "product",
        pagePath: "/system",
        moduleKey: HERO_TEST_KEY,
        metadata: { variant, test_key: HERO_TEST_KEY },
      });
    }

    // Scroll-depth tracking
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = doc.scrollHeight;
      if (total <= 0) return;
      const pct = scrolled / total;
      if (pct >= 0.5 && !scroll50Fired.current) {
        scroll50Fired.current = true;
        void trackEvent({
          eventName: "ab_scroll_50",
          category: "product",
          pagePath: "/system",
          moduleKey: HERO_TEST_KEY,
          metadata: { variant, test_key: HERO_TEST_KEY },
        });
      }
      if (pct >= 0.9 && !scroll90Fired.current) {
        scroll90Fired.current = true;
        void trackEvent({
          eventName: "ab_scroll_90",
          category: "product",
          pagePath: "/system",
          moduleKey: HERO_TEST_KEY,
          metadata: { variant, test_key: HERO_TEST_KEY },
        });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const fireCtaClick = (placement: "hero" | "final" | "nav") => {
    void trackEvent({
      eventName: "ab_hero_cta_click",
      category: "product",
      pagePath: "/system",
      moduleKey: HERO_TEST_KEY,
      metadata: { variant, test_key: HERO_TEST_KEY, placement },
    });
  };

  return (
    <main
      className="min-h-screen bg-white antialiased"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', color: "#111111" }}
    >
      {/* ───────── NAV ───────── */}
      <header className="w-full border-b" style={{ borderColor: "#E5E5E5" }}>
        <Container className="flex h-16 items-center justify-between">
          <Link
            to="/"
            className="text-[16px] font-semibold tracking-tight text-[#111111]"
          >
            ETC
          </Link>
          <Link
            to={ctaHref}
            onClick={() => fireCtaClick("nav")}
            className="text-[14px] font-medium text-[#111111] hover:text-black"
          >
            Book a call →
          </Link>
        </Container>
      </header>

      {/* ───────── 1. HERO ───────── */}
      <section
        className="w-full"
        style={{ paddingTop: 64, paddingBottom: 64 }}
      >
        <Container>
          <div
            className="grid grid-cols-1 items-center gap-12 md:grid-cols-12 md:gap-6"
            style={{ minHeight: 0 }}
          >
            {/* LEFT — text (7 cols) */}
            <div className="md:col-span-7" data-ab-variant={variant}>
              <h1
                className="font-semibold tracking-tight text-[#111111] text-[32px] leading-[40px] md:text-[48px] md:leading-[56px]"
                style={{ maxWidth: 560 }}
              >
                {hero.headline}
              </h1>

              <p
                className="text-[#111111] text-[16px] leading-[24px] md:text-[18px] md:leading-[28px]"
                style={{ marginTop: 24, maxWidth: 560 }}
              >
                {hero.subline}
              </p>

              <p
                className="text-[14px] leading-[22px] md:text-[16px] md:leading-[24px]"
                style={{ marginTop: 16, color: "#6B6B6B", maxWidth: 560 }}
              >
                Without adding complexity.
              </p>

              <div style={{ marginTop: 32 }}>
                <PrimaryButton
                  label={hero.cta}
                  href={ctaHref}
                  fullWidthMobile
                  onClick={() => fireCtaClick("hero")}
                />
              </div>

              <p
                className="text-[14px] leading-[20px]"
                style={{ marginTop: 12, color: "#6B6B6B" }}
              >
                Takes less than 2 minutes.
              </p>
            </div>

            {/* RIGHT — system flow visual (5 cols) */}
            <div className="md:col-span-5">
              <div className="flex justify-center md:justify-end">
                <HeroFlowVisual />
              </div>
            </div>
          </div>
        </Container>
      </section>


      {/* ───────── 2. CLARITY STRIP ───────── */}
      <section
        className="w-full border-y py-10"
        style={{ borderColor: "#E5E5E5" }}
      >
        <Container className="text-center">
          <p className="text-[20px] font-semibold leading-[28px] text-[#111111] md:text-[24px] md:leading-[32px]">
            No tool stack. No guesswork. No chaos.
          </p>
          <p className="mt-3 text-[14px] font-normal leading-[20px] text-[#6B6B6B]">
            One system that connects everything: Leads → Conversations → Calls
            → Revenue
          </p>
        </Container>
      </section>

      {/* ───────── 3. PROBLEM ───────── */}
      <Section>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-[28px] font-semibold leading-[36px] tracking-tight text-[#111111] md:text-[32px] md:leading-[40px]">
              Most sales systems don&rsquo;t fail because of leads.
            </h2>
            <p className="mt-4 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
              They fail because there is no structure.
            </p>
          </div>
          <ul className="space-y-4">
            {[
              "Too few qualified bookings",
              "Too many no-shows",
              "No clear ownership",
              "No scalable process",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start text-[16px] font-normal leading-[24px] text-[#111111]"
              >
                <span
                  className="mr-3 mt-[10px] inline-block h-px w-4 flex-none"
                  style={{ background: "#C7A97A" }}
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ───────── 4. SOLUTION ───────── */}
      <Section bg="#FAFAFA">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-[28px] font-semibold leading-[36px] tracking-tight text-[#111111] md:text-[32px] md:leading-[40px]">
            We install a working sales system.
          </h2>
          <p className="mt-6 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
            Not theory. Not tools. A system that turns leads into booked calls,
            calls into attended conversations, and conversations into revenue.
          </p>
        </div>
      </Section>

      {/* ───────── 4b. SYSTEM FLOW VISUAL ───────── */}
      <Section>
        <div className="mx-auto max-w-[960px]">
          <div className="mb-10 text-center md:mb-14">
            <p className="text-[14px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">
              How it works
            </p>
            <h2 className="mt-3 text-[24px] font-semibold leading-[32px] tracking-tight text-[#111111] md:text-[28px] md:leading-[36px]">
              One connected flow.
            </h2>
          </div>

          {/* Desktop: horizontal · Mobile: vertical */}
          <ol className="flex flex-col items-stretch gap-6 md:flex-row md:items-center md:justify-between md:gap-2">
            {[
              { n: "01", label: "Leads" },
              { n: "02", label: "Conversations" },
              { n: "03", label: "Calls" },
              { n: "04", label: "Show-Up" },
              { n: "05", label: "Revenue" },
            ].map((step, idx, arr) => (
              <li
                key={step.label}
                className="flex flex-1 items-center gap-4 md:flex-col md:items-center md:gap-3"
              >
                <div className="flex flex-col items-center md:items-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full border text-[13px] font-medium tracking-wider text-[#6B6B6B] md:h-16 md:w-16 md:text-[14px]"
                    style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
                  >
                    {step.n}
                  </div>
                </div>
                <div className="flex-1 md:flex-none md:text-center">
                  <p className="text-[16px] font-medium leading-[24px] text-[#111111] md:mt-1 md:text-[17px]">
                    {step.label}
                  </p>
                </div>
                {/* Connector */}
                {idx < arr.length - 1 && (
                  <>
                    {/* Mobile vertical line (hidden on md+) */}
                    <span
                      className="ml-7 hidden h-6 w-px md:hidden"
                      aria-hidden
                    />
                    {/* Desktop horizontal line */}
                    <span
                      className="mx-2 hidden h-px flex-1 md:block"
                      style={{ background: "#E5E5E5" }}
                      aria-hidden
                    />
                  </>
                )}
              </li>
            ))}
          </ol>

          <p className="mx-auto mt-12 max-w-[560px] text-center text-[15px] font-normal leading-[24px] text-[#6B6B6B] md:mt-14">
            Everything is connected in one system —
            <span className="text-[#111111]"> no separate tools, no broken handoffs.</span>
          </p>
        </div>
      </Section>

      {/* ───────── 5. SYSTEM STACK (2×4 grid) ───────── */}
      <Section>
        <div className="mb-10 text-center">
          <p className="text-[14px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">
            What you get
          </p>
          <h2 className="mt-3 text-[28px] font-semibold leading-[36px] tracking-tight text-[#111111] md:text-[32px] md:leading-[40px]">
            One system. Fully integrated.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Lead Engine",
              desc: "Funnel + lead generation that produces qualified demand.",
            },
            {
              title: "AI Setter",
              desc: "Chat and voice AI that books calls around the clock.",
            },
            {
              title: "Omni-Channel Comms",
              desc: "WhatsApp, SMS, push and email — orchestrated, never noisy.",
            },
            {
              title: "Smart Attendance",
              desc: "Show-up optimization built into every booking.",
            },
            {
              title: "Operator Control",
              desc: "Full visibility. Clean decisions. No black box.",
            },
            {
              title: "Sales Intelligence",
              desc: "Continuous optimization. Self-learning system.",
            },
            {
              title: "Team Build-Up",
              desc: "Setter and Closer structure that scales without chaos.",
            },
            {
              title: "Revenue Infrastructure",
              desc: "Everything connected. One system. One source of truth.",
            },
          ].map((item) => (
            <Card key={item.title} title={item.title} desc={item.desc} />
          ))}
        </div>
      </Section>

      {/* ───────── 6. FOR WHO ───────── */}
      <Section bg="#FAFAFA">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-[28px] font-semibold leading-[36px] tracking-tight text-[#111111] md:text-[32px] md:leading-[40px]">
            This is for you if&hellip;
          </h2>
          <ul className="mx-auto mt-10 max-w-[520px] space-y-4 text-left">
            {[
              "you need more qualified calls",
              "your show rate is inconsistent",
              "your team lacks structure",
              "you want to scale without chaos",
            ].map((line) => (
              <li
                key={line}
                className="flex items-start text-[16px] font-normal leading-[24px] text-[#111111]"
              >
                <span
                  className="mr-3 mt-[10px] inline-block h-px w-4 flex-none"
                  style={{ background: "#C7A97A" }}
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ───────── 7. DIFFERENTIATION ───────── */}
      <Section>
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-[28px] font-semibold leading-[36px] tracking-tight text-[#111111] md:text-[32px] md:leading-[40px]">
            We don&rsquo;t just give you software.
          </h2>
          <p className="mt-6 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
            We combine autonomous systems, execution, training and talent into
            one working revenue infrastructure.
          </p>
          <div className="mx-auto mt-10 grid max-w-[640px] grid-cols-2 gap-3 md:grid-cols-4">
            {["Autonomous Systems", "Execution", "Training", "Talent"].map(
              (label) => (
                <div
                  key={label}
                  className="rounded-[12px] border bg-white px-3 py-4 text-[14px] font-medium leading-[20px] text-[#111111]"
                  style={{ borderColor: "#E5E5E5" }}
                >
                  {label}
                </div>
              ),
            )}
          </div>
        </div>
      </Section>

      {/* ───────── 8. CRM SECTION ───────── */}
      <Section bg="#FAFAFA">
        <div className="mx-auto max-w-[640px] text-center">
          <p className="text-[20px] font-semibold leading-[28px] text-[#111111]">
            You don&rsquo;t need a separate CRM.
          </p>
          <p className="mt-3 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
            Leads, communication, calls and decisions — all run inside one
            system.
          </p>
        </div>
      </Section>

      {/* ───────── 9. RESULTS (3 cols) ───────── */}
      <Section>
        <div className="mb-10 text-center">
          <p className="text-[14px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">
            Typical impact
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {[
            {
              metric: "+30 – 80%",
              label: "more qualified bookings",
            },
            {
              metric: "Higher",
              label: "show rates, consistently",
            },
            {
              metric: "Full",
              label: "control over your pipeline",
            },
          ].map((r) => (
            <div
              key={r.label}
              className="border-t pt-6"
              style={{ borderColor: "#E5E5E5" }}
            >
              <p className="text-[32px] font-semibold leading-[40px] tracking-tight text-[#111111]">
                {r.metric}
              </p>
              <p className="mt-2 text-[14px] font-normal leading-[20px] text-[#6B6B6B]">
                {r.label}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ───────── 9b. TRUST / PROOF ───────── */}
      <section
        className="w-full border-t py-20 md:py-28"
        style={{ borderColor: "#E5E5E5" }}
      >
        <Container>
          <div className="mx-auto max-w-[720px]">
            {/* Eyebrow */}
            <p className="text-center text-[14px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">
              Why this works
            </p>

            {/* 1. Authority */}
            <div className="mt-8">
              <p className="text-[20px] font-semibold leading-[28px] text-[#111111]">
                This is not a new idea.
              </p>
              <p className="mt-3 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
                It&rsquo;s the result of building and optimizing real sales
                systems across multiple funnels, teams and offers.
              </p>
            </div>

            {/* divider */}
            <div
              className="mx-auto mt-8 h-px w-12"
              style={{ background: "#E5E5E5" }}
              aria-hidden
            />

            {/* 2. Mechanism Proof */}
            <div className="mt-8">
              <p className="text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
                Most improvements don&rsquo;t come from more leads. They come
                from fixing:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "how leads are handled",
                  "how communication is structured",
                  "how decisions are made",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start text-[16px] font-normal leading-[24px] text-[#111111]"
                  >
                    <span
                      className="mr-3 mt-[10px] inline-block h-px w-4 flex-none"
                      style={{ background: "#C7A97A" }}
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
                That&rsquo;s exactly what this system does.
              </p>
            </div>

            <div
              className="mx-auto mt-8 h-px w-12"
              style={{ background: "#E5E5E5" }}
              aria-hidden
            />

            {/* 3. Outcomes — calm, no metrics */}
            <div className="mt-8">
              <p className="text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
                Typical improvements:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "more qualified calls",
                  "higher show-up rates",
                  "clearer pipeline control",
                  "less manual follow-up",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start text-[16px] font-normal leading-[24px] text-[#111111]"
                  >
                    <span
                      className="mr-3 mt-[11px] inline-block h-1 w-1 flex-none rounded-full"
                      style={{ background: "#111111" }}
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[14px] font-normal leading-[20px] text-[#6B6B6B]">
                Results vary — but the system removes the chaos.
              </p>
            </div>

            <div
              className="mx-auto mt-8 h-px w-12"
              style={{ background: "#E5E5E5" }}
              aria-hidden
            />

            {/* 4. Soft Testimonials — no income claims */}
            <div className="mt-8 space-y-6">
              {[
                {
                  quote:
                    "We finally had structure in our sales process. That alone made a massive difference.",
                  attribution: "Founder · High-ticket coaching",
                },
                {
                  quote:
                    "The biggest change wasn’t more leads — it was how we handled them.",
                  attribution: "Sales Lead · B2B services",
                },
              ].map((t) => (
                <figure
                  key={t.quote}
                  className="border-l pl-6"
                  style={{ borderColor: "#E5E5E5" }}
                >
                  <blockquote className="text-[18px] font-normal leading-[28px] text-[#111111]">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-2 text-[14px] font-normal leading-[20px] text-[#6B6B6B]">
                    {t.attribution}
                  </figcaption>
                </figure>
              ))}
            </div>

            <div
              className="mx-auto mt-8 h-px w-12"
              style={{ background: "#E5E5E5" }}
              aria-hidden
            />

            {/* 5. System Credibility */}
            <div className="mt-8">
              <p className="text-[16px] font-normal leading-[24px] text-[#6B6B6B]">
                This system combines:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "automation",
                  "communication",
                  "decision logic",
                  "team structure",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start text-[16px] font-normal leading-[24px] text-[#111111]"
                  >
                    <span
                      className="mr-3 mt-[10px] inline-block h-px w-4 flex-none"
                      style={{ background: "#C7A97A" }}
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[16px] font-normal leading-[24px] text-[#111111]">
                Into one connected environment. That&rsquo;s why it scales.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ───────── 10. FINAL CTA — Closing Section ───────── */}
      <section className="w-full py-24 md:py-[100px]">
        <Container>
          <div className="mx-auto max-w-[640px] text-center">
            {/* 1. Reframe */}
            <h2 className="text-[28px] font-semibold leading-[36px] tracking-tight text-[#111111] md:text-[40px] md:leading-[48px]">
              This is not about another tool.
            </h2>
            <p className="mt-6 text-[18px] font-normal leading-[28px] text-[#111111] md:text-[20px] md:leading-[30px]">
              It&rsquo;s about having a sales system that actually works.
            </p>

            {/* 2. Clarity */}
            <p className="mt-6 text-[16px] font-normal leading-[26px] text-[#6B6B6B]">
              If you want more structure, more control and more revenue from your existing leads,
              this is worth looking at.
              <br />
              If not, it&rsquo;s not for you.
            </p>

            {/* 3. Safety */}
            <p className="mt-6 text-[16px] font-normal leading-[26px] text-[#6B6B6B]">
              The next step is simple: we look at your current setup and see if this fits.
              <br />
              No pressure. No commitment. Just clarity.
            </p>

            {/* 4. CTA */}
            <div className="mt-8">
              <PrimaryButton
                label="Book Strategy Call"
                href={ctaHref}
                fullWidthMobile
                onClick={() => fireCtaClick("final")}
              />
            </div>
            <p className="mt-4 text-[13px] font-normal leading-[20px] text-[#6B6B6B]">
              Takes less than 2 minutes to book.
            </p>
          </div>
        </Container>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="w-full border-t" style={{ borderColor: "#E5E5E5" }}>
        <Container className="flex flex-col items-center justify-between gap-3 py-8 md:flex-row">
          <p className="text-[14px] font-normal leading-[20px] text-[#6B6B6B]">
            © {new Date().getFullYear()} ETC — Radiant Sales OS™
          </p>
          <div className="flex gap-6 text-[14px] font-normal leading-[20px] text-[#6B6B6B]">
            <Link to="/impressum" className="hover:text-[#111111]">
              Imprint
            </Link>
            <Link to="/datenschutz" className="hover:text-[#111111]">
              Privacy
            </Link>
          </div>
        </Container>
      </footer>
    </main>
  );
}
