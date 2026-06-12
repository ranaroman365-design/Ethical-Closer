import { useLanguage } from '@/i18n/LanguageContext';
import { Info } from 'lucide-react';

interface Props {
  /** Translation key or inline text */
  de: string;
  en: string;
}

/**
 * Minimal self-explainer block. Answers "what is this, why does it matter".
 */
export default function SectionExplainer({ de, en }: Props) {
  const { lang } = useLanguage();
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2 mb-4">
      <Info className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {lang === 'de' ? de : en}
      </p>
    </div>
  );
}
