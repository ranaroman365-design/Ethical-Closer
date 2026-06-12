import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock, TrendingUp, Sparkles, MessageCircle, PlayCircle } from "lucide-react";
import { useUserLevel } from "@/hooks/useUserLevel";
import FooterSection from "@/components/landing/FooterSection";

/**
 * /insider — Conversion Community (Warm-Up Engine)
 *
 * NOT a performance community. NOT execution.
 * Goal: lead understands the system, sees reality, feels gap → wants access.
 *
 * 5 sections: Start · Results · Insights · Training (teaser) · Community (light)
 * Sticky global CTA: "Join the System" → /members/payment-links (or register)
 */
export default function Insider() {
  const { isAuthenticated, isL1Plus } = useUserLevel();
  const [params] = useSearchParams();
  const fromGate = params.get("reason") === "level";

  const ctaHref = useMemo(() => {
    if (isL1Plus) return "/community/feed";
    if (isAuthenticated) return "/members/payment-links";
    return "/members/register?next=/community";
  }, [isAuthenticated, isL1Plus]);

  useEffect(() => {
    document.title = "Insider · Ethical Closing";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* TOP BAR */}
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link
            to="/"
            className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground hover:text-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Ethical Closing
          </Link>
          <div
            className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            Insider · Preview
          </div>
        </div>
      </header>

      {/* GATE NOTICE (when redirected from L1+ area) */}
      {fromGate && (
        <div className="border-b border-border/40 bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-3">
            <p className="text-xs text-muted-foreground">
              You are currently viewing the preview environment.
              <span className="text-foreground"> Full access starts at Level 1.</span>
            </p>
          </div>
        </div>
      )}

      {/* 1 · START */}
      <section className="border-b border-border/40">
        <div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
          <div
            className="mb-8 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            01 · Start
          </div>
          <h1
            className="mb-6 text-4xl leading-[1.1] tracking-tight text-foreground sm:text-6xl"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            This is not content.
            <br />
            This is how the system works.
          </h1>
          <p className="mb-10 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            You are seeing the structure. Execution starts inside.
          </p>

          <div className="mb-12 grid gap-6 sm:grid-cols-3">
            <Bullet n="A" t="The Path" d="From first call to consistent close." />
            <Bullet n="B" t="The Inside" d="Real cases. Real numbers. Real operators." />
            <Bullet n="C" t="The Gap" d="Most fail without a system. Few execute one." />
          </div>

          <a
            href={ctaHref}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-4 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get Access to the System
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* 2 · RESULTS */}
      <section className="border-b border-border/40 bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div
            className="mb-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            02 · Results
          </div>
          <h2
            className="mb-12 text-3xl text-foreground sm:text-4xl"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            What actually happens inside.
          </h2>

          <div className="space-y-px overflow-hidden rounded-2xl border border-border/40 bg-background">
            <ResultRow phase="First deals" amount="€2.400 – €4.800" detail="Weeks 2–4 · first closed offers" />
            <ResultRow phase="From zero to traction" amount="€8k – €15k / month" detail="Months 2–4 · consistent pipeline" />
            <ResultRow phase="What changed" amount="System over hustle" detail="Predictable structure, repeatable wins" />
          </div>

          <p className="mt-10 text-sm italic text-muted-foreground">
            This is not luck. It's a system.
          </p>
        </div>
      </section>

      {/* 3 · SYSTEM INSIGHTS */}
      <section className="border-b border-border/40">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div
            className="mb-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            03 · System
          </div>
          <h2
            className="mb-12 text-3xl text-foreground sm:text-4xl"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Why the system wins.
          </h2>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-border/40 bg-border/40 sm:grid-cols-3">
            <Insight icon={<TrendingUp className="h-4 w-4" />} t="Closing is structure" d="Not motivation. Not talent. A repeatable conversation." />
            <Insight icon={<Sparkles className="h-4 w-4" />} t="Systems > effort" d="The right path produces results. Effort alone does not." />
            <Insight icon={<MessageCircle className="h-4 w-4" />} t="What matters" d="Awareness, decision, ethics. The rest is execution." />
          </div>

          <p className="mt-10 text-sm italic text-muted-foreground">
            Understanding it is step one. Executing it is step two.
          </p>
        </div>
      </section>

      {/* 4 · TRAINING TEASER */}
      <section className="border-b border-border/40 bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div
            className="mb-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            04 · Training
          </div>
          <h2
            className="mb-12 text-3xl text-foreground sm:text-4xl"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            A glimpse. Not the framework.
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <TeaserCard t="The First Question" d="Why most calls fail in the first 30 seconds." locked />
            <TeaserCard t="Awareness Levels" d="The 4 stages every buyer moves through." locked />
            <TeaserCard t="Ethical Pressure" d="How clarity creates decisions — without push." locked />
            <TeaserCard t="The Close Loop" d="When the offer becomes inevitable." locked />
          </div>

          <p className="mt-10 text-sm italic text-muted-foreground">
            You've seen a part of it. The full system is inside.
          </p>
        </div>
      </section>

      {/* 5 · COMMUNITY LIGHT */}
      <section className="border-b border-border/40">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div
            className="mb-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            05 · Community
          </div>
          <h2
            className="mb-12 text-3xl text-foreground sm:text-4xl"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Quiet signal. No noise.
          </h2>

          <div className="space-y-3">
            <SignalRow who="M.K." note="First closed deal after 11 days." />
            <SignalRow who="L.S." note="Restructured my pitch in week 2." />
            <SignalRow who="J.R." note="Booked 3 calls this week — without ads." />
          </div>

          <p className="mt-10 text-sm italic text-muted-foreground">
            You've seen enough to decide.
          </p>
        </div>
      </section>

      {/* FINAL CTA BLOCK */}
      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2
            className="mb-6 text-3xl sm:text-5xl"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            The preview ends here.
          </h2>
          <p className="mx-auto mb-10 max-w-md text-sm text-background/70">
            From here, results depend on execution.
          </p>
          <a
            href={ctaHref}
            className="inline-flex items-center gap-2 rounded-full bg-background px-7 py-4 text-sm font-medium text-foreground transition hover:opacity-90"
          >
            Join the System
            <ArrowRight className="h-4 w-4" />
          </a>
          <div className="mt-6">
            <Link
              to={isAuthenticated ? "/members/dashboard" : "/members/register?next=/insider"}
              className="text-xs uppercase tracking-[0.22em] text-background/60 hover:text-background"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              Start Application
            </Link>
          </div>
        </div>
      </section>

      {/* STICKY MOBILE CTA */}
      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 sm:hidden">
        <a
          href={ctaHref}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background shadow-lg"
        >
          Join the System
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
      <FooterSection />
    </div>
  );
}

function Bullet({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div>
      <div
        className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {n}
      </div>
      <div className="mb-1 text-sm font-medium text-foreground">{t}</div>
      <div className="text-sm text-muted-foreground">{d}</div>
    </div>
  );
}

function ResultRow({ phase, amount, detail }: { phase: string; amount: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-foreground">{phase}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div
        className="text-sm text-foreground"
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {amount}
      </div>
    </div>
  );
}

function Insight({ icon, t, d }: { icon: React.ReactNode; t: string; d: string }) {
  return (
    <div className="bg-background p-6">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <div className="mb-2 text-sm font-medium text-foreground">{t}</div>
      <div className="text-sm leading-relaxed text-muted-foreground">{d}</div>
    </div>
  );
}

function TeaserCard({ t, d, locked }: { t: string; d: string; locked?: boolean }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/40 bg-background p-6">
      <div className="mb-4 flex items-center justify-between">
        <PlayCircle className="h-5 w-5 text-muted-foreground" />
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Lock className="h-3 w-3" /> L1
          </span>
        )}
      </div>
      <div className="mb-1 text-sm font-medium text-foreground">{t}</div>
      <div className="text-sm text-muted-foreground">{d}</div>
    </div>
  );
}

function SignalRow({ who, note }: { who: string; note: string }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border/40 bg-background px-5 py-4">
      <div
        className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {who}
      </div>
      <div className="flex-1 text-sm text-foreground">{note}</div>
    </div>
  );
}
