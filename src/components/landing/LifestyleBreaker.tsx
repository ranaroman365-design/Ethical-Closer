import { motion } from "framer-motion";

interface LifestyleBreakerProps {
  src: string;
  alt: string;
  aspect?: string;
}

const LifestyleBreaker = ({ src, alt, aspect = "aspect-[21/9]" }: LifestyleBreakerProps) => (
  <motion.div
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 0.8 }}
    className="w-full overflow-hidden"
  >
    <img
      src={src}
      alt={alt}
      className={`${aspect} w-full object-cover`}
      loading="lazy"
    />
  </motion.div>
);

export default LifestyleBreaker;
