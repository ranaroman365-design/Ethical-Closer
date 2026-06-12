import { motion } from "framer-motion";

interface FunnelMidImageProps {
  src: string;
  alt: string;
}

const FunnelMidImage = ({ src, alt }: FunnelMidImageProps) => (
  <section className="py-10 md:py-16 bg-background">
    <div className="container mx-auto max-w-2xl px-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="overflow-hidden rounded-lg"
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-auto object-cover aspect-[4/3]"
          loading="lazy"
        />
      </motion.div>
    </div>
  </section>
);

export default FunnelMidImage;
