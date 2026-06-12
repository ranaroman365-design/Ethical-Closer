import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useClosingMode } from '@/contexts/ClosingModeContext';

interface Props {
  closing?: ReactNode;
  topClosing: ReactNode;
  ethical: ReactNode;
}

export default function DualModeBlock({ closing, topClosing, ethical }: Props) {
  const { mode } = useClosingMode();

  const content = mode === 'ethical' ? ethical : mode === 'closing' && closing ? closing : topClosing;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
