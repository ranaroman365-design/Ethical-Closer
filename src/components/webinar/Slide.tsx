import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type SlideVariant = "light" | "white" | "dark" | "muted" | "warm";

interface SlideProps {
  children: ReactNode;
  variant?: SlideVariant;
  className?: string;
  id?: string;
}

const variantStyles: Record<SlideVariant, string> = {
  light: "bg-background text-foreground",
  white: "bg-card text-card-foreground",
  dark: "bg-primary text-primary-foreground",
  muted: "bg-muted text-foreground",
  warm: "bg-secondary text-secondary-foreground",
};

const Slide = ({ children, variant = "light", className, id }: SlideProps) => (
  <section
    id={id}
    className={cn(
      "min-h-screen flex items-center justify-center snap-start relative",
      variantStyles[variant],
      className
    )}
  >
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="container mx-auto max-w-4xl px-6 py-20 md:py-28"
    >
      {children}
    </motion.div>
  </section>
);

export default Slide;

export const SlideH2 = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cn("font-serif text-3xl md:text-5xl lg:text-6xl font-semibold leading-tight mb-8", className)}>
    {children}
  </h2>
);

export const SlideP = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn("font-sans text-lg md:text-xl leading-relaxed opacity-80 mb-6", className)}>
    {children}
  </p>
);

export const SlideBullets = ({ items, className }: { items: string[]; className?: string }) => (
  <ul className={cn("space-y-3 mb-8", className)}>
    {items.map((item) => (
      <li key={item} className="flex items-start gap-3 font-sans text-base md:text-lg">
        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
        <span className="opacity-85">{item}</span>
      </li>
    ))}
  </ul>
);

export const ImagePlaceholder = ({ label, className }: { label: string; className?: string }) => (
  <div
    className={cn(
      "aspect-video rounded-lg bg-muted/30 border border-border/50 flex items-center justify-center backdrop-blur-sm",
      className
    )}
  >
    <span className="text-sm text-muted-foreground/60 italic px-4 text-center">{label}</span>
  </div>
);

export const SlideSupport = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn("font-sans text-sm md:text-base opacity-60 mt-6", className)}>
    {children}
  </p>
);
