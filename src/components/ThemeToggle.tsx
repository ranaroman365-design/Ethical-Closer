import { useTheme, type ThemePref } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Monitor } from "lucide-react";

const ICONS: Record<ThemePref, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

const LABELS: Record<ThemePref, { de: string; en: string }> = {
  light: { de: "Hell", en: "Light" },
  dark: { de: "Dunkel", en: "Dark" },
  system: { de: "System", en: "System" },
};

export function ThemeToggle({ lang = "de" }: { lang?: "de" | "en" }) {
  const { pref, set } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full transition-colors hover:bg-muted"
          aria-label={lang === "de" ? "Erscheinungsbild" : "Appearance"}
        >
          {ICONS[pref]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {(["light", "dark", "system"] as ThemePref[]).map((t) => (
          <DropdownMenuItem
            key={t}
            onClick={() => set(t)}
            className={`gap-2 text-xs ${pref === t ? "font-medium" : ""}`}
          >
            {ICONS[t]}
            <span>{LABELS[t][lang]}</span>
            {pref === t && <span className="ml-auto text-[10px] text-muted-foreground">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
