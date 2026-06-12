import { Link } from "react-router-dom";

/**
 * CareerFlowCopy — High-end, minimal copy block placed directly under the
 * Career Flow Map. Goal: Verstehen → Vertrauen → Entscheidung.
 * No hype. Structured progression, real outcomes, clear CTA.
 */
export default function CareerFlowCopy() {
  return (
    <section className="bg-background px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl">
        {/* Headline */}
        <h2 className="font-serif text-4xl font-medium leading-tight text-foreground md:text-5xl">
          A clear path.
          <br />
          Real progression.
          <br />
          <span className="text-muted-foreground">No guesswork.</span>
        </h2>

        {/* Subline */}
        <p className="mt-8 font-sans text-lg leading-relaxed text-muted-foreground md:text-xl">
          You don't "try" to become a closer.
          <br />
          <br />
          You move through a structured system — with defined levels, clear
          expectations and real outcomes.
        </p>

        <div className="mt-16 h-px w-12 bg-[hsl(var(--accent))]" />

        {/* Core explanation */}
        <div className="mt-16 space-y-6 font-sans text-base leading-relaxed text-foreground/90 md:text-lg">
          <p>You start as an applicant.</p>
          <p>
            From there, you don't get thrown into random calls or vague
            training.
          </p>
          <p>You enter a structured progression:</p>
          <ul className="space-y-2 pl-1 text-foreground/80">
            <li>— you learn</li>
            <li>— you apply</li>
            <li>— you earn</li>
            <li>— you move forward</li>
          </ul>
          <p>Every level builds on the previous one.</p>
          <p>Every step is measurable.</p>
          <p className="text-foreground">Every promotion is earned.</p>
        </div>

        {/* Income clarity */}
        <div className="mt-20">
          <h3 className="font-serif text-2xl font-medium text-foreground md:text-3xl">
            Income, without illusion.
          </h3>
          <div className="mt-6 space-y-5 font-sans text-base leading-relaxed text-foreground/90 md:text-lg">
            <p>Earnings don't appear at the end.</p>
            <p className="text-foreground">They start early.</p>
            <p>
              From your first contributions, you can earn commissions — and as
              your skill increases, so does your responsibility and your income.
            </p>
            <p className="text-muted-foreground">
              This is not theory. It's tied to real calls, real clients and
              real outcomes.
            </p>
          </div>
        </div>

        {/* Placement moment */}
        <div className="mt-20 border-l-2 border-[hsl(var(--accent))] pl-6">
          <h3 className="font-serif text-2xl font-medium text-foreground md:text-3xl">
            From Level 4 onward, everything changes.
          </h3>
          <div className="mt-6 space-y-4 font-sans text-base leading-relaxed text-foreground/90 md:text-lg">
            <p>You enter the placement track.</p>
            <p>That means:</p>
            <p className="text-foreground">
              You are no longer just training — you are working on real deals
              inside real sales environments.
            </p>
          </div>
        </div>

        {/* Authority / differentiation */}
        <div className="mt-20 space-y-5 font-sans text-base leading-relaxed text-foreground/90 md:text-lg">
          <p className="text-muted-foreground">
            Most programs stop at "education."
          </p>
          <p className="text-foreground">
            This system is built around execution.
          </p>
          <p>You don't just learn how to sell.</p>
          <p className="text-foreground">You prove it — step by step.</p>
        </div>

        {/* End state — L6 */}
        <div className="mt-20">
          <h3 className="font-serif text-2xl font-medium text-foreground md:text-3xl">
            At Level 6, you operate as a placed closer.
          </h3>
          <div className="mt-6 space-y-4 font-sans text-base leading-relaxed text-foreground/90 md:text-lg">
            <p>You work with partner companies.</p>
            <p>You handle high-ticket conversations.</p>
            <p className="text-foreground">
              And you are paid based on real performance.
            </p>
          </div>
        </div>

        {/* Trust close */}
        <div className="mt-20 space-y-4 font-sans text-base leading-relaxed text-muted-foreground md:text-lg">
          <p>This is not for everyone.</p>
          <p className="text-foreground">
            But if you're willing to go through a structured process and build
            real capability, this path is very clear.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-20 flex flex-col items-start gap-3">
          <Link
            to="/apply/quiz"
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-8 py-4 font-sans text-base font-medium text-background transition-opacity hover:opacity-90"
          >
            Start your application
          </Link>
          <span className="font-sans text-sm text-muted-foreground">
            Takes less than 2 minutes.
          </span>
        </div>
      </div>
    </section>
  );
}
