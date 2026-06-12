/**
 * <TransformationStories /> — Echte Wege echter Teilnehmer:innen.
 *
 * Phase D Skeleton, audience-aware.
 *  - Default cohort (Frauen): "Frauen, die ihren nächsten Schritt gegangen sind."
 *  - Male cohort (male_ambition): "Männer, die ihren nächsten Schritt gegangen sind."
 *
 * Bis Stories da sind: 3 dezente Skeleton-Karten + Microcopy "folgt in Kürze".
 * Sobald das passende Set befüllt + `consent: true`: echte Karten.
 *
 * Kein Fake-Content, kein Pseudo-Testimonial. Section bleibt sichtbar als
 * ehrliches Versprechen, nicht als leere Lücke.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TRANSFORMATION_STORIES_FEMALE,
  TRANSFORMATION_STORIES_MALE,
  type TransformationStory,
} from "@/config/transformation-stories";
import { getApplyAudience, type ApplyAudience } from "@/lib/apply-audience";

const SkeletonCard = ({ index }: { index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.6, delay: index * 0.1 }}
    className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-background/60 p-6 backdrop-blur-sm"
  >
    <div className="aspect-[4/5] w-full rounded-xl bg-gradient-to-br from-muted/50 via-muted/30 to-muted/50" />
    <div className="space-y-3">
      <div className="h-3 w-16 rounded-full bg-muted/60" />
      <div className="h-4 w-full rounded-full bg-muted/40" />
      <div className="h-4 w-4/5 rounded-full bg-muted/40" />
    </div>
  </motion.div>
);

const StoryCard = ({ story, index }: { story: TransformationStory; index: number }) => (
  <motion.figure
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.6, delay: index * 0.1 }}
    className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur-sm"
  >
    <div className="aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
      <img
        src={story.photoSrc!}
        alt={`${story.firstName} — echter Karriereweg`}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
    <div className="space-y-3">
      <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {story.firstName}
      </p>
      <p className="font-serif text-base leading-snug text-foreground/90">
        <span className="text-muted-foreground">Vorher: </span>{story.before}
      </p>
      <p className="font-serif text-base leading-snug text-foreground/90">
        <span className="text-muted-foreground">Heute: </span>{story.now}
      </p>
      <blockquote className="border-l-2 border-accent/60 pl-4 font-serif text-[15px] italic leading-relaxed text-foreground/80">
        „{story.quote}"
      </blockquote>
    </div>
  </motion.figure>
);

const TransformationStories = () => {
  // Audience cohort resolves client-side; default until effect runs to keep
  // SSR/initial render deterministic.
  const [audience, setAudience] = useState<ApplyAudience>("default");
  useEffect(() => {
    setAudience(getApplyAudience());
  }, []);

  const isMale = audience === "male_ambition";
  const stories = isMale ? TRANSFORMATION_STORIES_MALE : TRANSFORMATION_STORIES_FEMALE;
  const visibleStories = stories.filter((s) => s.consent && s.photoSrc);
  const showSkeleton = visibleStories.length === 0;

  const heading = isMale ? "Männer, die ihren nächsten" : "Frauen, die ihren nächsten";
  const subheading = isMale
    ? "Keine inszenierten Erfolgsgeschichten. Echte Karrierewege — mit eigener Richtung, eigenem Tempo, echtem Fortschritt."
    : "Keine inszenierten Erfolgsgeschichten. Echte Karrierewege — mit eigenem Tempo, eigener Richtung, eigenen Zweifeln.";
  const skeletonNote = isMale
    ? "Echte Wege echter Teilnehmer — folgt in Kürze."
    : "Echte Wege echter Teilnehmerinnen — folgt in Kürze.";

  return (
    <section
      data-section="transformation-stories"
      data-audience={audience}
      className="relative bg-background py-20 md:py-28"
    >
      <div className="container mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center md:mb-16"
        >
          <p className="mb-4 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Echte Wege
          </p>
          <h2 className="font-serif text-3xl font-semibold leading-[1.15] tracking-tight text-foreground md:text-4xl">
            {heading}
            <br />
            <span className="text-muted-foreground">Schritt gegangen sind.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-serif text-base leading-relaxed text-foreground/75 md:text-lg">
            {subheading}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {showSkeleton
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} index={i} />)
            : visibleStories
                .slice(0, 3)
                .map((story, i) => <StoryCard key={story.id} story={story} index={i} />)}
        </div>

        {showSkeleton && (
          <p className="mt-10 text-center font-sans text-xs italic text-muted-foreground/70">
            {skeletonNote}
          </p>
        )}
      </div>
    </section>
  );
};

export default TransformationStories;
