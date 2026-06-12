import { useEffect, useState } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type SoundMode,
  SOUND_MODE_LABELS,
  getSoundMode,
  setSoundMode,
  subscribeSoundMode,
  playCue,
} from "@/lib/sound-design";

const ICONS: Record<SoundMode, React.ComponentType<{ className?: string }>> = {
  off: VolumeX,
  minimal: Volume1,
  full: Volume2,
};

export function SoundToggle() {
  const [mode, setMode] = useState<SoundMode>(getSoundMode());

  useEffect(() => subscribeSoundMode(setMode), []);

  const Icon = ICONS[mode];

  function pick(next: SoundMode) {
    setSoundMode(next);
    if (next !== "off") {
      // Preview cue so user hears the change
      setTimeout(() => playCue("success"), 60);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Sound feedback: ${SOUND_MODE_LABELS[mode]}`}>
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide">
          Sound Feedback
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(SOUND_MODE_LABELS) as SoundMode[]).map((m) => {
          const ItemIcon = ICONS[m];
          return (
            <DropdownMenuItem
              key={m}
              onSelect={() => pick(m)}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <ItemIcon className="h-3.5 w-3.5" />
                {SOUND_MODE_LABELS[m]}
              </span>
              {mode === m && <span className="text-xs text-muted-foreground">✓</span>}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] text-muted-foreground leading-snug">
          Off by default. Tones &lt; 120ms, never stack.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
