import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/i18n/LanguageContext";

interface MicroCommitmentsProps {
  commitments: boolean[];
  onChange: (index: number, checked: boolean) => void;
}

const MicroCommitments = ({ commitments, onChange }: MicroCommitmentsProps) => {
  const { tx } = useLanguage();

  const items = [
    tx(
      "Ich bin bereit, Zeit und Energie in meine Entwicklung zu investieren.",
      "I am ready to invest time and energy in my development."
    ),
    tx(
      "Ich treffe eigenverantwortlich Entscheidungen.",
      "I make decisions independently and take responsibility."
    ),
    tx(
      "Ich bin offen für leistungsbasierte Entwicklung statt reiner Theorie.",
      "I am open to performance-based development over pure theory."
    ),
  ];

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <label
          key={i}
          className="flex cursor-pointer items-start gap-3 rounded-sm border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/30"
        >
          <Checkbox
            checked={commitments[i] ?? false}
            onCheckedChange={(checked) => onChange(i, !!checked)}
            className="mt-0.5"
          />
          <span className="font-sans text-sm leading-relaxed text-foreground/80">{item}</span>
        </label>
      ))}
    </div>
  );
};

export default MicroCommitments;
