import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MasterOfSalesCtaPair from "./MasterOfSalesCtaPair";

export interface Moment {
  img: string;
  eyebrow: string;
  promise?: string;
  title: string;
  body: string;
}

interface Props {
  moments: Moment[];
}

const MomentsStoryboard = ({ moments }: Props) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const scrollTo = useCallback((index: number) => {
    const el = slideRefs.current[index];
    if (!el || !scrollerRef.current) return;
    scrollerRef.current.scrollTo({
      left: el.offsetLeft,
      behavior: "smooth",
    });
  }, []);

  // Track active slide via IntersectionObserver
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        });
      },
      { root, threshold: [0.6] }
    );
    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [moments.length]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") scrollTo(Math.min(active + 1, moments.length - 1));
      if (e.key === "ArrowLeft") scrollTo(Math.max(active - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, moments.length, scrollTo]);

  const canPrev = active > 0;
  const canNext = active < moments.length - 1;

  return (
    <section id="moments" className="bg-background">
      <div className="mx-auto max-w-7xl px-6 pt-16 md:px-10">
        {/* Progress bar + counter */}
        <div className="mb-8 flex items-center justify-between gap-6">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            Storyboard · {String(active + 1).padStart(2, "0")} /{" "}
            {String(moments.length).padStart(2, "0")}
          </p>
          <div className="hidden flex-1 sm:block">
            <div className="h-px w-full bg-foreground/10">
              <div
                className="h-px bg-accent transition-all duration-500 ease-out"
                style={{ width: `${((active + 1) / moments.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              onClick={() => scrollTo(active - 1)}
              disabled={!canPrev}
              aria-label="Vorheriger Moment"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-foreground/20 transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollTo(active + 1)}
              disabled={!canNext}
              aria-label="Nächster Moment"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-foreground/20 transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal scroll-snap track */}
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-6 pb-16 md:gap-10 md:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {moments.map((m, i) => (
          <article
            key={m.eyebrow}
            data-index={i}
            ref={(el) => (slideRefs.current[i] = el)}
            className="flex w-[88%] shrink-0 snap-center flex-col gap-8 md:w-[78%] md:flex-row md:items-center md:gap-16 lg:w-[72%]"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl md:w-1/2">
              <img
                src={m.img}
                alt={m.title}
                loading="lazy"
                width={1280}
                height={896}
                className={`h-full w-full object-cover transition-all duration-1000 ${
                  active === i ? "scale-100 opacity-100" : "scale-[1.04] opacity-80"
                }`}
              />
              {/* Gradient base for legibility */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

              {/* Premium promise overlay */}
              {m.promise && (
                <div
                  className={`pointer-events-none absolute bottom-5 left-5 right-5 transition-all duration-700 md:bottom-7 md:left-7 md:right-7 ${
                    active === i
                      ? "translate-y-0 opacity-100"
                      : "translate-y-3 opacity-0"
                  }`}
                >
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white/90 backdrop-blur-md md:text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    <span className="font-medium">{m.promise}</span>
                  </div>
                </div>
              )}

              {/* Slide index chip */}
              <div className="absolute right-4 top-4 rounded-full bg-background/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.25em] text-foreground/70 backdrop-blur md:right-5 md:top-5">
                {String(i + 1).padStart(2, "0")} / {String(moments.length).padStart(2, "0")}
              </div>

              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-foreground/5" />
            </div>
            <div
              className={`md:w-1/2 transition-all duration-700 ${
                active === i
                  ? "translate-y-0 opacity-100"
                  : "translate-y-2 opacity-50"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.3em] text-accent">
                {m.eyebrow}
              </p>
              <h3 className="mt-4 font-serif text-3xl leading-tight md:text-5xl">
                {m.title}
              </h3>
              <p className="mt-5 text-base leading-relaxed text-foreground/75 md:text-lg">
                {m.body}
              </p>
              <div className="mt-8">
                <MasterOfSalesCtaPair variant="compact" source={`moment-${i + 1}`} />
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-6 pb-20 md:px-10">
        {moments.map((m, i) => (
          <button
            key={m.eyebrow}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Springe zu Moment ${i + 1}`}
            aria-current={active === i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              active === i ? "w-10 bg-accent" : "w-4 bg-foreground/20 hover:bg-foreground/40"
            }`}
          />
        ))}
      </div>
    </section>
  );
};

export default MomentsStoryboard;
